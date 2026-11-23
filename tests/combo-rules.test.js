// Universal systems, section 4 (docs/specs/universal-systems.md): the combo rules added on top of the older ones
// (tests/combo.test.js keeps proration, combo time and bounces): hard and soft launches, the juggle limit, the
// repeat penalty, the tech out after 8 seconds, and a long combo that must end by itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px, pct } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, SYSTEM } from './helpers.js';

const BIG = [[0, -400, 200, 900]]; // reaches the defender anywhere nearby, any height
const base = { startup: 3, active: 2, recovery: 5, damage: 1000, hitstun: 20, blockstun: 10, hitstop: 0,
  pushbackHit: 0, pushbackBlock: 0, hitboxes: BIG, starterProration: 10000, comboProration: 10000 };
const file = (moves, more = {}) => ({ engine: 'Toska', version: 2, character: { id: 'r', stats: {} }, ...more, moves });
const CHAR = compileCharacter(file([
  { ...base, id: '5L', input: '5L' },
  { ...base, id: '5M', input: '5M' },
  { ...base, id: 'hard', input: '5S', untech: 50, launch: 'hard' },
  { ...base, id: 'hard2', input: '2S', untech: 50, launch: { type: 'hard', x: 1, y: 30 } },
  { ...base, id: 'soft', input: '5H', untech: 40, launch: 'soft' },
  { ...base, id: 'soft2', input: '2H', untech: 40, launch: { x: 0, y: 9 } },
  { ...base, id: 'softOwn', input: '6H', untech: 40, launch: 'soft', juggleCost: 7 },
  { ...base, id: 'softNoJump', input: '4H', untech: 40, launch: 'soft', jumpCancel: false },
  { ...base, id: 'air', input: '2M', untech: 40 },
  { ...base, id: 'heavyAir', input: '6M', untech: 40, juggleCost: 4 },
  { ...base, id: 'spike', input: '3H', untech: 30, airHit: { x: 0, y: -12 }, groundBounce: { y: 10 } },
  { ...base, id: 'old', input: '4M', untech: 50, launcher: true, launch: { x: 0, y: 20 } },
]), SYSTEM);
const W = loadWorld(CHAR, CHAR);
const C = W.combo;

function setup(x1 = -50, x2 = 50) {
  const g = createGame(W);
  g.players[0].x = px(x1);
  g.players[1].x = px(x2);
  return g;
}
/** P1 does `move` with its first active frame on the next step. */
function hit(g, move, raw = [0, 0]) {
  const p = g.players[0];
  enterState(p, W.chars[0], move);
  p.frame = W.chars[0].states[move].move.startup - 2;
  step(g, raw, W);
}
const go = (g, n, raw = [0, 0]) => { for (let i = 0; i < n; i++) step(g, raw, W); };

// ---------- Chains ----------

test('chains: L -> M -> H -> S on the ground for the whole cast, and normals cancel into specials', () => {
  for (const id of ['avner', 'malik']) {
    const c = loadChar(`data/characters/${id}/${id}.toska.json`);
    const into = (from, to) => c.states[from].cancels.some((w) => w.into.has(to) && w.hit && w.block);
    for (const [from, to] of [['5L', '5M'], ['5L', '5H'], ['5L', '5S'], ['5M', '5H'], ['5M', '5S'], ['5H', '5S'], ['2L', '5M'], ['2M', '5H']]) {
      assert.ok(into(from, to), `${id}: ${from} chains into ${to} on hit or block`);
    }
    for (const [from, to] of [['j.L', 'j.M'], ['j.L', 'j.H'], ['j.M', 'j.H'], ['j.L', 'j.S'], ['j.M', 'j.S'], ['j.H', 'j.S']]) {
      assert.ok(into(from, to), `${id}: ${from} chains into ${to} on hit or block`);
    }
    for (const n of ['5L', '5M', '5H', '2L', '2M']) assert.ok(into(n, '#special'), `${id}: ${n} cancels into specials`);
    const specials = Object.values(c.states).filter((s) => s.move?.kind === 'special' && s.move.active > 0 && s.cancels.some((w) => w.into.has('#super')));
    assert.ok(specials.length > 0, `${id}: specials cancel into supers`);
  }
});

// ---------- Launches ----------

test('launch in the data: "hard", "soft", { type, x, y }, a plain { x, y } (soft), and the older launcher flag (hard)', () => {
  const m = (id) => CHAR.states[id].move;
  assert.deepEqual([m('hard').launchType, m('hard').launch], ['hard', null]);
  assert.deepEqual([m('hard2').launchType, m('hard2').launch], ['hard', { x: px(1), y: px(30) }]);
  assert.deepEqual([m('soft').launchType, m('soft').launch], ['soft', null]);
  assert.deepEqual([m('soft2').launchType, m('soft2').launch], ['soft', { x: 0, y: px(9) }]);
  assert.deepEqual([m('old').launchType, m('old').launch], ['hard', { x: 0, y: px(20) }]);
  assert.equal(m('5L').launchType, null);
  assert.throws(() => compileCharacter(file([{ ...base, id: 'x', input: '5L', launch: 'huge' }]), SYSTEM), /launch must be/);
  // The cast: both S launchers are hard launches.
  for (const id of ['avner', 'malik']) assert.equal(loadChar(`data/characters/${id}/${id}.toska.json`).states['5S'].move.launchType, 'hard', id);
});

test('hard launch: launches high, and the attacker can super-jump cancel on hit only', () => {
  const g = setup();
  hit(g, 'hard');
  const d = g.players[1];
  assert.equal(d.state, 'hitAir');
  assert.equal(d.vy, C.hardLaunchUnits.y - W.chars[1].stats.gravity * 0, 'the system\'s hard launch speed');
  assert.equal(d.combo.hard, 1);
  assert.equal(d.combo.juggle, 0, 'the launch itself is not a juggle hit');
  const sj = CHAR.states.hard.cancels.find((w) => w.into.has('#superjump'));
  assert.ok(sj.hit && !sj.block && !sj.whiff);
  // Up on hit: straight into the super jump.
  go(g, 1, [RAW.UP, 0]);
  assert.equal(g.players[0].state, 'superJump');
  // A move's own speeds win over the system's.
  const g2 = setup();
  hit(g2, 'hard2');
  assert.equal(g2.players[1].vy, px(30));
});

test('one hard launch per combo: a second one acts as a soft launch', () => {
  const g = setup();
  hit(g, 'hard');
  const d = g.players[1];
  go(g, 3);
  hit(g, 'hard2');
  assert.equal(d.combo.hits, 2);
  assert.equal(d.combo.hard, 1, 'still one');
  assert.equal(d.vy, C.softLaunchUnits.y, 'popped at the soft speed, not its own hard one');
  assert.ok(d.combo.juggle > 0, 'and it counts toward the juggle limit like any soft launch');
  // In a new combo it is a hard launch again.
  go(g, 200);
  assert.equal(d.combo, null);
  hit(g, 'hard2');
  assert.equal(d.vy, px(30));
});

test('soft launch: a short pop, a jump cancel on hit, any number of times, each one using the juggle limit', () => {
  const g = setup();
  hit(g, 'soft');
  const d = g.players[1];
  assert.equal(d.state, 'hitAir');
  assert.equal(d.vy, C.softLaunchUnits.y);
  assert.ok(C.softLaunchUnits.y < C.hardLaunchUnits.y, 'lower than a hard launch');
  assert.equal(d.combo.juggle, C.softLaunchCost);
  const jc = CHAR.states.soft.cancels.find((w) => w.into.has('#jump'));
  assert.ok(jc && jc.hit && !jc.block, 'jump cancel on hit');
  assert.ok(!CHAR.states.softNoJump.cancels.some((w) => w.into.has('#jump')), 'a move can turn it off');
  assert.ok(!CHAR.states.soft.cancels.some((w) => w.into.has('#superjump')), 'no super jump from a soft launch');
  // Let them land and stand in hitstun range again: a second soft launch works, and costs again.
  const g2 = setup();
  hit(g2, '5L');
  hit(g2, 'soft2');
  const d2 = g2.players[1];
  assert.equal(d2.vy, px(9), 'its own speed');
  assert.equal(d2.combo.juggle, C.softLaunchCost);
  go(g2, 2);
  hit(g2, 'soft');
  assert.equal(d2.combo.juggle, C.softLaunchCost + C.juggleCost, 'already airborne: an ordinary juggle hit');
  assert.equal(d2.combo.hard, 0);
});

// ---------- Juggle limit ----------

test('juggle: every airborne hit adds its cost; a move can name its own', () => {
  const g = setup();
  hit(g, 'hard');
  const d = g.players[1];
  go(g, 2);
  hit(g, 'air');
  assert.equal(d.combo.juggle, C.juggleCost);
  go(g, 2);
  hit(g, 'heavyAir');
  assert.equal(d.combo.juggle, C.juggleCost + 4);
  // Grounded hits cost nothing.
  const g2 = setup();
  hit(g2, '5L');
  hit(g2, '5M');
  assert.equal(g2.players[1].combo.juggle, 0);
  // A soft launch with its own cost.
  hit(g2, 'softOwn');
  assert.equal(g2.players[1].combo.juggle, 7);
});

test('past the juggle limit the opponent falls out: damage, but no untechable time, no launch and no bounce', () => {
  const g = setup();
  hit(g, 'hard');
  const d = g.players[1];
  d.combo.juggle = C.juggleLimit - 1;
  go(g, 2);
  hit(g, 'air');
  assert.equal(d.combo.juggle, C.juggleLimit, 'exactly at the limit: still a real hit');
  assert.ok(d.stun > 1);
  go(g, 2);
  const hp = d.health;
  hit(g, 'spike');
  assert.ok(d.health < hp, 'the hit still does its damage');
  assert.equal(d.combo.juggle, C.juggleLimit + 1);
  assert.equal(d.stun, 0, 'no untechable time');
  assert.equal(d.gbY, 0, 'no ground bounce armed');
  assert.notEqual(d.vy, -px(12), 'not the spike\'s own knockdown speed either');
  // They are free to tech on the next frame.
  go(g, 1);
  assert.equal(d.state, 'tumble');
  go(g, 1, [0, RAW.L]);
  assert.equal(d.state, 'airTech');
  assert.equal(d.combo, null, 'the combo is over');
  // A soft launch on a grounded fighter past the limit does not launch.
  const g2 = setup();
  hit(g2, '5L');
  g2.players[1].combo.juggle = C.juggleLimit;
  hit(g2, 'soft');
  assert.equal(g2.players[1].state, 'hitStand', 'they stay on the ground');
});

// ---------- Repeat penalty ----------

test('repeat penalty: a move used again in the same combo does 50% damage and 50% hitstun', () => {
  assert.equal(C.repeatDamage, 5000);
  assert.equal(C.repeatHitstun, 5000);
  const g = setup();
  const d = g.players[1];
  hit(g, '5L');
  assert.equal(10000 - d.health, 1000);
  assert.equal(d.stun, 20);
  hit(g, '5L');
  assert.equal(10000 - d.health, 1500, 'half damage');
  assert.equal(d.stun, 10, 'half hitstun');
  hit(g, '5L');
  assert.equal(10000 - d.health, 2000, 'the third use is halved too, not quartered');
  assert.equal(d.stun, 10);
  hit(g, '5M');
  assert.equal(10000 - d.health, 3000, 'a different move is at full strength');
  assert.equal(d.stun, 20);
  // Untechable time is halved the same way.
  const g2 = setup();
  hit(g2, 'soft');
  assert.equal(g2.players[1].stun, 40);
  go(g2, 2);
  hit(g2, 'soft');
  assert.equal(g2.players[1].stun, 20);
  // A new combo forgets it.
  go(g, 60);
  assert.equal(d.combo, null);
  const hp = d.health;
  hit(g, '5L');
  assert.equal(hp - d.health, 1000);
});

// ---------- Hitstun decay and the tech out ----------

test('after 480 frames of combo, hitstun and untechable time drop to nothing', () => {
  assert.equal(C.techOutAt, 480);
  assert.equal(C.hitstunDecay.at(-1)[0], 480);
  assert.equal(C.untechDecay.at(-1)[0], 480);
  for (const [t, full] of [[479, false], [480, true], [900, true]]) {
    const g = setup();
    hit(g, '5L');
    g.players[1].combo.time = t - 1; // the clock ticks once more on the step the next hit lands
    hit(g, '5M');
    assert.equal(g.players[1].combo.time, t);
    assert.equal(g.players[1].stun <= C.minHitstun, full, `ground hitstun at ${t}: ${g.players[1].stun}`);
    const g2 = setup();
    hit(g2, '5L');
    hit(g2, 'soft');
    g2.players[1].combo.time = t - 1;
    hit(g2, 'air');
    assert.equal(g2.players[1].stun <= C.minHitstun, full, `untechable time at ${t}: ${g2.players[1].stun}`);
  }
});

test('tech out: past 480 frames any button techs out of hitstun, on the ground and in the air; not before', () => {
  // On the ground.
  let g = setup();
  hit(g, '5L');
  let d = g.players[1];
  d.stun = 200;
  d.combo.time = 400;
  go(g, 3, [0, RAW.L]);
  go(g, 3);
  go(g, 3, [0, RAW.M]);
  assert.equal(d.state, 'hitStand', 'too early: buttons do nothing');
  go(g, 10); // those presses are long out of the buffer
  d.combo.time = 478;
  go(g, 1);
  assert.equal(d.combo.time, 479);
  go(g, 1, [0, RAW.L]);
  assert.equal(d.state, 'groundTech');
  assert.equal(d.stun, 0);
  assert.ok(W.chars[1].states.groundTech.frames[0].invStrike, 'invincible as it comes out');
  go(g, 1);
  assert.equal(d.combo, null, 'the combo is over');
  const hp = d.health;
  hit(g, '5M');
  assert.equal(d.health, hp, 'the next hit goes through them');
  go(g, 40);
  assert.equal(d.state, 'idle');
  // In the air.
  g = setup();
  hit(g, 'hard');
  d = g.players[1];
  d.stun = 200;
  d.combo.time = 460;
  go(g, 1, [0, RAW.H]);
  go(g, 10);
  assert.equal(d.state, 'hitAir', 'pressed too early, and that press does not wait around');
  d.combo.time = 478;
  go(g, 1);
  assert.equal(d.state, 'hitAir', 'one frame short');
  go(g, 1, [0, RAW.S]);
  assert.equal(d.state, 'airTech');
  // Every button works, R included.
  for (const b of ['L', 'M', 'H', 'S', 'R']) {
    g = setup();
    hit(g, '5L');
    g.players[1].stun = 200;
    g.players[1].combo.time = 600;
    go(g, 1);
    go(g, 1, [0, RAW[b]]);
    assert.ok(g.cues.some((c) => c.type === 'techout'), 'an event for the tech out');
    assert.equal(g.players[1].state, 'groundTech', b);
  }
});

test('a long combo must end by itself: an endless jab loop on a fighter who never presses anything', () => {
  const wall = W.battle.halfWidthUnits / 100;
  const g = setup(wall - 122, wall - 22);
  const d = g.players[1];
  const p = g.players[0];
  hit(g, '5L');
  let frames = 0;
  let hits = 0;
  // P1 hits with alternating moves the instant each one can come out; P2 does nothing at all.
  for (; frames < 2000 && d.combo; frames++) {
    if (W.chars[0].states[p.state].free || p.frame >= 5) { enterState(p, W.chars[0], hits % 2 ? '5L' : '5M'); p.frame = 1; }
    step(g, [0, 0], W);
    if (d.combo) hits = d.combo.hits;
  }
  assert.equal(d.combo, null, 'the combo ended');
  assert.ok(hits > 30, `it was long first (${hits} hits)`);
  assert.ok(d.lastCombo.time >= C.techOutAt && d.lastCombo.time < C.techOutAt + 30, `it ended at the 8 second mark (${d.lastCombo.time} frames)`);
});

test('bounces: one ground bounce and one wall bounce per combo', () => {
  assert.equal(loadJSON('data/system/combo.json').bounceLimit, 1);
  const g = setup();
  hit(g, 'hard');
  const d = g.players[1];
  go(g, 2);
  hit(g, 'spike');
  assert.ok(d.gbY > 0, 'armed');
  for (let i = 0; i < 80 && d.combo.gb === 0; i++) go(g, 1);
  assert.equal(d.combo.gb, 1, 'bounced');
  go(g, 2);
  d.combo.used = {}; // look at the bounce limit alone, not the repeat penalty
  hit(g, 'spike');
  assert.equal(d.gbY, 0, 'the second one in the same combo is not armed');
});
