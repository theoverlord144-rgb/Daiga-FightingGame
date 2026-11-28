// Universal systems, section 5 (docs/specs/universal-systems.md): Vow (M+H) and Debt. M+H is the parry for now
// (systems.json guardButton, Nov 28); these tests switch Vow back on, so it stays whole for when it returns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px, pct } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadJSON, lcg, VOW_SYSTEM as SYSTEM } from './helpers.js';

const RULES = loadJSON('data/system/systems.json').vow;
const BIG = [[0, 0, 300, 300]];
const base = { startup: 4, active: 2, recovery: 8, damage: 500, hitstun: 20, untech: 20, blockstun: 10, hitstop: 8,
  pushbackHit: 0, pushbackBlock: 0, selfPushback: 0, hitboxes: BIG };
const T = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'v', stats: {} },
  gatlings: { '5L': ['5M'] },
  projectiles: { ball: { speed: 10, spawn: [40, 60], hitbox: [-20, -20, 40, 40], lifetime: 200, damage: 300, hitstun: 20, hitstop: 4 } },
  moves: [
    { ...base, id: '5L', input: '5L' },
    { ...base, id: '5M', input: '5M', damage: 800 },
    { ...base, id: 'whiff', input: '2L', startup: 6, active: 4, recovery: 30, hitboxes: [[900, 0, 10, 10]] },
    { ...base, id: 'piercer', input: '2S', damage: 700, pierce: true },
    { ...base, id: 'super', input: '236236H', kind: 'super', damage: 900 },
    { ...base, id: 'grab', input: '6H', startup: 2, active: 2, recovery: 20, damage: 1000, hitboxes: undefined,
      throwboxes: [[10, 20, 200, 120]], throwDistance: 70 },
    { ...base, id: 'throwBall', input: '214L', startup: 6, active: 0, recovery: 30, hitboxes: undefined, timeline: [{ at: 6, spawn: 'ball' }] },
  ] }, SYSTEM);
const W = loadWorld(T, T, { systems: SYSTEM.systems });
const V = W.sys.vow;
const D = SYSTEM.meter.unit;
const MH = RAW.M | RAW.H;

function setup(x1 = -50, x2 = 50) {
  const g = createGame(W);
  g.players[0].x = px(x1);
  g.players[1].x = px(x2);
  return g;
}
function arrange(g, i, state, frame = 0) {
  const p = g.players[i];
  enterState(p, W.chars[i], state);
  p.frame = frame - 1;
}
const go = (g, n, raw = [0, 0]) => { for (let i = 0; i < n; i++) step(g, raw, W); };
/** P2 holds Vow (the guard is up) in a fresh game. */
function guarding(x1 = -50, x2 = 50) {
  const g = setup(x1, x2);
  go(g, 8, [0, MH]);
  assert.equal(g.players[1].state, 'vow_hold');
  return g;
}
/** P1's `move` lands on the next step (P2 keeps holding `raw2`). Returns that step's cues. */
function strike(g, move = '5L', raw2 = MH) {
  arrange(g, 0, move, T.states[move].move.startup - 1);
  step(g, [0, raw2], W);
  return g.cues.slice();
}
/** P1 holds M+H for exactly `held` frames, then lets go. Returns the strike that comes out. */
function release(g, held) {
  const a = g.players[0];
  for (let i = 0; i < held; i++) step(g, [MH, 0], W);
  for (let i = 0; i < 5 && !a.state.startsWith('vow_strike'); i++) step(g, [0, 0], W);
  return a.state;
}

test('the rules file holds the spec\'s numbers', () => {
  assert.deepEqual([RULES.startup, RULES.maxHold, RULES.absorbHitstop, RULES.strikeAt, RULES.fullAt], [4, 60, 6, 20, 45]);
  assert.deepEqual([RULES.cancelCost, RULES.dashCost, RULES.debtDrainFrames, RULES.debtPenalty, RULES.crumpleStun, RULES.witnessWindow], [100, 100, 180, 0.2, 45, 20]);
  assert.deepEqual(['vow_strike_quick', 'vow_strike', 'vow_strike_full'].map((id) => RULES.moves[id].startup), [10, 14, 16]);
  assert.equal(RULES.moves.vow_strike_full.guard, 'unblockable');
  assert.ok(!RULES.moves.vow_strike_quick.crumple && RULES.moves.vow_strike.crumple && RULES.moves.vow_strike_full.crumple);
});

test('M+H from neutral: the guard is up in 4 frames, and it costs nothing', () => {
  const g = setup();
  const p = g.players[0];
  p.meter = 250 * D;
  step(g, [MH, 0], W);
  assert.equal(p.state, 'vow_start');
  go(g, 3, [MH, 0]);
  assert.equal(p.state, 'vow_start', 'frames 1 to 4: not up yet');
  step(g, [MH, 0], W);
  assert.equal(p.state, 'vow_hold', 'up after 4 frames');
  assert.equal(p.meter, 250 * D);
  // M+H while holding a direction, and with the two presses a frame apart, still gives Vow.
  for (const frames of [[RAW.RIGHT | MH], [RAW.LEFT | MH], [RAW.M, MH]]) {
    const g2 = setup();
    for (const f of frames) step(g2, [f, 0], W);
    go(g2, 3, [MH, 0]);
    assert.ok(g2.players[0].state.startsWith('vow_'), `got ${g2.players[0].state}`);
  }
});

test('a hit before the guard is up is a normal hit', () => {
  const g = setup();
  step(g, [0, MH], W);
  strike(g);
  assert.equal(g.players[1].state, 'hitStand');
  assert.equal(g.players[1].debt, 0);
});

test('in Vow: no blocking, walking or jumping; holding keeps the guard', () => {
  const g = guarding();
  const p = g.players[1];
  const x = p.x;
  for (const dir of [RAW.RIGHT, RAW.LEFT, RAW.UP, RAW.DOWN, RAW.UP | RAW.LEFT]) {
    go(g, 4, [0, MH | dir]);
    assert.equal(p.state, 'vow_hold');
    assert.equal(p.x, x);
    assert.equal(p.y, 0);
  }
});

test('absorb: no hitstun, 6 frames of hitstop, the damage becomes Debt instead of being taken', () => {
  const g = guarding();
  const [a, d] = g.players;
  const cues = strike(g);
  assert.equal(d.state, 'vow_hold');
  assert.equal(d.stun, 0);
  assert.equal(d.hitstop, 6);
  assert.equal(a.hitstop, 6);
  assert.equal(d.health, T.stats.health, 'no damage taken');
  assert.equal(d.debt, 500);
  assert.equal(d.combo, null, 'not a combo');
  const cue = cues.find((c) => c.type === 'absorb');
  assert.deepEqual([cue.damage, cue.debt], [500, 500]);
  assert.ok(!cues.some((c) => c.type === 'hit' || c.type === 'block'));
  // Every hit that lands is absorbed, and the Debt adds up. It does not drain while the guard is held.
  go(g, 20, [0, MH]);
  assert.equal(d.debt, 500);
  strike(g, '5M');
  assert.equal(d.debt, 1300);
  assert.equal(d.health, T.stats.health);
  assert.equal(d.state, 'vow_hold');
});

test('absorb builds Devotion: the attacker as from a blocked hit, the guard half of what taking it would give', () => {
  const g = guarding();
  const [a, d] = g.players;
  strike(g);
  // 500 of 10000 health = 5%. Attacker: 1 per 1% blocked. Guard: 2 per 1%, halved by Vow.
  assert.equal(a.meter, 5 * D);
  assert.equal(d.meter, 5 * D);
});

test('a projectile is absorbed too', () => {
  const g = guarding(-200, 50);
  const d = g.players[1];
  arrange(g, 0, 'throwBall', 5);
  let seen = false;
  for (let i = 0; i < 60 && !seen; i++) { step(g, [0, MH], W); seen = g.cues.some((c) => c.type === 'absorb'); }
  assert.ok(seen);
  assert.equal(d.debt, 300);
  assert.equal(d.health, T.stats.health);
  assert.equal(g.projectiles.length, 0, 'the projectile is spent');
});

test('release: the strike depends on how long M+H was held (under 20, 20 to 44, 45 and up, automatic at 60)', () => {
  for (const [held, want] of [[1, 'vow_strike_quick'], [6, 'vow_strike_quick'], [19, 'vow_strike_quick'], [20, 'vow_strike'], [44, 'vow_strike'],
    [45, 'vow_strike_full'], [59, 'vow_strike_full']]) {
    assert.equal(release(setup(-400, 400), held), want, `held ${held} frames`);
  }
  // Never letting go: the full strike comes out by itself at 60 frames.
  const g = setup(-400, 400);
  const a = g.players[0];
  go(g, 60, [MH, 0]);
  assert.equal(a.state, 'vow_hold', 'frame 60: still holding');
  step(g, [MH, 0], W);
  assert.equal(a.state, 'vow_strike_full');
  // Letting go of only one of the two buttons keeps the guard.
  const g2 = setup(-400, 400);
  go(g2, 8, [MH, 0]);
  go(g2, 5, [RAW.M, 0]);
  assert.equal(g2.players[0].state, 'vow_hold');
});

/** P1 releases a strike after `held` frames next to P2 (who holds `raw2`); runs until it connects or ends. */
function landStrike(held, raw2 = 0, g = setup(-40, 40)) {
  const a = g.players[0];
  for (let i = 0; i < held; i++) step(g, [MH, raw2], W);
  const cues = [];
  for (let i = 0; i < 70; i++) {
    step(g, [0, raw2], W);
    cues.push(...g.cues);
    if (g.cues.some((c) => ['hit', 'counter', 'witness', 'block'].includes(c.type))) break;
    if (a.state === 'idle') break;
  }
  return { g, cues, kind: cues.find((c) => ['hit', 'counter', 'witness', 'block'].includes(c.type))?.type };
}

test('quick strike: startup 10, knocks back, no crumple', () => {
  assert.equal(T.states.vow_strike_quick.move.startup, 10);
  const { g, kind } = landStrike(5);
  const d = g.players[1];
  assert.equal(kind, 'hit');
  assert.equal(d.state, 'hitStand');
  assert.equal(d.health, T.stats.health - 600);
  assert.ok(d.slideLeft !== 0 || d.slide !== 0, 'pushed back');
});

test('strike (held 20 to 44): startup 14, crumple for 45 frames, and the crumple can be comboed', () => {
  assert.equal(T.states.vow_strike.move.startup, 14);
  const { g, kind } = landStrike(30);
  const [a, d] = g.players;
  assert.equal(kind, 'hit');
  assert.equal(d.state, 'crumple');
  assert.equal(d.stun, 45);
  assert.equal(d.combo.hits, 1);
  // It can be blocked.
  assert.equal(landStrike(30, RAW.DOWN | RAW.RIGHT).kind, 'block');
  // Combo-able: after the strike recovers, the next hit continues the same combo.
  for (let i = 0; i < 60 && a.state !== 'idle'; i++) step(g, [0, 0], W);
  assert.equal(a.state, 'idle', 'the striker recovers first');
  assert.equal(d.state, 'crumple', 'they are still crumpled');
  arrange(g, 0, '5L', 3);
  step(g, [0, 0], W);
  assert.equal(d.combo.hits, 2);
  // Left alone, the crumple ends and they stand up.
  const solo = landStrike(30).g;
  go(solo, 80);
  assert.equal(solo.players[1].state, 'idle');
  assert.equal(solo.players[1].combo, null);
});

test('full strike (held 45 or more): startup 16, crumple, and it cannot be blocked', () => {
  assert.equal(T.states.vow_strike_full.move.startup, 16);
  const { g, kind } = landStrike(50, RAW.DOWN | RAW.RIGHT);
  assert.equal(kind, 'hit', 'holding back does not block it');
  assert.equal(g.players[1].state, 'crumple');
  assert.equal(g.players[1].stun, 45);
  assert.equal(g.players[1].health, T.stats.health - 1200);
});

test('a hit in the air from a crumpling strike launches like any air hit, no crumple', () => {
  const g = setup(-40, 40);
  const d = g.players[1];
  for (let i = 0; i < 30; i++) step(g, [MH, 0], W);
  for (let i = 0; i < 40 && !g.cues.some((c) => c.type === 'hit'); i++) {
    d.y = px(40); d.vy = 0; enterState(d, T, 'jump');
    d.y = px(40);
    step(g, [0, 0], W);
  }
  assert.notEqual(d.state, 'crumple');
  assert.ok(d.combo);
});

test('throws, supers and moves flagged pierce go through Vow at full damage and make all Debt come due', () => {
  for (const [move, damage] of [['piercer', 700], ['super', 900]]) {
    const g = guarding();
    const d = g.players[1];
    strike(g); // 500 of Debt
    go(g, 10, [0, MH]);
    const cues = strike(g, move);
    assert.notEqual(d.state, 'vow_hold', `${move} hit through`);
    assert.equal(d.health, T.stats.health - damage - 600, `${move}: full damage, plus the Debt and 20% of it`);
    assert.equal(d.debt, 0);
    assert.equal(cues.find((c) => c.type === 'debt').damage, 600);
  }
  // A throw.
  const g = guarding();
  const d = g.players[1];
  strike(g);
  go(g, 10, [0, MH]);
  arrange(g, 0, 'grab', 1);
  step(g, [0, MH], W);
  assert.equal(d.state, 'thrown', 'Vow does not stop a throw');
  go(g, T.stats.throwBreak + 2);
  assert.equal(d.health, T.stats.health - 1000 - 600);
  assert.equal(d.debt, 0);
});

test('Debt: landing the strike forgives all of it', () => {
  const g = guarding(-40, 40);
  const d = g.players[1];
  strike(g);
  go(g, 10, [0, MH]);
  strike(g, '5M');
  go(g, 8, [0, MH]);
  assert.equal(d.debt, 1300);
  // P2 lets go; P1 stands there and is hit by the strike.
  let landed = false;
  for (let i = 0; i < 60 && !landed; i++) { step(g, [0, 0], W); landed = g.cues.some((c) => ['hit', 'counter', 'witness'].includes(c.type)); }
  assert.ok(landed);
  assert.equal(d.debt, 0);
  assert.equal(d.health, T.stats.health, 'the Debt was never paid');
  // A blocked strike forgives nothing.
  const g2 = guarding(-40, 40);
  strike(g2);
  let blocked = false;
  for (let i = 0; i < 60 && !blocked; i++) { step(g2, [RAW.LEFT, 0], W); blocked = g2.cues.some((c) => c.type === 'block'); }
  assert.ok(blocked);
  assert.ok(g2.players[1].debt > 0);
});

test('Debt: with no strike landed it drains to 0 over 180 frames, and costs nothing', () => {
  const g = guarding(-400, 400);
  const d = g.players[1];
  d.debt = 900;
  d.debtRate = Math.ceil(900 / 180);
  go(g, 30, [0, MH]);
  assert.equal(d.debt, 900, 'not while guarding');
  go(g, 1); // let go: the strike whiffs
  assert.ok(d.state.startsWith('vow_strike'));
  for (let i = 0; i < 80 && d.state !== 'idle'; i++) step(g, [0, 0], W);
  assert.equal(d.debt, 900, 'not during the strike either: it could still be forgiven');
  go(g, 90);
  assert.ok(d.debt > 0 && d.debt < 900, `draining: ${d.debt}`);
  assert.equal(d.debt, 900 - 90 * 5);
  go(g, 90);
  assert.equal(d.debt, 0, 'gone after 180 frames');
  go(g, 30);
  assert.equal(d.debt, 0);
  assert.equal(d.health, T.stats.health);
});

test('Debt: getting hit while any remains costs what remains plus 20%, at once', () => {
  const g = guarding(-400, 400);
  const d = g.players[1];
  d.debt = 900;
  d.debtRate = 5;
  go(g, 1);
  for (let i = 0; i < 80 && d.state !== 'idle'; i++) step(g, [0, 0], W);
  go(g, 59); // with the frame of the hit itself, 300 drained
  assert.equal(d.debt, 605);
  g.players[0].x = d.x - px(80);
  const cues = strike(g, '5L', 0);
  assert.equal(d.debt, 0);
  assert.equal(d.health, T.stats.health - 500 - 720, 'the hit, the 600 left, and 20% of it');
  assert.equal(cues.find((c) => c.type === 'debt').damage, 720);
  // A blocked hit does not make it come due.
  const g2 = guarding(-400, 400);
  const d2 = g2.players[1];
  d2.debt = 900;
  d2.debtRate = 5;
  go(g2, 1);
  for (let i = 0; i < 80 && d2.state !== 'idle'; i++) step(g2, [0, 0], W);
  g2.players[0].x = d2.x - px(80);
  strike(g2, '5L', RAW.RIGHT);
  assert.equal(d2.state, 'blockStand');
  assert.ok(d2.debt > 0);
  assert.equal(d2.health, T.stats.health);
});

test('Devotion: cancelling a normal into Vow costs 100 and needs it', () => {
  for (const [meter, works] of [[100, true], [99, false], [250, true]]) {
    const g = setup();
    const a = g.players[0];
    arrange(g, 0, '5L', 3);
    step(g, [0, 0], W); // 5L hits
    a.meter = meter * D;
    for (let i = 0; i < 14 && a.state === '5L'; i++) step(g, [MH, 0], W);
    assert.equal(a.state.startsWith('vow_'), works, `with ${meter}: ${a.state}`);
    if (works) assert.equal(a.meter, (meter - 100) * D);
    else assert.equal(a.meter, meter * D);
  }
  // On whiff there is no cancel at all.
  const g = setup(-400, 400);
  const a = g.players[0];
  a.meter = 400 * D;
  arrange(g, 0, 'whiff', 0);
  go(g, 20, [MH, 0]);
  assert.equal(a.state, 'whiff');
  assert.equal(a.meter, 400 * D);
});

test('Devotion: dashing out of Vow costs 100 and needs it', () => {
  const dash = (meter, fwd) => {
    const g = setup(-300, 300);
    const a = g.players[0];
    a.meter = meter * D;
    go(g, 8, [MH, 0]);
    const dir = fwd ? RAW.RIGHT : RAW.LEFT;
    for (const r of [MH | dir, MH, MH | dir, MH]) step(g, [r, 0], W);
    return a;
  };
  let a = dash(150, true);
  assert.equal(a.state, 'dashF');
  assert.equal(a.meter, 50 * D);
  a = dash(100, false);
  assert.equal(a.state, 'backdash');
  assert.equal(a.meter, 0);
  a = dash(99, true);
  assert.equal(a.state, 'vow_hold', 'not enough Devotion: the guard stays');
  assert.equal(a.meter, 99 * D);
});

test('the strike is a Witness counter if the opponent was in an attack within the last 20 frames', () => {
  // P2 whiffs an attack and has just recovered when the strike lands; then the same with a long wait.
  const run = (gap) => {
    const g = setup(-40, 40);
    const [a, d] = g.players;
    for (let i = 0; i < 30; i++) step(g, [MH, 0], W);
    step(g, [0, 0], W);
    assert.equal(a.state, 'vow_strike');
    // The strike lands on its 14th frame. Put P2 at the end of an attack's recovery `gap` frames before that.
    const lands = 14;
    for (let i = 1; i < lands; i++) {
      if (i === lands - 1 - gap) { arrange(g, 1, '5L', T.states['5L'].duration - 1); d.atkFrame = g.frame; enterState(d, T, 'idle'); }
      step(g, [0, 0], W);
      if (g.cues.some((c) => ['hit', 'counter', 'witness'].includes(c.type))) break;
    }
    return { type: g.cues.find((c) => ['hit', 'counter', 'witness'].includes(c.type))?.type, d };
  };
  const near = run(5);
  assert.equal(near.type, 'witness');
  assert.equal(near.d.combo.witness, 1);
  assert.equal(near.d.state, 'crumple');
  // Nothing recent: a plain hit.
  const g = setup(-40, 40);
  for (let i = 0; i < 30; i++) step(g, [MH, 0], W);
  let type;
  for (let i = 0; i < 40 && !type; i++) { step(g, [0, 0], W); type = g.cues.find((c) => ['hit', 'counter', 'witness'].includes(c.type))?.type; }
  assert.equal(type, 'hit');
  // The engine keeps the "last attack frame" itself: a real whiffed attack sets it.
  const g3 = setup(-400, 400);
  arrange(g3, 1, 'whiff', 0);
  go(g3, 12);
  assert.equal(g3.players[1].atkFrame, g3.frame);
});

test('Vow survives rollback: 6000 frames of fighting full of Vow, rewinding 8 frames every frame', () => {
  const rnd = lcg(77);
  const held = [0, 0];
  const dirs = [0, RAW.LEFT, RAW.RIGHT, RAW.RIGHT, RAW.DOWN, RAW.UP];
  let absorbs = 0, strikes = 0, debts = 0;
  const r = runSyncTest(W, (g) => {
    absorbs += g.cues.filter((c) => c.type === 'absorb').length;
    strikes += g.cues.filter((c) => c.type === 'vowrelease').length;
    debts += g.cues.filter((c) => c.type === 'debt').length;
    return [0, 1].map((i) => {
      if (held[i] > 0) { held[i]--; return MH | (rnd() % 9 === 0 ? RAW.RIGHT : 0); }
      const roll = rnd() % 100;
      if (roll < 14) { held[i] = 3 + (rnd() % 50); return MH; }
      const dir = dirs[rnd() % dirs.length];
      const b = roll < 40 ? [RAW.L, RAW.M, RAW.H, RAW.S][rnd() % 4] : 0;
      return dir | b;
    });
  }, { frames: 6000, distance: 8 });
  assert.ok(r.ok, `desync at frame ${r.failFrame}: ${r.diff}`);
  assert.ok(strikes >= 15, `Vow was released ${strikes} times`);
  assert.ok(absorbs >= 3, `${absorbs} hits were absorbed`);
  void debts;
});
