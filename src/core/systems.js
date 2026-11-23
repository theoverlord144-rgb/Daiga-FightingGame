// The universal systems' rules (data/system/systems.json), turned into the whole numbers the game reads:
// multipliers become percentages out of 10000, distances become units. Devotion has its own file (devotion.js).

const toPct = (n) => Math.round(n * 10000);

/** raw = the parsed systems.json (or nothing: every rule then takes its default). */
export function compileSystems(raw) {
  const r = raw || {};
  const c = r.counter || {};
  const w = r.witness || {};
  const l = r.perfectLink || {};
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
  };
}

/** A proration softened: `soften` (out of 10000) of the way back toward no scaling at all. */
export const soften = (proration, softenPct) => proration + Math.trunc(((10000 - proration) * softenPct) / 10000);
