// Training readouts for the universal systems: what the current (or last) combo did, per player being hit.
// Pure: reads the game after each step, changes nothing. The overlay draws `lines(i)`.

const HIT_TYPES = new Set(['hit', 'counter', 'witness']);
const SOURCE_LABELS = { hit: 'hits', blocked: 'blocked', special: 'specials', link: 'links', witness: 'Witness', variety: 'variety',
  repel: 'Repel', draw: 'Draw refund', vow: 'Vow', hurt: 'taking hits', guard: 'guarding' };
/** The hit states, as the readout names them (the state the fighter being hit is in). */
export const HIT_STATE_LABELS = { hitStand: 'hitstun', hitCrouch: 'hitstun (crouching)', hitAir: 'air hitstun', hitSpin: 'SPIN', hitTumble: 'TUMBLE', slide: 'SLIDE',
  crumple: 'CRUMPLE', knockdown: 'HARD KNOCKDOWN (OTG can hit)', knockdownSoft: 'soft knockdown (can get up)', tumble: 'falling (can air tech)', thrown: 'thrown' };

export function createSystemsReadout() {
  // Per attacker (0 / 1): the combo they are doing or last did, their last Perfect Link attempt, their last hit's kind.
  const combo = [null, null];
  const link = [null, null];
  const counter = [null, null];
  const otg = [false, false]; // their last hit was an OTG pickup

  function update(game, world) {
    const unit = world.meter?.unit ?? 100;
    for (const c of game.cues) {
      if (c.type === 'link') link[c.p] = { timing: c.timing, frames: c.frames, rewarded: c.rewarded };
      // The kind of the hit that STARTED the combo (later hits are always plain).
      if (HIT_TYPES.has(c.type) && c.hits === 1) counter[c.p] = c.type;
      if (HIT_TYPES.has(c.type)) otg[c.p] = !!c.otg;
    }
    for (const v of game.players) {
      const a = 1 - v.id;
      const k = v.combo;
      if (!k) { if (combo[a]) combo[a].live = false; continue; }
      const C = world.combo;
      combo[a] = {
        live: true,
        hits: k.hits,
        damage: k.damage,
        scalePct: Math.round(k.scale / 100), // damage scaling for the next hit, in percent
        decay: Math.max(0, k.time - k.extend), // the hitstun-decay timer (frames; a Witness combo's runs late)
        decayEnd: C.techOutAt ?? null, // where hitstun reaches nothing and the opponent can tech out
        juggle: k.juggle,
        juggleLimit: C.juggleLimit ?? null,
        links: k.links,
        otg: k.otg | 0, // OTG pickups used (the limit is in combo.json hitStates)
        witness: !!k.witness,
        gave: Math.round(k.gave / unit), // Devotion the attacker got from Give this combo
        took: Math.round(k.took / unit), // Devotion the defender got from Take this combo
        by: Object.fromEntries(Object.entries(k.by).map(([s, n]) => [s, Math.round(n / unit)])),
      };
    }
  }

  /** Text lines for attacker i (empty until they have hit something). */
  function lines(i, game) {
    const out = [];
    const k = combo[i];
    if (k) {
      out.push(`${k.live ? 'combo' : 'last combo'}: ${k.hits} hits, ${k.damage} damage`);
      out.push(`scaling ${k.scalePct}%   juggle ${k.juggle}${k.juggleLimit !== null ? `/${k.juggleLimit}` : ''}`);
      out.push(`decay timer ${k.decay}${k.decayEnd !== null ? `/${k.decayEnd}` : ''}${k.witness ? '  (Witness +)' : ''}`);
      const by = Object.entries(k.by).filter(([, n]) => n > 0).map(([s, n]) => `${SOURCE_LABELS[s] ?? s} ${n}`);
      out.push(`Devotion: ${by.length ? by.join(', ') : 'none'}`);
      // The hit state of the fighter being hit, while the combo is alive, and whether the OTG has been used.
      const label = k.live && game ? HIT_STATE_LABELS[game.players[1 - i].state] : null;
      if (label || k.otg) out.push(`${label ? `state: ${label}` : 'state: -'}${k.otg ? `   OTG used${otg[i] && k.live ? ' (this hit)' : ''}` : ''}`);
    }
    if (counter[i]) out.push(`starter: ${counter[i] === 'hit' ? 'normal hit' : counter[i] === 'counter' ? 'COUNTER' : 'WITNESS'}`);
    const l = link[i];
    if (l) out.push(`link: ${l.timing === 'perfect' ? (l.rewarded ? 'PERFECT' : 'perfect (limit reached)') : `${l.frames}f ${l.timing}`}`);
    const debt = game ? game.players[i].debt : 0;
    if (debt > 0) out.push(`Debt ${debt}`);
    return out;
  }

  return { update, lines, get combo() { return combo; }, get link() { return link; }, get counter() { return counter; } };
}
