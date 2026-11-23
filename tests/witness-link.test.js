// Universal systems, sections 10 and 6 (docs/specs/universal-systems.md): counter hits, Witness counters and
// Perfect Link.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState, CONTACT } from '../src/core/fighter.js';
import { soften } from '../src/core/systems.js';
import { RAW } from '../src/core/input.js';
import { px, pct } from '../src/core/fixed.js';
import { loadWorld, loadJSON, script, SYSTEM } from './helpers.js';

const RULES = loadJSON('data/system/systems.json');
const BIG = [[0, -400, 300, 900]];
const base = { startup: 4, active: 2, recovery: 8, damage: 500, hitstun: 20, untech: 20, blockstun: 10, hitstop: 8,
  pushbackHit: 0, pushbackBlock: 0, hitboxes: BIG, starterProration: 9000, comboProration: 9000 };
const file = (archetype) => ({ engine: 'Toska', version: 2, character: { id: `w-${archetype}`, stats: {} }, meter: { archetype },
  gatlings: { '5L': ['5M', '5H'], '5M': ['5L', '5H'], '5H': ['5L', '5M'] },
  projectiles: { ball: { speed: 10, spawn: [40, 60], hitbox: [-20, -20, 40, 40], lifetime: 200, damage: 300, hitstun: 20, hitstop: 4 } },
  moves: [
    { ...base, id: '5L', input: '5L' },
    { ...base, id: '5M', input: '5M' },
    { ...base, id: '5H', input: '5H' },
    { ...base, id: 'slow', input: '5S', startup: 12, active: 4, recovery: 20, hitboxes: [[400, 0, 10, 10]] },
    { ...base, id: 'special', input: '236L', startup: 8, active: 6, recovery: 20, hitboxes: [[400, 0, 10, 10]] },
    { ...base, id: 'super', input: '236236H', kind: 'super', startup: 6, active: 6, recovery: 20, hitboxes: [[400, 0, 10, 10]] },
    { ...base, id: 'safe', input: '2S', startup: 12, active: 4, recovery: 20, hitboxes: [[400, 0, 10, 10]], counterHit: 'none' },
    { ...base, id: 'throwBall', input: '214L', startup: 6, active: 0, recovery: 30, hitboxes: undefined, timeline: [{ at: 6, spawn: 'ball' }] },
  ] });
const CH = Object.fromEntries(['balanced', 'zealot'].map((a) => [a, compileCharacter(file(a), SYSTEM)]));
const W = loadWorld(CH.balanced, CH.balanced);
const S = W.sys;
const D = SYSTEM.meter.unit;

function setup(world = W) {
  const g = createGame(world);
  g.players[0].x = -px(50);
  g.players[1].x = px(50);
  return g;
}
/** Put a fighter in `state` so its NEXT frame is `frame`. */
function arrange(g, i, state, frame = 0, world = W) {
  const p = g.players[i];
  enterState(p, world.chars[i], state);
  p.frame = frame - 1;
}
/** P1's `move` lands on the next step. Returns that step's cues. */
function strike(g, move = '5L', world = W) {
  arrange(g, 0, move, world.chars[0].states[move].move.startup - 1, world);
  step(g, [0, 0], world);
  return g.cues.slice();
}
const kind = (cues) => cues.find((c) => ['hit', 'counter', 'witness'].includes(c.type))?.type;

// ---------- Counter and Witness ----------

test('the rules file: counter +20% hitstun; Witness +50%, 3 softer hits, +120 frames of decay timer, 10 frames of slow motion', () => {
  assert.equal(RULES.counter.hitstun, 1.2);
  assert.equal(RULES.witness.hitstun, 1.5);
  assert.equal(RULES.witness.softHits, 3);
  assert.equal(RULES.witness.decayExtend, 120);
  assert.equal(RULES.witness.slowFrames, 10);
  assert.deepEqual(RULES.perfectLink, { window: 3, maxPerCombo: 3 });
  assert.equal(S.counter.hitstunPct, 12000);
  assert.equal(S.witness.hitstunPct, 15000);
});

test('a hit on a fighter who is doing nothing is a plain hit', () => {
  const g = setup();
  const cues = strike(g);
  assert.equal(kind(cues), 'hit');
  assert.equal(g.players[1].stun, 20);
  assert.equal(g.players[1].hitstop, 8);
  assert.equal(g.players[1].combo.witness, 0);
});

test('counter hit: during the opponent\'s startup frames, +20% hitstun and the COUNTER event', () => {
  const st = CH.balanced.states.slow.move;
  for (const frame of [1, 5, st.startup - 2]) {
    const g = setup();
    arrange(g, 1, 'slow', frame);
    const cues = strike(g);
    assert.equal(kind(cues), 'counter', `startup frame ${frame}`);
    assert.equal(g.players[1].stun, pct(20, 12000));
    assert.equal(g.players[1].stun, 24);
    assert.equal(g.players[1].hitstop, 8 + S.counter.hitstopAdd);
    assert.equal(g.players[1].combo.witness, 0);
    assert.equal(g.players[1].combo.extend, 0);
  }
  // The startup of a special or a super is a counter hit too, and so are the active frames of a normal.
  for (const [move, frame] of [['special', 3], ['super', 2], ['slow', st.startup], ['slow', st.startup + st.active - 2]]) {
    const g = setup();
    arrange(g, 1, move, frame);
    assert.equal(kind(strike(g)), 'counter', `${move} frame ${frame}`);
  }
});

test('Witness counter: during the opponent\'s recovery frames, +50% hitstun and the WITNESS event with slow motion', () => {
  const st = CH.balanced.states.slow.move;
  const firstRecovery = st.startup - 1 + st.active;
  for (const frame of [firstRecovery, firstRecovery + 7, firstRecovery + st.recovery - 1]) {
    const g = setup();
    arrange(g, 1, 'slow', frame);
    const cues = strike(g);
    assert.equal(kind(cues), 'witness', `recovery frame ${frame}`);
    assert.equal(cues.find((c) => c.type === 'witness').slow, 10, 'ten frames of slow motion, for the screen only');
    assert.equal(g.players[1].stun, 30, '20 +50%');
    assert.equal(g.players[1].combo.witness, 1);
    assert.equal(g.players[1].combo.extend, 120);
  }
  // The frame before recovery is still a counter hit.
  const g = setup();
  arrange(g, 1, 'slow', firstRecovery - 1);
  assert.equal(kind(strike(g)), 'counter');
});

test('Witness counter: during a whiffed special or super, active frames included; not one that touched', () => {
  for (const move of ['special', 'super']) {
    const st = CH.balanced.states[move].move;
    for (const frame of [st.startup - 1, st.startup + 2, st.startup - 1 + st.active + 4]) {
      const g = setup();
      arrange(g, 1, move, frame);
      assert.equal(kind(strike(g)), 'witness', `${move} frame ${frame}`);
    }
    // In its active frames after it was blocked: an ordinary counter hit.
    const g = setup();
    arrange(g, 1, move, st.startup + 1);
    g.players[1].contact = CONTACT.BLOCK;
    assert.equal(kind(strike(g)), 'counter', `${move}, blocked, active`);
  }
});

test('a move with counterHit "none" is never countered, and a hit inside a combo is never a counter', () => {
  const g = setup();
  arrange(g, 1, 'safe', 3);
  assert.equal(kind(strike(g)), 'hit');
  const g2 = setup();
  arrange(g2, 1, 'safe', 25);
  assert.equal(kind(strike(g2)), 'hit');
  // Second hit of a combo: the victim is in hitstun, so it is a plain hit with plain hitstun.
  const g3 = setup();
  arrange(g3, 1, 'slow', 20);
  strike(g3);
  for (let i = 0; i < 12; i++) step(g3, [0, 0], W);
  const cues = strike(g3, '5M');
  assert.equal(kind(cues), 'hit');
  assert.equal(g3.players[1].stun, 20);
});

test('a projectile can score a counter or a Witness counter too', () => {
  const g = setup();
  g.players[0].x = -px(200);
  arrange(g, 0, 'throwBall', 5);
  let got = null;
  for (let i = 0; i < 60 && !got; i++) {
    if (i === 10) arrange(g, 1, 'slow', 18);
    step(g, [0, 0], W);
    got = kind(g.cues);
  }
  assert.equal(got, 'witness');
  assert.equal(g.players[1].combo.witness, 1);
});

test('Witness: the first 3 hits of the combo scale it less; from the fourth on, scaling is normal', () => {
  const run = (victimFrame) => {
    const g = setup();
    if (victimFrame !== null) arrange(g, 1, 'slow', victimFrame);
    const scales = [];
    for (const move of ['5L', '5M', '5H', '5L', '5M']) {
      strike(g, move);
      scales.push(g.players[1].combo.scale);
      for (let i = 0; i < 12; i++) step(g, [0, 0], W);
      g.players[1].stun = 30;
    }
    return scales;
  };
  const plain = run(null);
  const wit = run(20);
  const half = soften(9000, 5000);
  assert.equal(half, 9500, 'half of each hit\'s scaling is taken away');
  assert.equal(plain[0], pct(pct(10000, 9000), 9000));
  assert.equal(wit[0], pct(pct(10000, half), half), 'hit 1: starter and combo proration both softened');
  assert.equal(wit[1], pct(wit[0], half), 'hit 2');
  assert.equal(wit[2], pct(wit[1], half), 'hit 3');
  assert.equal(wit[3], pct(wit[2], 9000), 'hit 4: normal scaling again');
  assert.equal(wit[4], pct(wit[3], 9000));
  for (let i = 0; i < 5; i++) assert.ok(wit[i] > plain[i], `hit ${i + 1}: more damage left than in a plain combo`);
});

test('Witness: the hitstun-decay timer runs 120 frames longer, and so does the wait for the tech out', () => {
  const C = W.combo;
  for (const [witness, time, decayed] of [[false, 485, true], [true, 485, false], [true, 485 + 119 - 5, false], [true, 485 + 120, true]]) {
    const g = setup();
    if (witness) arrange(g, 1, 'slow', 20);
    strike(g);
    for (let i = 0; i < 12; i++) step(g, [0, 0], W);
    const d = g.players[1];
    d.combo.time = time - 1;
    strike(g, '5M');
    assert.equal(d.stun <= C.minHitstun, decayed, `${witness ? 'Witness' : 'plain'} combo at ${time}: hitstun ${d.stun}`);
    // The tech out follows the same clock.
    const g2 = setup();
    if (witness) arrange(g2, 1, 'slow', 20);
    strike(g2);
    for (let i = 0; i < 12; i++) step(g2, [0, 0], W);
    const d2 = g2.players[1];
    d2.stun = 300;
    d2.combo.time = time - 1;
    step(g2, [0, RAW.L], W);
    assert.equal(d2.state === 'groundTech', decayed, `${witness ? 'Witness' : 'plain'} combo at ${time}: tech out`);
  }
});

test('zealot: a Witness counter gives +25 Devotion; nobody else gets it, and a plain counter gives nothing extra', () => {
  for (const [name, bonus] of [['zealot', 25], ['balanced', 0]]) {
    const w = loadWorld(CH[name], CH.balanced);
    const give = CH[name].devotion.give;
    const fromDamage = pct(500 * 100 * 3 * D / 10000, give); // 5% of 10000 health, 3 per 1%
    let g = setup(w);
    arrange(g, 1, 'slow', 20, w);
    strike(g, '5L', w);
    assert.equal(g.players[0].meter, fromDamage + bonus * D, `${name}: Witness`);
    if (bonus) assert.equal(g.players[1].combo.by.witness, bonus * D);
    g = setup(w);
    arrange(g, 1, 'slow', 3, w);
    strike(g, '5L', w);
    assert.equal(g.players[0].meter, fromDamage, `${name}: counter`);
  }
});

// ---------- Perfect Link ----------

/**
 * P1 has just landed a hit (this step). Press `button` on frozen frame `j` of the hitstop (1 = its first frame,
 * hitstop = its last; hitstop + 1 = the first frame P1 can act again). Returns the cues up to the cancel.
 */
function pressAt(g, button, j, world = W) {
  const a = g.players[0];
  const from = a.state;
  const cues = [];
  for (let k = 1; k <= 30; k++) {
    step(g, [k === j ? RAW[button] : 0, 0], world);
    cues.push(...g.cues);
    if (a.state !== from) break;
  }
  return cues;
}
/** Run until P1's current move lands (the step its hit connects). */
function untilHit(g, world = W) {
  const d = g.players[1];
  const hits = d.combo ? d.combo.hits : 0;
  for (let i = 0; i < 40; i++) {
    step(g, [0, 0], world);
    if (d.combo && d.combo.hits > hits) return;
  }
  throw new Error('the move never hit');
}
const HS = 8; // the test moves' hitstop

test('Perfect Link: the press must come in the last 3 frames of the hitstop; the edges', () => {
  const cases = [[HS - 2, 'perfect', 3], [HS - 1, 'perfect', 2], [HS, 'perfect', 1], [HS - 3, 'early', 1], [1, 'early', HS - 3], [HS + 1, 'late', 1], [HS + 3, 'late', 3]];
  for (const [j, timing, frames] of cases) {
    const g = setup();
    strike(g);
    assert.equal(g.players[0].hitstop, HS);
    const cues = pressAt(g, 'M', j);
    assert.equal(g.players[0].state, '5M', `press on frame ${j}: the move comes out either way`);
    const link = cues.find((c) => c.type === 'link');
    assert.deepEqual([link.timing, link.frames], [timing, frames], `press on frame ${j}`);
    assert.equal(cues.some((c) => c.type === 'perfect'), timing === 'perfect');
    assert.equal(link.rewarded, timing === 'perfect');
    assert.equal(g.players[1].combo.links, timing === 'perfect' ? 1 : 0);
  }
});

test('Perfect Link: that hit adds nothing to damage scaling, +2 Devotion, and the flash event', () => {
  const linked = setup();
  strike(linked);
  const before = linked.players[1].combo.scale;
  const meter = linked.players[0].meter;
  const cues = pressAt(linked, 'M', HS);
  assert.ok(cues.some((c) => c.type === 'perfect'), 'the event for the white flash and sound');
  assert.equal(linked.players[0].meter, meter + 2 * D);
  assert.equal(linked.players[1].combo.by.link, 2 * D);
  untilHit(linked);
  assert.equal(linked.players[1].combo.hits, 2);
  assert.equal(linked.players[1].combo.scale, before, 'the linked hit did not scale the combo');
  assert.ok(linked.cues.find((c) => c.type === 'hit').linked);
  // The same combo with a buffered (early) press: the hit scales as usual.
  const plain = setup();
  strike(plain);
  const m2 = plain.players[0].meter;
  pressAt(plain, 'M', 2);
  assert.equal(plain.players[0].meter, m2, 'no Devotion for an early press');
  untilHit(plain);
  assert.equal(plain.players[1].combo.scale, pct(before, 9000));
  // Both did the same damage on that hit: the reward is in what comes after.
  assert.equal(plain.players[1].health, linked.players[1].health);
});

test('Perfect Link: at most 3 per combo; the fourth still comes out, with no reward', () => {
  const g = setup();
  strike(g);
  const d = g.players[1];
  const order = ['M', 'H', 'L', 'M', 'H'];
  const rewards = [];
  for (const b of order) {
    d.stun = 60;
    const scale = d.combo.scale;
    const meter = g.players[0].meter;
    const cues = pressAt(g, b, HS);
    const link = cues.find((c) => c.type === 'link');
    assert.equal(link.timing, 'perfect', b);
    untilHit(g);
    rewards.push([link.rewarded, d.combo.scale === scale, cues.some((c) => c.type === 'perfect')]);
    void meter;
  }
  assert.deepEqual(rewards, [[true, true, true], [true, true, true], [true, true, true], [false, false, false], [false, false, false]]);
  assert.equal(d.combo.links, 3);
  assert.equal(d.combo.hits, 6);
  // A new combo starts a new count.
  for (let i = 0; i < 120; i++) step(g, [0, 0], W);
  assert.equal(d.combo, null);
  strike(g);
  assert.equal(pressAt(g, 'M', HS).find((c) => c.type === 'link').rewarded, true);
});

test('Perfect Link: zealot gets +5 (times give) instead of +2', () => {
  const w = loadWorld(CH.zealot, CH.balanced);
  const g = setup(w);
  strike(g, '5L', w);
  const meter = g.players[0].meter;
  pressAt(g, 'M', HS, w);
  assert.equal(g.players[0].meter - meter, pct(5 * D, 15000), '5 x 1.5');
});

test('Perfect Link needs a hit: a cancel off a blocked move, or a move from neutral, reports nothing', () => {
  const g = setup();
  arrange(g, 0, '5L', 3);
  step(g, [0, RAW.RIGHT], W); // P2 blocks
  assert.equal(g.players[1].state, 'blockStand');
  const cues = pressAt(g, 'M', g.players[0].hitstop);
  assert.equal(g.players[0].state, '5M');
  assert.ok(!cues.some((c) => c.type === 'link' || c.type === 'perfect'));
  const g2 = setup();
  const seen = [];
  for (const r of script('5 5+L 5*3')) { step(g2, [r, 0], W); seen.push(...g2.cues); }
  assert.ok(!seen.some((c) => c.type === 'link'));
});
