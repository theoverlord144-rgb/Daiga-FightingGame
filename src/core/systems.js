// The universal systems' rules (data/system/systems.json), turned into the whole numbers the game reads:
// multipliers become percentages out of 10000, distances become units. Devotion has its own file (devotion.js).

const toPct = (n) => Math.round(n * 10000);

/** raw = the parsed systems.json (or nothing: every rule then takes its default). */
export function compileSystems(raw) {
  const r = raw || {};
  const c = r.counter || {};
  const w = r.witness || {};
  const l = r.perfectLink || {};
  const v = r.vow || {};
  const unit = r.devotion?.unit ?? 100;
  return {
    // Counter hit: a hit during the opponent's startup (or a normal's active frames).
    counter: {
      hitstunPct: toPct(c.hitstun ?? 1.2),
      hitstopAdd: c.hitstopAdd ?? 0,
      damagePct: toPct(c.damage ?? 1),
    },
    // Witness counter: a hit during the opponent's recovery, or during a special or super that has touched nothing.
    witness: {
      hitstunPct: toPct(w.hitstun ?? 1.5),
      hitstopAdd: w.hitstopAdd ?? 0,
      damagePct: toPct(w.damage ?? 1),
      softHits: w.softHits ?? 3, // the first hits of the combo whose scaling is softened
      softenPct: toPct(w.soften ?? 0.5), // how much of each of those hits' scaling is taken away
      decayExtend: w.decayExtend ?? 120, // frames added to the combo's hitstun-decay timer
      slowFrames: w.slowFrames ?? 10, // slow motion, drawing only (the game runs normally)
      mustBeWhiff: w.activeMustBeWhiff ?? true,
    },
    // Perfect Link: the next attack pressed in the last `window` frames of a hit's hitstop.
    link: {
      window: l.window ?? 3,
      max: l.maxPerCombo ?? 3,
    },
    // Vow: the M+H guard that absorbs hits into Debt, and its release strike.
    vow: {
      enabled: !!r.vow,
      startup: v.startup ?? 4,
      maxHold: v.maxHold ?? 60,
      absorbHitstop: v.absorbHitstop ?? 6,
      strikeAt: v.strikeAt ?? 20,
      fullAt: v.fullAt ?? 45,
      cancelCost: Math.round((v.cancelCost ?? 100) * unit),
      dashCost: Math.round((v.dashCost ?? 100) * unit),
      drainFrames: v.debtDrainFrames ?? 180,
      penaltyPct: toPct(v.debtPenalty ?? 0.2),
      crumpleStun: v.crumpleStun ?? 45,
      witnessWindow: v.witnessWindow ?? 20,
    },
  };
}

/** A proration softened: `soften` (out of 10000) of the way back toward no scaling at all. */
export const soften = (proration, softenPct) => proration + Math.trunc(((10000 - proration) * softenPct) / 10000);

/**
 * The states and moves every character gets, as Toska data: the shared states (common-states.json), the burst
 * moves, and what the universal systems add (Vow's guard and strikes, the crumple). system = { common, burst,
 * systems } (systems = the parsed systems.json; without it only the older content is there).
 */
export function universalContent(system) {
  const states = { ...(system.common?.states || {}) };
  const moves = {};
  for (const [id, m] of Object.entries(system.burst?.moves || {})) moves[id] = { ...m, kind: 'burst' };
  const v = system.systems?.vow;
  if (v) {
    // Vow: M+H starts it (a command like any other, so it obeys buffers and cancel rules); the guard is a held
    // state; letting go picks a strike by the time held.
    moves.vow_start = { input: 'MH', anyDir: true, kind: 'vow', startup: (v.startup ?? 4) + 1, active: 0, recovery: 0, next: 'vow_hold',
      specialCancel: false, superCancel: false };
    states.vow_hold = { stance: 'stand', loop: true, duration: 60, vow: true };
    states.crumple = { stance: 'stand', stun: true, next: 'idle' };
    for (const [id, m] of Object.entries(v.moves || {})) {
      moves[id] = { specialCancel: false, superCancel: false, ...m, kind: 'vow', vowStrike: true };
    }
  }
  return { states, moves };
}
