// Block effect (the spinning guard) and see-through effect pictures, and timing, on the real screen:
//   node scripts/block-fx-shots.mjs <out-folder> [--url http://localhost:5300]
// Needs the dev server running. Headless Chrome plays scripted situations over the stage and saves every frame from
// the first block (or hit), cropped around it: a light, a medium and a heavy block, a block string, a Repel; then a
// hit spark, a Rising Moon and a Lunar Halo beside a fighter, each as it was before and at the new opacities. Last,
// it times the drawing on the busiest frame of a blocked string that ends in a Repel.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const OUT = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!OUT) { console.log('usage: node scripts/block-fx-shots.mjs <out-folder>'); process.exit(1); }
const URL0 = opt('url', 'http://localhost:5300');
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('Chrome not found (set CHROME to its path)'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toska-block-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9379', `--user-data-dir=${profile}`, '--hide-scrollbars', '--window-size=1280,760', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = async () => {
  const boot = await import('/src/ui/boot.js');
  const { createFightRenderer } = await import('/src/render/fight-renderer.js');
  const { createGame, step } = await import('/src/core/game.js');
  const { W, H } = boot;
  const chars = boot.loadCharacters();
  const stage = Object.values(boot.STAGES)[0];
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  await new Promise((r) => setTimeout(r, 2500));
  const RT = 2, D = 8, F = 2, L = 16, M = 32, Hh = 64, S = 128; // RT = right: player 2's "back", and player 1's forward
  const crop = document.createElement('canvas');
  const cctx = crop.getContext('2d');
  const grab = (cv, cx, cy, w, h) => { crop.width = w; crop.height = h; cctx.drawImage(cv, Math.max(0, Math.min(cv.width - w, cx - w / 2)), Math.max(0, Math.min(cv.height - h, cy - h / 2)), w, h, 0, 0, w, h); return crop.toDataURL('image/png'); };
  const make = (p1, p2, gap, c = ctx) => {
    const world = boot.makeWorld(chars[p1], chars[p2], null);
    const game = createGame(world);
    game.players[0].x = -gap * 50; game.players[1].x = gap * 50;
    for (const p of game.players) p.meter = 40000;
    return { world, game, renderer: createFightRenderer(c, W, H) };
  };
  const settle = async (s) => { for (let i = 0; i < 12; i++) { s.renderer.draw(s.game, s.world, { stage, palettes: [0, 0] }); await new Promise((r) => setTimeout(r, 100)); } };
  // A press on some frames: { frame: buttons }. Player 2 holds back (blocks) on every frame unless told otherwise.
  const taps = (t) => (f) => t[f] ?? 0;
  const out = { shots: {}, log: [] };

  const scenes = [
    { name: 'light', p1: 'malik', p2: 'avner', gap: 70, a: taps({ 0: L }), frames: 30, on: ['block'] },
    { name: 'medium', p1: 'malik', p2: 'avner', gap: 70, a: taps({ 0: M }), frames: 34, on: ['block'] },
    { name: 'heavy', p1: 'malik', p2: 'avner', gap: 80, a: taps({ 0: Hh }), frames: 44, on: ['block'] },
    { name: 'string', p1: 'malik', p2: 'avner', gap: 60, a: (f) => (f === 0 ? L : f >= 6 && f < 22 && f % 4 === 2 ? M : f >= 22 && f < 50 && f % 4 === 2 ? Hh : 0), frames: 70, on: ['block'] },
    { name: 'repel', p1: 'malik', p2: 'avner', gap: 80, a: taps({ 0: Hh }), b: (f, g) => RT | (g.players[1].state.startsWith('block') && g.players[1].hitstop === 0 ? L | M : 0), frames: 50, on: ['block'] },
    // the see-through look of other effects: the dummy does not block
    { name: 'spark', p1: 'malik', p2: 'avner', gap: 80, a: taps({ 0: Hh }), b: () => 0, frames: 10, on: ['hit', 'counter'], compare: true },
    { name: 'risingmoon', p1: 'avner', p2: 'malik', gap: 150, a: taps({ 0: D, 1: D | F, 2: F | L }), b: () => 0, frames: 14, on: ['spawn'], compare: true, lead: 6, center: 'p2' },
    { name: 'halo', p1: 'avner', p2: 'malik', gap: 60, a: taps({ 0: F, 1: D, 2: D | F | Hh }), b: () => 0, frames: 16, on: ['fx'], compare: true, center: 'p1' },
  ];
  for (const sc of scenes) {
    const s = make(sc.p1, sc.p2, sc.gap);
    await settle(s);
    let since = -1, at = null, n = 0;
    for (let f = 0; f < 160 && n < sc.frames; f++) {
      step(s.game, [sc.a(f, s.game), sc.b ? sc.b(f, s.game) : RT], s.world);
      s.renderer.notice(s.game, s.world);
      const seen = s.game.cues.filter((c) => ['block', 'hit', 'counter', 'repel', 'spawn'].includes(c.type) || (c.type === 'fx' && sc.on.includes('fx')));
      if (seen.length) out.log.push(`${sc.name}: frame ${f} ${seen.map((c) => `${c.type} ${c.move ?? c.name ?? ''}`).join(', ')}`);
      const first = s.game.cues.find((c) => sc.on.includes(c.type));
      if (first && since < 0) { since = f + (sc.lead ?? 0); const who = sc.center === 'p1' ? s.game.players[0] : sc.center === 'p2' ? s.game.players[1] : null; at = who ? s.renderer.toScreen(who.x, 9000) : s.renderer.toScreen(first.x, first.y); }
      if (since < 0 || f < since) continue;
      s.renderer.draw(s.game, s.world, { stage, palettes: [0, 0], shockwave: false });
      out.shots[`${sc.name}-${String(n).padStart(2, '0')}`] = grab(canvas, at[0], at[1], 480, 320);
      if (sc.compare) { // the same frame as it was drawn before
        s.renderer.draw(s.game, s.world, { stage, palettes: [0, 0], shockwave: false, effectsOpacity: false });
        out.shots[`${sc.name}-before-${String(n).padStart(2, '0')}`] = grab(canvas, at[0], at[1], 480, 320);
      }
      n++;
    }
    if (since < 0) out.log.push(`${sc.name}: NOTHING SEEN`);
  }

  // ---- timing ----
  // Each measurement gets a fresh canvas and the browser finishes its drawing once per 20 frames (a canvas that is
  // read back often is moved off the graphics card, which would spoil the numbers).
  out.timing = {};
  for (const k of [1, 2]) for (const which of ['quiet', 'busy']) {
    const c2 = document.createElement('canvas');
    c2.width = W * k; c2.height = H * k;
    document.body.append(c2);
    const x2 = c2.getContext('2d');
    x2.setTransform(k, 0, 0, k, 0, 0);
    const s = make('malik', 'avner', 60, x2);
    const opts = { stage, palettes: [0, 0] };
    for (let i = 0; i < 12; i++) { s.renderer.draw(s.game, s.world, opts); await new Promise((r) => setTimeout(r, 100)); }
    let note = 'standing still';
    if (which === 'busy') {
      // A blocked L, M, H string with a Repel on the H: the guard at its largest, with its white flash.
      let f = 0, blocks = 0, stop = -1;
      for (; f < 200 && stop < 0; f++) {
        const g = s.game;
        const a = f === 0 ? L : f >= 6 && f < 22 && f % 4 === 2 ? M : f >= 22 && f < 50 && f % 4 === 2 ? Hh : 0;
        const b = RT | (blocks >= 3 && g.players[1].state.startsWith('block') && g.players[1].hitstop === 0 ? L | M : 0);
        step(g, [a, b], s.world);
        s.renderer.notice(g, s.world);
        blocks += g.cues.filter((c) => c.type === 'block').length;
        if (g.cues.some((c) => c.type === 'repel')) stop = f + 3;
      }
      for (; f <= stop; f++) { step(s.game, [0, RT], s.world); s.renderer.notice(s.game, s.world); }
      note = stop < 0 ? 'THE REPEL NEVER CAME' : `${blocks} blocks in a string, 3 frames after the Repel`;
    }
    for (let j = 0; j < 20; j++) s.renderer.draw(s.game, s.world, opts);
    const ms = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      for (let j = 0; j < 20; j++) s.renderer.draw(s.game, s.world, opts);
      x2.getImageData(0, 0, 1, 1);
      ms.push((performance.now() - t0) / 20);
    }
    ms.sort((p, q) => p - q);
    (out.timing[`${W * k}x${H * k}`] ??= {})[which] = { median: +ms[ms.length >> 1].toFixed(2), worst: +ms[ms.length - 1].toFixed(2), note };
    if (k === 1 && which === 'busy') { const mid = s.renderer.toScreen((s.game.players[0].x + s.game.players[1].x) / 2, 9000); out.shots['timing-scene'] = grab(c2, mid[0], mid[1], 640, 360); }
    c2.remove();
  }
  return out;
};

let exit = 0;
try {
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9379/json')).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Page.enable');
  await send('Page.navigate', { url: `${URL0}/?mode=lab` });
  await sleep(1500);
  const res = await send('Runtime.evaluate', { expression: `(${PAGE.toString()})()`, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails || !res.result?.result?.value) throw new Error(JSON.stringify(res.result?.exceptionDetails ?? res).slice(0, 1500));
  const { shots, timing, log } = res.result.result.value;
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, png] of Object.entries(shots)) fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
  for (const l of log) console.log(l);
  console.log(`${Object.keys(shots).length} pictures in ${OUT}`);
  console.log('draw time, ms a frame:', JSON.stringify(timing));
  ws.close();
} catch (e) { exit = 1; console.log('ERROR', String(e.message ?? e).slice(0, 2000)); }
chrome.kill();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still letting go of it */ }
process.exit(exit);
