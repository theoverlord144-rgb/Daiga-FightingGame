// Input history display (training-mode style): the newest inputs at the top, each with how many frames
// it was held. Reads the core's input buffer; never changes it.

import { dirOf, buttonsOf, frameAt, BUTTONS, motionsAt } from '../core/input.js';

export const ARROWS = ['', '↙', '↓', '↘', '←', '•', '→', '↖', '↑', '↗'];

/** Collapse the buffer into runs: [{ dir, buttons, frames, age }], newest first. age = how long ago the run began. */
export function historyRuns(inp, maxRuns = 18) {
  const runs = [];
  let cur = null;
  for (let age = 0; age < inp.count && runs.length <= maxRuns; age++) {
    const f = frameAt(inp, age);
    if (cur && cur.frame === f && cur.frames < 99) { cur.frames++; cur.age = age; continue; }
    cur = { frame: f, dir: dirOf(f), buttons: buttonsOf(f), frames: 1, age };
    runs.push(cur);
  }
  return runs.slice(0, maxRuns);
}

/**
 * Motion notation: for each run that starts a new button press, the motion that press completed (e.g. "236"),
 * read with the same rules the game uses. (Uses the player's current facing.)
 */
export function motionLabels(inp, runs, rules, facing) {
  return runs.map((r, k) => {
    const older = runs[k + 1];
    const fresh = r.buttons & ~(older ? older.buttons : 0);
    if (!fresh) return '';
    const m = motionsAt(inp, rules, facing, r.age).filter((name) => !/^(66|44|28)$/.test(name));
    return m.length ? m[0] : '';
  });
}

export const buttonText = (bits) => BUTTONS.filter((_, i) => bits & (1 << i)).join('');

/** Draw one player's history column at (x, y). */
export function drawHistory(ctx, inp, x, y, { align = 'left', rows = 18, rules = null, facing = 1 } = {}) {
  ctx.save();
  ctx.font = '15px ui-monospace, Consolas, monospace';
  ctx.textAlign = align;
  const runs = historyRuns(inp, rows);
  const labels = rules ? motionLabels(inp, runs, rules, facing) : [];
  runs.forEach((r, k) => {
    const yy = y + k * 19;
    ctx.globalAlpha = 1 - k / (rows + 4);
    ctx.fillStyle = '#7d7390';
    const n = String(r.frames).padStart(2, ' ');
    const motion = labels[k] ? ` ${labels[k]}${buttonText(r.buttons)}` : '';
    const text = `${n}  ${ARROWS[r.dir]} ${buttonText(r.buttons)}`;
    ctx.fillStyle = r.buttons ? '#ffd36b' : '#e8e2d4';
    ctx.fillText(text, x, yy);
    if (motion) {
      // The motion the press completed, in purple, beside the row (outside edge on either side).
      const w = ctx.measureText(text).width + 4;
      ctx.fillStyle = '#c9a2ff';
      ctx.fillText(motion.trim(), align === 'right' ? x - w : x + w, yy);
    }
  });
  ctx.restore();
}
