/* Вкладка «Сервер CS2»: локальный сервер из cs2-server/ — матч, пауза + реклама,
   карта, игроки, боты, любая команда, события MatchZy.
   Состояние сервера приходит вместе с hud (hud.cs2server), команды — /api/cs2server/cmd
   и /api/action/srv-… Работает без пароля на ПК сервера, с других ПК — с паролем rcon. */

const SRV_MAPS = ['de_mirage', 'de_inferno', 'de_nuke', 'de_ancient', 'de_anubis', 'de_dust2', 'de_cache', 'de_train', 'de_overpass', 'de_vertigo'];
let srvAuth = null;     // null — ещё не проверяли, true — можно, false — нужен пароль
let srvMatchzy = null;

function srvLog(text) {
  const el = $('srvLog');
  el.textContent += `[${new Date().toLocaleTimeString()}] ${text}\n`;
  el.scrollTop = el.scrollHeight;
}

async function srvCheckAuth() {
  try {
    await api('/api/cs2server/login');
    srvAuth = true;
  } catch {
    srvAuth = false;
  }
  $('srvLogin').hidden = srvAuth;
  $('srvMain').hidden = !srvAuth;
}

$('srvLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { sessionStorage.setItem('hud-rcon-pw', $('srvPw').value); } catch { /* */ }
  await srvCheckAuth();
  $('srvLoginErr').hidden = srvAuth;
  $('srvLoginErr').textContent = srvAuth ? '' : 'Неверный пароль';
  if (srvAuth) $('srvPw').value = '';
});

async function srvCmd(cmd, say) {
  srvLog('> ' + cmd);
  try {
    const r = await api('/api/cs2server/cmd', { body: { cmd } });
    srvLog((r.output || '').trim() || say || 'ок');
  } catch (ex) {
    srvLog('ОШИБКА: ' + ex.message);
    if (/пароль/i.test(ex.message)) srvCheckAuth();
  }
}

const SRV_DONE = {
  'srv-start': 'Матч начат',
  'srv-pause': 'Пауза заказана — начнётся с заморозкой следующего раунда',
  'srv-unpause': 'Пауза снята',
  'srv-teamnames': 'Названия команд отправлены'
};

async function srvAction(name) {
  try {
    const r = await api(`/api/action/${name}`);
    const text = name === 'srv-pause-ads' ? (r.started ? 'Пауза уже идёт — реклама запущена' : 'Пауза заказана — реклама начнётся вместе с ней') : SRV_DONE[name] || 'Готово';
    toast(text);
    srvLog(text);
  } catch (ex) {
    toast(ex.message, true);
    srvLog('ОШИБКА: ' + ex.message);
  }
}

// Команды MatchZy, если он стоит, иначе обычные mp_* (как в панели админа)
const srvCmdOf = (b) => (srvMatchzy && 'mz' in b.dataset ? b.dataset.mz : b.dataset.cmd);

document.querySelector('[data-panel="server"]').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.type === 'submit') return;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  if (b.dataset.srvAct) return srvAction(b.dataset.srvAct);
  if (b.dataset.map) {
    if (confirm(`Сменить карту на ${b.textContent}? Текущий матч прервётся, всех перекинет на новую карту.`)) srvCmd(`changelevel ${b.dataset.map}`, 'Меняю карту…');
    return;
  }
  if (b.dataset.bot) {
    // bot_add в CS2 добавляет двоих, поэтому задаём точное число ботов
    const bots = (hud && hud.cs2server && hud.cs2server.bots) || 0;
    return srvCmd(`bot_join_team ${b.dataset.bot}; bot_quota_mode normal; bot_quota ${bots + 1}`, 'Бот добавлен');
  }
  if (b.dataset.kick) {
    if (confirm(`Выкинуть ${b.dataset.name}?`)) srvCmd(`kickid ${b.dataset.kick}`, 'Игрок выкинут');
    return;
  }
  const cmd = srvCmdOf(b);
  if (cmd === 'restore') {
    const n = prompt('Откатить на начало какого раунда? (номер раунда)');
    if (n && /^\d+$/.test(n.trim())) srvCmd('css_restore ' + n.trim(), 'Раунд восстановлен');
    return;
  }
  if (cmd) srvCmd(cmd);
});

$('srvCmdForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('srvCmd').value.trim();
  if (v) { srvCmd(v); $('srvCmd').value = ''; }
});

$('srvAddrForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { host: $('srvHost').value.trim() };
  if ($('srvRconPw').value) body.password = $('srvRconPw').value;
  try {
    await api('/api/cs2server/settings', { body });
    $('srvRconPw').value = '';
    toast(body.host ? `Сервер CS2: ${body.host}` : 'Сервер CS2 — на этом компьютере');
  } catch (ex) { toast(ex.message, true); }
});

for (const [id, key] of [['srvAutoFinish', 'autoFinish'], ['srvAutoNames', 'autoTeamNames']]) {
  $(id).addEventListener('change', () => api('/api/cs2server/settings', { body: { [key]: $(id).checked } }).catch((ex) => { toast(ex.message, true); renderServer(); }));
}

for (const map of SRV_MAPS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn';
  b.dataset.map = map;
  b.title = map;
  b.textContent = window.mapLabel ? mapLabel(map) : map;
  $('srvMaps').append(b);
}

function renderServer() {
  const s = hud && hud.cs2server;
  if (!s) return;
  $('srvDot').classList.toggle('on', s.online);
  $('srvDot').title = s.online ? 'сервер CS2 работает' : 'сервер CS2 не отвечает';
  if (srvAuth === null) srvCheckAuth();

  $('srvPill').classList.toggle('on', s.online);
  $('srvState').textContent = !s.checked ? 'проверяю…' : s.online ? 'сервер работает' : 'не отвечает';
  $('srvError').hidden = s.online || !s.error;
  $('srvError').textContent = s.error
    ? `${s.host ? `${s.host}: ` : ''}${s.error}. Запустите сервер (cs2-server\\start-server.bat на его компьютере) — пульт подключится сам. `
      + 'Сервер на другом ПК — впишите его адрес ниже; на том ПК должен быть запущен firewall.bat.'
    : '';
  if (document.activeElement !== $('srvHost') && $('srvHost').dataset.saved !== s.settings.host) {
    $('srvHost').value = s.settings.host;
    $('srvHost').dataset.saved = s.settings.host;
  }
  $('srvPwHint').textContent = s.settings.hasPassword ? 'сохранён в пульте' : 'пусто — из server.cfg';
  $('srvHud').textContent = s.online
    ? `Подключено к ${s.host}.` + (s.matchzy ? (s.hudUrl ? ` События MatchZy идут на ${s.hudUrl}.` : ' Сообщаю MatchZy адрес HUD…') : '')
    : '';
  $('srvMap').textContent = s.map ? (window.mapLabel ? mapLabel(s.map) : s.map) : '—';
  $('srvCount').textContent = s.online ? `${s.humans}${s.bots ? ` + ${s.bots} бот.` : ''}` : '—';
  $('srvArmed').hidden = !s.armed;

  if (srvMatchzy !== s.matchzy) {
    srvMatchzy = s.matchzy;
    document.querySelectorAll('[data-panel="server"] button[data-cmd], [data-panel="server"] button[data-mz]').forEach((b) => { b.hidden = !srvCmdOf(b); });
    $('srvMode').textContent = !s.online ? '' : s.matchzy
      ? 'MatchZy: игроки пишут !ready, после разминки нож-раунд'
      : 'без модов: матч начинается кнопкой «Начать матч»';
  }
  document.querySelectorAll('#srvMaps .btn').forEach((b) => b.classList.toggle('is-current', b.dataset.map === s.map));
  document.querySelectorAll('[data-panel="server"] #srvMain button').forEach((b) => {
    if (!b.closest('#srvCmdForm')) b.disabled = !s.online && !b.dataset.srvAct;
  });

  if (document.activeElement !== $('srvAutoFinish')) $('srvAutoFinish').checked = !!s.settings.autoFinish;
  if (document.activeElement !== $('srvAutoNames')) $('srvAutoNames').checked = !!s.settings.autoTeamNames;

  const rows = s.players.map((p) => `<tr><td>${esc(p.name)}${p.bot ? ' <span class="h-hint">бот</span>' : ''}</td>
    <td class="num">${p.bot ? '—' : p.ping}</td><td class="num">${p.bot ? '—' : esc(p.time)}</td>
    <td class="num"><button type="button" class="btn btn--danger" data-kick="${p.id}" data-name="${esc(p.name)}">Кик</button></td></tr>`);
  const html = rows.length ? rows.join('') : `<tr><td colspan="4" class="empty">${s.online ? 'Никого нет' : '—'}</td></tr>`;
  if ($('srvPlayers').dataset.html !== html) { $('srvPlayers').innerHTML = html; $('srvPlayers').dataset.html = html; }

  const ev = s.events.map((e) => `<li class="${e.kind === 'error' ? 'is-error' : ''}"><time>${new Date(e.at).toLocaleTimeString().slice(0, 5)}</time><span>${esc(e.text)}</span></li>`).join('');
  $('srvEvents').innerHTML = ev || '<li class="empty">Пока ничего</li>';
}
