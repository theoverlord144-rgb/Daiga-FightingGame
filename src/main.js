// Entry point. Without ?mode= it runs the game: title, character select, versus, versus CPU, training, settings.
// Developer shortcuts with ?mode=:
//   training  straight into training mode (&p1=, &p2=, &pal1=, &pal2=)
//   versus    straight into a versus match (same params; &cpu=1 for the CPU on Player 2)
//   lab       the Input Lab
//   netplay   rollback netplay between two tabs, with rounds (&side=1|2, &lag=N, &delay=N, &free=1 for no rounds)
//   synctest  free play with the rollback sync test running every frame
//   replay    drop a replay file to watch it
import { setupCanvas, loadCharacters, makeWorld, INPUT_RULES, BATTLE, MATCH, STAGES, W, H } from './ui/boot.js';
import { createGame, step } from './core/game.js';
import { hashState } from './core/state.js';
import { startLoop } from './ui/loop.js';
import { createDevices } from './ui/devices.js';
import { openControlsPanel } from './ui/controls-panel.js';
import { drawHistory } from './ui/input-history.js';
import { createFightRenderer } from './render/fight-renderer.js';
import { createInputLab } from './ui/input-lab.js';
import { createNetplay, createLiveSyncTest } from './ui/netplay.js';
import { createReplayRecorder, decodeReplay } from './net/replay.js';
import { downloadReplay, onDroppedJSON, openButton } from './ui/replay-file.js';
import { createApp } from './ui/app.js';

const { ctx, ui } = setupCanvas();
const devices = createDevices();
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'game';
const isGame = mode === 'game' || mode === 'training' || mode === 'versus';
const opts = { boxes: params.has('boxes'), labels: true, history: true, versusHistory: false, meter: true };
const stage = STAGES[params.get('stage')] || Object.values(STAGES)[0];

// Time controls (training, sync test, replays): pause, one-frame steps, slow motion.
const SPEEDS = [1, 0.5, 0.25];
const time = {
  paused: false,
  stepOnce: false,
  speedIndex: 0,
  /** While paused: true once per F10 press. */
  consumeStep() {
    if (!time.stepOnce) return false;
    time.stepOnce = false;
    return true;
  },
};
let app = null;
const pausable = () => (isGame ? !!app?.screen?.pausable : mode === 'synctest' || mode === 'replay');
// Panels (F1 controls, F2 training menu) live on `host`: the app in game mode, a stand-in otherwise.
let host = { panel: null };
const gate = (fn) => () => {
  if (time.paused && !time.consumeStep()) return;
  fn();
};
const timeText = () => {
  if (!pausable()) return '';
  if (time.paused) return 'PAUSED · F10 next frame · F9 resume';
  return SPEEDS[time.speedIndex] === 1 ? '' : `SLOW MOTION ${['1×', '½×', '¼×'][time.speedIndex]}`;
};

let stepFn;
let drawFn;
let help = '';

const chars = mode === 'lab' ? null : loadCharacters();
const worldFor = (p1, p2, match = null) => makeWorld(chars[p1] || chars.avner, chars[p2] || chars.avner, match);
const renderer = createFightRenderer(ctx, W, H);

function caption(lines, color = '#e8e2d4', y = 150) {
  ctx.textAlign = 'center';
  ctx.font = '600 14px system-ui';
  lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? color : '#a99fb8'; ctx.fillText(l, W / 2, y + i * 20); });
}

function drawHistories(game, show = opts.history) {
  if (!show) return;
  ctx.fillStyle = '#0009';
  ctx.fillRect(0, 84, 126, 300);
  ctx.fillRect(W - 126, 84, 126, 300);
  const [a, b] = game.players;
  drawHistory(ctx, a.input, 12, 104, { rows: 15, rules: INPUT_RULES, facing: a.facing, width: 112 });
  drawHistory(ctx, b.input, W - 12, 104, { align: 'right', rows: 15, rules: INPUT_RULES, facing: b.facing, width: 112 });
}

let saveReplay = null; // set by modes that can save one (Ctrl+S)

if (isGame) {
  const picks = [
    { id: params.get('p1') || 'avner', pal: Number(params.get('pal1') ?? 0) },
    { id: params.get('p2') || 'avner', pal: Number(params.get('pal2') ?? 1) },
  ];
  const start = mode === 'training' ? ['training', { picks }]
    : mode === 'versus' ? ['versus', { mode: params.get('cpu') ? 'cpu' : 'versus', picks }]
      : ['title', {}];
  app = createApp({
    ctx, ui, W, H, devices, chars, stage, battle: BATTLE, matchBase: MATCH, renderer, opts, time,
    makeWorld: (a, b, match) => makeWorld(a, b, match),
    drawHistories: (game) => drawHistories(game, app.screenName === 'training' ? opts.history : opts.versusHistory),
  }, start);
  host = app;
  // Debugging hook for the browser console and screenshot scripts: toska.app.screen.game is the live game.
  // Changing it from the console is cheating, on purpose; nothing in the game reads this.
  globalThis.toska = { app };
  stepFn = () => app.step();
  drawFn = () => app.draw();
  saveReplay = () => app.screen.saveReplay?.();
  addEventListener('keydown', (e) => app.onKey(e));
} else if (mode === 'lab') {
  const lab = createInputLab(ctx, W, H, INPUT_RULES);
  stepFn = () => lab.step(host.panel ? [0, 0] : [devices.read(0), devices.read(1)]);
  drawFn = () => lab.draw();
  addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); lab.toggleLeniency(); }
  });
} else if (mode === 'netplay') {
  const p1 = params.get('p1') || 'avner';
  const p2 = params.get('p2') || 'avner';
  // Rounds from data/system/match.json (the same file on both sides, so both agree); &free=1 for endless play.
  const rules = params.has('free') ? null : MATCH;
  const world = worldFor(p1, p2, rules);
  const palettes = [Number(params.get('pal1') ?? 0), Number(params.get('pal2') ?? 1)];
  const side = params.get('side') === '2' ? 2 : 1;
  const rec = createReplayRecorder({ chars: [p1, p2], match: rules, palettes });
  const net = createNetplay(world, {
    side, lag: Number(params.get('lag') || 0), delay: Number(params.get('delay') || 2),
    onFinal: (f, raws, g) => rec.record(raws, g),
  });
  saveReplay = () => downloadReplay(rec.finish(), 'toska-netplay');
  help = 'Ctrl+S save replay (confirmed frames) · F3 boxes · F5 input history';
  stepFn = () => net.step(host.panel ? 0 : devices.read(0));
  drawFn = () => {
    const s = net.session;
    renderer.draw(s.game, world, { ...opts, stage, palettes });
    drawHistories(s.game);
    if (!net.started) {
      caption([`Netplay: you are Player ${side}. Waiting for the other tab...`,
        `Open this page again with side=${side === 1 ? 2 : 1} in another tab.`]);
      return;
    }
    const st = s.stats;
    caption([
      st.desync !== null ? `DESYNC at frame ${st.desync}` : `Player ${side} · ping ${net.ping ?? '…'} ms · fake lag ${net.lag}f each way`,
      `rollbacks ${st.rollbacks} · longest ${st.maxRollback}f · waits ${st.stalls + st.waits}`,
    ], st.desync !== null ? '#ff6b6b' : '#e8e2d4');
  };
} else if (mode === 'synctest') {
  const p1 = params.get('p1') || 'avner';
  const p2 = params.get('p2') || 'avner';
  const world = worldFor(p1, p2);
  const live = createLiveSyncTest(world, 8);
  const rec = createReplayRecorder({ chars: [p1, p2] });
  saveReplay = () => downloadReplay(rec.finish(live.game), 'toska-match');
  help = 'Ctrl+S save replay · F9 pause · F10 next frame · ` slow motion · F3 boxes · F5 input history';
  stepFn = gate(() => {
    const raws = host.panel ? [0, 0] : [devices.read(0), devices.read(1)];
    live.step(raws);
    rec.record(raws, live.game);
  });
  drawFn = () => {
    renderer.draw(live.game, world, { ...opts, stage });
    drawHistories(live.game);
    const st = live.status;
    caption(st.failFrame === null
      ? [`SYNC TEST OK · ${st.checks} frames rewound 8 and replayed, all identical`]
      : [`SYNC TEST FAILED at frame ${st.failFrame}`, 'Something in the game is not deterministic or not saved in the state.'],
    st.failFrame === null ? '#5fd38a' : '#ff6b6b');
  };
} else if (mode === 'replay') {
  let rp = null; // { world, frames, checks, game, f, failedAt, palettes }
  let error = null;
  const load = (file) => {
    try {
      const frames = decodeReplay(file);
      const world = worldFor(file.chars[0], file.chars[1], file.match ?? null);
      rp = { world, frames, checks: new Map(file.checks), finalHash: file.finalHash, game: createGame(world), f: 0, failedAt: null, file, palettes: file.palettes ?? null };
      error = null;
      btn.remove();
    } catch (err) { error = err.message; }
  };
  const fail = (err) => { error = `Couldn't read that file: ${err.message}`; };
  const btn = openButton(ui, (file) => load(file), fail);
  onDroppedJSON(load, fail);
  help = 'Drop a replay file anywhere · R restart · F9 pause · F10 next frame · ` slow motion · F3 boxes · F5 input history';
  stepFn = gate(() => {
    if (!rp || rp.f >= rp.frames.length) return;
    step(rp.game, rp.frames[rp.f], rp.world);
    rp.f++;
    const want = rp.checks.get(rp.f) ?? (rp.f === rp.frames.length ? rp.finalHash : undefined);
    if (want != null && rp.failedAt === null && hashState(rp.game) !== want) rp.failedAt = rp.f;
  });
  drawFn = () => {
    if (!rp) {
      ctx.fillStyle = '#17141f';
      ctx.fillRect(0, 0, W, H);
      caption([error ?? 'Drop a replay file (.json) on this page, or open one, to watch it.',
        'Save one with Ctrl+S in a versus match, ?mode=synctest or ?mode=netplay.'], error ? '#ff6b6b' : '#e8e2d4', H / 2);
      return;
    }
    renderer.draw(rp.game, rp.world, { ...opts, stage, palettes: rp.palettes });
    drawHistories(rp.game);
    const done = rp.f >= rp.frames.length;
    const state = rp.failedAt !== null ? `DOES NOT MATCH the recording from frame ${rp.failedAt}`
      : done ? 'finished · matched the recording exactly' : 'matching the recording so far';
    caption([`Replay · frame ${rp.f} / ${rp.frames.length} · ${state}`], rp.failedAt !== null ? '#ff6b6b' : done ? '#5fd38a' : '#e8e2d4', 110);
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !e.repeat && rp) { rp.game = createGame(rp.world); rp.f = 0; rp.failedAt = null; }
  });
}

// Keys shared by the fight screens.
addEventListener('keydown', (e) => {
  if (host.panel || mode === 'lab') return;
  if (e.code === 'F3') { e.preventDefault(); opts.boxes = !opts.boxes; }
  if (e.code === 'F5') {
    e.preventDefault();
    if (isGame && app.screenName === 'versus') opts.versusHistory = !opts.versusHistory;
    else opts.history = !opts.history;
  }
  if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey) && saveReplay) { e.preventDefault(); saveReplay(); }
  if (!pausable()) return;
  if (e.code === 'F9') { e.preventDefault(); time.paused = !time.paused; }
  if (e.code === 'F10') { e.preventDefault(); time.paused = true; time.stepOnce = true; }
  if (e.code === 'Backquote') { e.preventDefault(); time.speedIndex = (time.speedIndex + 1) % SPEEDS.length; }
});

const loop = startLoop({
  step: () => { stepFn(); devices.endStep(); },
  speed: () => (pausable() ? SPEEDS[time.speedIndex] : 1),
  render: () => {
    drawFn();
    const t = timeText();
    if (t) caption([t], '#c9a2ff', 120);
    const perf = !isGame || app.screenName === 'training' || app.settings.showPerformance;
    if (perf) {
      ctx.textAlign = 'center';
      ctx.font = '11px ui-monospace, monospace';
      ctx.fillStyle = '#8f86a3';
      const s = loop.stats;
      ctx.fillText(`${s.fps} fps · ${s.sps} steps/s · step ${s.stepMs.toFixed(3)} ms · draw ${s.drawMs.toFixed(2)} ms (max ${s.drawMax.toFixed(1)})`, W / 2, H - 34);
    }
    const h = isGame ? app.screen.help : help;
    if (h) {
      ctx.fillStyle = '#a99fb8';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(h, W / 2, H - 14);
    }
  },
});

addEventListener('keydown', (e) => {
  if (e.code === 'F1' || (e.code === 'Escape' && host.panel && !host.panel.training)) {
    e.preventDefault();
    if (host.panel) { if (!host.panel.training) host.panel.close(); return; }
    host.panel = openControlsPanel(ui, devices, () => { host.panel = null; app?.menu.sync(); });
  }
});
