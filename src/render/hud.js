// The fight HUD: health bars (with a red trail showing the damage just taken), names, the timer, round markers,
// burst gauge, super meter, the character mechanic, and the round banners (ROUND 1, FIGHT, K.O., TIME, WINS).
// It only reads the game; the only thing it remembers is presentation (how far the red trail has drained).
import FX from '../../data/system/effects.json';

const FONT = 'system-ui, sans-serif';

/** image(name): a loaded picture from data/effects/, or null while it loads. */
export function createHud(ctx, W, image = () => null) {
  const trail = [null, null]; // the red damage trail, per player (visual only)
  const BAR_W = 360;
  const BAR_Y = 22;
  const BAR_H = 18;

  function healthBar(p, def, game) {
    const left = p.id === 0;
    const max = def.stats.health;
    const x = left ? W / 2 - 44 - BAR_W : W / 2 + 44;
    // Trail: holds while the player is being comboed, then drains toward the real health.
    if (trail[p.id] === null || trail[p.id] < p.health) trail[p.id] = p.health;
    else if (!p.combo) trail[p.id] = Math.max(p.health, trail[p.id] - Math.ceil(max / 220));
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(x - 3, BAR_Y - 3, BAR_W + 6, BAR_H + 6);
    ctx.fillStyle = '#2a2535';
    ctx.fillRect(x, BAR_Y, BAR_W, BAR_H);
    const fill = (v) => Math.round((BAR_W * v) / max);
    const tw = fill(trail[p.id]);
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(left ? x + BAR_W - tw : x, BAR_Y, tw, BAR_H);
    const hw = fill(p.health);
    const g = ctx.createLinearGradient(0, BAR_Y, 0, BAR_Y + BAR_H);
    const low = p.health * 4 < max;
    g.addColorStop(0, low ? '#ff8a5c' : '#ffe39a');
    g.addColorStop(1, low ? '#e0482c' : '#e0a93a');
    ctx.fillStyle = g;
    ctx.fillRect(left ? x + BAR_W - hw : x, BAR_Y, hw, BAR_H);
    // Name.
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = '#f2ecdf';
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(def.name.toUpperCase(), left ? x : x + BAR_W, BAR_Y + BAR_H + 18);
    return x;
  }

  function roundPips(game, world, p, x) {
    const m = game.match;
    if (!m) return;
    const left = p.id === 0;
    const n = world.match.roundsToWin;
    for (let i = 0; i < n; i++) {
      const cx = left ? x + BAR_W - 8 - i * 18 : x + 8 + i * 18;
      const cy = BAR_Y + BAR_H + 13;
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = i < m.wins[p.id] ? '#ffd36b' : '#2a2535';
      ctx.fill();
      ctx.strokeStyle = '#0b0910';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  function timer(game) {
    const m = game.match;
    ctx.fillStyle = '#0b0910';
    ctx.fillRect(W / 2 - 36, 12, 72, 46);
    ctx.textAlign = 'center';
    ctx.font = `800 34px ${FONT}`;
    const t = m && m.timer > 0 ? Math.ceil(m.timer / 60) : m && m.timer === 0 && m.phase !== 'fight' ? 0 : null;
    ctx.fillStyle = t !== null && t <= 10 ? '#ff6b4a' : '#f2ecdf';
    ctx.fillText(t === null ? '∞' : String(t).padStart(2, '0'), W / 2, 48);
  }

  /** The super meter, drawn as the Devotion meter (layout in data/system/effects.json "devotion"). Returns its top y. */
  function devotion(p, def, world, H, frame) {
    const D = FX.devotion;
    const left = p.id === 0;
    const s = D.scale;
    const bar = world.meter?.barSize ?? 10000;
    const x0 = left ? D.margin : W - D.margin;
    const y0 = H - D.bottom - D.frame.h * s;
    const slots = D.windows.slice(0, Math.max(1, Math.min(D.windows.length, Math.round(def.meterMax / bar))));
    const share = slots.map((_, i) => Math.max(0, Math.min(1, (p.meter - i * bar) / bar)));
    ctx.save();
    ctx.translate(x0, y0);
    ctx.scale(left ? s : -s, s); // from here on: the frame image's own pixels, mirrored for Player 2
    const frameImg = image(D.frame.image);
    if (frameImg) ctx.drawImage(frameImg, 0, 0, D.frame.w, D.frame.h);
    else { ctx.fillStyle = '#0b0910cc'; ctx.fillRect(0, D.windows[0][1] - 8, D.frame.w, D.windows[0][3] + 16); }
    slots.forEach(([x, y, w, h], i) => {
      const f = share[i];
      if (f <= 0) return;
      const img = image(f >= 1 ? D.fillFull : D.fill);
      ctx.save();
      ctx.beginPath();
      if (i === D.windows.length - 1 && D.tip) { // the pointed end
        ctx.moveTo(x, y); ctx.lineTo(D.tip[0], y); ctx.lineTo(D.tip[1], y + h / 2); ctx.lineTo(D.tip[0], y + h); ctx.lineTo(x, y + h);
        ctx.closePath();
        ctx.clip();
        ctx.beginPath();
      }
      ctx.rect(x, y, w * f, h);
      ctx.clip();
      if (img) ctx.drawImage(img, x, y, w, h);
      else { ctx.fillStyle = f >= 1 ? '#b8ffd0' : '#19d05a'; ctx.fillRect(x, y, w, h); }
      ctx.restore();
    });
    // The glow, as light over the bars, breathing slowly.
    const pulse = D.pulse.min + (1 - D.pulse.min) * (0.5 + 0.5 * Math.sin((frame / D.pulse.period) * Math.PI * 2));
    const [gx, gy, gw, gh] = D.glowBox;
    slots.forEach(([x, y, w, h], i) => {
      const f = share[i];
      const img = f > 0 ? image(f >= 1 ? D.glowFull : D.glow) : null;
      if (!img) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + gx * w, y + gy * h, (f >= 1 ? gw : f - gx) * w, gh * h);
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pulse;
      ctx.drawImage(img, x + gx * w, y + gy * h, gw * w, gh * h);
      ctx.restore();
    });
    ctx.restore();
    // Not mirrored: the bar count in the ring, and the name plate under the frame.
    const bars = Math.min(4, Math.floor(p.meter / bar));
    const cx = left ? x0 + D.ring[0] * s : x0 - D.ring[0] * s;
    const cy = y0 + D.ring[1] * s;
    const digits = image(D.digits.image);
    const dh = D.digits.height * s;
    const dw = (dh * D.digits.cellW) / D.digits.cellH;
    if (digits) ctx.drawImage(digits, bars * D.digits.cellW, 0, D.digits.cellW, D.digits.cellH, cx - dw / 2, cy - dh / 2, dw, dh);
    else { ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#19d05a'; ctx.fillText(String(bars), cx, cy + 8); }
    const plate = image(D.plate.image);
    if (plate) {
      const pw = D.plate.w * D.plate.scale, ph = D.plate.h * D.plate.scale;
      const mid = left ? x0 + (D.frame.w * s) / 2 : x0 - (D.frame.w * s) / 2;
      ctx.drawImage(plate, mid - pw / 2, y0 + D.frame.h * s + D.plate.gap, pw, ph);
    }
    return y0;
  }

  /** Burst gauge (thin bar under the health bar), super meter (bottom corners), the mechanic. */
  function resources(p, def, world, H, game) {
    const left = p.id === 0;
    const B = world.burst;
    if (B && B.enabled) {
      const bwMax = 150;
      const bx = left ? W / 2 - 44 - bwMax : W / 2 + 44;
      const by = BAR_Y + BAR_H + 26;
      const full = p.burst >= B.gaugeMax;
      const bw = Math.round((bwMax * p.burst) / B.gaugeMax);
      ctx.fillStyle = '#1c1826';
      ctx.fillRect(bx, by, bwMax, 5);
      ctx.fillStyle = full ? '#7fe0ff' : '#3f6f80';
      ctx.fillRect(left ? bx + bwMax - bw : bx, by, bw, 5);
      if (full) {
        ctx.font = `700 10px ${FONT}`;
        ctx.textAlign = left ? 'right' : 'left';
        ctx.fillText('BURST', left ? bx - 5 : bx + bwMax + 5, by + 6);
      }
    }
    const top = devotion(p, def, world, H, game.frame);
    // The mechanic: its gauge as a percentage, its counters as pips.
    const mech = def.mechanic;
    let line = '';
    if (mech?.gauge) line += `${mech.gauge.label ?? mech.name} ${Math.floor((100 * p.gauge) / mech.gauge.max)}%  `;
    for (const [k, v] of Object.entries(mech?.vars || {})) {
      if (!v.show) continue;
      const n = p.vars[k];
      if (v.display === 'timer') line += n > 0 ? `${v.label} ${(n / 60).toFixed(1)}s  ` : '';
      else line += v.max <= 6 ? `${v.label} ${'●'.repeat(n)}${'○'.repeat(Math.max(0, v.max - n))}  ` : `${v.label} ${n}  `;
    }
    if (line) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = '#c9a2ff';
      ctx.textAlign = left ? 'left' : 'right';
      ctx.fillText(line.trim(), left ? FX.devotion.margin + 4 : W - FX.devotion.margin - 4, top - 6);
    }
  }

  function banner(text, sub, t, color = '#ffe9a8') {
    // t: frames since it appeared (a quick scale-in).
    const s = Math.min(1, t / 8);
    ctx.save();
    ctx.translate(W / 2, 215);
    ctx.scale(0.7 + 0.3 * s, 0.7 + 0.3 * s);
    ctx.globalAlpha = s;
    ctx.fillStyle = '#0b0910aa';
    ctx.fillRect(-W / 2, -52, W, sub ? 96 : 78);
    ctx.textAlign = 'center';
    ctx.font = `900 58px ${FONT}`;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#0b0910';
    ctx.strokeText(text, 0, 10);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 10);
    if (sub) {
      ctx.font = `700 18px ${FONT}`;
      ctx.fillStyle = '#f2ecdf';
      ctx.fillText(sub, 0, 36);
    }
    ctx.restore();
  }

  function banners(game, world) {
    const m = game.match;
    if (!m) return;
    const rules = world.match;
    const name = (i) => world.chars[i].name.toUpperCase();
    if (m.phase === 'intro') {
      const final = m.wins[0] === rules.roundsToWin - 1 && m.wins[1] === rules.roundsToWin - 1;
      const split = Math.floor(rules.introFrames * 0.6);
      if (m.phaseTime < split) banner(final ? 'FINAL ROUND' : `ROUND ${m.round}`, null, m.phaseTime);
      else banner('FIGHT!', null, m.phaseTime - split, '#ff9a4a');
    } else if (m.phase === 'ko' || m.phase === 'timeup' || m.phase === 'end') {
      const t = m.phase === 'end' ? 999 : m.phaseTime;
      if (m.phase !== 'end' && t < 60) {
        const text = m.phase === 'timeup' ? 'TIME' : m.ko[0] && m.ko[1] ? 'DOUBLE K.O.' : 'K.O.';
        banner(text, null, t, '#ff6b4a');
      } else {
        const w = m.phase === 'end' ? m.winner : m.roundWinner;
        const text = w === 2 ? 'DRAW' : `${name(w)} WINS`;
        banner(text, m.phase === 'end' ? (w === 2 ? 'the match is a draw' : `Player ${w + 1} takes the match`) : null, t - 60);
      }
    }
  }

  return {
    draw(game, world, H) {
      for (const p of game.players) {
        const def = world.chars[p.id];
        const x = healthBar(p, def, game);
        roundPips(game, world, p, x);
        resources(p, def, world, H, game);
      }
      timer(game);
      banners(game, world);
    },
    reset() { trail[0] = trail[1] = null; },
  };
}
