// Панель админа CS2: веб-страница с кнопками, команды уходят серверу по rcon.
// Без зависимостей. Запуск: panel.bat (или node panel/server.js). Самопроверка: node panel/server.js --selftest
'use strict';
const http = require('http');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PANEL_PORT = Number(process.env.PANEL_PORT) || 8080;
let detectedIp = null; // кэш: detect-ip.ps1 запускаем один раз

// Настройки берём из тех же файлов, что и сервер, чтобы не было второго места с паролем и IP.
function readConfig() {
  const settings = fs.readFileSync(path.join(ROOT, 'settings.bat'), 'latin1');
  const cfg = fs.readFileSync(path.join(ROOT, 'cfg', 'server.cfg'), 'utf8');
  const get = (re, text, name) => {
    const m = text.match(re);
    if (!m) throw new Error(`Не найдено: ${name}`);
    return m[1];
  };
  // panel.bat вызывает settings.bat, поэтому уже определённый IP (SERVER_IP=auto) приходит через окружение.
  let host = process.env.SERVER_IP || get(/^set "SERVER_IP=([^"]+)"/m, settings, 'SERVER_IP в settings.bat');
  if (host === 'auto') {
    detectedIp ??= require('child_process').execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'detect-ip.ps1')], { encoding: 'utf8' }).trim();
    host = detectedIp;
  }
  if (!host) throw new Error('Не удалось определить IP сервера: впишите его в settings.bat');
  return {
    host,
    port: Number(process.env.GAME_PORT || get(/^set "GAME_PORT=(\d+)"/m, settings, 'GAME_PORT в settings.bat')),
    password: get(/^\s*rcon_password\s+"([^"]*)"/m, cfg, 'rcon_password в cfg/server.cfg'),
  };
}

function packet(id, type, body) {
  const b = Buffer.from(body, 'utf8');
  const buf = Buffer.alloc(14 + b.length);
  buf.writeInt32LE(10 + b.length, 0);
  buf.writeInt32LE(id, 4);
  buf.writeInt32LE(type, 8);
  b.copy(buf, 12);
  return buf;
}

// Разбирает накопленный буфер на пакеты rcon, возвращает [пакеты, остаток].
function parsePackets(buf) {
  const out = [];
  while (buf.length >= 4) {
    const size = buf.readInt32LE(0);
    if (size < 10 || buf.length < 4 + size) break;
    out.push({ id: buf.readInt32LE(4), type: buf.readInt32LE(8), body: buf.toString('utf8', 12, 4 + size - 2) });
    buf = buf.subarray(4 + size);
  }
  return [out, buf];
}

// Одна команда = одно соединение: просто и не надо следить за обрывами.
function rcon(cmd, conf = readConfig()) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: conf.host, port: conf.port });
    let buf = Buffer.alloc(0), authed = false, body = '', idle = null;
    const fail = (msg) => { sock.destroy(); reject(new Error(msg)); };
    const done = () => { sock.destroy(); resolve(body); };
    sock.setTimeout(4000, () => (authed && body !== '' ? done() : fail('Сервер не отвечает')));
    sock.on('error', (e) => reject(new Error(e.code === 'ECONNREFUSED' ? 'Сервер CS2 не запущен' : e.message)));
    sock.on('connect', () => sock.write(packet(1, 3, conf.password)));
    sock.on('data', (chunk) => {
      let pkts;
      [pkts, buf] = parsePackets(Buffer.concat([buf, chunk]));
      for (const p of pkts) {
        if (!authed) {
          if (p.type !== 2) continue; // перед ответом на авторизацию идёт пустой пакет
          if (p.id === -1) return fail('Неверный rcon_password');
          authed = true;
          sock.write(packet(2, 2, cmd));
        } else {
          body += p.body;
          // Длинный ответ приходит несколькими пакетами: ждём тишины.
          clearTimeout(idle);
          idle = setTimeout(done, 250);
        }
      }
    });
  });
}

// Вывод команды status -> { map, players: [{id, name, ping, time, bot}] }
function parseStatus(text) {
  const map = (text.match(/spawngroup\(\s*1\)\s*:\s*SV:\s*\[1:\s*(\S+)/) || [])[1] || null;
  const players = [];
  const section = text.split('---------players--------')[1] || '';
  for (const line of section.split('\n')) {
    if (line.startsWith('#end')) break;
    const m = line.match(/^\s*(\d+)\s+(\S+)\s+(\d+)\s+(\d+)\s+(\S+)\s+\d+\s*(?:\S+\s+)?'(.*)'\s*$/);
    if (!m || m[1] === '65535') continue; // 65535 = незавершённое подключение
    players.push({ id: Number(m[1]), time: m[2], ping: Number(m[3]), state: m[5], name: m[6], bot: m[2] === 'BOT' });
  }
  return { map, players };
}

function sameSecret(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 4096) reject(new Error('Слишком длинный запрос')); });
    req.on('end', () => resolve(data));
  });
}

async function handle(req, res) {
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
  }
  if (!req.url.startsWith('/api/')) return send(res, 404, { error: 'Нет такой страницы' });

  let conf;
  try { conf = readConfig(); } catch (e) { return send(res, 500, { error: e.message }); }
  // Панель видна всей сети арены, включая игроков: без пароля rcon ничего не делаем.
  if (!sameSecret(req.headers['x-panel-password'] || '', conf.password)) return send(res, 401, { error: 'Неверный пароль' });

  try {
    if (req.method === 'GET' && req.url === '/api/status') {
      const status = parseStatus(await rcon('status', conf));
      // С MatchZy кнопки матча шлют его команды (css_start и т.д.), без него - обычные mp_*.
      const matchzy = /"MatchZy"/.test(await rcon('css_plugins list', conf).catch(() => ''));
      return send(res, 200, { online: true, matchzy, ...status });
    }
    if (req.method === 'POST' && req.url === '/api/cmd') {
      const { cmd } = JSON.parse(await readBody(req));
      if (typeof cmd !== 'string' || !cmd.trim() || /[\r\n]/.test(cmd)) return send(res, 400, { error: 'Пустая или неверная команда' });
      console.log(new Date().toLocaleTimeString(), req.socket.remoteAddress, cmd);
      return send(res, 200, { output: await rcon(cmd.trim(), conf) });
    }
    return send(res, 404, { error: 'Нет такого метода' });
  } catch (e) {
    return send(res, 200, { online: false, error: e.message });
  }
}

function selftest() {
  const assert = require('assert');
  const sample = [
    'loaded spawngroup(  1)  : SV:  [1: de_mirage | main lump | mapload]',
    '---------players--------',
    '  id     time ping loss      state   rate adr name',
    "   0      BOT    0    0     active      0 'SourceTV'",
    "   1    01:41   12    0     active 786432 192.168.0.100:56651 'yasha korniy'",
    "65535 [NoChan]    0    0 challenging      0unknown ''",
    '#end',
  ].join('\n');
  const s = parseStatus(sample);
  assert.strictEqual(s.map, 'de_mirage');
  assert.deepStrictEqual(s.players.map((p) => [p.id, p.name, p.bot, p.ping]), [[0, 'SourceTV', true, 0], [1, 'yasha korniy', false, 12]]);
  const [pkts, rest] = parsePackets(Buffer.concat([packet(7, 0, 'привет'), packet(8, 0, 'x').subarray(0, 5)]));
  assert.deepStrictEqual(pkts, [{ id: 7, type: 0, body: 'привет' }]);
  assert.strictEqual(rest.length, 5);
  assert.ok(sameSecret('a', 'a') && !sameSecret('a', 'b'));
  console.log('selftest ok');
}

if (process.argv.includes('--selftest')) selftest();
else {
  http.createServer((req, res) => handle(req, res).catch((e) => send(res, 500, { error: e.message })))
    .listen(PANEL_PORT, '0.0.0.0', () => {
      const c = readConfig();
      console.log(`Панель админа: http://localhost:${PANEL_PORT}  (с других ПК арены: http://${c.host}:${PANEL_PORT})`);
      console.log(`Пароль для входа = rcon_password из cfg\\server.cfg. Сервер CS2: ${c.host}:${c.port}`);
      console.log('Не закрывайте это окно, пока пользуетесь панелью.');
    })
    .on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Порт ${PANEL_PORT} занят: панель уже запущена?` : e.message); process.exit(1); });
}
