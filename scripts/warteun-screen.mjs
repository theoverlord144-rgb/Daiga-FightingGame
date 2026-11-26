// War'Teun on the real screen:  node scripts/warteun-screen.mjs <out-folder> [--url http://localhost:5300]
//
// Needs the dev server running and Chrome (the same way as baseline-screen.mjs). With the real renderer, stage, HUD
// and training overlay it
//   - saves pictures of him against Avner and Malik (standing, three vacuums waiting with the Wiretap mark on, the
//     Tune burst at Resonance 3), and
//   - times every frame (rules + drawing) of a 900-frame loop in which three vacuums, the Wiretap mark, Resonance 3
//     and his effects are on screen as much as the rules allow. Writes <out>/warteun-performance.json.
// It changes nothing in the game.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const OUT = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!OUT) { console.log('usage: node scripts/warteun-screen.mjs <out-folder> [--url http://localhost:5300]'); process.exit(1); }
const URL0 = opt('url', 'http://localhost:5300');
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('Chrome not found (set CHROME to its path)'); process.exit(1); }
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toska-warteun-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9378', `--user-data-dir=${profile}`, '--hide-scrollbars', '--window-size=1280,760', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = async () => {
  const boot = await import('/src/ui/boot.js');
  const { createFightRenderer } = await import('/src/render/fight-renderer.js');
  const { step } = await import('/src/core/game.js');
  const { RAW } = await import('/src/core/input.js');
  const { createTraining, defaultSettings } = await import('/src/ui/training/training.js');
  const { createFrameMeter } = await import('/src/ui/training/frame-meter.js');
  const { createSystemsReadout } = await import('/src/ui/training/systems-readout.js');
  const { drawTrainingOverlay } = await import('/src/ui/training/overlay.js');
  const { W, H } = boot;
  const chars = boot.loadCharacters();
  const stage = Object.values(boot.STAGES)[0];
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  await new Promise((r) => setTimeout(r, 2500));
  const D = { 5: 0, 6: RAW.RIGHT, 4: RAW.LEFT, 2: RAW.DOWN, 3: RAW.DOWN | RAW.RIGHT, 1: RAW.DOWN | RAW.LEFT, 8: RAW.UP };
  /** "2 3 6+H 5*20" → raw inputs, a frame each. */
  const script = (s) => s.trim().split(/\s+/).flatMap((tok) => { const [body, n] = tok.split('*'); const [d, b = ''] = body.split('+'); let r = D[d]; for (const c of b) r |= RAW[c]; return Array(Number(n ?? 1)).fill(r); });
  function make(vs, gap) {
    const world = boot.makeWorld(chars.warteun, chars[vs], null);
    const training = createTraining(world, defaultSettings());
    const meter = createFrameMeter(), readout = createSystemsReadout();
    const renderer = createFightRenderer(ctx, W, H);
    const game = training.newGame();
    game.players[0].x = -gap * 50; game.players[1].x = gap * 50;
    for (const p of game.players) p.meter = 40000;
    const draw = (overlay) => { renderer.draw(game, world, { stage, marks: true, palettes: [0, 0] }); if (overlay) drawTrainingOverlay(ctx, W, H, meter, training, readout, game); };
    const go = (s) => { for (const r of script(s)) { step(game, [r, 0], world); renderer.notice(game, world); meter.update(game, world); readout.update(game, world); } };
    return { world, game, draw, go };
  }
  const shots = {};
  const snap = (name, m) => { m.draw(false); shots[name] = canvas.toDataURL('image/png'); };
  for (const vs of ['avner', 'malik']) {
    const m = make(vs, 300);
    for (let i = 0; i < 20; i++) { m.draw(false); await new Promise((r) => setTimeout(r, 100)); } // sheets load
    m.go('5*30'); snap(`${vs}-1-standing`, m);
    // Three vacuums waiting around the opponent, the Wiretap mark on, Resonance 3.
    const a = m.game.players[0], d = m.game.players[1];
    a.vars.wiretap = 360; a.vars.resonance = 18;
    const home = a.x;
    for (const off of [-9000, 2000, 16000]) { a.x = d.x + off - 8000; a.facing = 1; a.vars.wiretap = 0; m.go('2 3 6+H 5*8'); a.vars.wiretap = 360; a.x = home; m.go('5*40'); a.x = home; for (const q of m.game.projectiles) { q.fuse = q.age + 200; q.boom = q.fuse + 12; } }
    a.x = home; a.facing = 1; a.vars.resonance = 18; m.go('5*4'); snap(`${vs}-2-three-vacuums-marked`, m);
    m.go('5+R 5*9'); snap(`${vs}-3-tune-strike`, m);
    m.go('5*3'); snap(`${vs}-4-tune-burst`, m);
    m.go('5*5'); snap(`${vs}-5-tune-burst-later`, m);
  }

  // Frame time: 900 frames, three passes, the fastest time of each frame kept.
  const loop = script('2 5 2+M 5*30 2 3 6+L 5*40 2 3 6+M 5*40 2 3 6+H 5*40 5+H 5*30 2+M 5*30 5+R 5*50 2 1 4+M 5*50 6 2 3+M 5*50');
  const N = 900;
  const stepMs = new Float64Array(N).fill(1e9), drawMs = new Float64Array(N).fill(1e9);
  let most = 0, withThree = 0;
  for (let pass = 0; pass < 3; pass++) {
    const world = boot.makeWorld(chars.warteun, chars.malik, null);
    const training = createTraining(world, defaultSettings());
    const meter = createFrameMeter(), readout = createSystemsReadout();
    const renderer = createFightRenderer(ctx, W, H);
    const game = training.newGame();
    game.players[0].x = -9000; game.players[1].x = 9000;
    for (let f = 0; f < N; f++) {
      const a = game.players[0];
      a.vars.wiretap = 360; a.vars.resonance = 18; a.meter = 40000; game.players[1].health = 10000;
      // Keep three vacuums waiting (the scripted warps add more; the rule of three trims them).
      for (const q of game.projectiles) if (q.kind === 'vacuum' && q.age < q.fuse && f % 250 > 60) { q.fuse = q.age + 30; q.boom = q.fuse + 12; }
      const t0 = performance.now();
      step(game, [loop[f % loop.length], 0], world);
      renderer.notice(game, world);
      const t1 = performance.now();
      renderer.draw(game, world, { stage, marks: true, palettes: [0, 0] });
      meter.update(game, world); readout.update(game, world);
      drawTrainingOverlay(ctx, W, H, meter, training, readout, game);
      ctx.getImageData(0, 0, 1, 1);
      const t2 = performance.now();
      stepMs[f] = Math.min(stepMs[f], t1 - t0); drawMs[f] = Math.min(drawMs[f], t2 - t1);
      if (pass === 0) { const n = game.projectiles.filter((q) => q.kind === 'vacuum').length; most = Math.max(most, n); if (n >= 3) withThree++; }
      if (f % 300 === 299) await new Promise((r) => setTimeout(r, 0));
    }
  }
  const total = Array.from(stepMs, (s, i) => s + drawMs[i]);
  const stat = (list) => { const s = [...list].sort((x, y) => x - y); const worst = s.slice(Math.floor(s.length * 0.95)); const avg = (l) => l.reduce((x, y) => x + y, 0) / l.length; return { average: +avg(s).toFixed(3), worst5pct: +avg(worst).toFixed(3), max: +s[s.length - 1].toFixed(3) }; };
  return { shots, performance: { frames: N, mostVacuums: most, framesWithThreeOrMore: withThree, ms: { total: stat(total), step: stat(stepMs), draw: stat(drawMs) }, budgetMs: 16.667 } };
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
  const { shots, performance } = res.result.result.value;
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, png] of Object.entries(shots)) { fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(png.split(',')[1], 'base64')); console.log(`${name}.png`); }
  performance.note = 'headless Chrome on this machine, 960x540 canvas, real renderer + stage + HUD + training overlay; War\'Teun against Malik with the Wiretap mark on, Resonance 3 and vacuums kept on screen. Fastest of three passes per frame.';
  fs.writeFileSync(path.join(OUT, 'warteun-performance.json'), `${JSON.stringify(performance, null, 1)}\n`);
  console.log(JSON.stringify(performance));
  ws.close();
} catch (e) { exit = 1; console.log('ERROR', String(e.message ?? e).slice(0, 2000)); }
chrome.kill();
process.exit(exit);
