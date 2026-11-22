// Entry point. Phase 1: the Input Lab. Both players' inputs run through the real 60 Hz core;
// the screen shows the input history and every special motion the reader recognises.

import inputRules from '../data/system/input.json';
import { createGame, step } from './core/game.js';
import { BTN, BUTTONS, dirOf, frameAt, pressedAt, motionsAt } from './core/input.js';
import { startLoop } from './ui/loop.js';
import { createDevices } from './ui/devices.js';
import { openControlsPanel } from './ui/controls-panel.js';
import { drawHistory, ARROWS } from './ui/input-history.js';

const W = 960;
const H = 540;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const ui = document.getElementById('ui');

function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
  canvas.style.marginTop = `${Math.floor((innerHeight - H * s) / 2)}px`;
}
addEventListener('resize', fit);
fit();

const devices = createDevices();
const game = createGame(inputRules);
const FACING = [1, -1]; // until there are fighters: P1 faces right, P2 faces left
const reads = [[], []]; // newest recognised specials per player (display only)
let leniency = inputRules.leniency;
let panel = null;

function simStep() {
  const raw = panel ? [0, 0] : [devices.read(0), devices.read(1)];
  step(game, raw, inputRules);
  for (let i = 0; i < 2; i++) {
    const inp = game.players[i].input;
    for (const b of BUTTONS) {
      if (!pressedAt(inp, BTN[b], 0)) continue;
      const found = motionsAt(inp, inputRules, FACING[i], 0, { leniency });
      const label = found.length ? `${found[0]}${b}` : `5${b}`;
      reads[i].unshift({ label, also: found.slice(1), frame: game.frame });
      reads[i].length = Math.min(reads[i].length, 8);
    }
  }
}

function render() {
  ctx.fillStyle = '#100e15';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e8e2d4';
  ctx.font = '600 22px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Input Lab', W / 2, 36);
  ctx.font = '14px system-ui';
  ctx.fillStyle = '#a99fb8';
  ctx.fillText(`F1 controls  ·  F2 leniency: ${leniency ? 'on' : 'off'}  ·  P1 faces right, P2 faces left`, W / 2, 58);

  for (let i = 0; i < 2; i++) {
    const inp = game.players[i].input;
    const left = i === 0;
    const colX = left ? 40 : W - 40;
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillStyle = '#e8e2d4';
    ctx.font = '600 16px system-ui';
    ctx.fillText(`Player ${i + 1}`, colX, 96);
    drawHistory(ctx, inp, colX, 124, { align: left ? 'left' : 'right' });

    // Current stick + buttons, big.
    const cx = left ? 330 : W - 330;
    const f = frameAt(inp, 0);
    ctx.textAlign = 'center';
    ctx.font = '64px system-ui';
    ctx.fillStyle = '#e8e2d4';
    ctx.fillText(ARROWS[dirOf(f)], cx, 170);
    ctx.font = '600 20px system-ui';
    BUTTONS.forEach((b, k) => {
      const on = (f >> 4) & (1 << k);
      const bx = cx - 66 + k * 44;
      ctx.fillStyle = on ? '#ffd36b' : '#2a2535';
      ctx.beginPath();
      ctx.arc(bx, 220, 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = on ? '#100e15' : '#7d7390';
      ctx.fillText(b, bx, 227);
    });

    // Recognised specials.
    ctx.font = '600 15px system-ui';
    ctx.fillStyle = '#a99fb8';
    ctx.fillText('Read as', cx, 280);
    reads[i].forEach((r, k) => {
      const age = game.frame - r.frame;
      ctx.globalAlpha = Math.max(0.25, 1 - k * 0.12);
      ctx.font = k === 0 ? '700 30px system-ui' : '600 18px system-ui';
      ctx.fillStyle = r.label.startsWith('5') ? '#e8e2d4' : '#c9a2ff';
      const y = k === 0 ? 318 : 318 + 10 + k * 24;
      ctx.fillText(r.label + (k === 0 && r.also.length ? `  (also ${r.also.join(', ')})` : ''), cx, y);
      if (k === 0 && age < 20) {
        ctx.fillStyle = `rgba(201,162,255,${(20 - age) / 40})`;
        ctx.fillRect(cx - 110, 292, 220, 36);
      }
      ctx.globalAlpha = 1;
    });
  }

  ctx.textAlign = 'left';
  ctx.font = '12px ui-monospace, monospace';
  ctx.fillStyle = '#5d556b';
  ctx.fillText(`frame ${game.frame}  ·  ${loop.stats.fps} fps  ·  ${loop.stats.sps} steps/s  ·  step ${loop.stats.stepMs.toFixed(3)} ms`, 12, H - 12);
}

const loop = startLoop({ step: simStep, render });

addEventListener('keydown', (e) => {
  if (e.code === 'F1' || (e.code === 'Escape' && panel)) {
    e.preventDefault();
    if (panel) panel.close();
    else panel = openControlsPanel(ui, devices, () => { panel = null; });
  }
  if (e.code === 'F2') { e.preventDefault(); leniency = !leniency; }
});
