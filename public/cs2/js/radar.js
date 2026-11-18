/* Радар CS2 — левый верхний угол HUD.

   Картинки карт и калибровка — public/assets/radar/ (взяты из файлов CS2:
   panorama/images/overheadmaps и resource/overviews). Мировые координаты
   игрока переводятся в пиксели картинки так же, как это делает сама игра:
       x_px = (x − posX) / scale,   y_px = (posY − y) / scale   (картинка 1024×1024)

   Игроки двигаются плавно: между пакетами (10 в секунду) позиция
   досчитывается каждый кадр. На картах с двумя этажами (Nuke, Train, Vertigo)
   нижний этаж — отдельное окно под радаром: оно появляется, когда там
   кто-то есть (игрок, бомба, граната), игрок уходит туда по высоте. */

const Radar = (() => {
  const SIZE = 320;          // сторона радара на экране, px
  const INSET = 170;         // сторона окна нижнего этажа
  const LERP_MS = 120;       // за сколько догонять новую позицию
  const SMOKE_R = 144;       // радиус дыма в единицах мира
  const FLAME_R = 60;        // радиус одного очага огня

  const root = document.getElementById('radar');
  const mainImg = root.querySelector('.radar__map');
  const lowerBox = root.querySelector('.radar__lower');
  const lowerImg = root.querySelector('.radar__lower-map');
  const marks = root.querySelector('.radar__marks');
  const lowerMarks = root.querySelector('.radar__lower-marks');
  const label = root.querySelector('.radar__label');

  let maps = null;
  fetch('/assets/radar/maps.json').then((r) => r.json()).then((d) => { maps = d.maps || {}; }).catch(() => { maps = {}; });

  let mapKey = null;
  let view = null;           // { m, k, ox, oy, ik } — масштаб и сдвиги основной картинки и вставки
  const players = new Map(); // steamid → { el, from, to, at, yaw, lower }
  let showNades = true;
  let lastGame = null;

  // ---------------------------------------------------------------- карта

  function setupMap(key) {
    mapKey = key;
    const m = maps && maps[key];
    if (!m) { view = null; return; }

    // Приближаем область, где на картинке сама карта (bounds), квадратом.
    const [x0, y0, x1, y1] = m.bounds || [0, 0, 1, 1];
    const side = Math.max(x1 - x0, y1 - y0) * 1024;
    const k = SIZE / side;
    const cx = (x0 + x1) / 2 * 1024;
    const cy = (y0 + y1) / 2 * 1024;
    const ox = SIZE / 2 - cx * k;
    const oy = SIZE / 2 - cy * k;
    view = { m, k, ox, oy, ik: INSET / 1024 };

    mainImg.src = `/assets/radar/${m.image}`;
    mainImg.style.width = `${1024 * k}px`;
    mainImg.style.transform = `translate(${ox}px, ${oy}px)`;

    lowerBox.hidden = true;
    if (m.lower) lowerImg.src = `/assets/radar/${m.lower.image}`;

    marks.innerHTML = '';
    lowerMarks.innerHTML = '';
    players.clear();
  }

  /** Мир → пиксели картинки 1024 */
  function toImage(pos) {
    const m = view.m;
    return [(pos[0] - m.posX) / m.scale, (m.posY - pos[1]) / m.scale];
  }

  function onLower(pos) {
    return !!(view.m.lower && pos && pos[2] < view.m.lower.below);
  }

  /** Мир → экранные px внутри радара (или вставки нижнего этажа) */
  function toScreen(pos, lower) {
    const [ix, iy] = toImage(pos);
    if (lower) return [ix * view.ik, iy * view.ik];
    return [view.ox + ix * view.k, view.oy + iy * view.k];
  }

  // ---------------------------------------------------------------- данные

  function update(g, show, nades) {
    lastGame = g;
    showNades = nades !== false;
    const key = g && g.map ? g.map.key || g.map.name : null;
    if (!maps || !show || !g || !key) { root.hidden = true; return; }
    if (key !== mapKey) setupMap(key);
    if (!view) { root.hidden = true; return; }
    root.hidden = false;
    label.textContent = g.map.label || key;

    const now = performance.now();
    const seen = new Set();
    for (const p of [...g.a.players, ...g.b.players]) {
      seen.add(p.steamid);
      let rec = players.get(p.steamid);
      if (!rec) {
        const el = document.createElement('div');
        el.className = 'rp';
        el.innerHTML = '<i class="rp__dir"></i><b class="rp__num"></b>';
        rec = { el, from: null, to: null, at: now, yaw: 0, lower: false };
        players.set(p.steamid, rec);
      }
      // Убитый остаётся там, где погиб (позиция мёртвого в игре может прыгать)
      if (p.pos && (p.alive || !rec.to)) {
        const lower = onLower(p.pos);
        const pt = toScreen(p.pos, lower);
        if (lower !== rec.lower) { rec.from = pt; }
        else rec.from = rec.to ? current(rec, now) : pt;
        rec.to = pt;
        rec.at = now;
        rec.lower = lower;
        (lower ? lowerMarks : marks).appendChild(rec.el);
      }
      if (p.yaw !== null && p.yaw !== undefined) rec.yaw = p.yaw;
      const el = rec.el;
      el.classList.toggle('is-t', p.side === 'T');
      el.classList.toggle('is-ct', p.side !== 'T');
      el.classList.toggle('is-dead', !p.alive);
      el.classList.toggle('is-observed', !!p.observed && p.alive);
      el.classList.toggle('has-bomb', !!p.hasBomb && p.alive);
      el.classList.toggle('is-flashed', p.alive && p.flashed > 120);
      el.querySelector('.rp__num').textContent = p.slot !== null && p.slot !== undefined ? String((Number(p.slot) + 1) % 10) : '';
      el.hidden = !rec.to;
    }
    for (const [id, rec] of players) {
      if (!seen.has(id)) { rec.el.remove(); players.delete(id); }
    }
    drawStatic(g);

    // Окно нижнего этажа — только когда там что-то есть
    const busy = !!view.m.lower && lowerMarks.querySelector('.rp:not(.is-dead), .rn, .rb') !== null;
    lowerBox.hidden = !busy;
  }

  /** Видно ли сейчас окно нижнего этажа (оверлей сдвигает под него таймер) */
  function lowerShown() { return !root.hidden && !lowerBox.hidden; }

  function current(rec, now) {
    if (!rec.from) return rec.to;
    const t = Math.min(1, (now - rec.at) / LERP_MS);
    return [rec.from[0] + (rec.to[0] - rec.from[0]) * t, rec.from[1] + (rec.to[1] - rec.from[1]) * t];
  }

  // Бомба и гранаты: перерисовываются на каждом пакете
  function drawStatic(g) {
    root.querySelectorAll('.rn, .rb').forEach((n) => n.remove());
    const add = (cls, pos, html, size) => {
      const lower = onLower(pos);
      const [x, y] = toScreen(pos, lower);
      const n = document.createElement('div');
      n.className = cls;
      n.style.transform = `translate(${x}px, ${y}px)`;
      if (size) { n.style.width = n.style.height = `${size}px`; n.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`; }
      if (html) n.innerHTML = html;
      (lower ? lowerMarks : marks).prepend(n);
      return n;
    };
    const scaleFor = (pos) => (onLower(pos) ? view.ik : view.k) / view.m.scale;

    if (showNades) {
      for (const n of g.grenades || []) {
        if (n.type === 'smoke' && n.deployed) {
          add('rn rn--smoke', n.pos, '', 2 * SMOKE_R * scaleFor(n.pos));
        } else if (n.type === 'fire') {
          for (const f of n.flames) add(`rn rn--fire${n.side === 'CT' ? ' is-ct' : ''}`, f, '', Math.max(5, 2 * FLAME_R * scaleFor(f)));
        } else if (n.pos) {
          add(`rn rn--fly rn--${n.type}`, n.pos, '', 0);
        }
      }
    }

    // Бомба: у игрока — значок на его точке (has-bomb), иначе — на земле
    const b = g.bomb || {};
    if (b.pos && ['dropped', 'planted', 'planting', 'defusing', 'defused', 'exploded'].includes(b.state)) {
      add(`rb rb--${b.state}`, b.pos, '<svg class="ico"><use href="#i-bomb"/></svg>', 0);
    }
  }

  // ---------------------------------------------------------------- кадр

  (function frame() {
    if (view && !root.hidden) {
      const now = performance.now();
      for (const rec of players.values()) {
        if (!rec.to) continue;
        const [x, y] = current(rec, now);
        rec.el.style.transform = `translate(${x}px, ${y}px)`;
        // На радаре ось Y смотрит вниз, поэтому угол взгляда с минусом
        rec.el.style.setProperty('--yaw', `${-rec.yaw}deg`);
      }
    }
    requestAnimationFrame(frame);
  })();

  return { update, lowerShown, get map() { return mapKey; } };
})();
