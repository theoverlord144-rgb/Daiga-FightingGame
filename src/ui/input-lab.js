// The Input Lab (?mode=lab): both players' input history and what the motion reader recognises.
import { createInputState, pushInput, BTN, BUTTONS, dirOf, frameAt, pressedAt, motionsAt } from '../core/input.js';
import { drawHistory, ARROWS } from './input-history.js';

export function createInputLab(ctx, W, H, rules) {
  const inputs = [createInputState(rules.bufferFrames), createInputState(rules.bufferFrames)];
  const FACING = [1, -1];
  const reads = [[], []];
  let leniency = rules.leniency;

  return {
    toggleLeniency() { leniency = !leniency; },
    step(raw) {
      for (let i = 0; i < 2; i++) {
        const inp = inputs[i];
        pushInput(inp, raw[i], rules);
        for (const b of BUTTONS) {
          if (!pressedAt(inp, BTN[b], 0)) continue;
          const found = motionsAt(inp, rules, FACING[i], 0, { leniency });
          reads[i].unshift({ label: found.length ? `${found[0]}${b}` : `5${b}`, also: found.slice(1) });
          reads[i].length = Math.min(reads[i].length, 8);
        }
      }
    },
    draw() {
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
        const inp = inputs[i];
        const left = i === 0;
        const colX = left ? 40 : W - 40;
        ctx.textAlign = left ? 'left' : 'right';
        ctx.fillStyle = '#e8e2d4';
        ctx.font = '600 16px system-ui';
        ctx.fillText(`Player ${i + 1}`, colX, 96);
        drawHistory(ctx, inp, colX, 124, { align: left ? 'left' : 'right' });
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
        ctx.font = '600 15px system-ui';
        ctx.fillStyle = '#a99fb8';
        ctx.fillText('Read as', cx, 280);
        reads[i].forEach((r, k) => {
          ctx.globalAlpha = Math.max(0.25, 1 - k * 0.12);
          ctx.font = k === 0 ? '700 30px system-ui' : '600 18px system-ui';
          ctx.fillStyle = r.label.startsWith('5') ? '#e8e2d4' : '#c9a2ff';
          const y = k === 0 ? 318 : 318 + 10 + k * 24;
          ctx.fillText(r.label + (k === 0 && r.also.length ? `  (also ${r.also.join(', ')})` : ''), cx, y);
          ctx.globalAlpha = 1;
        });
      }
    },
  };
}
