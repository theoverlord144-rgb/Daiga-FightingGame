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
  function scene(name, a, b, gap, play) {
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
        renderer.draw(game, world, { hud: false, palettes: [0, 0] });
        const file = path.join(OUT, `${name}-${String(++n).padStart(2, '0')}-${label}.png`);
        fs.writeFileSync(file, encodePng({ width: W, height: H, data: Buffer.from(c.px) }));
        console.log(`${file}  [P1 ${game.players[0].state} ${game.players[0].frame}, P2 ${game.players[1].state} ${game.players[1].frame}]`);
      },
    };
    play(api);
  }

  // ----- Vow: guard, an absorbed hit, the three strikes, the crumple -----
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
  // ----- Rite: the four Guardian Palms -----
  for (const [label, input, gap] of [['5R', 'R', 260], ['2R', 'DR', 260], ['6R', 'FR', 160]]) {
    scene(`rite-${label}`, 'malik', 'avner', gap, (s) => {
      s.go(input, '', 1); s.go('', '', 8); s.shot('windup');
      s.until('', '', (g) => g.projectiles.length > 0, 30); s.go('', '', 2); s.shot('hand-1');
      s.go('', '', 4); s.shot('hand-2'); s.go('', '', 4); s.shot('hand-3'); s.go('', '', 5); s.shot('hand-4');
    });
  }
  scene('rite-jR', 'malik', 'avner', 170, (s) => {
    s.go('U', '', 1); s.go('', '', 16); s.go('R', '', 1); s.go('', '', 6); s.shot('windup');
    s.until('', '', (g) => g.projectiles.length > 0, 30); s.go('', '', 2); s.shot('hand-1');
    s.go('', '', 4); s.shot('hand-2'); s.go('', '', 4); s.shot('hand-3'); s.go('', '', 5); s.shot('hand-4');
  });
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
} catch (e) { console.log('ERROR', e.stack.split('\n').slice(0, 8).join('\n')); }
await server.close();
