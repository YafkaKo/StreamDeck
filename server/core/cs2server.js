/**
 * Сервер CS2 из пульта трансляции.
 *
 * Сам сервер лежит в cs2-server/ (установка, запуск, конфиги, MatchZy). Отсюда HUD
 *  - раз в несколько секунд спрашивает у него по rcon карту и игроков (status);
 *  - отправляет команды из вкладки «Сервер CS2» и кнопок пульта;
 *  - «Пауза + реклама»: ставит паузу и запускает очередь роликов, как только пауза началась;
 *  - отправляет названия команд из пульта на сервер (mp_teamname_1/2);
 *  - принимает события MatchZy (POST /api/matchzy): итог карты записывается сам.
 *
 * rcon и разбор status — общие с панелью админа: cs2-server/panel/server.js.
 * Пароль — rcon_password из cs2-server/cfg/server.cfg, адрес — из cs2-server/settings.bat.
 */

const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

function createCs2Server({ root, config, state, change, games, ads, onUpdate }) {
  const panel = require(path.join(root, 'cs2-server', 'panel', 'server.js'));
  const opts = { host: 'auto', port: 0, pollSec: 3, ...(config.cs2server || {}) };
  // Адрес можно задать в config/server.json, иначе — как у самого сервера (settings.bat)
  if (opts.host && opts.host !== 'auto') process.env.SERVER_IP = opts.host;
  if (opts.port) process.env.GAME_PORT = String(opts.port);

  const srv = () => state.s.cs2.server;

  let info = { online: false, checked: false, error: '', map: null, matchzy: false, players: [], at: 0 };
  let matchzyAt = 0;
  let armed = null;          // «Пауза + реклама»: ждём начала паузы { at }
  const events = [];         // последние события MatchZy и действия пульта
  const finished = new Map(); // защита от двойной записи итога одной карты

  function note(text, kind = 'info') {
    events.unshift({ at: Date.now(), text, kind });
    events.length = Math.min(events.length, 30);
    console.log(`[cs2-server] ${text}`);
    onUpdate();
  }

  // SERVER_IP=auto: IP определяет detect-ip.ps1. Панель запускает его синхронно, а HUD так нельзя —
  // повиснут приём GSI и оверлей. Поэтому узнаём IP заранее, в фоне, и кладём в окружение.
  let ipError = '';
  function detectIp() {
    if (process.env.SERVER_IP) return;
    let auto = true;
    try {
      const settings = fs.readFileSync(path.join(root, 'cs2-server', 'settings.bat'), 'latin1');
      const m = settings.match(/^set "SERVER_IP=([^"]+)"/m);
      if (m && m[1] !== 'auto') { process.env.SERVER_IP = m[1]; auto = false; }
    } catch { /* нет settings.bat — readConfig скажет понятнее */ }
    if (!auto) return;
    if (process.platform !== 'win32') { process.env.SERVER_IP = '127.0.0.1'; return; }
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'cs2-server', 'detect-ip.ps1')],
      { encoding: 'utf8', timeout: 15000, windowsHide: true }, (err, out) => {
        const ip = String(out || '').trim();
        if (!err && ip) { process.env.SERVER_IP = ip; ipError = ''; console.log(`[cs2-server] адрес сервера CS2: ${ip}`); }
        else { ipError = 'Не удалось определить IP этого ПК — впишите его в cs2-server/settings.bat или config/server.json → cs2server.host'; setTimeout(detectIp, 60000); }
      });
  }
  detectIp();

  function conf() {
    if (!process.env.SERVER_IP) throw new Error(ipError || 'Определяю IP этого компьютера…');
    return panel.readConfig();
  }

  async function run(cmd) {
    return panel.rcon(cmd, conf());
  }

  // ---------------------------------------------------------------- опрос сервера

  let polling = false;
  async function poll() {
    if (polling) return;
    polling = true;
    try {
      const c = conf();
      const status = panel.parseStatus(await panel.rcon('status', c));
      if (Date.now() - matchzyAt > 30000) {
        const list = await panel.rcon('css_plugins list', c).catch(() => '');
        info.matchzy = /"MatchZy"/.test(list);
        matchzyAt = Date.now();
      }
      info = { ...info, online: true, checked: true, error: '', map: status.map, players: status.players, at: Date.now() };
    } catch (err) {
      info = { ...info, online: false, checked: true, error: err.message, players: [], at: Date.now() };
      matchzyAt = 0;
    } finally {
      polling = false;
      onUpdate();
    }
  }

  // Сервер выключен — спрашиваем реже, чтобы не сыпать ошибками
  setTimeout(function loop() {
    poll().finally(() => setTimeout(loop, (info.online ? opts.pollSec : Math.max(10, opts.pollSec)) * 1000));
  }, 1500);

  // ---------------------------------------------------------------- команды матча

  // С MatchZy — его команды, без него — обычные mp_*
  const CMD = {
    start: () => (info.matchzy ? 'css_start' : 'mp_warmup_end'),
    pause: () => (info.matchzy ? 'css_forcepause' : 'mp_pause_match'),
    unpause: () => (info.matchzy ? 'css_forceunpause' : 'mp_unpause_match')
  };

  async function matchCmd(kind, say) {
    try {
      await run(CMD[kind]());
      note(say);
      setTimeout(poll, 400);
      return { ok: true };
    } catch (err) {
      return { error: `Сервер CS2: ${err.message}` };
    }
  }

  /** «Пауза + реклама»: пауза включится с заморозкой следующего раунда — тогда и запускаем ролики. */
  async function pauseWithAds() {
    const a = state.s.ads;
    if (!(a.queue || []).length) return { error: 'Очередь рекламы пуста — отметьте ролики во вкладке «Реклама»' };
    if (!ads.publicState().mainConnected) return { error: 'OBS-оверлей не подключён — реклама не запустится' };
    if (games.cs2.paused()) {
      const out = ads.play();
      if (out && out.error) return out;
      note('Пауза уже идёт — реклама запущена');
      return { ok: true, started: true };
    }
    const out = await matchCmd('pause', 'Пауза заказана — реклама начнётся вместе с паузой');
    if (out.error) return out;
    armed = { at: Date.now() };
    onUpdate();
    return { ok: true, armed: true };
  }

  function cancelArmed(why) {
    if (!armed) return;
    armed = null;
    if (why) note(why);
    onUpdate();
  }

  // Ждём паузу из данных игры (GSI): phase = paused / timeout
  setInterval(() => {
    if (!armed) return;
    if (Date.now() - armed.at > 4 * 60000) return cancelArmed('Пауза так и не началась за 4 минуты — реклама отменена');
    if (!games.cs2.paused()) return;
    armed = null;
    const out = ads.play();
    note(out && out.error ? `Пауза началась, но реклама не запустилась: ${out.error}` : 'Пауза началась — реклама запущена', out && out.error ? 'error' : 'info');
  }, 300);

  /** Названия команд из пульта → сервер. mp_teamname_1 — команда, начавшая карту за CT. */
  async function sendTeamNames(quiet) {
    const teams = state.s.shared.teams;
    const ctTeam = state.s.cs2.sides.aStart === 'T' ? 'B' : 'A';
    const tTeam = ctTeam === 'A' ? 'B' : 'A';
    const clean = (s) => String(s || '').replace(/["';\r\n]/g, '').trim().slice(0, 32);
    const n1 = clean(teams[ctTeam].name), n2 = clean(teams[tTeam].name);
    if (!n1 || !n2) return { error: 'Сначала впишите названия обеих команд' };
    try {
      await run(`mp_teamname_1 "${n1}"; mp_teamname_2 "${n2}"`);
      if (!quiet) note(`Названия команд на сервере: ${n1} (CT) и ${n2} (T)`);
      return { ok: true };
    } catch (err) {
      return { error: `Сервер CS2: ${err.message}` };
    }
  }

  // ---------------------------------------------------------------- события MatchZy

  const EVENT_TEXT = {
    going_live: 'Матч начался (going live)',
    series_start: 'Серия создана',
    side_picked: 'Выбрана сторона после ножа',
    map_picked: 'Пик карты',
    map_vetoed: 'Бан карты',
    series_end: 'Серия закончилась',
    game_paused: 'Пауза',
    game_unpaused: 'Пауза снята',
    knife_start: 'Нож-раунд'
  };

  function onMatchzy(ev) {
    const name = String(ev.event || '');
    if (name === 'round_end') return;           // раунды HUD видит и так, из GSI
    if (name === 'map_result') {
      const map = games.cs2.state().game?.map?.name || 'map';
      const key = `${map}#${ev.matchid ?? ''}#${ev.map_number ?? ''}`;
      const last = finished.get(key);
      if (last && Date.now() - last < 10 * 60000) return;
      finished.set(key, Date.now());
      if (!srv().autoFinish) return note('MatchZy: карта сыграна (итог не записан — авто-запись выключена)');
      // Счёт берём из игры, как кнопка «Карта сыграна»: GSI ещё держит финальный счёт
      setTimeout(() => {
        const out = games.cs2.finishMap({});
        note(out.error ? `MatchZy: карта сыграна, но итог не записан: ${out.error}` : 'MatchZy: карта сыграна — итог записан в «Карты серии»', out.error ? 'error' : 'info');
      }, 1500);
      return;
    }
    if (name === 'going_live' && srv().autoTeamNames) {
      sendTeamNames(true).then((out) => { if (out.error) note(`Названия команд не отправлены: ${out.error}`, 'error'); });
    }
    if (name === 'going_live') cancelArmed();
    note(`MatchZy: ${EVENT_TEXT[name] || name}`);
  }

  // ---------------------------------------------------------------- доступ

  // Сервер HUD виден всей сети арены, в том числе игрокам. Команды серверу — только
  // с этого компьютера или с паролем rcon (заголовок X-Rcon-Password).
  function isLocal(req) {
    const ip = String(req.socket.remoteAddress || '');
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  }
  function trusted(req) {
    if (isLocal(req)) return true;
    try { return panel.sameSecret(req.get('x-rcon-password') || '', conf().password); } catch { return false; }
  }

  // ---------------------------------------------------------------- HTTP

  function routes(app) {
    app.get('/api/cs2server', (req, res) => res.json({ ...publicState(), local: isLocal(req) }));

    app.post('/api/cs2server/login', (req, res) => {
      if (!trusted(req)) return res.status(401).json({ error: 'Неверный пароль (rcon_password из cs2-server/cfg/server.cfg)' });
      res.json({ ok: true });
    });

    app.post('/api/cs2server/cmd', async (req, res) => {
      if (!trusted(req)) return res.status(401).json({ error: 'Нужен пароль rcon' });
      const cmd = String((req.body && req.body.cmd) || '').trim();
      if (!cmd || /[\r\n]/.test(cmd) || cmd.length > 300) return res.status(400).json({ error: 'Пустая или неверная команда' });
      try {
        const output = await run(cmd);
        console.log(`[cs2-server] ${req.socket.remoteAddress} > ${cmd}`);
        setTimeout(poll, 400);
        res.json({ ok: true, output });
      } catch (err) {
        res.status(502).json({ error: err.message });
      }
    });

    app.post('/api/cs2server/settings', (req, res) => {
      if (!trusted(req)) return res.status(401).json({ error: 'Нужен пароль rcon' });
      const b = req.body || {};
      change(() => {
        for (const k of ['autoFinish', 'autoTeamNames']) if (typeof b[k] === 'boolean') srv()[k] = b[k];
      });
      res.json(srv());
    });

    // События MatchZy: matchzy_remote_log_url в cs2-server/cfg/MatchZy/config.cfg
    app.post('/api/matchzy', (req, res) => {
      const token = req.get('x-hud-token') || '';
      if (config.requireToken !== false && token !== config.token) {
        console.warn('[cs2-server] событие MatchZy с неверным токеном — проверьте matchzy_remote_log_header_value');
        return res.status(401).json({ error: 'token' });
      }
      try { onMatchzy(req.body || {}); } catch (err) { console.error('[cs2-server] событие MatchZy:', err.message); }
      res.json({ ok: true });
    });
  }

  /** Действия для пультов, агента хоткеев и Stream Deck (/api/action/srv-…) */
  function actions(add) {
    add('srv-start', 'Сервер CS2: начать матч', ['cs2'], () => matchCmd('start', 'Матч начат кнопкой пульта'), true);
    add('srv-pause', 'Сервер CS2: пауза', ['cs2'], () => matchCmd('pause', 'Пауза заказана — начнётся с заморозкой следующего раунда'), true);
    add('srv-unpause', 'Сервер CS2: снять паузу', ['cs2'], () => { cancelArmed(); return matchCmd('unpause', 'Пауза снята'); }, true);
    add('srv-pause-ads', 'Сервер CS2: пауза + реклама', ['cs2'], () => pauseWithAds(), true);
    add('srv-teamnames', 'Сервер CS2: названия команд на сервер', ['cs2'], () => sendTeamNames(false), true);
  }

  function publicState() {
    const people = info.players.filter((p) => p.name !== 'SourceTV' && !/GOTV/i.test(p.name));
    return {
      online: info.online,
      checked: info.checked,
      error: info.error,
      map: info.map,
      matchzy: info.matchzy,
      humans: people.filter((p) => !p.bot).length,
      bots: people.filter((p) => p.bot).length,
      players: people.map(({ id, name, ping, time, bot }) => ({ id, name, ping, time, bot })),
      armed: !!armed,
      settings: { ...srv() },
      events: events.slice(0, 12)
    };
  }

  return { routes, actions, trusted, publicState, poll };
}

module.exports = { createCs2Server };
