// Entry point. Picks a screen from ?mode=:
//   (none)    Training mode: two fighters; Player 2 is the training dummy (a second controller still plays it)
//   lab       the Input Lab
//   netplay   rollback netplay between two tabs (&side=1|2, &lag=N, &delay=N)
//   synctest  free play with the rollback sync test running every frame
//   replay    drop a replay file to watch it
import { setupCanvas, loadCharacters, makeWorld, INPUT_RULES, W, H } from './ui/boot.js';
import { createGame, step } from './core/game.js';
import { hashState } from './core/state.js';
import { startLoop } from './ui/loop.js';
import { createDevices } from './ui/devices.js';
import { openControlsPanel } from './ui/controls-panel.js';
import { drawHistory } from './ui/input-history.js';
import { createFightRenderer } from './render/fight-renderer.js';
import { createInputLab } from './ui/input-lab.js';
import { createTraining } from './ui/training/training.js';
import { createFrameMeter } from './ui/training/frame-meter.js';
import { drawTrainingOverlay } from './ui/training/overlay.js';
import { openTrainingPanel, loadTrainingSettings } from './ui/training/training-panel.js';
import { createNetplay, createLiveSyncTest } from './ui/netplay.js';
import { createReplayRecorder, decodeReplay } from './net/replay.js';
import { downloadReplay, onDroppedJSON, openButton } from './ui/replay-file.js';

const { ctx, ui } = setupCanvas();
const devices = createDevices();
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'training';
let panel = null;
const opts = { boxes: params.has('boxes'), labels: true, history: true, meter: true };

// Time controls (training, sync test, replays): pause, one-frame steps, slow motion.
const SPEEDS = [1, 0.5, 0.25];
const time = { paused: false, stepOnce: false, speedIndex: 0, pausable: mode !== 'netplay' && mode !== 'lab' };
const gate = (fn) => () => {
  if (time.paused) {
    if (!time.stepOnce) return;
    time.stepOnce = false;
  }
  fn();
};
const timeText = () => {
  if (!time.pausable) return '';
  if (time.paused) return 'PAUSED · F10 next frame · F9 resume';
  return SPEEDS[time.speedIndex] === 1 ? '' : `SLOW MOTION ${['1×', '½×', '¼×'][time.speedIndex]}`;
};

let stepFn;
let drawFn;
let help = '';

const chars = mode === 'lab' ? null : loadCharacters();
const worldFor = (p1, p2) => makeWorld(chars[p1] || chars.avner, chars[p2] || chars.avner);

function caption(lines, color = '#e8e2d4', y = 150) {
  ctx.textAlign = 'center';
  ctx.font = '600 14px system-ui';
  lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? color : '#a99fb8'; ctx.fillText(l, W / 2, y + i * 20); });
}

function drawHistories(game) {
  if (!opts.history) return;
  ctx.fillStyle = '#0009';
  ctx.fillRect(0, 0, 126, 350);
  ctx.fillRect(W - 126, 0, 126, 350);
  const [a, b] = game.players;
  drawHistory(ctx, a.input, 12, 22, { rows: 17, rules: INPUT_RULES, facing: a.facing, width: 112 });
  drawHistory(ctx, b.input, W - 12, 22, { align: 'right', rows: 17, rules: INPUT_RULES, facing: b.facing, width: 112 });
}

let saveReplay = null; // set by modes that can save one (Ctrl+S)

if (mode === 'lab') {
  const lab = createInputLab(ctx, W, H, INPUT_RULES);
  stepFn = () => lab.step(panel ? [0, 0] : [devices.read(0), devices.read(1)]);
  drawFn = () => lab.draw();
  addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); lab.toggleLeniency(); }
  });
} else if (mode === 'netplay') {
  const p1 = params.get('p1') || 'avner';
  const p2 = params.get('p2') || 'avner';
  const world = worldFor(p1, p2);
  const renderer = createFightRenderer(ctx, W, H);
  const side = params.get('side') === '2' ? 2 : 1;
  const rec = createReplayRecorder({ chars: [p1, p2] });
  const net = createNetplay(world, {
    side, lag: Number(params.get('lag') || 0), delay: Number(params.get('delay') || 2),
    onFinal: (f, raws, g) => rec.record(raws, g),
  });
  saveReplay = () => downloadReplay(rec.finish(), 'toska-netplay');
  help = 'Ctrl+S save replay (confirmed frames) · F3 boxes · F5 input history';
  stepFn = () => net.step(panel ? 0 : devices.read(0));
  drawFn = () => {
    const s = net.session;
    renderer.draw(s.game, world, opts);
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
  const renderer = createFightRenderer(ctx, W, H);
  const live = createLiveSyncTest(world, 8);
  const rec = createReplayRecorder({ chars: [p1, p2] });
  saveReplay = () => downloadReplay(rec.finish(live.game), 'toska-match');
  help = 'Ctrl+S save replay · F9 pause · F10 next frame · ` slow motion · F3 boxes · F5 input history';
  stepFn = gate(() => {
    const raws = panel ? [0, 0] : [devices.read(0), devices.read(1)];
    live.step(raws);
    rec.record(raws, live.game);
  });
  drawFn = () => {
    renderer.draw(live.game, world, opts);
    drawHistories(live.game);
    const st = live.status;
    caption(st.failFrame === null
      ? [`SYNC TEST OK · ${st.checks} frames rewound 8 and replayed, all identical`]
      : [`SYNC TEST FAILED at frame ${st.failFrame}`, 'Something in the game is not deterministic or not saved in the state.'],
    st.failFrame === null ? '#5fd38a' : '#ff6b6b');
  };
} else if (mode === 'replay') {
  const renderer = createFightRenderer(ctx, W, H);
  let rp = null; // { world, frames, checks, game, f, failedAt }
  let error = null;
  const load = (file) => {
    try {
      const frames = decodeReplay(file);
      const world = worldFor(file.chars[0], file.chars[1]);
      rp = { world, frames, checks: new Map(file.checks), finalHash: file.finalHash, game: createGame(world), f: 0, failedAt: null, file };
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
        'Save one with Ctrl+S in ?mode=synctest or ?mode=netplay.'], error ? '#ff6b6b' : '#e8e2d4', H / 2);
      return;
    }
    renderer.draw(rp.game, rp.world, opts);
    drawHistories(rp.game);
    const done = rp.f >= rp.frames.length;
    const state = rp.failedAt !== null ? `DOES NOT MATCH the recording from frame ${rp.failedAt}`
      : done ? 'finished · matched the recording exactly' : 'matching the recording so far';
    caption([`Replay · frame ${rp.f} / ${rp.frames.length} · ${state}`], rp.failedAt !== null ? '#ff6b6b' : done ? '#5fd38a' : '#e8e2d4');
  };
  addEventListener('keydown', (e) => {
    if (e.code === 'KeyR' && !e.repeat && rp) { rp.game = createGame(rp.world); rp.f = 0; rp.failedAt = null; }
  });
} else {
  const world = worldFor(params.get('p1') || 'avner', params.get('p2') || 'avner');
  const training = createTraining(world, loadTrainingSettings());
  const meter = createFrameMeter();
  let game = training.newGame();
  const renderer = createFightRenderer(ctx, W, H);
  help = 'F1 controls · F2 training menu · F3 boxes · F4 labels · F5 inputs · F6 record · F7 playback · F8 meter · F9 pause · F10 frame · ` slow · R reset';
  stepFn = gate(() => {
    const dev = panel ? [0, 0] : [devices.read(0), devices.read(1)];
    step(game, training.inputs(game, dev), world);
    training.afterStep(game);
    meter.update(game, world);
  });
  drawFn = () => {
    renderer.draw(game, world, opts);
    if (opts.meter) drawTrainingOverlay(ctx, W, H, meter, training);
    drawHistories(game);
  };
  addEventListener('keydown', (e) => {
    if (panel) return;
    if (e.code === 'F4') { e.preventDefault(); opts.labels = !opts.labels; }
    if (e.code === 'F8') { e.preventDefault(); opts.meter = !opts.meter; }
    if (e.code === 'F6') {
      e.preventDefault();
      if (training.mode === 'record') training.stopRecording();
      else training.startRecording();
    }
    if (e.code === 'F7') {
      e.preventDefault();
      if (training.mode === 'playback') training.stopPlayback();
      else training.startPlayback();
    }
    if (e.code === 'KeyR' && !e.repeat) { game = training.newGame(); meter.reset(); }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'F2' || (e.code === 'Escape' && panel?.training)) {
      e.preventDefault();
      if (panel) { if (panel.training) panel.close(); return; }
      panel = openTrainingPanel(ui, training.settings, () => { panel = null; });
      panel.training = true;
    }
  });
}

// Keys shared by the fight screens.
addEventListener('keydown', (e) => {
  if (panel || mode === 'lab') return;
  if (e.code === 'F3') { e.preventDefault(); opts.boxes = !opts.boxes; }
  if (e.code === 'F5') { e.preventDefault(); opts.history = !opts.history; }
  if (e.code === 'KeyS' && (e.ctrlKey || e.metaKey) && saveReplay) { e.preventDefault(); saveReplay(); }
  if (!time.pausable) return;
  if (e.code === 'F9') { e.preventDefault(); time.paused = !time.paused; }
  if (e.code === 'F10') { e.preventDefault(); time.paused = true; time.stepOnce = true; }
  if (e.code === 'Backquote') { e.preventDefault(); time.speedIndex = (time.speedIndex + 1) % SPEEDS.length; }
});

const loop = startLoop({
  step: stepFn,
  speed: () => (time.pausable ? SPEEDS[time.speedIndex] : 1),
  render: () => {
    drawFn();
    const t = timeText();
    if (t) caption([t], '#c9a2ff', 120);
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#5d556b';
    ctx.fillText(`${loop.stats.fps} fps · ${loop.stats.sps} steps/s · step ${loop.stats.stepMs.toFixed(3)} ms`, 160, H - 34);
    if (help) {
      ctx.fillStyle = '#a99fb8';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(help, W / 2, H - 14);
    }
  },
});

addEventListener('keydown', (e) => {
  if (e.code === 'F1' || (e.code === 'Escape' && panel && !panel.training)) {
    e.preventDefault();
    if (panel) { if (!panel.training) panel.close(); return; }
    panel = openControlsPanel(ui, devices, () => { panel = null; });
  }
});
