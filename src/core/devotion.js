// Devotion: the meter's rules (data/system/systems.json "devotion") and each character's Give / Take archetype.
//
// The data is written in Devotion points (a bar is 100, the meter holds 400) and plain multipliers (give 0.6).
// The game keeps whole numbers only: one Devotion point is `unit` (100) meter units, so a bar is 10000 units, and
// every multiplier becomes a percentage out of 10000. Nothing here is read during a frame except those integers.

const toPct = (n) => Math.round(n * 10000);

/** The system's Devotion rules, in game units. */
export function compileDevotion(src) {
  if (!src) return null;
  const unit = src.unit ?? 100;
  const dv = (n) => Math.round((n ?? 0) * unit);
  const g = src.gain || {};
  const archetypes = {};
  for (const [name, a] of Object.entries(src.archetypes || {})) archetypes[name] = a;
  return {
    unit,
    barSize: dv(src.barSize ?? 100),
    exCost: dv(src.exCost ?? 100),
    superCost: Object.fromEntries(Object.entries(src.superCost || { 1: 100 }).map(([level, n]) => [level, dv(n)])),
    gain: {
      hitPerPct: dv(g.hitPerPct), // the attacker, per 1% of the opponent's max health dealt
      blockedPerPct: dv(g.blockedPerPct), // the attacker, per 1% (of the defender's max health) the blocked hit would have done
      special: dv(g.special), // doing a special move
      perfectLink: dv(g.perfectLink),
      hurtPerPct: dv(g.hurtPerPct), // the defender, per 1% of their max health lost
      vowAbsorb: toPct(g.vowAbsorb ?? 0.5), // a hit absorbed by Vow: this share of what taking it would give
    },
    takeCap: dv(src.takeCapPerCombo ?? 150),
    archetypes,
  };
}

/**
 * A character's Devotion profile: `meter: { archetype, give, take, extras }` in its file. The archetype is a preset
 * from the rules; give, take and single extras can be overridden. Returns integers only.
 */
export function compileArchetype(rules, own, charId = '?') {
  const name = own?.archetype ?? 'balanced';
  const base = rules?.archetypes?.[name];
  if (rules && !base) throw new Error(`${charId}: unknown Devotion archetype "${name}"`);
  const unit = rules?.unit ?? 100;
  const dv = (n) => Math.round((n ?? 0) * unit);
  const x = { ...(base?.extras || {}), ...(own?.extras || {}) };
  const v = x.variety ? { ...(base?.extras?.variety || {}), ...(own?.extras?.variety || {}) } : null;
  const give = toPct(own?.give ?? base?.give ?? 1);
  return {
    archetype: name,
    give,
    take: toPct(own?.take ?? base?.take ?? 1),
    special: Math.trunc(((rules?.gain.special ?? 0) * give) / 10000), // what doing a special gives this character
    extras: {
      vowAbsorb: x.vowAbsorb === undefined ? null : toPct(x.vowAbsorb), // replaces the rule's share
      perfectLink: x.perfectLink === undefined ? null : dv(x.perfectLink), // replaces the rule's amount
      witness: dv(x.witness), // flat, on landing a Witness counter
      guardPerPct: dv(x.guardPerPct), // the defender, per 1% blocked
      repel: dv(x.repel), // flat, on a Repel
      drawRefund: toPct(x.drawRefund ?? 0), // share of Draw's cost returned by a punish
      variety: v ? { newMove: toPct(v.newMove ?? 1), repeat: toPct(v.repeat ?? 1), switch: dv(v.switch) } : null,
    },
  };
}

/** `perPct` units for every 1% of `maxHealth` that `damage` is (whole units, rounded down). */
export const perPercent = (damage, maxHealth, perPct) => (damage <= 0 ? 0 : Math.trunc((damage * 100 * perPct) / maxHealth));
