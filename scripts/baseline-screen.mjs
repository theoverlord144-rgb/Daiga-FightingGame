// Real-screen baseline (art polish, Part 0):  node scripts/baseline-screen.mjs [out-folder] [--url http://localhost:5300]
//
// Needs the dev server running (npm run dev) and Chrome. Opens a headless Chrome on the dev server, loads the game's
// own modules in that page, and with the real renderer, stage, HUD and training overlay:
//   - plays the recorded input sequences in scripts/baseline-scenes.json and saves a PNG at each marked frame
//     (screens/<scene>-<label>.png): the same inputs always give the same pictures;
//   - replays the recorded match of scripts/baseline.mjs (<out>/match-inputs.json) and times every frame
//     (step + draw), writing <out>/performance.json: average, and the average of the worst 5%.
// It changes nothing in the game; it writes only the out folder.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const OUT = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--'))) || 'docs/baseline';
const URL0 = opt('url', 'http://localhost:5300');
const LABEL = opt('label', 'performance'); // the name of the timing file (performance.json)
const SWITCHES = opt('polish', 'off'); // look-only polish: off (the baseline look) | on | default | a list of the items to turn on (a,b,c)
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => p && fs.existsSync(p));
if (!CHROME) { console.log('Chrome not found (set CHROME to its path)'); process.exit(1); }
const scenes = JSON.parse(fs.readFileSync('scripts/baseline-scenes.json', 'utf8')).scenes;
const match = JSON.parse(fs.readFileSync(path.join(OUT, 'match-inputs.json'), 'utf8'));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'toska-baseline-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9377', `--user-data-dir=${profile}`, '--hide-scrollbars', '--window-size=1280,760', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The code that runs inside the page. It builds its own canvas and uses the game's modules straight from the dev server.
const PAGE = async ({ scenes, match, switches }) => {
  const boot = await import('/src/ui/boot.js');
  const { createFightRenderer } = await import('/src/render/fight-renderer.js');
  const { createGame, step } = await import('/src/core/game.js');
  const { hashState } = await import('/src/core/state.js');
  const { createTraining, defaultSettings } = await import('/src/ui/training/training.js');
  const { createFrameMeter } = await import('/src/ui/training/frame-meter.js');
  const { createSystemsReadout } = await import('/src/ui/training/systems-readout.js');
  const { drawTrainingOverlay } = await import('/src/ui/training/overlay.js');
  const polish = await import('/src/render/polish.js').catch(() => null);
  if (polish) {
    if (switches === 'on' || switches === 'off' || switches === 'default') polish.setAllPolish(switches === 'default' ? 'default' : switches === 'on');
    else { polish.setAllPolish(false); for (const k of switches.split(',')) polish.setPolish(k, true); }
  }
  const { W, H } = boot;
  const chars = boot.loadCharacters();
  const stage = Object.values(boot.STAGES)[0];
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  await new Promise((r) => setTimeout(r, 2500)); // every sheet preloads when the renderer module loads
  const waitImages = async (renderer, game, world) => { for (let i = 0; i < 20; i++) { renderer.draw(game, world, { stage, marks: true, palettes: [0, 0] }); await new Promise((r) => setTimeout(r, 100)); } };

  const shots = {};
  for (const sc of scenes) {
    const world = boot.makeWorld(chars[sc.p1], chars[sc.p2], null);
    const training = createTraining(world, defaultSettings());
    const meter = createFrameMeter(), readout = createSystemsReadout();
    const renderer = createFightRenderer(ctx, W, H);
    const game = training.newGame();
    if (sc.gap) { game.players[0].x = -sc.gap * 50; game.players[1].x = sc.gap * 50; }
    for (const p of game.players) p.meter = 40000;
    await waitImages(renderer, game, world);
    let f = 0;
    for (const [a, b, n] of sc.steps) for (let i = 0; i < n; i++) {
      step(game, [a, b], world);
      renderer.notice(game, world);
      meter.update(game, world);
      readout.update(game, world);
      f++;
      const label = sc.shots[f];
      if (label) {
        renderer.draw(game, world, { stage, marks: true, palettes: [0, 0] });
        drawTrainingOverlay(ctx, W, H, meter, training, readout, game);
        shots[`${sc.name}-${label}`] = { png: canvas.toDataURL('image/png'), frame: f, hash: hashState(game), states: game.players.map((p) => `${p.state} ${p.frame}`) };
      }
    }
  }

  // Frame time over the recorded match: three passes, the fastest time of each frame kept (shakes off other programs).
  const N = match.inputs.length;
  const stepMs = new Float64Array(N).fill(1e9), drawMs = new Float64Array(N).fill(1e9);
  let finalHash = null;
  for (let pass = 0; pass < 3; pass++) {
    const world = boot.makeWorld(chars.avner, chars.malik, boot.MATCH);
    const game = createGame(world);
    for (const p of game.players) p.meter = 40000;
    if (game.match) game.match.phase = 'fight';
    game.players[0].x = -6000; game.players[1].x = 6000;
    const renderer = createFightRenderer(ctx, W, H);
    const meter = createFrameMeter(), readout = createSystemsReadout();
    const training = createTraining(world, defaultSettings());
    for (let f = 0; f < N; f++) {
      const t0 = performance.now();
      step(game, match.inputs[f], world);
      renderer.notice(game, world);
      const t1 = performance.now();
      renderer.draw(game, world, { stage, marks: true, palettes: [0, 1] });
      meter.update(game, world); readout.update(game, world);
      drawTrainingOverlay(ctx, W, H, meter, training, readout, game);
      ctx.getImageData(0, 0, 1, 1); // make the browser finish the drawing before the clock is read
      const t2 = performance.now();
      stepMs[f] = Math.min(stepMs[f], t1 - t0); drawMs[f] = Math.min(drawMs[f], t2 - t1);
      if (f % 400 === 399) for (const p of game.players) { p.health = world.chars[p.id].stats.health; p.meter = 40000; if (world.burst) p.burst = world.burst.gaugeMax; }
      if (f % 300 === 299) await new Promise((r) => setTimeout(r, 0));
    }
    finalHash = hashState(game);
  }
  const total = Array.from(stepMs, (s, i) => s + drawMs[i]);
  const stat = (list) => { const s = [...list].sort((a, b) => a - b); const worst = s.slice(Math.floor(s.length * 0.95)); const avg = (l) => l.reduce((a, b) => a + b, 0) / l.length; return { average: +avg(s).toFixed(3), worst5pct: +avg(worst).toFixed(3), max: +s[s.length - 1].toFixed(3) }; };
  return { shots, performance: { frames: N, finalHash, ms: { total: stat(total), step: stat(stepMs), draw: stat(drawMs) }, budgetMs: 16.667 } };
};

let exit = 0;
try {
  let target = null;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://127.0.0.1:9377/json')).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
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
  const res = await send('Runtime.evaluate', { expression: `(${PAGE.toString()})(${JSON.stringify({ scenes, match, switches: SWITCHES })})`, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails || !res.result?.result?.value) throw new Error(JSON.stringify(res.result?.exceptionDetails ?? res).slice(0, 1500));
  const { shots, performance } = res.result.result.value;
  const dir = path.join(OUT, LABEL === 'performance' ? 'screens' : `screens-${LABEL}`);
  fs.mkdirSync(dir, { recursive: true });
  const index = {};
  for (const [name, s] of Object.entries(shots)) {
    fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(s.png.split(',')[1], 'base64'));
    index[name] = { frame: s.frame, hash: s.hash, states: s.states };
    console.log(`${name}.png  frame ${s.frame}  [${s.states.join(' | ')}]`);
  }
  fs.writeFileSync(path.join(dir, 'index.json'), `${JSON.stringify(index, null, 1)}\n`);
  performance.polish = SWITCHES;
  performance.note = 'headless Chrome on this machine, 960x540 canvas, real renderer + stage + HUD + training overlay; step = game rules, draw = everything drawn. Fastest of three passes per frame.';
  fs.writeFileSync(path.join(OUT, `${LABEL}.json`), `${JSON.stringify(performance, null, 1)}\n`);
  console.log(JSON.stringify(performance.ms), 'final hash', performance.finalHash);
  ws.close();
} catch (e) { exit = 1; console.log('ERROR', String(e.message ?? e).slice(0, 2000)); }
chrome.kill();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome still letting go of it */ }
process.exit(exit);
