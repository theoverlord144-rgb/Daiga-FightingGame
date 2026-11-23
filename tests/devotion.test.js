// Universal systems, section 2 (docs/specs/universal-systems.md): the Devotion meter and the Give / Take archetypes.
// Every source that exists so far, for every archetype; the take cap; spending; the meter's limits.
// (Perfect Link, Vow, Witness, Repel and Draw gains are tested with those systems.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { compileCharacter } from '../src/core/character.js';
import { compileDevotion, compileArchetype, perPercent } from '../src/core/devotion.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, loadJSON, script, lcg, SYSTEM } from './helpers.js';

const RAW_RULES = loadJSON('data/system/systems.json').devotion;
const M = SYSTEM.meter;
const D = M.unit; // game units in one Devotion point
const ARCHETYPES = ['balanced', 'martyr', 'zealot', 'penitent', 'trickster'];
// The spec's table.
const GIVE = { balanced: 1, martyr: 0.5, zealot: 1.5, penitent: 0.6, trickster: 1 };
const TAKE = { balanced: 1, martyr: 2, zealot: 0.5, penitent: 1, trickster: 1 };

// A small fighter: quick moves that always combo (long hitstun, no pushback), 10000 health.
const hit = (id, input, damage, more = {}) => ({ id, input, startup: 3, active: 2, recovery: 5, damage, hitstun: 40, blockstun: 12, hitboxes: [[0, 0, 300, 200]], specialCancel: false, ...more });
const fighter = (archetype, own = {}) => compileCharacter({ engine: 'Toska', version: 2, character: { id: `t-${archetype}`, stats: {} },
  meter: { archetype, ...own },
  moves: [
    hit('5L', '5L', 400),
    hit('5M', '5M', 600, { guard: 'high' }),
    hit('5H', '5H', 1000, { guard: 'low' }),
    hit('big', '5S', 2000),
    hit('fire', '236L', 800, { ex: { damage: 1200 } }),
    hit('lv1', '214214H', 1500, { kind: 'super' }),
    hit('lv3', '236236H', 3000, { kind: 'super', level: 3 }),
  ] }, SYSTEM);
const CH = Object.fromEntries(ARCHETYPES.map((a) => [a, fighter(a)]));

function fight(a, b, gap = 80) {
  const w = loadWorld(a, b);
  const g = createGame(w);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  const run = (s, p2 = '') => {
    const x = script(s);
    const y = p2 ? script(p2) : [];
    for (let i = 0; i < Math.max(x.length, y.length); i++) step(g, [x[i] ?? 0, y[i] ?? 0], w);
  };
  return { w, g, run, a: g.players[0], d: g.players[1] };
}

test('the rules file: a bar is 100 Devotion, costs and gains are the spec\'s, and every archetype is there', () => {
  assert.equal(RAW_RULES.barSize, 100);
  assert.equal(RAW_RULES.exCost, 100);
  assert.deepEqual(RAW_RULES.superCost, { 1: 100, 3: 300 });
  assert.deepEqual(RAW_RULES.gain, { hitPerPct: 3, blockedPerPct: 1, special: 5, perfectLink: 2, hurtPerPct: 2, vowAbsorb: 0.5 });
  assert.equal(RAW_RULES.takeCapPerCombo, 150);
  for (const a of ARCHETYPES) {
    assert.equal(RAW_RULES.archetypes[a].give, GIVE[a], a);
    assert.equal(RAW_RULES.archetypes[a].take, TAKE[a], a);
  }
  assert.deepEqual(RAW_RULES.archetypes.balanced.extras, {});
  assert.deepEqual(RAW_RULES.archetypes.martyr.extras, { vowAbsorb: 1 });
  assert.deepEqual(RAW_RULES.archetypes.zealot.extras, { perfectLink: 5, witness: 25 });
  assert.deepEqual(RAW_RULES.archetypes.penitent.extras, { guardPerPct: 1, repel: 10, drawRefund: 0.5, vowAbsorb: 1 });
  assert.deepEqual(RAW_RULES.archetypes.trickster.extras, { variety: { newMove: 1.5, repeat: 0.2, switch: 10 } });
  // In the game everything is a whole number.
  assert.equal(M.barSize, 100 * D);
  const whole = (o) => Object.values(o).every((v) => (v && typeof v === 'object' ? whole(v) : v === null || typeof v === 'string' || Number.isInteger(v)));
  assert.ok(whole({ ...M, archetypes: null }));
  for (const a of ARCHETYPES) assert.ok(whole(CH[a].devotion), a);
});

test('the cast: Avner is balanced, Malik is penitent, both hold 400', () => {
  const avner = loadChar('data/characters/avner/avner.toska.json');
  const malik = loadChar('data/characters/malik/malik.toska.json');
  assert.equal(avner.devotion.archetype, 'balanced');
  assert.equal(malik.devotion.archetype, 'penitent');
  assert.equal(malik.devotion.give, 6000);
  for (const c of [avner, malik]) assert.equal(c.meterMax, 400 * D, c.id);
  // A character with no `meter` in its file is balanced; an unknown archetype is a load error.
  assert.equal(loadChar('tests/fixtures/fighter.toska.json').devotion.archetype, 'balanced');
  assert.throws(() => fighter('saint'), /unknown Devotion archetype "saint"/);
});

test('a character may override its archetype: give, take and single extras', () => {
  const c = fighter('penitent', { give: 0.8, extras: { repel: 15 } });
  assert.equal(c.devotion.give, 8000);
  assert.equal(c.devotion.take, 10000, 'the preset\'s take');
  assert.equal(c.devotion.extras.repel, 15 * D);
  assert.equal(c.devotion.extras.guardPerPct, 1 * D, 'the preset\'s other extras stay');
  assert.deepEqual(compileArchetype(M, null).extras.variety, null);
});

test('dealing damage: 3 per 1% of the opponent\'s max health, times give (every archetype)', () => {
  for (const name of ARCHETYPES) {
    const f = fight(CH[name], CH.balanced);
    f.run('5+L 5*8');
    assert.equal(10000 - f.d.health, 400);
    // The trickster's first hit is a move new to the combo: x1.5.
    const variety = name === 'trickster' ? 1.5 : 1;
    assert.equal(f.a.meter, Math.round(12 * GIVE[name] * variety * D), `${name}: 400 damage = 4% -> 12, x give`);
  }
  // Against more health the same damage is a smaller share.
  const tank = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'tank', stats: { health: 20000 } }, moves: [hit('5L', '5L', 400)] }, SYSTEM);
  const f = fight(CH.balanced, tank);
  f.run('5+L 5*8');
  assert.equal(f.a.meter, 6 * D, '400 of 20000 = 2% -> 6');
});

test('your attack blocked: 1 per 1% of the damage it would have done, times give (every archetype)', () => {
  for (const name of ARCHETYPES) {
    const f = fight(CH[name], CH.balanced);
    f.run('5+S 5*8', '6*12');
    assert.equal(f.d.health, 10000, 'blocked');
    assert.equal(f.a.meter, Math.round(20 * GIVE[name] * D), `${name}: 2000 damage = 20% -> 20, x give`);
    assert.equal(f.d.meter, 0, 'a balanced defender builds nothing by blocking');
  }
});

test('doing a special move: +5 times give, on hit, block or whiff alike; an EX or a super gives nothing for it', () => {
  for (const name of ARCHETYPES) {
    let f = fight(CH[name], CH.balanced, 1400);
    f.run('2 3 6+L 5*12');
    assert.equal(f.a.meter, Math.round(5 * GIVE[name] * D), `${name}: whiffed special`);
    f.run('2 3 6+L 5*12');
    assert.equal(f.a.meter, Math.round(10 * GIVE[name] * D), `${name}: twice`);
    f = fight(CH[name], CH.balanced, 1400);
    f.a.meter = 200 * D;
    f.run('2 3 6+LS 5*12');
    assert.equal(f.a.meter, 100 * D, `${name}: the EX costs 100 and gives no 5`);
    f.run('2 1 4 2 1 4+H 5*12');
    assert.equal(f.a.meter, 0, `${name}: a level 1 super costs 100 and gives no 5`);
  }
});

test('whiffs give nothing: normals, and a special beyond its 5', () => {
  const f = fight(CH.zealot, CH.balanced, 1400);
  f.run('5+L 5*10 5+M 5*10 5+H 5*10 5+S 5*10');
  assert.equal(f.a.meter, 0);
  assert.equal(f.d.meter, 0);
});

test('taking damage: 2 per 1% of your max health lost, times take (every archetype)', () => {
  for (const name of ARCHETYPES) {
    const f = fight(CH.balanced, CH[name]);
    f.run('5+H 5*8');
    assert.equal(10000 - f.d.health, 1000);
    assert.equal(f.d.meter, Math.round(20 * TAKE[name] * D), `${name}: 10% lost -> 20, x take`);
  }
});

test('penitent: blocking a hit gives 1 per 1% blocked; nobody else builds by blocking', () => {
  for (const name of ARCHETYPES) {
    const f = fight(CH.balanced, CH[name]);
    f.run('5+S 5*8', '6*12');
    assert.equal(f.d.health, 10000);
    assert.equal(f.d.meter, name === 'penitent' ? 20 * D : 0, name);
  }
});

test('take is capped at 150 Devotion per combo received, and a new combo starts a new count', () => {
  // A martyr (take x2) builds 4 per 1% lost. One combo of five hits: the first four stay under 150, the fifth
  // would pass it.
  const f = fight(CH.balanced, CH.martyr);
  f.run('5+S 5*10');
  assert.equal(f.d.meter, 80 * D, '2000 damage = 20% -> 40, x2');
  assert.ok(f.d.combo, 'still in the combo');
  f.run('5+H 5*10 5+M 5*10 5+L 5*10');
  assert.equal(f.d.combo.hits, 4);
  const lost = () => 10000 - f.d.health;
  assert.ok(f.d.meter < 150 * D && f.d.meter > 140 * D, `under the cap so far (${f.d.meter})`);
  assert.ok(Math.abs(f.d.meter - lost() * 4) <= 4 * 4, 'every hit so far paid in full');
  f.run('5+S 5*10');
  assert.equal(f.d.combo.hits, 5);
  assert.ok(lost() * 4 > 150 * D + 10 * D, 'uncapped, this combo would have given well over 150');
  assert.equal(f.d.meter, 150 * D, 'capped at 150');
  f.run('5+H 5*10');
  assert.equal(f.d.combo.hits, 6);
  assert.equal(f.d.meter, 150 * D, 'nothing more from this combo');
  assert.equal(f.d.combo.took, 150 * D);
  // The attacker's side has no cap.
  assert.ok(f.a.meter > 0 && f.d.combo.gave === f.a.meter, 'the combo counts what it gave the attacker');
  // Let the combo end, then hit again.
  f.run('5*80');
  assert.equal(f.d.combo, null);
  const before = f.d.meter;
  f.run('5+L 5*8');
  assert.ok(f.d.meter > before, 'a new combo gives again');
});

test('the combo keeps a tally of Devotion per source (for the training readouts)', () => {
  const f = fight(CH.balanced, CH.balanced);
  f.run('5+L 5*8 2 3 6+L 5*10');
  const c = f.d.combo;
  assert.equal(c.hits, 2);
  assert.equal(c.by.special, 5 * D);
  assert.equal(c.by.hit + c.by.special, f.a.meter);
  assert.equal(c.by.hurt, f.d.meter);
  assert.equal(c.gave, f.a.meter);
});

test('trickster variety: a new move x1.5, a repeated move x0.2, a high / low switch +10 (same list as the repeat penalty)', () => {
  const f = fight(CH.trickster, CH.balanced);
  const gained = (s) => { const b = f.a.meter; f.run(s); return f.a.meter - b; };
  const base = (dmg) => perPercent(dmg, 10000, M.gain.hitPerPct);
  const dealt = (s) => { const hp = f.d.health; const got = gained(s); return [hp - f.d.health, got]; };
  let [dmg, got] = dealt('5+L 5*8');
  assert.equal(got, Math.trunc(base(dmg) * 1.5), 'first use of 5L');
  [dmg, got] = dealt('5+L 5*8');
  assert.equal(f.d.combo.hits, 2);
  assert.equal(got, Math.trunc(base(dmg) * 0.2), '5L again');
  [dmg, got] = dealt('5+M 5*8');
  assert.equal(got, Math.trunc(base(dmg) * 1.5), '5M (high) is new; nothing to switch from yet');
  [dmg, got] = dealt('5+H 5*8');
  assert.equal(got, Math.trunc(base(dmg) * 1.5) + 10 * D, '5H (low) is new, and high -> low is a switch');
  [dmg, got] = dealt('5+H 5*8');
  assert.equal(got, Math.trunc(base(dmg) * 0.2), 'low again: repeated, no switch');
  [dmg, got] = dealt('5+M 5*8');
  assert.equal(got, Math.trunc(base(dmg) * 0.2) + 10 * D, 'back to high: repeated move, but a switch');
  assert.equal(f.d.combo.hits, 6);
  // Nobody else gets any of this.
  const g = fight(CH.balanced, CH.balanced);
  g.run('5+M 5*8');
  const b = g.a.meter;
  const hp = g.d.health;
  g.run('5+H 5*8');
  assert.equal(g.a.meter - b, base(hp - g.d.health));
});

test('spending: EX costs 100, supers 100 (level 1) or 300 (level 3), and none comes out without the meter', () => {
  const c = CH.balanced;
  assert.equal(c.states.fire_ex.move.cost.meter, 100 * D);
  assert.equal(c.states.lv1.move.cost.meter, 100 * D);
  assert.equal(c.states.lv3.move.cost.meter, 300 * D);
  assert.equal(c.states.lv1.move.level, 1);
  assert.equal(c.states.lv3.move.level, 3);
  for (const [input, id, cost] of [['2 3 6+LS', 'fire_ex', 100], ['2 1 4 2 1 4+H', 'lv1', 100], ['2 3 6 2 3 6+H', 'lv3', 300]]) {
    let f = fight(c, c, 1400);
    f.a.meter = cost * D - 1;
    const seen = new Set();
    for (const r of script(`${input} 5*6`)) { step(f.g, [r, 0], f.w); seen.add(f.a.state); }
    assert.ok(!seen.has(id), `${id} with one point too little`);
    f = fight(c, c, 1400);
    f.a.meter = cost * D;
    for (const r of script(`${input} 5*2`)) { step(f.g, [r, 0], f.w); seen.add(f.a.state); }
    assert.ok(seen.has(id), `${id} with exactly ${cost}`);
    assert.equal(f.a.meter, 0);
  }
  // A move can name its own cost, in Devotion.
  const own = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'o', stats: {} }, moves: [hit('s', '236236H', 100, { kind: 'super', meterCost: 250 })] }, SYSTEM);
  assert.equal(own.states.s.move.cost.meter, 250 * D);
  assert.throws(() => compileCharacter({ engine: 'Toska', version: 2, character: { id: 'o', stats: {} }, moves: [hit('s', '236236H', 100, { kind: 'super', level: 2 })] }, SYSTEM), /level must be one of 1, 3/);
});

test('the meter never goes above 400 or below 0', () => {
  const f = fight(CH.zealot, CH.martyr);
  f.a.meter = 400 * D - 50;
  f.d.meter = 400 * D - 50;
  f.run('5+S 5*10');
  assert.equal(f.a.meter, 400 * D);
  assert.equal(f.d.meter, 400 * D);
  assert.equal(f.d.combo.gave, 50, 'the combo counts only what was really gained');
  // A long random fight: always inside the limits, always whole numbers.
  const w = loadWorld(CH.trickster, CH.penitent);
  const rnd = lcg(404);
  const plans = ['5+L', '5+M', '5+H', '5+S', '2 3 6+L', '2 3 6+LS', '2 1 4 2 1 4+H', '2 3 6 2 3 6+H', '4*8', '6*8', '9', '5*3'];
  const queues = [[], []];
  let low = 0, high = 0, spent = 0;
  const last = [0, 0];
  const r = runSyncTest(w, (g) => {
    for (const i of [0, 1]) {
      const p = g.players[i];
      assert.ok(Number.isInteger(p.meter) && p.meter >= 0 && p.meter <= 400 * D, `meter ${p.meter}`);
      if (p.meter === 0) low++;
      if (p.meter === 400 * D) high++;
      if (p.meter < last[i]) spent++;
      last[i] = p.meter;
      if (!queues[i].length) {
        let raws = script(plans[rnd() % plans.length]);
        if (p.facing < 0) raws = raws.map((x) => (x & ~3) | ((x & 1) << 1) | ((x & 2) >> 1));
        queues[i] = raws;
      }
    }
    return [queues[0].shift(), queues[1].shift()];
  }, { frames: 5000, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
  assert.ok(low > 0 && spent > 0, `meter was built and spent (${spent} spends)`);
});
