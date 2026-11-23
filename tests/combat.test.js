import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { CONTACT, enterState } from '../src/core/fighter.js';
import { worldBox, gutsDamage, cornered } from '../src/core/combat.js';
import { RAW } from '../src/core/input.js';
import { px, pct } from '../src/core/fixed.js';
import { loadWorld, SYSTEM } from './helpers.js';

// A test character with one move per rule. Hurtboxes are the defaults: standing [-30, 0, 60, 160].
const base = { startup: 3, active: 3, recovery: 6, damage: 500, hitstun: 12, blockstun: 8, hitstop: 8,
  pushbackHit: 30, pushbackBlock: 40, selfPushback: 20 };
const T = compileCharacter({
  engine: 'Toska', version: 2, character: { id: 't', stats: {} },
  moves: [
    { ...base, id: '5L', input: '5L', guard: 'mid', hitboxes: [[0, 90, 80, 30]] },
    { ...base, id: '2L', input: '2L', guard: 'low', hitboxes: [[0, 0, 80, 30]] },
    { ...base, id: '5M', input: '5M', guard: 'high', hitboxes: [[0, 90, 80, 30]] },
    { ...base, id: '5H', input: '5H', guard: 'unblockable', hitboxes: [[0, 90, 80, 30]] },
    { ...base, id: '5S', input: '5S', guard: 'mid', hitboxes: [[0, 60, 90, 260]] },
    { ...base, id: '2S', input: '2S', guard: 'mid', hitboxes: [[0, 60, 90, 260]], airBlockable: false },
    { ...base, id: '2H', input: '2H', guard: 'low', knockdown: true, hitboxes: [[0, 0, 80, 30]] },
    { ...base, id: '2M', input: '2M', startup: 3, active: 6, recovery: 6, hitstop: 0, damage: 100, pushbackHit: 0,
      hitboxes: [[0, 90, 80, 30]], timeline: [{ at: 5, hit: [[0, 90, 80, 30]] }] },
    { ...base, id: 'armor', input: 'j.S', stance: 'stand', startup: 20, active: 2, recovery: 5, timeline: [{ from: 0, to: 15, armor: 1 }] },
    { ...base, id: 'slow', input: 'j.H', stance: 'stand', startup: 20, active: 2, recovery: 5, hitboxes: [[0, 90, 10, 10]] },
    { ...base, id: 'clashy', input: 'j.M', stance: 'stand', startup: 3, active: 3, recovery: 6, hitboxes: [[60, 100, 40, 20]],
      hurtboxes: [[-10, 0, 20, 160]] },
    { ...base, id: '6H', input: '6H', startup: 2, active: 2, recovery: 20, damage: 1000, pushbackHit: 50,
      throwboxes: [[10, 20, 55, 120]], throwDistance: 70 },
    { ...base, id: '4H', input: '4H', startup: 2, active: 2, recovery: 20, damage: 1000, pushbackHit: 50,
      throwboxes: [[10, 20, 55, 120]], throwDistance: 70, throwSwap: true },
  ],
}, SYSTEM);
const W = loadWorld(T, T);
const HALF = W.battle.halfWidthUnits;

/** A game with both fighters placed (pixels). P1 faces right, P2 faces left unless they cross. */
function setup(x1 = -50, x2 = 50) {
  const g = createGame(W);
  g.players[0].x = px(x1);
  g.players[1].x = px(x2);
  g.players[0].facing = x1 <= x2 ? 1 : -1;
  g.players[1].facing = -g.players[0].facing;
  return g;
}

/** Put a fighter in `state` so its NEXT frame is `frame`. */
function arrange(g, i, state, frame = 0) {
  const p = g.players[i];
  enterState(p, W.chars[i], state);
  p.frame = frame - 1;
}

const back2 = RAW.RIGHT; // P2 (on the right) holding back
const down2 = RAW.DOWN | RAW.RIGHT; // P2 crouch-blocking
const go = (g, n, raw = [0, 0]) => { for (let i = 0; i < n; i++) step(g, raw, W); };

/** P1 starts a move whose first active frame lands on the next step; P2 holds `raw2`. */
function strike(g, move, raw2 = 0) {
  arrange(g, 0, move, T.states[move].move.startup - 1);
  step(g, [0, raw2], W);
}

// ---------- Boxes ----------

test('boxes are in character space and flip with facing', () => {
  const p = { x: px(100), y: 0, facing: 1 };
  assert.deepEqual(worldBox(p, [px(10), 0, px(50), px(20)]), [px(110), 0, px(160), px(20)]);
  p.facing = -1;
  assert.deepEqual(worldBox(p, [px(10), 0, px(50), px(20)]), [px(40), 0, px(90), px(20)]);
});

// ---------- Hits ----------

test('a hit: damage, hitstop on both, hitstun, contact for cancels', () => {
  const g = setup();
  strike(g, '5L');
  const [a, d] = g.players;
  assert.equal(d.state, 'hitStand');
  assert.equal(d.health, 10000 - 500);
  assert.equal(a.hitstop, 8);
  assert.equal(d.hitstop, 8);
  assert.equal(a.contact, CONTACT.HIT);
  assert.deepEqual(g.cues.map((c) => c.type), ['hit']);
});

test('hitstop freezes both fighters; hitstun runs after it, for exactly its length', () => {
  const g = setup();
  strike(g, '5L');
  const [a, d] = g.players;
  const aFrame = a.frame;
  go(g, 8);
  assert.equal(a.frame, aFrame, 'attacker frozen for 8 frames');
  assert.equal(d.stun, 12, 'hitstun has not started');
  let stunned = 0;
  while (d.state === 'hitStand') { step(g, [0, 0], W); if (d.state === 'hitStand') stunned++; }
  assert.equal(stunned, 12, 'exactly 12 frames of hitstun, acting on the 13th');
});

test('a move hits once per hit, multi-hit moves hit again', () => {
  const g = setup();
  arrange(g, 0, '2M', 2);
  go(g, 8);
  const C = W.combo;
  const second = Math.trunc((100 * Math.trunc((10000 * C.comboProration) / 10000)) / 10000);
  assert.equal(g.players[1].health, 10000 - 100 - second, 'two hits: 100, then 100 after one hit of combo proration');
});

// ---------- Blocking ----------

test('block rules per guard type', () => {
  const cases = [
    ['5L', back2, 'blockStand'], ['5L', down2, 'blockCrouch'], // mid: either
    ['5M', back2, 'blockStand'], ['5M', down2, 'hitCrouch'], // high: stand only
    ['2L', down2, 'blockCrouch'], ['2L', back2, 'hitStand'], // low: crouch only
    ['5H', back2, 'hitStand'], ['5H', down2, 'hitCrouch'], // unblockable
    ['5L', 0, 'hitStand'], // not holding back
  ];
  for (const [move, raw, want] of cases) {
    const g = setup();
    if (raw === down2) arrange(g, 1, 'crouch', 1);
    strike(g, move, raw);
    assert.equal(g.players[1].state, want, `${move} vs ${raw === back2 ? 'stand block' : raw ? 'crouch block' : 'no block'}`);
  }
});

test('blocking: blockstun, no damage without chip, contact = block, block pushback', () => {
  const g = setup();
  strike(g, '5L', back2);
  const [a, d] = g.players;
  assert.equal(d.stun, 8);
  assert.equal(d.health, 10000);
  assert.equal(a.contact, CONTACT.BLOCK);
  assert.equal(d.slide, px(40));
});

test('air blocking: allowed by default, refused when the move says so', () => {
  for (const [move, want] of [['5S', 'blockAir'], ['2S', 'hitAir']]) {
    const g = setup();
    arrange(g, 1, 'fall', 1);
    g.players[1].y = px(100);
    strike(g, move, back2);
    assert.equal(g.players[1].state, want, move);
  }
});

test('air hits launch the defender; landing from hitstun is a knockdown', () => {
  const g = setup();
  arrange(g, 1, 'fall', 1);
  g.players[1].y = px(100);
  strike(g, '5S');
  const d = g.players[1];
  assert.equal(d.state, 'hitAir');
  assert.ok(d.vx > 0, 'knocked away from the attacker');
  go(g, 200);
  assert.ok(['knockdown', 'wakeup', 'idle'].includes(d.state));
  assert.equal(d.y, 0);
});

test('knockdown moves knock a standing opponent down', () => {
  const g = setup();
  strike(g, '2H');
  assert.equal(g.players[1].state, 'knockdown');
});

// ---------- Counter hit, clash, trade, armor ----------

// A counter hit used to add 4 frames of hitstun. The owner's universal systems spec (section 10) made it +20%
// (tests/witness-link.test.js has the full set, with Witness counters).
test('counter hit: hitting a fighter mid-move adds hitstun and hitstop', () => {
  const g = setup();
  arrange(g, 1, 'slow', 3); // P2 in the startup of a slow move: counter-hit state
  strike(g, '5L');
  const d = g.players[1];
  assert.equal(g.cues[0].type, 'counter');
  assert.equal(d.stun, pct(12, W.sys.counter.hitstunPct));
  assert.equal(d.hitstop, 8 + W.sys.counter.hitstopAdd);
});

test('clash: hitboxes meet, neither reaches a hurtbox', () => {
  const g = setup(-80, 80);
  arrange(g, 0, 'clashy', 2);
  arrange(g, 1, 'clashy', 2);
  step(g, [0, 0], W);
  const [a, b] = g.players;
  assert.deepEqual(g.cues.map((c) => c.type), ['clash']);
  assert.equal(a.contact, CONTACT.CLASH);
  assert.equal(b.contact, CONTACT.CLASH);
  assert.equal(a.hitstop, W.battle.clash.hitstop);
  assert.equal(a.health + b.health, 20000, 'no damage');
});

test('trade: both hit on the same frame, both take damage and freeze together', () => {
  const g = setup();
  arrange(g, 0, '5L', 2);
  arrange(g, 1, '5L', 2);
  step(g, [0, 0], W);
  const [a, b] = g.players;
  assert.equal(a.health, 10000 - 500);
  assert.equal(b.health, 10000 - 500);
  assert.equal(a.hitstop, b.hitstop);
  assert.ok(['counter', 'hit'].includes(g.cues[0].type));
});

test('armor absorbs one hit: damage taken, no hitstun, the move continues', () => {
  const g = setup();
  arrange(g, 1, 'armor', 3);
  strike(g, '5L');
  const d = g.players[1];
  assert.equal(d.state, 'armor');
  assert.equal(d.health, 10000 - 500);
  assert.equal(g.cues[0].type, 'armor');
  go(g, 9); // hitstop, then the next hit
  arrange(g, 0, '5L', 2);
  step(g, [0, 0], W);
  assert.equal(d.state, 'hitStand', 'the armor only takes one hit');
});

// ---------- Throws ----------

test('throws: connect, break window, then damage and knockdown', () => {
  const g = setup(-30, 30);
  arrange(g, 0, '6H', 1);
  step(g, [0, 0], W);
  const [a, d] = g.players;
  assert.equal(a.state, 'throwHold');
  assert.equal(d.state, 'thrown');
  go(g, T.stats.throwBreak + 1);
  assert.equal(d.health, 10000 - 1000);
  assert.equal(d.state, 'knockdown');
  assert.equal(a.state, 'throwFinish');
});

test('throw break: pressing H inside the window breaks it', () => {
  const g = setup(-30, 30);
  arrange(g, 0, '6H', 1);
  step(g, [0, 0], W);
  go(g, 3);
  step(g, [0, RAW.H], W);
  assert.equal(g.players[0].state, 'throwTech');
  assert.equal(g.players[1].state, 'throwTech');
  assert.equal(g.players[1].health, 10000);
});

test('back throw swaps sides', () => {
  const g = setup(-30, 30);
  arrange(g, 0, '4H', 1);
  step(g, [0, 0], W);
  go(g, T.stats.throwBreak + 1);
  assert.ok(g.players[1].x < g.players[0].x, 'P2 ends up on the left');
});

test('two throws on the same frame tech; fighters in blockstun cannot be thrown', () => {
  const g = setup(-30, 30);
  arrange(g, 0, '6H', 1);
  arrange(g, 1, '6H', 1);
  step(g, [0, 0], W);
  assert.equal(g.players[0].state, 'throwTech');
  const g2 = setup(-30, 30);
  arrange(g2, 1, 'blockStand', 1);
  g2.players[1].stun = 10;
  arrange(g2, 0, '6H', 1);
  step(g2, [0, 0], W);
  assert.equal(g2.players[1].state, 'blockStand');
});

test('a throw beats a strike on the same frame', () => {
  const g = setup(-30, 30);
  arrange(g, 0, '6H', 1);
  arrange(g, 1, '5L', 2);
  step(g, [0, 0], W);
  assert.equal(g.players[1].state, 'thrown');
  assert.equal(g.players[0].health, 10000);
});

// ---------- Pushback and corners ----------

test('pushback slides over several frames, fastest first, and totals exactly', () => {
  const g = setup();
  strike(g, '5L');
  const d = g.players[1];
  const x0 = d.x;
  go(g, 8); // hitstop
  const steps = [];
  let last = d.x;
  for (let i = 0; i < W.battle.pushbackFrames; i++) { step(g, [0, 0], W); steps.push(d.x - last); last = d.x; }
  assert.equal(d.x - x0, px(30));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] <= steps[i - 1], `slowing down: ${steps}`);
  assert.ok(steps.every((s) => s > 0));
});

test('corner pushback: a cornered defender stays, the attacker slides back', () => {
  const wall = W.battle.halfWidthUnits / 100;
  const g = setup(wall - 22 - 100, wall - 22);
  const [a, d] = g.players;
  assert.ok(cornered(d, T, W, 1));
  const ax = a.x;
  const dx = d.x;
  strike(g, '5L');
  go(g, 8 + W.battle.pushbackFrames);
  assert.equal(d.x, dx, 'defender did not move');
  assert.equal(a.x, ax - px(20), 'attacker slid back by its self pushback');
});

test('pushboxes keep fighters apart; nobody walks through, even in the corner', () => {
  const g = setup(-100, 100);
  go(g, 120, [RAW.RIGHT, 0]); // P1 walks into P2 and pushes
  const [a, b] = g.players;
  assert.ok(a.x < b.x);
  assert.ok(b.x - a.x >= px(44), `apart: ${(b.x - a.x) / 100}px`);
  go(g, 600, [RAW.RIGHT, 0]); // push P2 all the way into the corner
  assert.ok(b.x - a.x >= px(44));
  assert.ok(b.x + px(22) <= HALF, 'P2 stays inside the wall');
  assert.ok(cornered(b, T, W, 1));
});

test('a slide that hits the wall halfway passes the rest to the attacker', () => {
  const wall = W.battle.halfWidthUnits / 100;
  const g = setup(wall - 22 - 110, wall - 22 - 10);
  const [a, d] = g.players;
  const ax = a.x;
  strike(g, '5L');
  go(g, 8 + W.battle.pushbackFrames);
  assert.equal(d.x, HALF - px(22), 'defender reached the wall');
  assert.equal(ax - a.x, px(30) - px(10), 'the attacker took the 20 px the wall refused');
});

// ---------- Guts ----------

test('guts: less damage taken at low health, per the table', () => {
  const B = W.battle;
  assert.equal(gutsDamage(1000, 10000, 10000, B), 1000);
  assert.equal(gutsDamage(1000, 5000, 10000, B), 900);
  assert.equal(gutsDamage(1000, 3000, 10000, B), 800);
  assert.equal(gutsDamage(1000, 1500, 10000, B), 700);
  assert.equal(gutsDamage(1000, 500, 10000, B), 600);
  assert.equal(gutsDamage(1, 500, 10000, B), 1, 'never below the minimum');
  const g = setup();
  g.players[1].health = 3000;
  strike(g, '5L');
  assert.equal(g.players[1].health, 3000 - 400, '500 at 80%');
});

test('no first-mover advantage: a mirrored match plays out mirrored', () => {
  // Same inputs mirrored left-right for P1 and P2, from mirrored positions.
  const mirrorRaw = (r) => (r & ~3) | ((r & 1) << 1) | ((r & 2) >> 1);
  const g = setup(-60, 60);
  let s = 5;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < 3000; i++) {
    const r = rnd() & 255;
    step(g, [r, mirrorRaw(r)], W);
    const [a, b] = g.players;
    assert.equal(a.x, -b.x, `frame ${i}: x mirrored`);
    assert.equal(a.health, b.health, `frame ${i}: health equal`);
    assert.equal(a.state, b.state, `frame ${i}: same state`);
  }
});
