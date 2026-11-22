// Entry point. ?mode=lab opens the Input Lab; otherwise Training mode (two fighters; Player 2 is the training dummy,
// and a second controller still plays Player 2 on top of it).
import { setupCanvas, loadCharacters, makeWorld, INPUT_RULES, W, H } from './ui/boot.js';
import { step } from './core/game.js';
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

const { ctx, ui } = setupCanvas();
const devices = createDevices();
const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'sandbox';
let panel = null;
const opts = { boxes: params.has('boxes'), labels: true, history: true, meter: true };

let stepFn;
let drawFn;

if (mode === 'lab') {
  const lab = createInputLab(ctx, W, H, INPUT_RULES);
  stepFn = () => lab.step(panel ? [0, 0] : [devices.read(0), devices.read(1)]);
  drawFn = () => lab.draw();
  addEventListener('keydown', (e) => {
    if (e.code === 'F2') { e.preventDefault(); lab.toggleLeniency(); }
  });
} else if (mode === 'netplay' || mode === 'synctest') {
  const chars = loadCharacters();
  const world = makeWorld(chars[params.get('p1') || 'avner'], chars[params.get('p2') || 'avner']);
  const renderer = createFightRenderer(ctx, W, H);
  const caption = (lines, color = '#e8e2d4') => {
    ctx.textAlign = 'center';
    ctx.font = '600 14px system-ui';
    lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? color : '#a99fb8'; ctx.fillText(l, W / 2, 150 + i * 20); });
  };
  if (mode === 'netplay') {
    const side = params.get('side') === '2' ? 2 : 1;
    const net = createNetplay(world, { side, lag: Number(params.get('lag') || 0), delay: Number(params.get('delay') || 2) });
    stepFn = () => net.step(panel ? 0 : devices.read(0));
    drawFn = () => {
      const s = net.session;
      renderer.draw(s.game, world, opts);
      if (!net.started) {
        caption([`Netplay: you are Player ${side}. Waiting for the other tab...`,
          `Open this page again with side=${side === 1 ? 2 : 1} in another tab.`]);
        return;
      }
      const st = s.stats;
      const lines = [
        st.desync !== null ? `DESYNC at frame ${st.desync}` : `Player ${side} · ping ${net.ping ?? '…'} ms · fake lag ${net.lag}f each way`,
        `rollbacks ${st.rollbacks} · longest ${st.maxRollback}f · waits ${st.stalls + st.waits}`,
      ];
      caption(lines, st.desync !== null ? '#ff6b6b' : '#e8e2d4');
    };
  } else {
    const live = createLiveSyncTest(world, 8);
    stepFn = () => live.step(panel ? [0, 0] : [devices.read(0), devices.read(1)]);
    drawFn = () => {
      renderer.draw(live.game, world, opts);
      const st = live.status;
      caption(st.failFrame === null
        ? [`SYNC TEST OK · ${st.checks} frames rewound 8 and replayed, all identical`]
        : [`SYNC TEST FAILED at frame ${st.failFrame}`, 'Something in the game is not deterministic or not saved in the state.'],
      st.failFrame === null ? '#5fd38a' : '#ff6b6b');
    };
  }
} else {
  const chars = loadCharacters();
  const world = makeWorld(chars[params.get('p1') || 'avner'], chars[params.get('p2') || 'avner']);
  const training = createTraining(world, loadTrainingSettings());
  const meter = createFrameMeter();
  let game = training.newGame();
  const renderer = createFightRenderer(ctx, W, H);
  stepFn = () => {
    const dev = panel ? [0, 0] : [devices.read(0), devices.read(1)];
    step(game, training.inputs(game, dev), world);
    training.afterStep(game);
    meter.update(game, world);
  };
  drawFn = () => {
    renderer.draw(game, world, opts);
    if (opts.meter) drawTrainingOverlay(ctx, W, H, meter, training);
    if (opts.history) {
      ctx.fillStyle = '#0009';
      ctx.fillRect(0, 0, 112, 350);
      ctx.fillRect(W - 112, 0, 112, 350);
      drawHistory(ctx, game.players[0].input, 12, 22, { rows: 17 });
      drawHistory(ctx, game.players[1].input, W - 12, 22, { align: 'right', rows: 17 });
    }
    ctx.fillStyle = '#a99fb8';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('F1 controls · F2 training menu · F3 boxes · F4 labels · F5 input history · F6 record · F7 playback · F8 frame meter · R reset · ?mode=lab Input Lab', W / 2, H - 14);
  };
  addEventListener('keydown', (e) => {
    if (panel) return;
    if (e.code === 'F3') { e.preventDefault(); opts.boxes = !opts.boxes; }
    if (e.code === 'F4') { e.preventDefault(); opts.labels = !opts.labels; }
    if (e.code === 'F5') { e.preventDefault(); opts.history = !opts.history; }
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

const loop = startLoop({
  step: stepFn,
  render: () => {
    drawFn();
    ctx.textAlign = 'left';
    ctx.font = '11px ui-monospace, monospace';
    ctx.fillStyle = '#5d556b';
    ctx.fillText(`${loop.stats.fps} fps · ${loop.stats.sps} steps/s · step ${loop.stats.stepMs.toFixed(3)} ms`, 122, H - 34);
  },
});

addEventListener('keydown', (e) => {
  if (e.code === 'F1' || (e.code === 'Escape' && panel && !panel.training)) {
    e.preventDefault();
    if (panel) { if (!panel.training) panel.close(); return; }
    else panel = openControlsPanel(ui, devices, () => { panel = null; });
  }
});
