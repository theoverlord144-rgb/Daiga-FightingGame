// Input history display (training-mode style): the newest inputs at the top, each with how many frames
// it was held. Reads the core's input buffer; never changes it.

import { dirOf, buttonsOf, frameAt, BUTTONS } from '../core/input.js';

export const ARROWS = ['', '↙', '↓', '↘', '←', '•', '→', '↖', '↑', '↗'];

/** Collapse the buffer into runs: [{ dir, buttons, frames }], newest first. */
export function historyRuns(inp, maxRuns = 18) {
  const runs = [];
  let cur = null;
  for (let age = 0; age < inp.count && runs.length <= maxRuns; age++) {
    const f = frameAt(inp, age);
    if (cur && cur.frame === f && cur.frames < 99) { cur.frames++; continue; }
    cur = { frame: f, dir: dirOf(f), buttons: buttonsOf(f), frames: 1 };
    runs.push(cur);
  }
  return runs.slice(0, maxRuns);
}

export const buttonText = (bits) => BUTTONS.filter((_, i) => bits & (1 << i)).join('');

/** Draw one player's history column at (x, y). */
export function drawHistory(ctx, inp, x, y, { align = 'left', rows = 18 } = {}) {
  ctx.save();
  ctx.font = '15px ui-monospace, Consolas, monospace';
  ctx.textAlign = align;
  const runs = historyRuns(inp, rows);
  runs.forEach((r, k) => {
    const yy = y + k * 19;
    ctx.globalAlpha = 1 - k / (rows + 4);
    ctx.fillStyle = '#7d7390';
    const n = String(r.frames).padStart(2, ' ');
    const text = `${n}  ${ARROWS[r.dir]} ${buttonText(r.buttons)}`;
    ctx.fillStyle = r.buttons ? '#ffd36b' : '#e8e2d4';
    ctx.fillText(text, x, yy);
  });
  ctx.restore();
}
