// The fight HUD: health bars (with a red trail showing the damage just taken), names, the timer, round markers,
// burst gauge, super meter, the character mechanic, and the round banners (ROUND 1, FIGHT, K.O., TIME, WINS).
// It only reads the game; the only thing it remembers is presentation (how far the red trail has drained).

const FONT = 'system-ui, sans-serif';

export function createHud(ctx, W) {
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

  /** Burst gauge (thin bar under the health bar), super meter (bottom corners), the mechanic. */
  function resources(p, def, world, H) {
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
    const bar = world.meter?.barSize ?? 10000;
    const bars = Math.floor(p.meter / bar);
    const full = p.meter >= def.meterMax;
    const part = full ? bar : p.meter - bars * bar;
    const mw = 200;
    const mx = left ? 64 : W - 64 - mw;
    const my = H - 40;
    ctx.fillStyle = '#0b0910cc';
    ctx.fillRect(mx - 52, my - 14, mw + 60, 30);
    ctx.fillStyle = '#1c1826';
    ctx.fillRect(mx, my, mw, 10);
    ctx.fillStyle = full ? '#ffe9a8' : '#b38cff';
    const fw = Math.round((mw * part) / bar);
    ctx.fillRect(left ? mx : mx + mw - fw, my, fw, 10);
    ctx.font = `800 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = bars > 0 ? '#ffe9a8' : '#5d556b';
    ctx.fillText(String(bars), left ? mx - 24 : mx + mw + 24, my + 13);
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
      ctx.fillText(line.trim(), left ? mx : mx + mw, my - 20);
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
        resources(p, def, world, H);
      }
      timer(game);
      banners(game, world);
    },
    reset() { trail[0] = trail[1] = null; },
  };
}
