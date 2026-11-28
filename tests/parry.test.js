// The parry (owner, Nov 28): an experiment in Vow's place on M+H (systems.json guardButton "parry"). Pressed from
// neutral, it catches a strike landing in its window: no damage, the attacker freezes, the defender is free at once
// (to punish, block, or parry the next hit) and gains a little Devotion. A whiff is stuck and cannot block.
// Throws, supers and pierce moves go through. Tested on a small made-up character, so the cast can be retuned freely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadJSON, lcg, script, SYSTEM, VOW_SYSTEM } from './helpers.js';

const RULES = loadJSON('data/system/systems.json');
const P = RULES.parry;
const BIG = [[0, 0, 300, 300]];
const base = { startup: 4, active: 2, recovery: 8, damage: 500, hitstun: 20, untech: 20, blockstun: 10, hitstop: 8,
  pushbackHit: 0, pushbackBlock: 0, selfPushback: 0, hitboxes: BIG };
const file = { engine: 'Toska', version: 2, character: { id: 'p', stats: {} },
  gatlings: { '5L': ['5M'] },
  projectiles: { ball: { speed: 10, spawn: [40, 60], hitbox: [-20, -20, 40, 40], lifetime: 200, damage: 300, hitstun: 20, hitstop: 4 } },
  moves: [
    { ...base, id: '5L', input: '5L' },
    { ...base, id: '5M', input: '5M', damage: 800 },
    { ...base, id: 'piercer', input: '2S', damage: 700, pierce: true },
    { ...base, id: 'super', input: '236236H', kind: 'super', damage: 900 },
    { ...base, id: 'grab', input: '6H', startup: 2, active: 2, recovery: 20, damage: 1000, hitboxes: undefined,
      throwboxes: [[10, 20, 200, 120]], throwDistance: 70 },
    { ...base, id: 'throwBall', input: '214L', startup: 6, active: 0, recovery: 30, hitboxes: undefined, timeline: [{ at: 6, spawn: 'ball' }] },
  ] };
const T = compileCharacter(file, SYSTEM);
const W = loadWorld(T, T);
const MH = RAW.M | RAW.H;
const BACK = RAW.RIGHT; // P2 stands on the right: holding right is holding back

function setup() {
  const g = createGame(W);
  g.players[0].x = px(-50);
  g.players[1].x = px(50);
  return g;
}
const go = (g, n, raw = [0, 0]) => { for (let i = 0; i < n; i++) step(g, raw, W); };
/** P1's `move` lands on the next step (P2 holds `raw2`). Returns that step's cue types. */
function strike(g, move = '5L', raw2 = 0) {
  const a = g.players[0];
  enterState(a, W.chars[0], move);
  a.frame = T.states[move].move.startup - 2;
  step(g, [0, raw2], W);
  return g.cues.map((c) => c.type);
}
/** P2 presses M+H, then waits `k` frames: the strike that lands next meets the parry's frame k + 1. */
function parrying(k) {
  const g = setup();
  step(g, [0, MH], W);
  go(g, k);
  return g;
}

test('the rules: M+H is the parry, with its numbers in the systems file', () => {
  assert.equal(RULES.guardButton, 'parry');
  assert.deepEqual([P.startup, P.window, P.recovery, P.freeze, P.successFrames, P.devotion, P.projectiles], [2, 6, 20, 12, 8, 10, true]);
  assert.ok(W.sys.parry.enabled);
  assert.ok(!W.sys.vow.enabled, 'Vow is off while the parry has M+H');
  const cmd = T.commands.find((c) => c.buttons === 'MH');
  assert.equal(cmd.move, 'parry_start');
  assert.ok(!T.commands.some((c) => c.move === 'vow_start'), 'Vow has no input');
  // 2 frames before the window, 6 frames of window, 20 stuck after it.
  const st = T.states.parry_start;
  assert.deepEqual(st.frames.map((f, i) => (f.catch ? i : null)).filter((i) => i !== null), [2, 3, 4, 5, 6, 7]);
  assert.equal(st.duration, 27);
});

test('a hit inside the window is parried: no damage, no stun, the attacker frozen 12 frames, Devotion for the parry', () => {
  for (let k = 1; k <= 6; k++) {
    const g = parrying(k);
    const d = g.players[1];
    const cues = strike(g);
    assert.ok(cues.includes('parry'), `frame ${k + 1}: ${cues}`);
    assert.equal(d.health, T.stats.health);
    assert.equal(d.state, 'parry_success');
    assert.equal(d.stun, 0);
    assert.equal(g.players[0].hitstop, P.freeze);
    assert.equal(d.meter, P.devotion * SYSTEM.meter.unit);
    assert.equal(d.combo, null, 'no combo started');
  }
});

test('outside the window it is a hit: too early, and too late (a whiffed parry is hit as a counter in its recovery)', () => {
  for (const k of [0, 7, 12, 20]) {
    const g = parrying(k);
    const cues = strike(g);
    assert.ok(!cues.includes('parry'), `k ${k}: ${cues}`);
    assert.ok(g.players[1].health < T.stats.health, `k ${k}: hurt`);
  }
  assert.ok(strike(parrying(12)).includes('witness'), 'the stuck recovery is a Witness counter');
});

test('a whiffed parry cannot block: holding back during its recovery still gets hit', () => {
  const g = setup();
  step(g, [0, MH], W);
  go(g, 10, [0, BACK]);
  assert.equal(g.players[1].state, 'parry_start');
  strike(g, '5L', BACK);
  assert.ok(g.players[1].health < T.stats.health);
  // The parry lasts its 27 frames, then the fighter is back in neutral.
  const g2 = setup();
  step(g2, [0, MH], W);
  go(g2, 26);
  assert.equal(g2.players[1].state, 'parry_start');
  go(g2, 1);
  assert.equal(g2.players[1].state, 'idle');
});

test('after a parry the defender is free while the attacker is frozen: their 5L punishes', () => {
  const g = parrying(3);
  strike(g);
  const a = g.players[0], d = g.players[1];
  assert.ok(T.states.parry_success.free);
  step(g, [0, RAW.L], W);
  assert.equal(d.state, '5L', 'acts at once');
  go(g, 6);
  assert.ok(a.health < T.stats.health, 'the punish lands');
  assert.ok(g.players[0].state.startsWith('hit'), `the attacker is in ${a.state}`);
});

test('a parry can be followed by another: both hits of a two-hit attack are parried', () => {
  const g = parrying(3);
  strike(g);
  assert.equal(g.players[1].state, 'parry_success');
  go(g, P.freeze); // a real second hit comes after the freeze: the attacker is stopped until then
  step(g, [0, MH], W);
  assert.equal(g.players[1].state, 'parry_start', 'parries again straight out of the first');
  go(g, 3);
  const cues = strike(g, '5M');
  assert.ok(cues.includes('parry'), cues.join(','));
  assert.equal(g.players[1].health, T.stats.health);
  assert.equal(g.players[1].meter, 2 * P.devotion * SYSTEM.meter.unit);
});

test('it starts from neutral only: a normal cancelled into mid-string is not turned into a parry', () => {
  // 5L, 5M cancelled from it, then H two frames into the 5M: from neutral that late H would turn the 5M into the
  // parry; out of a cancel it must not. (No hitstop on these two, so the cancel comes the moment M is pressed.)
  const Q = compileCharacter({ ...file, moves: file.moves.map((m) => (m.id === '5L' || m.id === '5M' ? { ...m, hitstop: 0 } : m)) }, SYSTEM);
  const wq = loadWorld(Q, Q);
  const g = createGame(wq);
  g.players[0].x = px(-50);
  g.players[1].x = px(50);
  const seen = [];
  for (const raw of script('5+L 5 5 5+M 5 5 5+H 5*20')) { step(g, [raw, 0], wq); if (seen.at(-1) !== g.players[0].state) seen.push(g.players[0].state); }
  assert.ok(seen.includes('5M') && !seen.includes('parry_start'), seen.join(','));
  // From neutral the same M then H is the parry (the second button may come a frame late).
  const g2 = setup();
  step(g2, [RAW.M, 0], W);
  step(g2, [MH, 0], W);
  assert.equal(g2.players[0].state, 'parry_start');
});

test('throws, supers and moves flagged pierce go through the parry', () => {
  for (const move of ['super', 'piercer']) {
    const g = parrying(3);
    const cues = strike(g, move);
    assert.ok(!cues.includes('parry'), `${move}: ${cues}`);
    assert.ok(g.players[1].health < T.stats.health, `${move} hurts`);
  }
  const g = parrying(3);
  g.players[0].x = px(0);
  g.players[1].x = px(60);
  step(g, [RAW.RIGHT | RAW.H, 0], W);
  go(g, 40);
  assert.ok(g.players[1].health < T.stats.health, 'the throw lands');
});

test('a projectile is parried too: it is used up and does nothing', () => {
  const g = setup();
  g.players[0].x = px(-300);
  g.players[1].x = px(200);
  const a = g.players[0], d = g.players[1];
  enterState(a, W.chars[0], 'throwBall');
  let parried = false;
  for (let i = 0; i < 80 && !parried; i++) {
    // P2 presses M+H as the ball comes close.
    const ball = g.projectiles?.[0];
    const near = ball && Math.abs(ball.x - d.x) < px(90) && d.state === 'idle';
    step(g, [0, near ? MH : 0], W);
    if (g.cues.some((c) => c.type === 'parry')) parried = true;
  }
  assert.ok(parried, 'the ball was parried');
  assert.equal(d.health, T.stats.health);
  assert.equal((g.projectiles || []).length, 0, 'the ball is gone');
});

test('with guardButton "vow", M+H is Vow again and there is no parry', () => {
  const V = compileCharacter(file, VOW_SYSTEM);
  const w = loadWorld(V, V, { systems: VOW_SYSTEM.systems });
  assert.ok(w.sys.vow.enabled && !w.sys.parry.enabled);
  assert.equal(V.commands.find((c) => c.buttons === 'MH').move, 'vow_start');
  assert.ok(!V.states.parry_start);
});

test('the parry survives rollback: 3000 frames of fighting full of parries, rewinding 8 frames every frame', () => {
  const rnd = lcg(28);
  const held = [0, 0], left = [0, 0];
  let parries = 0;
  const r = runSyncTest(W, (g) => {
    parries += g.cues.filter((c) => c.type === 'parry').length;
    return [0, 1].map((i) => {
      if (left[i]-- <= 0) {
        const roll = rnd() % 10;
        held[i] = roll < 3 ? MH : roll < 5 ? RAW.L : roll < 6 ? RAW.M : roll < 7 ? (i ? RAW.LEFT : RAW.RIGHT) : roll < 8 ? RAW.H : 0;
        left[i] = 1 + (rnd() % 6);
      }
      return held[i];
    });
  }, { frames: 3000, distance: 8 });
  assert.ok(r.ok, `desync at frame ${r.failFrame}: ${r.diff}`);
  assert.ok(parries >= 5, `${parries} parries`);
});
