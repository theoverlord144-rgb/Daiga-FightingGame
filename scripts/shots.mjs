// Pictures of real game frames without a browser:  node scripts/shots.mjs <out-folder>
//
// Loads the real renderer through Vite, gives it a small software canvas (sprites, flips, light blending and flat
// fills only: no text, no outlines, no gradients, no HUD), plays scripted situations with the real game rules and
// saves a PNG of the moments worth looking at. It shows whether the fighters' drawings and the effects land in the
// right place at the right size. It is not the game's real screen: the HUD and the stage are left out.
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { decodePng, encodePng } from './png.mjs';

const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });

// ---------- a tiny software canvas ----------
const colour = (s) => {
  if (typeof s !== 'string' || s[0] !== '#') return [40, 36, 50, 255];
  const h = s.slice(1);
  const full = h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), full.length >= 8 ? parseInt(full.slice(6, 8), 16) : 255];
};
function canvas(W, H) {
  const px = new Uint8ClampedArray(W * H * 4);
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const none = () => {};
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '', textAlign: 'left', lineCap: 'butt',
    save() { stack.push([m.slice(), this.globalAlpha, this.globalCompositeOperation]); },
    restore() { const s = stack.pop(); if (s) [m, this.globalAlpha, this.globalCompositeOperation] = s; },
    translate(x, y) { m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; },
    scale(x, y) { m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = [m[0] * c + m[2] * s, m[1] * c + m[3] * s, m[2] * c - m[0] * s, m[3] * c - m[1] * s, m[4], m[5]]; },
    put(i, r, g, b, a) {
      if (a <= 0) return;
      if (this.globalCompositeOperation === 'lighter') { px[i] += r * a; px[i + 1] += g * a; px[i + 2] += b * a; } else { px[i] = r * a + px[i] * (1 - a); px[i + 1] = g * a + px[i + 1] * (1 - a); px[i + 2] = b * a + px[i + 2] * (1 - a); }
      px[i + 3] = 255;
    },
    fillRect(x, y, w, h) {
      if (typeof this.fillStyle !== 'string') return; // gradients are left out
      const [r, g, b, a] = colour(this.fillStyle);
      const x0 = Math.max(0, Math.round(m[4] + x * m[0])), x1 = Math.min(W, Math.round(m[4] + (x + w) * m[0]));
      const y0 = Math.max(0, Math.round(m[5] + y * m[3])), y1 = Math.min(H, Math.round(m[5] + (y + h) * m[3]));
      for (let yy = Math.min(y0, y1); yy < Math.max(y0, y1); yy++) for (let xx = Math.min(x0, x1); xx < Math.max(x0, x1); xx++) this.put((yy * W + xx) * 4, r, g, b, (a / 255) * this.globalAlpha);
    },
    drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh) {
      if (!img?.data) return;
      const det = m[0] * m[3] - m[1] * m[2];
      if (!det) return;
      const corners = [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]].map(([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]);
      const x0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[0])))), x1 = Math.min(W - 1, Math.ceil(Math.max(...corners.map((c) => c[0]))));
      const y0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c[1])))), y1 = Math.min(H - 1, Math.ceil(Math.max(...corners.map((c) => c[1]))));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const ux = x + 0.5 - m[4], uy = y + 0.5 - m[5];
        const lx = (m[3] * ux - m[2] * uy) / det, ly = (m[0] * uy - m[1] * ux) / det; // back to the drawing's own space
        const u = (lx - dx) / dw, v = (ly - dy) / dh;
        if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
        const ix = Math.floor(sx + u * sw), iy = Math.floor(sy + v * sh);
        if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) continue;
        const s = (iy * img.width + ix) * 4;
        this.put((y * W + x) * 4, img.data[s], img.data[s + 1], img.data[s + 2], (img.data[s + 3] / 255) * this.globalAlpha);
      }
    },
    createLinearGradient: () => ({ addColorStop: none }), createRadialGradient: () => ({ addColorStop: none }),
    beginPath: none, moveTo: none, lineTo: none, stroke: none, fill: none, arc: none, ellipse: none, rect: none, clip: none, closePath: none,
    strokeRect: none, fillText: none, measureText: () => ({ width: 0 }), setLineDash: none, quadraticCurveTo: none, bezierCurveTo: none, roundRect: none,
  };
  return { ctx, px, clear() { for (let i = 0; i < W * H; i++) { px[i * 4] = 34; px[i * 4 + 1] = 30; px[i * 4 + 2] = 44; px[i * 4 + 3] = 255; } } };
}
// Images load straight from the project's files.
globalThis.Image = class {
  set src(v) {
    this._src = v;
    try {
      const im = decodePng(fs.readFileSync(path.join(process.cwd(), decodeURIComponent(String(v).split('?')[0]).replace(/^\/+/, ''))));
      this.data = im.data; this.width = this.naturalWidth = im.width; this.height = this.naturalHeight = im.height; this.complete = true;
    } catch { this.complete = false; this.naturalWidth = 0; }
  }
  get src() { return this._src; }
};
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => canvas(1, 1).ctx }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const boot = await server.ssrLoadModule('/src/ui/boot.js');
  const { createFightRenderer } = await server.ssrLoadModule('/src/render/fight-renderer.js');
  const { createGame, step } = await server.ssrLoadModule('/src/core/game.js');
  const { RAW } = await server.ssrLoadModule('/src/core/input.js');
  const { enterState } = await server.ssrLoadModule('/src/core/fighter.js');
  const chars = boot.loadCharacters();
  const { W, H } = boot;
  const B = { L: RAW.L, M: RAW.M, H: RAW.H, S: RAW.S, R: RAW.R, U: RAW.UP, D: RAW.DOWN, F: RAW.RIGHT, K: RAW.LEFT };
  /** "MH" → the raw input holding those (F = right, K = left, U, D). */
  const raw = (s) => [...(s || '')].reduce((a, c) => a | (B[c] ?? 0), 0);

  /** One situation: a = Player 1 (left, facing right), b = Player 2. gap = px between them. */
  const ONLY = process.argv[3] || ''; // a second argument: only the scenes whose name starts with it
  function scene(name, a, b, gap, play) {
    if (ONLY && !name.startsWith(ONLY)) return;
    const world = boot.makeWorld(chars[a], chars[b], null);
    const game = createGame(world);
    const c = canvas(W, H);
    const renderer = createFightRenderer(c.ctx, W, H);
    game.players[0].x = -gap * 50; game.players[1].x = gap * 50;
    for (const p of game.players) p.meter = 40000;
    let n = 0;
    const api = {
      game, world,
      /** Step `frames` times holding p1 / p2 (strings of buttons). */
      go(p1, p2, frames = 1) { for (let i = 0; i < frames; i++) { step(game, [raw(p1), raw(p2)], world); renderer.notice(game, world); } },
      /** Step until test(game) is true (at most `max` frames); returns whether it happened. */
      until(p1, p2, test, max = 120) { for (let i = 0; i < max; i++) { api.go(p1, p2); if (test(game)) return true; } return false; },
      cue: (type) => (g) => g.cues.some((q) => q.type === type),
      shot(label) {
        c.clear();
        renderer.draw(game, world, { hud: false, zoom: false, palettes: [0, 0], ...(this.opts ?? {}) });
        const file = path.join(OUT, `${name}-${String(++n).padStart(2, '0')}-${label}.png`);
        fs.writeFileSync(file, encodePng({ width: W, height: H, data: Buffer.from(c.px) }));
        console.log(`${file}  [P1 ${game.players[0].state} ${game.players[0].frame}, P2 ${game.players[1].state} ${game.players[1].frame}]`);
      },
    };
    play(api);
  }

  // ----- Avner, the Lampbearer (node scripts/shots.mjs <folder> lamp) -----
  const qcf = (s, b) => { s.go('D', '', 1); s.go('DF', '', 1); s.go('F' + b, '', 1); };
  const qcb = (s, b) => { s.go('D', '', 1); s.go('DK', '', 1); s.go('K' + b, '', 1); };
  const dp = (s, b) => { s.go('F', '', 1); s.go('D', '', 1); s.go('DF' + b, '', 1); };
  scene('lamp-stand', 'avner', 'malik', 260, (s) => {
    s.go('', '', 20); s.shot('idle');
    s.go('D', '', 30); s.shot('crouch'); s.go('D', '', 70); s.shot('crouch-lantern-down'); s.go('', '', 2); s.shot('stand-up');
    s.go('F', '', 12); s.shot('walk'); s.go('', '', 4);
    s.go('U', '', 1); s.go('', '', 8); s.shot('jump-rising'); s.go('', '', 12); s.shot('jump-apex'); s.go('', '', 14); s.shot('jump-falling'); s.go('', '', 8); s.shot('landed');
    s.go('K', 'L', 3); s.shot('guard'); s.go('K', '', 6); s.shot('pushed-back');
  });
  scene('lamp-normals', 'avner', 'malik', 170, (s) => {
    for (const [name, input, frames] of [['5L', 'L', 5], ['5M', 'M', 9], ['5H', 'H', 15], ['4H', 'KH', 15], ['5S', 'S', 13], ['2M', 'DM', 10]]) {
      s.go('', '', 50); s.game.players[1].x = s.game.players[0].x + 17000; s.go(input, '', 1); s.go(input.includes('D') ? 'D' : '', '', frames); s.shot(name);
    }
    s.go('', '', 60); s.go('U', '', 1); s.go('', '', 14); s.go('H', '', 1); s.go('', '', 13); s.shot('jH');
  });
  scene('lamp-heavy', 'avner', 'malik', 150, (s) => {
    s.go('', '', 20); s.go('H', '', 1); s.go('', '', 12); s.shot('5H-last-startup'); s.go('', '', 4); s.shot('5H-hitstop'); s.go('', '', 22); s.shot('5H-after');
    s.go('', '', 70); s.game.players[1].x = s.game.players[0].x + 15000; s.go('DH', '', 1); s.go('D', '', 6); s.shot('2H-reach'); s.go('D', '', 7); s.shot('2H-slide'); s.go('D', '', 18); s.shot('2H-recover');
  });
  scene('lamp-low', 'avner', 'malik', 120, (s) => {
    s.go('', '', 10); s.go('DL', '', 1); s.go('D', '', 4); s.shot('2L'); s.go('D', '', 40); s.go('DH', '', 1); s.go('D', '', 9); s.shot('2H-sliding');
  });
  scene('lamp-drag', 'avner', 'malik', 230, (s) => {
    s.go('', '', 10); s.go('DFH', '', 1); s.go('', '', 3); s.shot('windup'); s.go('', '', 5); s.shot('lunge'); s.go('', '', 3); s.shot('kick');
    s.until('', '', s.cue('hit'), 10); s.shot('hit'); s.go('', '', 3); s.shot('sparks'); s.go('', '', 14); s.shot('drag'); s.go('', '', 8); s.shot('rise'); s.go('', '', 12); s.shot('up');
  });
  // Rebound Strike (j.2H) and Moon Phase Assault (j.236): node scripts/shots.mjs <folder> moon   (one picture per frame)
  /** Films `n` frames, one picture each; p1(game, i) gives Player 1's buttons for that frame. */
  const filmEach = (s, n, p1 = () => '', p2 = '') => { for (let i = 0; i < n; i++) { s.go(p1(s.game, i) || '', p2, 1); s.shot('f'); } };
  /** Player 1 repeats the rekka motion once each listed move has landed (hit or blocked) its count of times. */
  const rekka = (button, needs) => {
    const seen = {}; let roll = 0; const done = new Set();
    return (g) => {
      for (const c of g.cues) if ((c.type === 'hit' || c.type === 'block') && c.p === 0) seen[c.move] = (seen[c.move] ?? 0) + 1;
      if (roll) return ['', 'F' + button, 'DF'][--roll];
      for (const [move, n] of needs) if (!done.has(move) && (seen[move] ?? 0) >= n) { done.add(move); roll = 2; return 'D'; }
      return '';
    };
  };
  const kick = (s) => { s.go('UF', '', 6); s.go('', '', 16); s.go('DH', '', 1); };
  scene('moon-rebound-hit', 'avner', 'malik', 260, (s) => { kick(s); filmEach(s, 28); filmEach(s, 50, (g, i) => (i === 14 ? 'M' : '')); });
  scene('moon-rebound-block', 'avner', 'malik', 260, (s) => { kick(s); filmEach(s, 70, () => '', 'F'); });
  scene('moon-rebound-whiff', 'avner', 'malik', 700, (s) => { kick(s); filmEach(s, 60); });
  const hop = (s, b) => { s.go('U', '', 6); s.go('', '', 22); qcf(s, b); };
  scene('moon-part1', 'avner', 'malik', 120, (s) => { hop(s, 'L'); filmEach(s, 80); });
  scene('moon-part2', 'avner', 'malik', 120, (s) => { hop(s, 'L'); filmEach(s, 110, rekka('L', [['waxingL', 3]])); });
  scene('moon-full', 'avner', 'malik', 120, (s) => { hop(s, 'L'); filmEach(s, 170, rekka('L', [['waxingL', 3], ['halfMoonEndL', 1]])); });
  scene('moon-ex', 'avner', 'malik', 120, (s) => { hop(s, 'LS'); filmEach(s, 200); });
  // The newer sheets (owner, Nov 24): stance, crouch and the ground normals side by side, to check sizes and boxes.
  scene('lamp-bb', 'avner', 'malik', 300, (s) => {
    s.go('', '', 14); s.shot('idle'); s.go('F', '', 12); s.shot('walk'); s.go('', '', 6); s.go('D', '', 2); s.shot('crouch-down'); s.go('D', '', 20); s.shot('crouch');
    s.go('DL', '', 1); s.go('D', '', 5); s.shot('2L'); s.go('D', '', 20); s.go('DM', '', 1); s.go('D', '', 8); s.shot('2M'); s.go('D', '', 30); s.go('DH', '', 1); s.go('D', '', 12); s.shot('2H'); s.go('D', '', 40);
    s.go('', '', 12); s.go('L', '', 1); s.go('', '', 5); s.shot('5L'); s.go('', '', 20); s.go('M', '', 1); s.go('', '', 8); s.shot('5M'); s.go('', '', 30); s.go('H', '', 1); s.go('', '', 12); s.shot('5H'); s.go('', '', 40);
    s.go('S', '', 1); s.go('', '', 10); s.shot('5S'); s.go('', '', 40); s.go('KH', '', 1); s.go('', '', 12); s.shot('4H'); s.go('', '', 16); s.shot('4H-landing');
  });
  scene('lamp-bb-move', 'avner', 'malik', 600, (s) => {
    s.go('U', '', 4); s.go('', '', 6); s.shot('jump-rise'); s.go('', '', 12); s.shot('jump-top'); s.go('', '', 14); s.shot('jump-fall'); s.go('', '', 14);
    s.go('F', '', 1); s.go('', '', 1); s.go('F', '', 1); s.go('', '', 5); s.shot('dash'); s.go('', '', 30); s.go('K', '', 1); s.go('', '', 1); s.go('K', '', 1); s.go('', '', 7); s.shot('backdash'); s.go('', '', 30);
    s.go('U', '', 4); s.go('', '', 10); s.go('F', '', 1); s.go('', '', 1); s.go('F', '', 1); s.go('', '', 7); s.shot('airdash');
  });
  scene('lamp-hop', 'avner', 'malik', 190, (s) => {
    s.go('', '', 10); s.go('FM', '', 1); s.go('', '', 3); s.shot('windup'); s.go('', '', 6); s.shot('hop'); s.go('', '', 8); s.shot('raised');
    s.until('', '', s.cue('hit'), 12); s.shot('hit'); s.go('', '', 4); s.shot('swing'); s.go('', '', 14); s.shot('landed'); s.go('', '', 10); s.shot('rise');
  });
  // ----- The universal hit effects (node scripts/shots.mjs <folder> fx-hits): each kind, 3 and 7 frames after it lands -----
  scene('fx-hits', 'avner', 'malik', 100, (s) => {
    const hit = (label, p1, p2 = '', wait = 0, gap = 100) => {
      s.go('', '', 50); s.game.players[1].x = s.game.players[0].x + gap * 100; for (const p of s.game.players) p.health = 99999;
      if (p2) s.go('', p2, 1);
      s.go('', '', wait); s.go(p1, '', 1);
      const ok = s.until('', '', (g) => g.cues.some((q) => q.type === 'hit' || q.type === 'counter' || q.type === 'witness'), 40);
      const kind = s.game.cues.find((q) => q.type === 'hit' || q.type === 'counter' || q.type === 'witness')?.type ?? 'none';
      s.go('', '', 2); s.shot(label + '-' + kind + '-a'); s.go('', '', 4); s.shot(label + '-' + kind + '-b');
      return ok;
    };
    hit('light', 'L'); hit('medium', 'M'); hit('heavy', 'H');
    hit('counter', 'DL', 'H', 2); // he is hit while his heavy is still winding up
    hit('witness', 'DFH', 'H', 6, 230); // his heavy misses from far; Lantern Drag reaches him while he recovers
  });
  scene('fx-hits-projectile', 'avner', 'malik', 200, (s) => { qcf(s, 'M'); s.until('', '', s.cue('hit'), 60); s.go('', '', 2); s.shot('a'); s.go('', '', 4); s.shot('b'); });
  // ----- Avner's specials with their effects (owner, Nov 25): node scripts/shots.mjs <folder> lamp-sp -----
  // A still every 2 game frames, so the stills played at 30 a second are the move at game speed.
  const film = (s, frames, label) => { for (let k = 0; k < frames; k += 2) { s.shot(label); s.go('', '', 2); } };
  for (const [b, gap] of [['L', 150], ['M', 300], ['H', 500]]) scene('lamp-sp-moon-' + b, 'avner', 'malik', gap, (s) => { qcf(s, b); film(s, 76, 'f'); });
  scene('lamp-sp-moon-ex', 'avner', 'malik', 250, (s) => { qcf(s, 'MS'); film(s, 90, 'f'); });
  for (const b of ['L', 'H']) scene('lamp-sp-halo-' + b, 'avner', 'malik', 70, (s) => { dp(s, b); film(s, 56, 'f'); });
  scene('lamp-sp-tide-M', 'avner', 'malik', 250, (s) => { qcb(s, 'M'); film(s, 70, 'f'); });
  scene('lamp-sp-tide-ex', 'avner', 'malik', 250, (s) => { qcb(s, 'MS'); film(s, 90, 'f'); });
  scene('lamp-sp-moonlit-5', 'avner', 'malik', 300, (s) => { s.go('R', '', 1); film(s, 50, 'f'); });
  scene('lamp-sp-moonlit-2', 'avner', 'malik', 300, (s) => { s.go('DR', '', 1); film(s, 50, 'f'); });
  scene('lamp-sp-moonlit-j', 'avner', 'malik', 300, (s) => { s.go('U', '', 1); s.go('', '', 12); s.go('R', '', 1); film(s, 50, 'f'); });
  scene('lamp-sp-snap', 'avner', 'malik', 110, (s) => { s.go('R', '', 1); s.go('', '', 40); s.go('H', '', 1); s.go('', '', 13); s.go('R', '', 1); s.go('', '', 16); film(s, 60, 'f'); });
  // Everything at once, for the frame-time measure: two moons (EX), a Moonlit zone, then a Tide.
  scene('lamp-sp-busy', 'avner', 'malik', 420, (s) => { s.go('R', '', 1); s.go('', '', 34); qcf(s, 'MS'); s.go('', '', 24); s.shot('two-moons-and-zone'); s.go('', '', 40); qcb(s, 'H'); s.go('', '', 19); s.shot('zone-and-tide'); });
  scene('lamp-supers', 'avner', 'malik', 240, (s) => {
    qcf(s, ''); qcf(s, 'S'); s.go('', '', 3); s.shot('new-moon-flash'); s.until('', '', s.cue('hit'), 60); s.shot('new-moon-hit'); s.go('', '', 12); s.shot('new-moon-after'); s.go('', '', 90);
    s.game.players[0].meter = 40000; qcb(s, ''); qcb(s, 'S'); s.go('', '', 6); s.shot('full-moon-flash'); s.until('', '', s.cue('hit'), 90); s.go('', '', 3); s.shot('full-moon-column');
  });

  // ----- Vow: guard, an absorbed hit, the three strikes, the crumple -----
  scene('pillar', 'malik', 'avner', 200, (s) => {
    s.go('', '', 10); s.go('F', '', 1); s.go('D', '', 1); s.go('DFM', '', 1); s.go('', '', 9); s.shot('rising'); s.go('', '', 5); s.shot('peak'); s.go('', '', 2); s.shot('hit'); s.go('', '', 14); s.shot('fading');
  });
  scene('mthrow', 'malik', 'avner', 60, (s) => {
    s.go('', '', 10); s.go('FH', '', 1); s.go('', '', 3); s.shot('grab'); s.go('', '', 4); s.shot('hold'); s.go('', '', 5); s.shot('push'); s.go('', '', 14); s.shot('after');
  });
  scene('mbthrow', 'malik', 'avner', 60, (s) => {
    s.go('', '', 10); s.go('KH', '', 1); s.go('', '', 3); s.shot('grab'); s.go('', '', 4); s.shot('hold'); s.go('', '', 3); s.shot('heave'); s.go('', '', 5); s.shot('slam'); s.go('', '', 6); s.shot('turned'); s.go('', '', 12); s.shot('after');
  });
  for (const [name, dir] of [['athrow-f', 'F'], ['athrow-b', 'K']]) scene(name, 'avner', 'malik', 60, (s) => {
    s.go('', '', 10); s.go(dir + 'H', '', 1); s.go('', '', 4); s.shot('grab'); s.go('', '', 9); s.shot('hold'); s.go('', '', 6); s.shot('finish-1'); s.go('', '', 8); s.shot('finish-2'); s.go('', '', 8); s.shot('finish-3'); s.go('', '', 12); s.shot('after');
  });
  scene('tech', 'avner', 'malik', 60, (s) => {
    s.go('', '', 10); s.go('FH', '', 1); s.go('', '', 3); s.go('', 'H', 1); s.go('', '', 4); s.shot('guard'); s.go('', '', 5); s.shot('push'); s.go('', '', 6); s.shot('recoil');
  });
  // ----- Avner's blocks, hit reactions, throws and system poses (node scripts/shots.mjs <folder> lamp-sys) -----
  const P0 = (st) => (g) => g.players[0].state === st;
  for (const [label, hold, hit] of [['stand', 'K', 'M'], ['crouch', 'DK', 'DM']]) scene('lamp-sys-block-' + label, 'avner', 'malik', 90, (s) => {
    if (!s.until(hold, hit, s.cue('block'), 40)) return console.log(label + ': no block');
    s.shot('impact'); s.until(hold, '', (g) => !g.players[0].hitstop, 30); s.go(hold, '', 6); s.shot('guard');
    s.until('', '', (g) => !/^block/.test(g.players[0].state), 40); s.go('', '', 1); s.shot('out');
  });
  for (const [label, hold, hit] of [['stand', '', 'M'], ['crouch', 'D', 'DM']]) scene('lamp-sys-hit-' + label, 'avner', 'malik', 90, (s) => {
    if (!s.until(hold, hit, s.cue('hit'), 40)) return console.log(label + ': no hit');
    s.shot('hit'); s.until(hold, '', (g) => !g.players[0].hitstop, 30); s.go(hold, '', 8); s.shot('reel');
  });
  scene('lamp-sys-down', 'avner', 'malik', 90, (s) => {
    if (!s.until('', 'DH', P0('knockdown'), 80)) return console.log('down: no knockdown, in ' + s.game.players[0].state);
    s.go('', '', 2); s.shot('landing'); s.go('', '', 12); s.shot('lying');
    if (!s.until('', '', P0('wakeup'), 80)) return console.log('down: no wakeup');
    s.go('', '', 1); s.shot('up-1'); s.go('', '', 3); s.shot('up-2'); s.go('', '', 3); s.shot('up-3'); s.go('', '', 3); s.shot('up-4');
  });
  scene('lamp-sys-air', 'avner', 'malik', 90, (s) => {
    if (!s.until('', 'S', (g) => /^hit(Air|Tumble)$/.test(g.players[0].state), 60)) return console.log('air: not launched, in ' + s.game.players[0].state);
    for (let n = 1; n <= 8; n++) { s.until('', '', (g) => !g.players[0].hitstop, 30); s.go('', '', 5); s.shot('fall-' + n); }
  });
  for (const [label, dir, wait] of [['f', 'F', 12], ['b', 'K', 8]]) scene('lamp-sys-throw-' + label, 'avner', 'malik', 60, (s) => {
    s.go('', '', 10); s.go(dir + 'H', '', 1); s.go('', '', 3); s.shot('grab'); s.go('', '', 6); s.shot('hold-2'); s.go('', '', 5); s.shot('hold-3');
    s.go('', '', 3); s.shot('finish-1'); s.go('', '', 7); s.shot('finish-2'); s.go('', '', wait - 6); s.shot('finish-3'); s.go('', '', 12); s.shot('finish-4');
  });
  scene('lamp-sys-vow', 'avner', 'malik', 90, (s) => {
    s.go('MH', '', 3); s.shot('start'); s.go('MH', '', 12); s.shot('hold');
    if (s.until('MH', 'M', s.cue('absorb'), 40)) { s.go('MH', '', 2); s.shot('absorb-1'); s.go('MH', '', 9); s.shot('absorb-2'); } else console.log('vow: no absorb');
  });
  scene('lamp-sys-vowstrike', 'avner', 'malik', 110, (s) => {
    s.go('MH', '', 50); s.go('', '', 4); s.shot('1'); s.go('', '', 8); s.shot('2'); s.go('', '', 5); s.shot('3-hit'); s.go('', '', 8); s.shot('4'); s.go('', '', 8); s.shot('5'); s.go('', '', 8); s.shot('6');
  });
  for (const [label, dir] of [['repel', 'K'], ['draw', 'F']]) scene('lamp-sys-' + label, 'avner', 'malik', 100, (s) => {
    if (!s.until('K', 'H', s.cue('block'), 40)) return console.log(label + ': no block');
    s.until('K', '', (g) => !g.players[0].hitstop, 30);
    s.go(dir + 'LM', '', 1); s.go(dir, '', 1); s.shot('1'); s.go(dir, '', 3); s.shot('2'); s.go(dir, '', 4); s.shot('3'); s.go(dir, '', 5); s.shot('4');
  });
  // Each throw just before, on and after its hit drawing (node scripts/shots.mjs <folder> thit)
  for (const [name, who, other, dir, wait] of [['thit-avner-f', 'avner', 'malik', 'F', 12], ['thit-avner-b', 'avner', 'malik', 'K', 8], ['thit-malik-f', 'malik', 'avner', 'F', 6], ['thit-malik-b', 'malik', 'avner', 'K', 8]]) scene(name, who, other, 60, (s) => {
    s.go('', '', 10); s.go(dir + 'H', '', 1); s.go('', '', 14 + wait); s.shot('before'); s.go('', '', 3); s.shot('hit'); s.go('', '', 5); s.shot('after');
  });
  // Dust under moves that run or slide (node scripts/shots.mjs <folder> dust)
  scene('dust-slide', 'avner', 'malik', 300, (s) => { s.go('', '', 10); s.go('DH', '', 1); s.go('', '', 7); s.shot('a'); s.go('', '', 5); s.shot('b'); });
  scene('dust-lariat', 'malik', 'avner', 500, (s) => { s.go('', '', 10); s.go('D', '', 1); s.go('DK', '', 1); s.go('KH', '', 1); s.go('', '', 6); s.shot('a'); s.go('', '', 6); s.shot('b'); });
  // Malik's Spirit Install: the look, and the guardian's L / M / H on their striking frame (node scripts/shots.mjs <folder> spirit)
  scene('spirit-look', 'malik', 'avner', 400, (s) => {
    s.game.players[0].vars.install = 600; s.go('', '', 20); s.shot('idle'); s.go('F', '', 14); s.shot('walk'); s.go('', '', 4); s.go('F', '', 1); s.go('', '', 1); s.go('F', '', 6); s.shot('dash');
  });
  for (const [b, pre, hold] of [['L', 3, 6], ['M', 6, 8], ['H', 9, 10]]) scene('spirit-' + b, 'malik', 'avner', 130, (s) => {
    s.opts = { boxes: true };
    s.game.players[0].vars.install = 600; s.go('', '', 20); s.go(b, '', 1); s.go('', '', 1); s.shot('start'); s.go('', '', pre - 1); s.shot('strike'); s.go('', '', hold); s.shot('after');
  });
  // Malik's newer drawings, Nov 25 (node scripts/shots.mjs <folder> mk): each scene is filmed, a still every 2 frames.
  const mk = (name, gap, frames, start) => scene('mk-' + name, 'malik', 'avner', gap, (s) => { if (process.env.SHOT_BOXES) s.opts = { boxes: true }; s.go('', '', 6); start(s); film(s, frames, 'f'); }); // SHOT_BOXES=1: with the boxes drawn
  mk('idle', 300, 24, () => {});
  mk('walk', 500, 24, (s) => s.go('F', '', 1));
  for (const [n, b, len, gap] of [['5L', 'L', 14, 70], ['5M', 'M', 24, 80], ['5H', 'H', 30, 90], ['2L', 'DL', 14, 70], ['2M', 'DM', 22, 90], ['2H', 'DH', 34, 100], ['5S', 'S', 36, 80], ['4H', 'KH', 36, 200], ['stomp', 'FM', 36, 100]]) mk(n, gap, len, (s) => s.go(b, '', 1));
  for (const [n, b, len] of [['jL', 'L', 16], ['jM', 'M', 22], ['jH', 'H', 22], ['jS', 'S', 30]]) mk(n, 90, len, (s) => { s.go('U', '', 1); s.go('', '', 14); s.go(b, '', 1); });
  mk('jump', 400, 48, (s) => s.go('U', '', 1));
  mk('dash', 600, 30, (s) => { s.go('F', '', 1); s.go('', '', 1); s.go('F', '', 1); });
  mk('backdash', 300, 30, (s) => { s.go('K', '', 1); s.go('', '', 1); s.go('K', '', 1); });
  for (const b of ['L', 'M', 'H']) mk('orb-' + b, 330, 60, (s) => qcf(s, b));
  mk('pillar', 200, 40, (s) => dp(s, 'M'));
  mk('lariat', 420, 46, (s) => qcb(s, 'M'));
  mk('vow', 110, 40, (s) => { s.go('MH', '', 26); });
  mk('rite4', 100, 36, (s) => s.go('KR', '', 1));
  mk('riteJ', 150, 34, (s) => { s.go('U', '', 1); s.go('', '', 16); s.go('R', '', 1); });
  mk('install', 400, 44, (s) => { s.go('D', '', 1); s.go('', '', 1); s.go('DHS', '', 1); });
  mk('install-move', 500, 60, (s) => { s.game.players[0].vars.install = 600; s.go('', '', 12); s.go('F', '', 10); s.go('U', '', 1); });
  mk('install-attack', 130, 26, (s) => { s.game.players[0].vars.install = 600; s.go('', '', 6); s.go('H', '', 1); });
  mk('throw', 60, 60, (s) => s.go('FH', '', 1));
  mk('bthrow', 60, 60, (s) => s.go('KH', '', 1));
  scene('mk-hurt', 'avner', 'malik', 90, (s) => { s.go('', '', 6); s.go('M', '', 1); film(s, 30, 'stand'); s.go('', 'D', 20); s.go('DM', 'D', 1); for (let k = 0; k < 14; k++) { s.shot('crouch'); s.go('', 'D', 2); } s.go('', 'K', 10); s.go('M', 'K', 1); for (let k = 0; k < 10; k++) { s.shot('block'); s.go('', 'K', 2); } });
  scene('mk-launched', 'avner', 'malik', 90, (s) => { s.go('', '', 6); s.go('S', '', 1); film(s, 90, 'air'); });
  // Malik's Running Lariat (node scripts/shots.mjs <folder> lariat)
  scene('lariat', 'malik', 'avner', 330, (s) => {
    s.go('', '', 10); s.go('D', '', 1); s.go('DK', '', 1); s.go('KH', '', 1); s.go('', '', 2); s.shot('power-up'); s.go('', '', 10); s.shot('running'); s.go('', '', 9); s.shot('swing'); s.go('', '', 30); s.shot('recovery');
  });
  scene('vow', 'malik', 'avner', 150, (s) => {
    s.go('MH', '', 3); s.shot('start');
    s.go('MH', '', 12); s.shot('hold');
    if (s.until('MH', 'M', s.cue('absorb'), 40)) { s.go('MH', '', 1); s.shot('absorb-1'); s.go('MH', '', 3); s.shot('absorb-emphasis'); s.go('MH', '', 9); s.shot('absorb-end'); } else console.log('vow: no absorb happened');
  });
  for (const [label, held] of [['quick', 6], ['strike', 26], ['full', 50]]) {
    scene(`vow-${label}`, 'malik', 'avner', 110, (s) => {
      s.go('MH', '', held);
      s.go('', '', 5); s.shot('windup');
      const hit = s.until('', '', (g) => g.cues.some((q) => ['hit', 'counter', 'witness', 'block'].includes(q.type)), 40);
      s.go('', '', 2); s.shot(hit ? 'hit' : 'no-hit');
      s.go('', '', 14); s.shot('after');
      s.go('', '', 16); s.shot('later');
    });
  }
  // ----- Rite: Guardian Palm, Ancestor's Seal, Guardian's Wrath, Guardian's Judgment (j.R also from far away: it opens on the opponent) -----
  const hands = (s) => {
    s.until('', '', s.cue('spawn'), 30); s.shot('hand-1');
    for (const n of [2, 3, 4, 5, 6]) { s.go('', '', 3); s.shot('hand-' + n); }
  };
  for (const [label, input, gap] of [['5R', 'R', 260], ['2R', 'DR', 260], ['4R', 'KR', 160]]) {
    scene(`rite-${label}`, 'malik', 'avner', gap, (s) => { s.go(input, '', 1); s.go('', '', label === '4R' ? 3 : 8); s.shot('windup'); hands(s); });
  }
  for (const [label, gap] of [['jR', 170], ['jR-far', 520]]) {
    scene(`rite-${label}`, 'malik', 'avner', gap, (s) => { s.go('U', '', 1); s.go('', '', 16); s.go('R', '', 1); s.go('', '', 6); s.shot('windup'); hands(s); });
  }
  // ----- Absolve: the burst, and the baited recovery -----
  const inState = (i, name) => (g) => g.players[i].state === name;
  scene('absolve', 'avner', 'malik', 90, (s) => {
    if (!s.until('M', '', s.cue('hit'), 40)) return console.log('absolve: no hit');
    if (!s.until('', 'RS', inState(1, 'absolve'), 30)) return console.log('absolve: did not come out');
    s.go('', '', 2); s.shot('curl'); s.go('', '', 4); s.shot('burst'); s.go('', '', 3); s.shot('burst-2'); s.go('', '', 8); s.shot('landing');
  });
  // The baited recovery, put there directly (this is a look at the drawing, not a test of the rule).
  scene('absolve-bait', 'avner', 'malik', 140, (s) => {
    s.go('', '', 2);
    enterState(s.game.players[1], s.world.chars[1], 'absolve_recovery');
    s.go('', '', 3); s.shot('shroud-1'); s.go('', '', 12); s.shot('shroud-2'); s.go('', '', 16); s.shot('shroud-3');
  });
  // ----- Malik crumpling (hit by a Vow strike) -----
  scene('crumple', 'avner', 'malik', 110, (s) => {
    s.go('MH', '', 26);
    if (!s.until('', '', inState(1, 'crumple'), 40)) return console.log('crumple: did not happen');
    s.go('', '', 3); s.shot('1'); s.go('', '', 6); s.shot('2'); s.go('', '', 8); s.shot('3'); s.go('', '', 12); s.shot('4'); s.go('', '', 12); s.shot('5');
  });
  // ----- Repel and Draw -----
  for (const [label, dir] of [['repel', 'F'], ['draw', 'K']]) {
    scene(label, 'avner', 'malik', 100, (s) => {
      if (!s.until('H', 'F', s.cue('block'), 40)) return console.log(label + ': no block');
      s.until('', 'F', (g) => !g.players[1].hitstop, 30);
      s.go('', dir + 'LM', 1); s.go('', dir, 1); s.shot('1'); s.go('', dir, 3); s.shot('2'); s.go('', dir, 4); s.shot('3'); s.go('', dir, 5); s.shot('4');
    });
  }
  // ----- Super flash (Malik's install) and a tech -----
  scene('super', 'malik', 'avner', 200, (s) => {
    s.go('D', '', 2); s.go('', '', 2); s.go('D', '', 2); s.go('', '', 1); s.go('HS', '', 1);
    if (!s.until('', '', (g) => g.flash > 0, 30)) return console.log('super: no flash');
    s.shot('flash-1'); s.go('', '', 4); s.shot('flash-2'); s.go('', '', 5); s.shot('flash-3'); s.go('', '', 8); s.shot('flash-4');
  });
  // ----- War'Teun (node scripts/shots.mjs <folder> wt): each special filmed (a still every 2 or 3 frames) -----
  const wtFilm = (s, frames, every = 2, p2 = '') => { every = Number(process.env.WT_EVERY) || every; for (let i = 0; i < frames; i += every) { s.shot('f' + String(i + 1).padStart(2, '0')); s.go('', p2, every); } };
  const dd = (s, b) => { s.go('D', '', 2); s.go('', '', 2); s.go('D' + b, '', 1); };
  for (const vs of ['avner', 'malik']) {
    scene('wt-stand-' + vs, 'warteun', vs, 240, (s) => { s.go('', '', 20); s.shot('idle'); s.go('F', '', 14); s.shot('walk'); s.go('D', '', 20); s.shot('crouch'); s.go('', '', 4); s.go('U', '', 1); s.go('', '', 14); s.shot('jump'); s.go('', '', 40); s.go('K', 'L', 6); s.shot('block'); });
  }
  scene('wt-normals', 'warteun', 'malik', 150, (s) => {
    for (const [dir, b] of [['', 'L'], ['', 'M'], ['', 'H'], ['', 'S'], ['F', 'M'], ['K', 'H'], ['F', 'H'], ['D', 'L'], ['D', 'M'], ['D', 'H']]) {
      s.game.players[0].x = -7500; s.game.players[1].x = 7500; s.game.players[1].health = 10000; s.go('', '', 50);
      s.go(dir + b, '', 1);
      if (s.until(dir, '', (g) => g.cues.some((q) => q.type === 'hit' || q.type === 'counter'), 40)) s.shot((dir || 'N') + b + '-hit'); else s.shot((dir || 'N') + b + '-nohit');
      s.go('', '', 60);
    }
  });
  scene('wt-warpstep', 'warteun', 'malik', 600, (s) => { s.go('', '', 10); qcf(s, 'L'); wtFilm(s, 60, 3); });
  scene('wt-warpstep-marked', 'warteun', 'malik', 600, (s) => { s.go('', '', 10); s.game.players[0].vars.wiretap = 300; qcf(s, 'H'); wtFilm(s, 44, 4); });
  scene('wt-displacement', 'warteun', 'malik', 160, (s) => { s.go('', '', 10); qcb(s, 'M'); wtFilm(s, 52, 3); });
  scene('wt-listen', 'warteun', 'malik', 110, (s) => { s.go('', '', 10); dp(s, 'M'); s.go('', '', 4); s.go('', 'L', 1); wtFilm(s, 30, 2); });
  scene('wt-listen-whiff', 'warteun', 'malik', 300, (s) => { s.go('', '', 10); dp(s, 'M'); wtFilm(s, 44, 4); });
  scene('wt-wiretap', 'warteun', 'malik', 120, (s) => { s.go('', '', 10); dd(s, 'M'); wtFilm(s, 40, 4); s.go('', '', 30); s.shot('marked'); });
  scene('wt-tune', 'warteun', 'malik', 520, (s) => {
    s.go('', '', 10); s.game.players[0].vars.resonance = 18;
    qcf(s, 'H'); s.go('', '', 40); s.game.players[0].x = -30000; qcf(s, 'H'); s.go('', '', 40); s.game.players[0].x = -5000; s.game.players[1].x = -24000; s.go('', '', 2);
    s.shot('before'); s.go('R', '', 1); wtFilm(s, 30, 2);
  });
  scene('wt-swap', 'warteun', 'malik', 600, (s) => { s.go('', '', 10); qcf(s, 'S'); wtFilm(s, 34, 2); });
  scene('wt-air', 'warteun', 'malik', 300, (s) => { s.go('', '', 10); s.go('U', '', 1); s.go('', '', 16); s.go('S', '', 1); wtFilm(s, 40, 3); });
  // Silent Drop hitting: the fork planted on the strike, the burst inside the freeze, the slide (boxes drawn).
  scene('wt-drop', 'warteun', 'malik', 130, (s) => { s.opts = { boxes: true }; s.go('', '', 10); s.go('U', '', 1); s.go('', '', 16); s.go('S', '', 1); wtFilm(s, 80, 2); });
  scene('wt-airwarp', 'warteun', 'malik', 500, (s) => { s.go('', '', 10); s.go('U', '', 1); s.go('', '', 14); qcb(s, 'M'); wtFilm(s, 50, 3); });
  scene('wt-dash', 'warteun', 'malik', 600, (s) => { s.go('', '', 10); s.go('F', '', 1); s.go('', '', 1); s.go('F', '', 1); wtFilm(s, 22, 2); s.go('', '', 10); s.go('K', '', 1); s.go('', '', 1); s.go('K', '', 1); wtFilm(s, 22, 2); });
  scene('wt-2M', 'warteun', 'malik', 320, (s) => { s.go('', '', 10); s.go('DM', '', 1); wtFilm(s, 50, 3); });
} catch (e) { console.log('ERROR', e.stack.split('\n').slice(0, 8).join('\n')); }
await server.close();
