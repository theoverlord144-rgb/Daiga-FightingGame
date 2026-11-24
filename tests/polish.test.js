// Look-only polish: the snap timing never changes a move, the drawing never changes the game, the sheet tools cut
// the right drawings. (The polish itself is drawn by src/render/fight-renderer.js from data/system/polish.json.)
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'vite';
import { snapOf } from '../scripts/snap-timing.mjs';
import { cutCell, layStrip } from '../scripts/sprite-assemble.mjs';
import { makePalette, lockCell, shrinkCell, cleanSheet, headSize } from '../scripts/sprite-clean.mjs';

const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'width' || k === 'height' ? 64 : k === 'data' ? new Uint8ClampedArray(64 * 64 * 4) : any()), apply: () => any(), set: () => true });
let server, boot, chars, core, state, render, polish;
before(async () => {
  globalThis.Image = class { set src(v) { this._src = v; this.complete = true; this.naturalWidth = 64; this.width = 64; this.height = 64; } get src() { return this._src; } };
  globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => any() }) };
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  boot = await server.ssrLoadModule('/src/ui/boot.js');
  core = await server.ssrLoadModule('/src/core/game.js');
  state = await server.ssrLoadModule('/src/core/state.js');
  render = await server.ssrLoadModule('/src/render/fight-renderer.js');
  polish = await server.ssrLoadModule('/src/render/polish.js');
  chars = boot.loadCharacters();
});
after(async () => { await server?.close(); });

const sum = (a) => a.reduce((x, y) => x + y, 0);
/** Frames held by the drawings that begin in startup, active and recovery. */
function phases(holds, timing, first, end) {
  const out = [0, 0, 0];
  let t = 0;
  holds.forEach((h, i) => { out[t < first ? 0 : t < end ? 1 : 2] += timing[i]; t += h; });
  return out;
}

test('Snap: every move keeps its length and its startup, active and recovery frames', () => {
  let moves = 0, retimed = 0;
  for (const id of ['avner', 'malik']) {
    const def = chars[id], snap = JSON.parse(readFileSync(new URL(`../data/snap/${id}.json`, import.meta.url), 'utf8')).moves;
    for (const [name, e] of Object.entries(snap)) {
      const st = def.states[name];
      assert.ok(st, `${id} ${name}: the move exists`);
      assert.equal(e.snap.length, e.holds.length, `${id} ${name}: one hold per drawing`);
      assert.equal(e.roles.length, e.holds.length, `${id} ${name}: one role per drawing`);
      assert.ok(e.snap.every((h) => Number.isInteger(h) && h >= 1), `${id} ${name}: every drawing shows at least one frame`);
      assert.equal(sum(e.snap), sum(e.holds), `${id} ${name}: same total`);
      const sheet = def.sheets[st.frames[0].sprite.sheet];
      if (sheet.holds.join() !== e.holds.join()) continue; // the move was retimed since: the game ignores this entry
      assert.equal(sum(e.snap), st.frames.length, `${id} ${name}: the move's length`);
      let first = -1, last = -1;
      st.frames.forEach((f, i) => { if (f.hit.length || f.throw.length) { if (first < 0) first = i; last = i; } });
      if (first < 0) { first = Math.max(0, (st.move.startup ?? 1) - 1); last = first; }
      assert.deepEqual(phases(e.holds, e.snap, first, last + 1), phases(e.holds, e.holds, first, last + 1), `${id} ${name}: frames only move inside startup, active and recovery`);
      moves++; if (e.snap.join() !== e.holds.join()) retimed++;
    }
  }
  assert.ok(moves >= 60 && retimed >= 40, `checked ${moves} moves, ${retimed} re-timed`);
});

test('Snap rules: any holds keep their totals per phase, a smear gets one frame', () => {
  let seed = 11;
  const rnd = (n) => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % n;
  for (let k = 0; k < 500; k++) {
    const holds = Array.from({ length: 2 + rnd(9) }, () => 1 + rnd(9)), total = sum(holds);
    const first = rnd(total), end = Math.min(total, first + 1 + rnd(6));
    const strength = ['light', 'medium', 'heavy'][rnd(3)];
    const r = snapOf({ holds, first, end, strength, hasHit: true });
    assert.equal(sum(r.snap), total);
    assert.ok(r.snap.every((h) => h >= 1));
    assert.deepEqual(phases(holds, r.snap, first, end), phases(holds, holds, first, end));
    r.roles.forEach((role, i) => { if (role === 'smear') assert.equal(r.snap[i], 1); });
  }
});

test('The rules never read the polish: nothing in src/core or src/net mentions it', () => {
  for (const dir of ['core', 'net']) for (const f of readdirSync(new URL(`../src/${dir}/`, import.meta.url))) {
    const text = readFileSync(new URL(`../src/${dir}/${f}`, import.meta.url), 'utf8');
    assert.ok(!/polish|data\/snap/i.test(text), `src/${dir}/${f}`);
  }
});

test('Determinism: a recorded match is identical with all polish on, all off, and with no drawing at all', () => {
  const { createGame, step } = core;
  const inputs = [];
  let seed = 5;
  const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 8;
  const hold = [0, 0], cur = [0, 0];
  for (let f = 0; f < 1500; f++) inputs.push([0, 1].map((k) => { if (hold[k]-- > 0) return cur[k]; hold[k] = 1 + (rnd() % 9); const r = rnd() % 100; cur[k] = (k ? 1 : 2) | (r < 15 ? 4 : r < 25 ? 8 : 0) | (r % 5 === 0 ? 0 : [16, 32, 64, 128, 96, 256][rnd() % 6]); return cur[k]; }));
  const stage = JSON.parse(readFileSync(new URL('../data/stages/dusk-terrace.json', import.meta.url), 'utf8'));
  const run = (mode) => {
    const world = boot.makeWorld(chars.avner, chars.malik, boot.MATCH), game = createGame(world);
    if (game.match) game.match.phase = 'fight';
    game.players[0].x = -6000; game.players[1].x = 6000;
    for (const p of game.players) p.meter = 40000;
    const renderer = mode === 'none' ? null : render.createFightRenderer(any(), boot.W, boot.H);
    if (mode !== 'none') { polish.setAllPolish(mode === 'on'); }
    const hashes = [];
    for (const raw of inputs) {
      step(game, raw, world);
      if (renderer) { renderer.notice(game, world); renderer.draw(game, world, { marks: true, palettes: [0, 1], stage }); }
      hashes.push(state.hashState(game));
    }
    return hashes;
  };
  let none, on, off;
  try { none = run('none'); on = run('on'); off = run('off'); } finally { polish.setAllPolish('default'); }
  assert.ok(new Set(none).size > 1000, 'the match really plays');
  assert.deepEqual(on, none, 'all polish on');
  assert.deepEqual(off, none, 'all polish off');
});

test('Every polish item has a switch, and the panel lists it', () => {
  const keys = polish.POLISH_ITEMS.map((i) => i.key);
  for (const k of ['cleanSprites', 'impactFrame', 'hitFlash', 'squash', 'shadow', 'rimLight', 'hitstopShake', 'ribbons', 'snap', 'overshoot', 'hitFreeze', 'anticipationLean']) assert.ok(keys.includes(k), k);
  assert.equal(polish.POLISH.ribbons.on, false, 'ribbons are off by default');
  assert.equal(polish.POLISH.cleanSprites.on, false, 'cleaned sprites are parked');
});

test('Assembly: the right drawings in the right order, placed by the fighter point', () => {
  // Two 3-drawing sheets, 4 x 2 cells; every drawing is one flat colour that names it.
  const sheet = (base) => { const d = new Uint8Array(12 * 2 * 4); for (let n = 0; n < 3; n++) for (let y = 0; y < 2; y++) for (let x = 0; x < 4; x++) d.set([base, n * 10, 0, 255], (y * 12 + n * 4 + x) * 4); return { width: 12, height: 2, data: d }; };
  const cell = { columns: 3, frameW: 4, frameH: 2, originX: 2, originY: 2 }, A = sheet(100), B = sheet(200);
  const picks = [[A, 1], [B, 2], [A, 3], [B, 1]].map(([img, frame]) => cutCell(img, cell, frame - 1));
  const { png, clipped } = layStrip(picks, cell);
  assert.equal(clipped, 0);
  assert.equal(png.width, 16);
  assert.deepEqual([0, 1, 2, 3].map((n) => [png.data[n * 4 * 4], png.data[n * 4 * 4 + 1]]), [[100, 0], [200, 10], [100, 20], [200, 0]]);
  assert.throws(() => cutCell(A, cell, 3), /outside the sheet/);
  // A drawing cut from a cell with another fighter point lands with that point on the sheet's.
  const moved = layStrip([{ ...cutCell(A, cell, 0), originX: 1 }], { frameW: 6, frameH: 2, originX: 3, originY: 2 });
  assert.equal(moved.png.data[2 * 4], 100);
  assert.equal(moved.png.data[1 * 4 + 3], 0);
});

test('Cleanup tool (parked): a noisy gradient comes out palette-only, the head is scaled to its target, the original is untouched', () => {
  const pal = makePalette({ outline: 'outline', colors: [{ name: 'outline', hex: '#101010' }, { name: 'red', hex: '#c03030' }, { name: 'skin', hex: '#c89060' }, { name: 'blue', hex: '#3050c0' }], extra: [], head: ['red'] });
  const w = 48, h = 48, a = new Float32Array(w * h), rgb = new Float32Array(w * h * 3);
  let seed = 3;
  const noise = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % 31) - 15;
  for (let y = 4; y < 44; y++) for (let x = 4; x < 44; x++) { const i = y * w + x, t = (x - 4) / 40; a[i] = 1; rgb[i * 3] = 200 * (1 - t) + 48 * t + noise(); rgb[i * 3 + 1] = 144 * (1 - t) + 80 * t + noise(); rgb[i * 3 + 2] = 96 * (1 - t) + 192 * t + noise(); }
  const L = lockCell(a, rgb, w, h, pal), out = shrinkCell(L.idx, w, h, pal, 1, 24, 48);
  const allowed = new Set(pal.rgb.map((c) => c.join()));
  let solid = 0;
  for (let i = 0; i < out.width * out.height; i++) if (out.data[i * 4 + 3] === 255) { solid++; assert.ok(allowed.has([out.data[i * 4], out.data[i * 4 + 1], out.data[i * 4 + 2]].join()), 'a colour outside the palette'); }
  assert.ok(solid > 1200);
  // Scale: a body with a 14 px head is brought to a 16 px head.
  const img = { width: 64, height: 64, data: new Uint8Array(64 * 64 * 4) };
  const fill = (x0, y0, x1, y1, c) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) img.data.set([...c, 255], (y * 64 + x) * 4); };
  fill(22, 30, 42, 64, [0xc8, 0x90, 0x60]);
  fill(25, 16, 39, 30, [0xc0, 0x30, 0x30]);
  const before = Buffer.from(img.data).toString('base64');
  const res = cleanSheet(img, { columns: 1, rows: 1, count: 1, frameW: 64, frameH: 64, originX: 32, originY: 64, scale: 1 }, { pal, target: 16, scaleMode: 'frame', deadband: 0.03 });
  assert.equal(Buffer.from(img.data).toString('base64'), before, 'the original image is never modified');
  const idx = new Int16Array(64 * 64).fill(-1), al = new Float32Array(64 * 64);
  for (let i = 0; i < 64 * 64; i++) if (res.png.data[i * 4 + 3] > 127) { al[i] = 1; idx[i] = pal.nearest(res.png.data[i * 4], res.png.data[i * 4 + 1], res.png.data[i * 4 + 2])[0]; }
  const head = headSize(idx, al, 64, 64, new Set(pal.head));
  assert.ok(Math.abs(head - 16) <= 1, `head ${head} px, wanted 16`);
});
