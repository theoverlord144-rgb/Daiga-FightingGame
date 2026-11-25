// Shockwave pictures and timing on the real screen:  node scripts/shockwave-shots.mjs <out-folder> [--url http://localhost:5300]
// Needs the dev server running. Headless Chrome plays three scripted hits (a heavy hit, a counter hit, a super's last
// hit) over the stage and saves every frame after the hit, cropped around it, then times the drawing with six rings on
// screen against the same frames with the shockwave off, at the game's own size and at twice that.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const OUT = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!OUT) { console.log('usage: node scripts/shockwave-shots.mjs <out-folder>'); process.exit(1); }
const URL0 = opt('url', 'http://localhost:5300');
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('Chrome not found (set CHROME to its path)'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toska-shock-'));
const GPU = args.includes('--gpu'); // ask headless Chrome to draw with the graphics card, as a normal browser window does
const chrome = spawn(CHROME, ['--headless=new', ...(GPU ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-accelerated-2d-canvas'] : []), '--remote-debugging-port=9378', `--user-data-dir=${profile}`, '--hide-scrollbars', '--window-size=1280,760', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
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
  const size = (k) => { canvas.width = W * k; canvas.height = H * k; ctx.setTransform(k, 0, 0, k, 0, 0); };
  size(1);
  await new Promise((r) => setTimeout(r, 2500));
  const D = 8, F = 2, K = 1, U = 4, L = 16, M = 32, Hh = 64, S = 128;
  const crop = document.createElement('canvas');
  const cctx = crop.getContext('2d');
  const grab = (cx, cy, w, h) => { crop.width = w; crop.height = h; cctx.drawImage(canvas, Math.max(0, Math.min(canvas.width - w, cx - w / 2)), Math.max(0, Math.min(canvas.height - h, cy - h / 2)), w, h, 0, 0, w, h); return crop.toDataURL('image/png'); };

  const make = (p1, p2, gap) => {
    const world = boot.makeWorld(chars[p1], chars[p2], null);
    const game = createGame(world);
    game.players[0].x = -gap * 50; game.players[1].x = gap * 50;
    for (const p of game.players) p.meter = 40000;
    return { world, game, renderer: createFightRenderer(ctx, W, H) };
  };
  const settle = async (s) => { for (let i = 0; i < 12; i++) { s.renderer.draw(s.game, s.world, { stage, palettes: [0, 0] }); await new Promise((r) => setTimeout(r, 100)); } };

  // ---- the three captures ----
  const scenes = [
    { name: 'heavy', p1: 'malik', p2: 'avner', gap: 90, inputs: [[Hh, 0]] },
    { name: 'counter', p1: 'malik', p2: 'avner', gap: 90, inputs: [[Hh, 0], [0, 0], [0, 0], [0, 0], [0, Hh]] },
    { name: 'super', p1: 'avner', p2: 'malik', gap: 110, inputs: [[D, 0], [D | F, 0], [F, 0], [D, 0], [D | F, 0], [F | S, 0]] },
  ];
  const out = { shots: {}, log: [] };
  for (const sc of scenes) {
    const s = make(sc.p1, sc.p2, sc.gap);
    await settle(s);
    let since = -1, at = null, n = 0;
    for (let f = 0; f < 140 && n < 30; f++) {
      step(s.game, sc.inputs[f] ?? [0, 0], s.world);
      s.renderer.notice(s.game, s.world);
      const hits = s.game.cues.filter((c) => c.type === 'hit' || c.type === 'counter' || c.type === 'witness');
      if (hits.length) { out.log.push(`${sc.name}: frame ${f} ${hits.map((c) => `${c.type} ${c.move}`).join(', ')}`); }
      // Film from the last hit seen (a super's last hit restarts the film).
      if (hits.length && (since < 0 || sc.name === 'super')) { since = f; n = 0; at = s.renderer.toScreen(hits[0].x, hits[0].y); for (const k of Object.keys(out.shots)) if (k.startsWith(`${sc.name}-`)) delete out.shots[k]; }
      if (since < 0) continue;
      s.renderer.draw(s.game, s.world, { stage, palettes: [0, 0] });
      out.shots[`${sc.name}-${String(n).padStart(2, '0')}`] = grab(at[0], at[1], 480, 320);
      if (n === 3) { // the same frame without the shockwave, to compare
        s.renderer.draw(s.game, s.world, { stage, palettes: [0, 0], shockwave: false });
        out.shots[`${sc.name}-off-03`] = grab(at[0], at[1], 480, 320);
      }
      n++;
    }
  }

  // ---- timing: six rings held on screen ----
  // Each measurement gets a fresh canvas, and the browser is made to finish its drawing only once per 20 frames: a
  // canvas that is read back often is moved off the graphics card by the browser, which would spoil the numbers.
  out.timing = {};
  for (const k of [1, 2]) for (const which of ['off', 'sixRings']) {
    const c2 = document.createElement('canvas');
    c2.width = W * k; c2.height = H * k;
    document.body.append(c2);
    const x2 = c2.getContext('2d');
    x2.setTransform(k, 0, 0, k, 0, 0);
    const world = boot.makeWorld(chars.malik, chars.avner, null);
    const game = createGame(world);
    game.players[0].x = -4500; game.players[1].x = 4500;
    const renderer = createFightRenderer(x2, W, H);
    const opts = { stage, palettes: [0, 0], shockwave: which !== 'off' };
    for (let i = 0; i < 12; i++) { renderer.draw(game, world, opts); await new Promise((r) => setTimeout(r, 100)); }
    // Three of the bigger pairs at once (six rings), five frames into their growth, over the fighters and the stage.
    for (const dx of [-9000, 0, 9000]) renderer.shock('big', dx, 9000);
    for (let i = 0; i < 5; i++) { step(game, [0, 0], world); renderer.notice(game, world); }
    for (let j = 0; j < 20; j++) renderer.draw(game, world, opts); // warm up
    const ms = [];
    for (let i = 0; i < 15; i++) {
      const t0 = performance.now();
      for (let j = 0; j < 20; j++) renderer.draw(game, world, opts);
      x2.getImageData(0, 0, 1, 1);
      ms.push((performance.now() - t0) / 20);
    }
    ms.sort((p, q) => p - q);
    (out.timing[`${W * k}x${H * k}`] ??= {})[which] = { median: +ms[ms.length >> 1].toFixed(2), worst: +ms[ms.length - 1].toFixed(2) };
    if (k === 1 && which === 'sixRings') out.shots['six-rings'] = c2.toDataURL('image/png');
    c2.remove();
  }
  const gl = document.createElement('canvas').getContext('webgl');
  const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
  out.log.push(`graphics: ${gl ? gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'no WebGL'}`);
  return out;
};

let exit = 0;
try {
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9378/json')).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
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
