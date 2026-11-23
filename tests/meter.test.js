import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { compileCharacter } from '../src/core/character.js';
import { enterState } from '../src/core/fighter.js';
import { hashState } from '../src/core/state.js';
import { px, pct } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadChar, loadJSON, script, lcg, SYSTEM } from './helpers.js';

const P = loadChar('data/characters/proto/proto.toska.json');
const W = loadWorld(P, P);
const M = SYSTEM.meter;
const B = SYSTEM.burst;

function setup(gap = 60) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
const run = (g, s, p2 = '') => {
  const a = script(s);
  const b = p2 ? script(p2) : [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) step(g, [a[i] ?? 0, b[i] ?? 0], W);
};
const states = (g, s, who = 0) => script(s).map((r) => { step(g, who === 0 ? [r, 0] : [0, r], W); return g.players[who].state; });

// ---------- Meter ----------

test('meter builds on hit, on block and on whiff by the amounts in the data; the defender builds from damage', () => {
  const N = M.gain.normal;
  let g = setup(600);
  run(g, '5+L 5*20');
  assert.equal(g.players[0].meter, N.whiff, 'whiffed jab');
  g = setup();
  run(g, '5+L 5*20');
  assert.equal(g.players[0].meter, N.hit, 'jab hit (no whiff meter on top)');
  assert.equal(g.players[1].meter, pct(400, M.victimGainPct), 'defender: half the 400 damage');
  g = setup();
  run(g, '5+L 5*20', '6*25');
  assert.equal(g.players[1].state.startsWith('block') || g.players[1].state === 'walkB' || g.players[1].state === 'idle', true);
  assert.equal(g.players[0].meter, N.block, 'jab blocked');
  assert.equal(g.players[1].meter, 0, 'blocking builds nothing for the defender');
  // Specials build their own (larger) amounts.
  g = setup();
  run(g, '2 3 6+L 5*40');
  assert.equal(g.players[0].meter, M.gain.special.hit);
});

test('a move can set its own meter gain, and meter never passes the maximum', () => {
  const c = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'x', stats: { meterBars: 1 } }, moves: [
    { id: '5L', input: '5L', startup: 3, active: 2, recovery: 5, damage: 100, hitstun: 30, hitboxes: [[0, 50, 200, 100]], meter: { hit: 4000 } },
  ] }, SYSTEM);
  const w = loadWorld(c, c);
  const g = createGame(w);
  g.players[0].x = -px(40); g.players[1].x = px(40);
  for (const r of script('5+L 5*12 5+L 5*12 5+L 5*12 5+L 5*12')) step(g, [r, 0], w);
  assert.equal(c.meterMax, 10000);
  assert.equal(g.players[0].meter, 10000, 'capped at one bar');
});

// ---------- Specials, EX, chords ----------

// The EX input was motion + two attack buttons for half a bar (236LM). The owner's universal systems spec
// (docs/specs/universal-systems.md, sections 1 and 3) replaced it: motion + attack button + S, one full bar.
test('specials come out from motions; the EX version (attack + S) needs a full bar and costs it', () => {
  assert.equal(M.exCost, M.barSize, 'an EX costs one bar');
  let g = setup(300);
  assert.ok(states(g, '2 3 6+L 5').includes('236L'));
  g = setup(300);
  assert.ok(states(g, '2 3 6+LS 5').includes('236L'), 'no meter: the EX input gives the plain version');
  g = setup(300);
  g.players[0].meter = M.exCost - 1;
  assert.ok(states(g, '2 3 6+LS 5').includes('236L'), 'just short of a bar: still the plain version');
  assert.equal(g.players[0].meter, M.exCost - 1, 'and nothing is spent');
  g = setup(300);
  g.players[0].meter = 12000;
  assert.ok(states(g, '2 3 6+LS 5').includes('236L_ex'));
  assert.equal(g.players[0].meter, 12000 - M.exCost);
});

test('a chord works with the buttons up to chordWindow frames apart, in either order; not further apart', () => {
  const W8 = W.input.chordWindow;
  for (const gap of [0, 1, 2, W8]) {
    for (const [first, second] of [['L', 'S'], ['S', 'L']]) {
      const g = setup(300);
      g.players[0].meter = 10000;
      const seq = gap === 0 ? `2 3 6+${first}${second} 5*40` : `2 3 6+${first} ${gap > 1 ? `6*${gap - 1} ` : ''}6+${second} 5*40`;
      const seen = states(g, seq);
      assert.ok(seen.includes('236L_ex'), `${first} then ${second}, ${gap} apart: ${[...new Set(seen)].join(' ')}`);
      assert.equal(g.players[0].meter, 10000 - M.exCost + M.gain.special.whiff, 'paid once (then whiff meter when it ended)');
    }
  }
  const g = setup(300);
  g.players[0].meter = 10000;
  const seen = states(g, `2 3 6+L 6*${W8 + 1} 6+S 5*20`);
  assert.ok(!seen.includes('236L_ex'), 'too far apart');
});

test('supers: a super flash freezes the whole game, and presses made during it come out right after', () => {
  const g = setup(120);
  g.players[0].meter = 20000;
  run(g, '2 3 6 2 3 6+H');
  const [a, d] = g.players;
  assert.equal(a.state, 'super');
  assert.equal(a.meter, 0, 'two full bars spent');
  const flash = g.flash;
  assert.ok(flash > 0);
  const before = hashState({ ...g, frame: 0, flash: 0, cues: [], players: g.players.map((p) => ({ ...p, input: null, freezeAge: 0 })) });
  // Player 2 presses 5L during the flash.
  for (let i = 0; i < flash; i++) step(g, [0, i === 5 ? 16 : 0], W);
  const after = hashState({ ...g, frame: 0, flash: 0, cues: [], players: g.players.map((p) => ({ ...p, input: null, freezeAge: 0 })) });
  assert.equal(after, before, 'nothing moved during the flash');
  assert.equal(g.flash, 0);
  step(g, [0, 0], W);
  // The press from the flash is still buffered: Player 2's jab starts on the first frame after (it loses to the
  // invincible super, but it did come out).
  assert.equal(d.state, '5L', `got ${d.state}`);
});

test('specials super-cancel on hit; normals special-cancel', () => {
  const g = setup(80);
  g.players[0].meter = 20000;
  // The super's input is finished before 236L connects; it stays buffered through the hitstop and comes out after.
  const seen = states(g, '5+M 5*7 2 3 6+L 5*8 2 3 6 2 3 6+H 5*20');
  const order = [...new Set(seen)];
  assert.deepEqual(order.filter((s) => ['5M', '236L', 'super'].includes(s)), ['5M', '236L', 'super']);
});

// ---------- Chains (follow-ups only from a cancel route) ----------

test('chain moves: the follow-ups only come out of the move before them, never from neutral', () => {
  let g = setup(80);
  assert.ok(!states(g, '5+L 5*10').includes('chain2'), 'L from neutral is a jab');
  g = setup(80);
  const seen = states(g, '2 1 4+L 5*10 5+L 5*10 5+L 5*30');
  const order = [...new Set(seen)].filter((s) => s.startsWith('chain'));
  assert.deepEqual(order, ['chain1', 'chain2', 'chain3']);
  g = setup(600); // out of range: chain1 whiffs, and its window needs a hit or block
  assert.ok(!states(g, '2 1 4+L 5*10 5+L 5*10').includes('chain2'));
});

// ---------- The mechanic slot ----------

test('mechanic: an event builds a counter, a move requires and spends it, and a full counter boosts damage', () => {
  let g = setup(300);
  const p = g.players[0];
  assert.ok(!states(g, '2 3 6+S 5*30').includes('236S'), 'no charge: no Charged Rush');
  for (let i = 0; i < 4; i++) run(g, '2 5 2+S 5*30');
  assert.equal(p.vars.charge, 3, 'capped at its max');
  assert.ok(states(g, '2 3 6+S 5').includes('236S'));
  assert.equal(p.vars.charge, 2, 'spent one');
  // Damage boost at full charge.
  for (const [charge, mult] of [[2, 10000], [3, 11000]]) {
    g = setup();
    g.players[0].vars.charge = charge;
    run(g, '5+M 5*20');
    assert.equal(10000 - g.players[1].health, pct(600, mult), `charge ${charge}`);
  }
});

test('mechanic gauge, per-frame ticks, on-hit effects and requirements, all from data', () => {
  const c = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'm', stats: {} },
    mechanic: { name: 'Heat', gauge: { max: 5000, start: 1000, perFrame: 10, onHit: 200 }, vars: { mode: { start: 0, min: 0, max: 1 }, timer: { start: 0, min: 0, max: 60, perFrame: -1 } } },
    moves: [
      { id: '5L', input: '5L', startup: 3, active: 2, recovery: 5, damage: 100, hitstun: 20, hitboxes: [[0, 50, 200, 100]], onHit: { vars: { timer: 60 } } },
      { id: 'on', input: '22S', startup: 1, active: 0, recovery: 4, requires: { gauge: 3000 }, cost: { gauge: 3000 }, timeline: [{ at: 1, setVar: { mode: 1 } }] },
    ] }, SYSTEM);
  const w = loadWorld(c, c);
  const g = createGame(w);
  g.players[0].x = -px(40); g.players[1].x = px(40);
  const p = g.players[0];
  for (const r of script('5*10')) step(g, [r, 0], w);
  assert.equal(p.gauge, 1000 + 10 * 10, 'per-frame gain');
  for (const r of script('2 5 2+S 5*5')) step(g, [r, 0], w);
  assert.equal(p.vars.mode, 0, 'not enough gauge yet');
  p.gauge = 4000;
  for (const r of script('2 5 2+S 5*5')) step(g, [r, 0], w);
  assert.equal(p.vars.mode, 1);
  assert.ok(p.gauge < 4000 - 3000 + 100, 'cost paid');
  const g0 = p.gauge;
  for (const r of script('5+L 5*3')) step(g, [r, 0], w);
  assert.equal(p.gauge, g0 + 200 + 4 * 10, 'on-hit gauge plus four frames of ticks');
  assert.equal(p.vars.timer, 60 - 1, 'on-hit set the timer, which ticks down');
  assert.throws(() => compileCharacter({ engine: 'Toska', version: 2, character: { id: 'bad', stats: {} },
    moves: [{ id: 'x', input: '5L', startup: 1, cost: { vars: { nope: 1 } } }] }, SYSTEM), /var "nope"/);
  assert.throws(() => compileCharacter({ engine: 'Toska', version: 2, character: { id: 'bad', stats: {} },
    moves: [{ id: 'x', input: '5L', startup: 1, timeline: [{ at: 0, addVar: { typo: 1 } }] }] }, SYSTEM), /var "typo"/);
});

// ---------- Burst ----------

function comboedDummy() {
  const g = setup();
  run(g, '5+M 5*7'); // 5M connects on its 6th frame
  assert.equal(g.players[1].state, 'hitStand');
  return g;
}

test('burst: from a combo with a full gauge, H+S breaks out and knocks the attacker away', () => {
  const g = comboedDummy();
  const [a, d] = g.players;
  assert.ok(d.combo);
  run(g, '5', '5+HS'); // pressed during hitstop: it comes out the moment hitstop ends
  run(g, '5*10');
  assert.equal(d.state, 'burst');
  assert.equal(d.burst, 0, 'the gauge is spent');
  assert.equal(d.combo, null, 'the combo is over');
  run(g, '5*20');
  assert.equal(a.state, 'hitAir', 'the attacker was blown away');
  assert.ok(a.y > 0);
});

test('burst is invincible: it beats the attacker\'s next hit', () => {
  const g = comboedDummy();
  const [a, d] = g.players;
  // Player 1 has 5M still running and chains 5H; Player 2 bursts at the same moment.
  run(g, '5+H', '5+HS');
  run(g, '5*10');
  assert.equal(d.state, 'burst');
  const hp = d.health;
  run(g, '5*20');
  assert.equal(d.health, hp, 'the burst took no damage');
  assert.equal(a.state, 'hitAir');
});

test('no burst without a full gauge, outside a combo, or with the wrong buttons', () => {
  let g = comboedDummy();
  g.players[1].burst = B.gaugeMax - 1;
  run(g, '5', '5+HS');
  assert.notEqual(g.players[1].state, 'burst', 'gauge not full');
  g = setup(200);
  run(g, '5', '5+HS');
  assert.notEqual(g.players[1].state, 'burst', 'not being comboed');
  g = comboedDummy();
  run(g, '5', '5+LM');
  assert.notEqual(g.players[1].state, 'burst', 'wrong buttons');
});

test('air burst while juggled hangs in the air', () => {
  const g = setup();
  run(g, '5+S 5*20');
  const d = g.players[1];
  assert.equal(d.state, 'hitAir');
  run(g, '5', '5+HS');
  assert.equal(d.state, 'burstAir');
  const y = d.y;
  run(g, '5*6');
  assert.equal(d.y, y, 'no gravity during the burst');
});

test('the burst rules are data: a version with burst disabled never bursts', () => {
  const w = { ...W, burst: { ...W.burst, enabled: false } };
  const g = createGame(w);
  g.players[0].x = -px(30); g.players[1].x = px(30);
  for (const r of script('5+M 5*7')) step(g, [r, 0], w);
  for (const r of script('5+HS 5*3')) step(g, [0, r], w);
  assert.notEqual(g.players[1].state, 'burst');
  assert.notEqual(g.players[1].state, 'burstAir');
});

// ---------- Rollback safety ----------

test('sync test with specials, EX, supers, chains, the mechanic and burst: identical after every 8-frame rewind', () => {
  const rnd = lcg(808);
  const plans = ['2 3 6+L', '2 3 6+LS', '2 3 6+MS', '5+LS', '5+S 5+M', '5+R', '2 3 6 2 3 6+H', '2 1 4+L 5*6 5+L 5*6 5+L', '2 5 2+S', '2 3 6+S', '6 2 3+H', '5+M', '2+L', '5+S', '5+HS', '6*10', '4*6', '9', '5*4'];
  const queues = [[], []];
  let flashes = 0;
  let bursts = 0;
  const r = runSyncTest(W, (g) => {
    if (g.flash > 0 && g.cues.length === 0) { /* frozen */ }
    for (const c of g.cues) { if (c.type === 'superflash') flashes++; if (c.type === 'burst') bursts++; }
    for (const i of [0, 1]) {
      const p = g.players[i];
      // A super costs two bars, which random play rarely saves up: both start the run with two (set before the
      // first step, so every rewind sees it). After that, meter only comes from play.
      if (g.frame === 0) p.meter = 20000;
      if (!queues[i].length) {
        let raws = script(plans[rnd() % plans.length]);
        if (p.facing < 0) raws = raws.map((x) => (x & ~3) | ((x & 1) << 1) | ((x & 2) >> 1));
        queues[i] = raws;
      }
    }
    return [queues[0].shift(), queues[1].shift()];
  }, { frames: 6000, distance: 8 });
  assert.ok(r.ok, `desync at ${r.failFrame}: ${r.diff}`);
  assert.ok(bursts > 0, `bursts happened (${bursts})`);
  assert.ok(flashes > 0, `supers happened (${flashes})`);
});
