// Training overlay: draws the frame bar, the last move's frame data, the advantage and the recording state.
// Reads the meter and the training controller; changes nothing.

export const BAR_COLORS = {
  startup: '#3fb27f',
  active: '#e5484d',
  recovery: '#3b82f6',
  stun: '#e0c040',
  busy: '#8a7f9c',
  free: '#2a2533',
};

const sign = (n) => (n > 0 ? `+${n}` : `${n}`);

/** The universal systems readouts: one column per player, under the frame bar at the sides. */
function drawSystemsReadout(ctx, W, readout, game) {
  ctx.font = '600 12px system-ui';
  for (const i of [0, 1]) {
    const lines = readout.lines(i, game);
    if (!lines.length) continue;
    const left = i === 0;
    const x = left ? 12 : W - 12;
    const y0 = 262;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
    ctx.fillStyle = '#0b091090';
    ctx.fillRect(left ? x - 6 : x - w + 6, y0 - 15, w, lines.length * 16 + 8);
    ctx.textAlign = left ? 'left' : 'right';
    lines.forEach((l, n) => {
      ctx.fillStyle = /PERFECT|COUNTER|WITNESS/.test(l) ? '#ffe9a8' : l.startsWith('Debt') ? '#ff6b7f' : '#e8e2d4';
      ctx.fillText(l, x, y0 + n * 16);
    });
  }
}

export function drawTrainingOverlay(ctx, W, H, meter, training, readout = null, game = null) {
  if (readout) drawSystemsReadout(ctx, W, readout, game);
  const cells = 80;
  const cw = Math.floor((W - 260) / cells);
  const x0 = Math.round((W - cw * cells) / 2);
  const y0 = 158; // between the combo counter and the fighters' heads

  // Frame bar: one row per player, newest frame on the right edge of what has been recorded.
  ctx.fillStyle = '#0b091090';
  ctx.fillRect(x0 - 50, y0 - 30, cw * cells + 60, 102);
  ctx.font = '600 12px system-ui';
  ctx.textAlign = 'right';
  for (const i of [0, 1]) {
    const y = y0 + i * 15;
    ctx.fillStyle = '#a99fb8';
    ctx.fillText(`P${i + 1}`, x0 - 10, y + 10);
    const bar = meter.bars[i];
    for (let c = 0; c < cells; c++) {
      const cell = bar[c];
      ctx.fillStyle = cell ? BAR_COLORS[cell.kind] : '#1a1722';
      ctx.fillRect(x0 + c * cw, y, cw - 1, 12);
      if (cell?.inv) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x0 + c * cw, y, cw - 1, 3);
      }
    }
  }

  // Frame data of each player's last move, and the advantage.
  ctx.textAlign = 'left';
  ctx.font = '600 13px system-ui';
  const line = (i) => {
    const r = meter.last[i];
    if (!r) return '';
    if (r.startup === null) return `${r.move}  ·  ${r.total}f, no hitbox`;
    return `${r.move}  ·  startup ${r.startup}  ·  active ${r.active}  ·  recovery ${r.recovery}${r.cancelled ? ' (cancelled)' : ''}`;
  };
  ctx.fillStyle = '#e8e2d4';
  ctx.fillText(line(0), x0, y0 + 46);
  ctx.textAlign = 'right';
  ctx.fillText(line(1), x0 + cw * cells, y0 + 46);

  const a = meter.advantage;
  if (a?.done) {
    ctx.textAlign = 'center';
    ctx.font = '800 16px system-ui';
    if (a.value === null) {
      ctx.fillStyle = '#a99fb8';
      ctx.fillText(`${a.move} cancelled`, W / 2, y0 - 10);
    } else {
      ctx.fillStyle = a.value > 0 ? '#5fd38a' : a.value < 0 ? '#ff6b6b' : '#e8e2d4';
      ctx.fillText(`P${a.attacker + 1} ${a.move} on ${a.kind}  ${sign(a.value)}`, W / 2, y0 - 10);
    }
  }

  // Recording badge.
  if (training.mode !== 'dummy') {
    const rec = training.mode === 'record';
    ctx.textAlign = 'center';
    ctx.font = '800 16px system-ui';
    ctx.fillStyle = rec ? '#ff5a5a' : '#5fd38a';
    const secs = (training.recording.length / 60).toFixed(1);
    ctx.fillText(rec ? `● RECORDING DUMMY  ${secs}s  (F6 to stop)` : `▶ PLAYBACK  ${secs}s loop  (F7 to stop)`, W / 2, y0 + 86);
  }

  // Legend.
  ctx.font = '11px system-ui';
  ctx.textAlign = 'left';
  let lx = x0;
  for (const [k, col] of Object.entries(BAR_COLORS)) {
    ctx.fillStyle = col;
    ctx.fillRect(lx, y0 + 56, 9, 9);
    ctx.fillStyle = '#a99fb8';
    ctx.fillText(k, lx + 13, y0 + 64);
    lx += 24 + ctx.measureText(k).width;
  }
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(lx, y0 + 56, 9, 3);
  ctx.fillStyle = '#a99fb8';
  ctx.fillText('invincible', lx + 13, y0 + 64);
}
