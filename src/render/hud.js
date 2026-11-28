// The fight HUD: health bars (with a red trail showing the damage just taken), names, the timer, round markers,
// Debt, the Absolve icon, the Devotion meter, the Rite gauge, the character mechanic, the pop-up words (PERFECT,
// COUNTER, WITNESS) and the round banners (ROUND 1, FIGHT, K.O., TIME, WINS).
// It only reads the game; the only things it remembers are presentation (how far the red trail has drained, and
// the pop-up words still on screen).
import FX from '../../data/system/effects.json';
import CAMERA from '../../data/system/camera.json';
import { markLive } from './mark-live.js';
import { lobAges } from '../core/lob.js';

const FONT = 'system-ui, sans-serif';

/** image(name): a loaded picture from data/effects/, or null while it loads. */
export function createHud(ctx, W, image = () => null) {
  const trail = [null, null]; // the red damage trail, per player (visual only)
  const popups = []; // { p, text, color, frame }: words shown for a moment (visual only)
  const POPUP_LIFE = 50;
  const POPUP = { perfect: ['PERFECT', '#ffffff'], counter: ['COUNTER', '#ff9a4a'], witness: ['WITNESS', '#c9a2ff'] };
  // The bar's place and size. With a drawn frame (effects.json `health`) they come from the frame's window: the bar
  // fills that window, clipped to its six corners, and the frame is drawn over it.
  const HB = FX.health ?? null;
  const HBX = HB ? HB.window.map((c) => c[0]) : null, HBY = HB ? HB.window.map((c) => c[1]) : null;
  const HB0 = HB ? [Math.min(...HBX), Math.min(...HBY)] : null; // the window's left and top, in the frame's pixels
  const BAR_W = HB ? Math.round((Math.max(...HBX) - HB0[0]) * HB.scale) : 360;
  const BAR_H = HB ? Math.round((Math.max(...HBY) - HB0[1]) * HB.scale) : 18;
  const BAR_Y = HB ? HB.top + Math.round(HB0[1] * HB.scale) : 22;
  const BAR_GAP = HB ? HB.gap : 44;
  const UNDER = HB ? HB.below - 5 : 13; // from the bar's lower edge to the row of round markers; the name is 5 lower

  function healthBar(p, def, game) {
    const left = p.id === 0;
    const max = def.stats.health;
    const x = left ? W / 2 - BAR_GAP - BAR_W : W / 2 + BAR_GAP;
    // Trail: holds while the player is being comboed, then drains toward the real health.
    if (trail[p.id] === null || trail[p.id] < p.health) trail[p.id] = p.health;
    else if (!p.combo) trail[p.id] = Math.max(p.health, trail[p.id] - Math.ceil(max / 220));
    ctx.save();
    if (HB) {
      ctx.beginPath();
      HB.window.forEach(([vx, vy], i) => ctx[i ? 'lineTo' : 'moveTo'](x + (vx - HB0[0]) * HB.scale, BAR_Y + (vy - HB0[1]) * HB.scale));
      ctx.closePath();
      ctx.clip();
      ctx.beginPath();
    } else {
      ctx.fillStyle = '#0b0910';
      ctx.fillRect(x - 3, BAR_Y - 3, BAR_W + 6, BAR_H + 6);
    }
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
    // Debt (Vow): the part of the health that is owed, in red at the draining end of the bar.
    if (p.debt > 0) {
      const dw = Math.min(hw, Math.max(2, fill(Math.min(p.debt, p.health))));
      const dx = left ? x + BAR_W - hw : x + hw - dw;
      ctx.fillStyle = '#ff2f4f';
      ctx.fillRect(dx, BAR_Y, dw, BAR_H);
      ctx.fillStyle = '#7a0f22';
      for (let sx = dx + 3; sx < dx + dw; sx += 6) ctx.fillRect(sx, BAR_Y, 2, BAR_H);
    }
    ctx.restore();
    const frame = HB ? image(HB.frame.image) : null;
    if (frame) ctx.drawImage(frame, x - HB0[0] * HB.scale, BAR_Y - HB0[1] * HB.scale, HB.frame.w * HB.scale, HB.frame.h * HB.scale);
    // Name.
    ctx.font = `700 15px ${FONT}`;
    ctx.fillStyle = '#f2ecdf';
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(def.name.toUpperCase(), left ? x : x + BAR_W, BAR_Y + BAR_H + UNDER + 5);
    flameIcons(p, def, left ? x + ctx.measureText(def.name.toUpperCase()).width + 14 : x + BAR_W - ctx.measureText(def.name.toUpperCase()).width - 14, BAR_Y + BAR_H + UNDER, left);
    return x;
  }

  /**
   * A mechanic var shown as `display: "flames"` (Avner's lantern flames): one small flame per point of its max, beside
   * the name under the health bar, lit or dark. Drawn in code (no art yet).
   */
  function flameIcons(p, def, x0, cy, left) {
    for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
      if (v.display !== 'flames' || !v.show) continue;
      const n = p.vars[k] | 0;
      for (let i = 0; i < v.max; i++) {
        const cx = left ? x0 + i * 16 : x0 - i * 16;
        const lit = i < n;
        ctx.save();
        ctx.beginPath(); // a drop: round below, a point above
        ctx.moveTo(cx, cy - 9);
        ctx.bezierCurveTo(cx + 6, cy - 2, cx + 6, cy + 5, cx, cy + 5);
        ctx.bezierCurveTo(cx - 6, cy + 5, cx - 6, cy - 2, cx, cy - 9);
        if (lit) {
          const g = ctx.createLinearGradient(0, cy - 9, 0, cy + 5);
          g.addColorStop(0, '#fff4c8');
          g.addColorStop(0.5, '#ffc24a');
          g.addColorStop(1, '#e0702a');
          ctx.fillStyle = g;
          ctx.shadowColor = '#ffb347';
          ctx.shadowBlur = 8;
        } else ctx.fillStyle = '#2a2535';
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = lit ? '#7a3a12' : '#4a4258';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function roundPips(game, world, p, x) {
    const m = game.match;
    if (!m) return;
    const left = p.id === 0;
    const n = world.match.roundsToWin;
    for (let i = 0; i < n; i++) {
      const cx = left ? x + BAR_W - 8 - i * 18 : x + 8 + i * 18;
      const cy = BAR_Y + BAR_H + UNDER;
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
    if (D.layout?.belowFloor) { // the strip under the fighters' feet: nothing of the meter rises over the floor line
      ctx.beginPath();
      ctx.rect(0, Math.round(H * CAMERA.groundLine) + 2, W, H);
      ctx.clip();
      ctx.beginPath();
    }
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
      ctx.globalAlpha = pulse * (D.layout?.glowAlpha ?? 1);
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

  /** The Rite gauge: one pip per charge, the next one filling, under the Devotion meter beside its name plate. */
  function riteGauge(p, def, H) {
    const g = def.rite?.gauge;
    if (!g) return;
    const D = FX.devotion;
    const left = p.id === 0;
    const mid = D.margin + (D.frame.w * D.scale) / 2;
    const start = mid + (D.plate.w * D.plate.scale) / 2 + 14; // distance from the screen edge to the first pip
    const y = H - D.bottom + D.plate.gap + (D.plate.h * D.plate.scale) / 2;
    const unlimited = !!g.unlimitedWhile && (p.vars[g.unlimitedWhile] | 0) > 0;
    for (let i = 0; i < g.charges; i++) {
      const cx = left ? start + i * 18 : W - start - i * 18;
      const full = unlimited || i < p.rite;
      ctx.beginPath();
      ctx.arc(cx, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = full ? (unlimited ? '#ffe9a8' : '#8fe3ff') : '#1c1826';
      ctx.fill();
      if (!full && i === p.rite) { // the charge that is refilling
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.arc(cx, y, 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p.riteTimer) / g.rechargeFrames);
        ctx.closePath();
        ctx.fillStyle = '#3f6f80';
        ctx.fill();
      }
      ctx.strokeStyle = '#0b0910';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.font = `700 10px ${FONT}`;
    ctx.fillStyle = '#8fe3ff';
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText('RITE', left ? start + g.charges * 18 : W - start - g.charges * 18, y + 4);
  }

  /** Mechanic vars shown as pips (`display: "pips"`, `per` = what one pip holds): bars beside the Devotion name plate,
   *  the one in progress part-filled. War'Teun's Resonance. */
  function varPips(p, def, H) {
    const D = FX.devotion;
    const left = p.id === 0;
    const mid = D.margin + (D.frame.w * D.scale) / 2;
    let start = mid + (D.plate.w * D.plate.scale) / 2 + 14 + (def.rite?.gauge ? def.rite.gauge.charges * 18 + 44 : 0);
    const y = H - D.bottom + D.plate.gap + (D.plate.h * D.plate.scale) / 2;
    for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
      if (v.display !== 'pips' || !v.show) continue;
      const per = v.per || 1, count = Math.ceil(v.max / per), n = p.vars[k] | 0;
      const BW = 16, BH = 9, GAP = 4;
      for (let i = 0; i < count; i++) {
        const x = left ? start + i * (BW + GAP) : W - start - i * (BW + GAP) - BW;
        const share = Math.max(0, Math.min(1, (n - i * per) / per));
        ctx.fillStyle = '#1c1826';
        ctx.fillRect(x, y - BH / 2, BW, BH);
        if (share > 0) {
          ctx.fillStyle = share >= 1 ? '#e8b6ff' : '#8a5fb0';
          const w = Math.round(BW * share);
          ctx.fillRect(left ? x : x + BW - w, y - BH / 2, w, BH);
        }
        ctx.strokeStyle = '#0b0910';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y - BH / 2, BW, BH);
      }
      const end = start + count * (BW + GAP) + 2;
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = '#e8b6ff';
      ctx.textAlign = left ? 'left' : 'right';
      const label = v.label.toUpperCase();
      ctx.fillText(label, left ? end : W - end, y + 4);
      start = end + ctx.measureText(label).width + 12;
    }
    return start;
  }

  /** A mark with a `live` rule (War'Teun's Wiretap): a small icon after the pips, a tuning fork in a ring. Dark with
   *  no mark, dim while the mark is on the opponent, lit while the move that spends it can come out (markLive). */
  function markIcons(p, def, H, start) {
    const D = FX.devotion;
    const left = p.id === 0;
    const y = H - D.bottom + D.plate.gap + (D.plate.h * D.plate.scale) / 2;
    for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
      if (!v.mark?.live) continue;
      const on = (p.vars[k] | 0) > 0, live = markLive(p, def, k);
      const cx = left ? start + 9 : W - start - 9;
      const color = v.mark.color ?? '#d01c3c';
      ctx.save();
      ctx.globalAlpha = live ? 1 : on ? 0.55 : 0.22;
      if (live) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
      ctx.fillStyle = '#12060a';
      ctx.strokeStyle = live ? '#ff6a7c' : color;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, y, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.beginPath(); // the fork: two tines, a bend, a stem
      ctx.moveTo(cx - 2.5, y - 5); ctx.lineTo(cx - 2.5, y - 0.5); ctx.quadraticCurveTo(cx, y + 2, cx + 2.5, y - 0.5); ctx.lineTo(cx + 2.5, y - 5);
      ctx.moveTo(cx, y + 1); ctx.lineTo(cx, y + 5.5);
      ctx.stroke();
      ctx.restore();
      start += 26;
    }
    return start;
  }

  /** A fighter with a lobbed projectile (Khai'ro's bracelet): a small ring after the other icons. Bright while the
   *  bracelet is on his wrist; while it is out the ring is dark and fills back round as it comes home. */
  function lobIcon(p, def, H, start, game) {
    const kinds = Object.entries(def.projectiles || {}).filter(([, d]) => d.lob);
    if (!kinds.length) return;
    const D = FX.devotion;
    const y = H - D.bottom + D.plate.gap + (D.plate.h * D.plate.scale) / 2;
    const cx = p.id === 0 ? start + 9 : W - start - 9;
    const out = game?.projectiles.find((pr) => pr.owner === p.id && def.projectiles[pr.kind]?.lob);
    const total = out ? lobAges(def.projectiles[out.kind].lob)[4] : 1;
    const done = out ? Math.min(1, out.age / total) : 1;
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3a2a12';
    ctx.beginPath(); ctx.arc(cx, y, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = out ? '#E08A2C' : '#FFC861';
    if (!out) { ctx.shadowColor = '#FFC861'; ctx.shadowBlur = 6; }
    ctx.beginPath(); ctx.arc(cx, y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * done); ctx.stroke();
    ctx.restore();
  }

  /** The Absolve icon (by the health bar), the Devotion meter (bottom corners), the Rite gauge, the mechanic. */
  function resources(p, def, world, H, game) {
    const left = p.id === 0;
    const B = world.burst;
    if (B && B.enabled) {
      // A diamond: bright while Absolve is still unused this round, hollow once it is spent; dimmer while there
      // is not enough Devotion to pay for it.
      const cx = left ? W / 2 - 44 - 132 : W / 2 + 44 + 132;
      const cy = BAR_Y + BAR_H + UNDER;
      const ready = p.burst >= B.gaugeMax;
      const canPay = p.meter >= (world.sys?.absolve.cost ?? 0);
      ctx.save();
      ctx.globalAlpha = ready && !canPay ? 0.55 : 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 7, cy); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 7, cy);
      ctx.closePath();
      ctx.fillStyle = ready ? '#7fe0ff' : '#1c1826';
      ctx.fill();
      ctx.strokeStyle = ready ? '#e9fbff' : '#3f6f80';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = `700 10px ${FONT}`;
      ctx.fillStyle = ready ? '#7fe0ff' : '#3f6f80';
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillText('ABSOLVE', left ? cx - 12 : cx + 12, cy + 4);
      ctx.restore();
    }
    const top = devotion(p, def, world, H, game.frame);
    riteGauge(p, def, H);
    lobIcon(p, def, H, markIcons(p, def, H, varPips(p, def, H)), game);
    // The mechanic: its gauge as a percentage, its counters as pips.
    const mech = def.mechanic;
    let line = '';
    if (mech?.gauge) line += `${mech.gauge.label ?? mech.name} ${Math.floor((100 * p.gauge) / mech.gauge.max)}%  `;
    for (const [k, v] of Object.entries(mech?.vars || {})) {
      if (!v.show || v.display === 'pips' || v.display === 'flames') continue;
      const n = p.vars[k];
      if (v.display === 'timer') line += n > 0 ? `${v.label} ${(n / 60).toFixed(1)}s  ` : '';
      else line += v.max <= 6 ? `${v.label} ${'●'.repeat(n)}${'○'.repeat(Math.max(0, v.max - n))}  ` : `${v.label} ${n}  `;
    }
    if (line) {
      ctx.font = `600 12px ${FONT}`;
      ctx.fillStyle = '#c9a2ff';
      ctx.textAlign = left ? 'left' : 'right';
      const D = FX.devotion;
      if (D.layout?.lineBeside) { // beside the meter, inside the strip under the floor
        const off = D.margin + D.frame.w * D.scale + 8;
        ctx.fillText(line.trim(), left ? off : W - off, top + (D.frame.h * D.scale) / 2 + 4);
      } else ctx.fillText(line.trim(), left ? D.margin + 4 : W - D.margin - 4, top - 6);
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

  /** PERFECT / COUNTER / WITNESS: a word under the health bar of the player who earned it, for a moment. */
  function popupWords(game) {
    for (let i = popups.length - 1; i >= 0; i--) {
      const age = game.frame - popups[i].frame;
      if (age < 0 || age > POPUP_LIFE) popups.splice(i, 1);
    }
    const row = [0, 0];
    for (const w of popups) {
      const age = game.frame - w.frame;
      const left = w.p === 0;
      const s = Math.min(1, age / 5);
      ctx.save();
      ctx.globalAlpha = age > POPUP_LIFE - 12 ? Math.max(0, (POPUP_LIFE - age) / 12) : 1;
      ctx.translate(left ? W / 2 - 220 : W / 2 + 220, 96 + row[w.p]++ * 26);
      ctx.scale(0.8 + 0.2 * s, 0.8 + 0.2 * s);
      ctx.textAlign = 'center';
      ctx.font = `900 22px ${FONT}`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#0b0910';
      ctx.strokeText(w.text, 0, 0);
      ctx.fillStyle = w.color;
      ctx.fillText(w.text, 0, 0);
      ctx.restore();
    }
  }

  return {
    /** Called once per game frame (cues last one frame): remember the words to show. */
    notice(game) {
      for (const c of game.cues) {
        const w = POPUP[c.type];
        if (w) popups.push({ p: c.p, text: w[0], color: w[1], frame: game.frame });
      }
    },
    draw(game, world, H) {
      for (const p of game.players) {
        const def = world.chars[p.id];
        const x = healthBar(p, def, game);
        roundPips(game, world, p, x);
        resources(p, def, world, H, game);
      }
      timer(game);
      popupWords(game);
      banners(game, world);
    },
    reset() { trail[0] = trail[1] = null; popups.length = 0; },
  };
}
