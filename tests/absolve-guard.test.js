// Universal systems, sections 7 and 9 (docs/specs/universal-systems.md): Absolve (R+S while being comboed), and
// Repel and Draw (two attack buttons during blockstun).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadJSON, lcg, SYSTEM } from './helpers.js';

const RULES = loadJSON('data/system/systems.json');
const BURST = loadJSON('data/system/burst.json');
const BIG = [[0, 0, 400, 300]];
const base = { startup: 4, active: 2, recovery: 8, damage: 500, hitstun: 20, untech: 20, blockstun: 10, hitstop: 8,
  pushbackHit: 0, pushbackBlock: 0, selfPushback: 0, hitboxes: BIG };
const file = (archetype) => ({ engine: 'Toska', version: 2, character: { id: `g-${archetype}`, stats: {} }, meter: { archetype },
  projectiles: { ball: { speed: 10, spawn: [40, 60], hitbox: [-20, -20, 40, 40], lifetime: 200, damage: 300, hitstun: 20, blockstun: 20, hitstop: 4 } },
  moves: [
    { ...base, id: '5L', input: '5L' },
    { ...base, id: '5M', input: '5M', damage: 800 },
    { ...base, id: 'long', input: '5H', startup: 4, active: 2, recovery: 40, blockstun: 30 },
    { ...base, id: 'slow', input: '5S', startup: 12, active: 4, recovery: 20, hitboxes: [[900, 0, 10, 10]] },
    { ...base, id: 'up', input: '2S', launch: { x: 0, y: 14 } },
    { ...base, id: 'throwBall', input: '214L', startup: 6, active: 0, recovery: 30, hitboxes: undefined, timeline: [{ at: 6, spawn: 'ball' }] },
  ] });
const CH = Object.fromEntries(['balanced', 'penitent'].map((a) => [a, compileCharacter(file(a), SYSTEM)]));
const T = CH.balanced;
const W = loadWorld(T, T);
const D = SYSTEM.meter.unit;
const RS = RAW.R | RAW.S;
const LM = RAW.L | RAW.M;
const BACK2 = RAW.RIGHT; // Player 2 stands on the right: right is back, left is forward
const FWD2 = RAW.LEFT;

function setup(x1 = -50, x2 = 50, world = W) {
  const g = createGame(world);
  g.players[0].x = px(x1);
  g.players[1].x = px(x2);
  return g;
}
function arrange(g, i, state, frame = 0, world = W) {
  const p = g.players[i];
  enterState(p, world.chars[i], state);
  p.frame = frame - 1;
}
const go = (g, n, raw = [0, 0], world = W) => { for (let i = 0; i < n; i++) step(g, raw, world); };
/** P1's `move` lands on the next step while P2 holds `raw2`. */
function strike(g, move = '5L', raw2 = 0, world = W) {
  arrange(g, 0, move, world.chars[0].states[move].move.startup - 1, world);
  step(g, [0, raw2], world);
}
/** Step with P2 holding `raw2` until a cue of `type` shows (returns it), or `max` frames pass (returns null). */
function until(g, type, raw2, max = 20, raw1 = 0, world = W) {
  for (let i = 0; i < max; i++) {
    step(g, [raw1, raw2], world);
    const c = g.cues.find((x) => x.type === type);
    if (c) return c;
  }
  return null;
}

// ---------- Absolve ----------

/** P2 has just been hit by P1's 5L and holds `meter` Devotion. */
function comboed(meter = 400, { witness = false } = {}) {
  const g = setup();
  if (witness) arrange(g, 1, 'slow', 20);
  strike(g);
  assert.equal(g.players[1].state, 'hitStand');
  assert.equal(g.players[1].combo.witness, witness ? 1 : 0);
  g.players[1].meter = meter * D;
  return g;
}

test('the rules files hold the spec\'s numbers', () => {
  assert.deepEqual(RULES.absolve, { cost: 200, witnessCost: 300 });
  assert.equal(BURST.buttons, 'RS');
  assert.equal(BURST.moves.absolve.pushbackHit, 480, 'half of the 960 pixel screen');
  assert.equal(BURST.recovery.absolve_recovery.duration, 40);
  assert.deepEqual([RULES.repel.push, RULES.repel.lockout], [320, 20]);
  assert.deepEqual([RULES.draw.cost, RULES.draw.advantage, RULES.draw.punishWindow], [100, 4, 30]);
  assert.deepEqual([BURST.perFrame, BURST.hurtPct, BURST.start], [0, 0, BURST.gaugeMax], 'once per round: full at the start, never refills by itself');
});

test('Absolve costs 200 Devotion and cannot be used with less', () => {
  let g = comboed(250);
  assert.ok(until(g, 'burst', RS));
  assert.equal(g.players[1].state, 'absolve');
  assert.equal(g.players[1].meter, 50 * D);
  assert.equal(g.players[1].combo, null, 'the combo is over');
  g = comboed(200);
  assert.ok(until(g, 'burst', RS));
  assert.equal(g.players[1].meter, 0);
  g = comboed(199);
  assert.equal(until(g, 'burst', RS), null);
  assert.equal(g.players[1].meter, 199 * D, 'nothing was paid');
  assert.equal(g.players[1].burst, BURST.gaugeMax, 'and it is still available');
});

test('Absolve costs 300 against a combo that began with a Witness counter', () => {
  let g = comboed(299, { witness: true });
  assert.equal(until(g, 'burst', RS), null, '299 is not enough');
  g = comboed(350, { witness: true });
  const cue = until(g, 'burst', RS);
  assert.ok(cue);
  assert.equal(cue.cost, 300 * D);
  assert.equal(g.players[1].meter, 50 * D);
});

test('Absolve: once per round', () => {
  const g = comboed(400);
  const d = g.players[1];
  assert.ok(until(g, 'burst', RS));
  assert.equal(d.burst, 0);
  go(g, 80);
  assert.equal(d.state, 'idle');
  // Comboed again with plenty of Devotion: no second Absolve.
  g.players[0].x = d.x - px(100);
  enterState(g.players[0], T, 'idle');
  strike(g);
  assert.equal(d.state, 'hitStand');
  assert.equal(d.meter >= 200 * D, true);
  assert.equal(until(g, 'burst', RS), null);
  // A new round refills it (tests/match.test.js checks the refill itself): with the gauge back, it works again.
  d.burst = BURST.gaugeMax;
  strike(g);
  assert.ok(until(g, 'burst', RS));
});

test('Absolve only works while being comboed, and only with R+S', () => {
  const g = setup();
  g.players[1].meter = 400 * D;
  assert.equal(until(g, 'burst', RS, 6), null, 'standing free');
  for (const buttons of [RAW.H | RAW.S, RAW.R, RAW.S, RAW.R | RAW.L]) {
    const g2 = comboed(400);
    assert.equal(until(g2, 'burst', buttons, 6), null);
  }
  // While blocking: no.
  const g3 = setup();
  g3.players[1].meter = 400 * D;
  strike(g3, '5L', BACK2);
  assert.equal(g3.players[1].state, 'blockStand');
  assert.equal(until(g3, 'burst', RS | BACK2, 8), null);
});

test('Absolve: 20 frames of invincibility', () => {
  const g = comboed(400);
  const d = g.players[1];
  assert.ok(until(g, 'burst', RS));
  const hp = d.health;
  // P1 swings again and again into the first frames of the Absolve.
  enterState(g.players[0], T, 'idle');
  strike(g, '5M');
  assert.equal(d.health, hp, 'no damage');
  assert.equal(d.state, 'absolve');
  const frames = T.states.absolve.frames;
  assert.equal(frames.filter((f) => f.invStrike && f.invThrow).length, 20);
  assert.ok(frames.slice(0, 20).every((f) => f.invStrike));
});

test('Absolve knocks the attacker back half a screen', () => {
  const g = comboed(400);
  const a = g.players[0];
  const x = a.x;
  assert.ok(until(g, 'burst', RS));
  assert.ok(until(g, 'hit', 0, 20), 'the Absolve hits the attacker');
  assert.equal(a.state, 'hitStand');
  go(g, 30);
  assert.equal(x - a.x, px(480));
  assert.equal(a.health, T.stats.health, 'it does no damage');
});

test('Absolve wipes the slate: the attacker loses all the Devotion that combo gave them', () => {
  const g = setup();
  const [a, d] = g.players;
  a.meter = 70 * D; // had this before the combo
  strike(g);
  go(g, 12);
  strike(g, '5M');
  const gave = d.combo.gave;
  assert.ok(gave > 0);
  assert.equal(a.meter, 70 * D + gave);
  d.meter = 400 * D;
  const cue = until(g, 'burst', RS);
  assert.equal(cue.wiped, gave);
  assert.equal(a.meter, 70 * D, 'back to what they had before the combo');
  // If they already spent some of it, they lose what is left, never below zero.
  const g2 = setup();
  strike(g2);
  g2.players[0].meter = 3 * D;
  g2.players[1].meter = 400 * D;
  assert.ok(until(g2, 'burst', RS));
  assert.equal(g2.players[0].meter, 0);
});

test('the bait: if the attacker blocks it, the burster has 40 frames of recovery and can be punished', () => {
  const g = comboed(400);
  const [a, d] = g.players;
  assert.ok(until(g, 'burst', RS));
  // The attacker stops and holds back.
  enterState(a, T, 'idle');
  assert.ok(until(g, 'block', 0, 20, RAW.LEFT), 'blocked');
  assert.equal(d.state, 'absolve_recovery');
  assert.equal(T.states.absolve_recovery.duration, 40);
  assert.ok(T.states.absolve_recovery.frames.every((f) => !f.invStrike), 'not invincible');
  // 40 frames stuck (after the block's hitstop), then free.
  go(g, d.hitstop);
  let stuck = 0;
  const probe = JSON.parse(JSON.stringify(g));
  while (probe.players[1].state === 'absolve_recovery' && stuck < 100) { step(probe, [0, 0], W); stuck++; }
  assert.equal(stuck, 40);
  // The punish: the attacker's blockstun (12) is long over; their hit lands.
  go(g, 14);
  assert.equal(a.state, 'idle');
  assert.equal(d.state, 'absolve_recovery');
  strike(g, '5M');
  assert.equal(d.state, 'hitStand');
  assert.equal(d.health, T.stats.health - 500 - 800);
  // When it hits instead, the burster recovers normally.
  const g2 = comboed(400);
  assert.ok(until(g2, 'burst', RS));
  assert.ok(until(g2, 'hit', 0, 20));
  assert.equal(g2.players[1].state, 'absolve');
});

test('Absolve in the air: it hangs there; blocked, the burster falls helpless and recovers on landing', () => {
  const g = setup();
  const [a, d] = g.players;
  strike(g, 'up');
  go(g, 14);
  assert.equal(d.state, 'hitAir');
  d.meter = 400 * D;
  assert.ok(until(g, 'burst', RS));
  assert.equal(d.state, 'absolve_air');
  const y = d.y;
  go(g, 4);
  assert.equal(d.y, y, 'no gravity during it');
  enterState(a, T, 'idle');
  if (until(g, 'block', 0, 20, RAW.LEFT)) {
    assert.equal(d.state, 'absolve_recovery_air');
    for (let i = 0; i < 120 && d.state === 'absolve_recovery_air'; i++) step(g, [0, 0], W);
    assert.equal(d.state, 'absolve_recovery');
  }
});

// ---------- Repel and Draw ----------

/** P2 has just blocked P1's `move` (P1 at x1, P2 at x2). */
function blocked(move = 'long', x1 = -100, x2 = 100, world = W) {
  const g = setup(x1, x2, world);
  strike(g, move, BACK2, world);
  assert.equal(g.players[1].state, 'blockStand');
  return g;
}

test('Repel (two attack buttons, holding back): pushes the attacker a third of the screen away, for free', () => {
  for (const pair of [LM, RAW.M | RAW.H, RAW.L | RAW.H]) {
    const g = blocked();
    const [a, d] = g.players;
    d.meter = 30 * D;
    const x = a.x;
    assert.ok(until(g, 'repel', BACK2 | pair));
    assert.equal(d.state, 'repel');
    go(g, 14, [0, BACK2]);
    assert.equal(x - a.x, px(320), 'a third of 960');
    assert.equal(d.meter, 30 * D, 'free');
    assert.equal(d.health, T.stats.health);
  }
  // One button, or no direction, does nothing.
  for (const raw of [BACK2 | RAW.M, LM, RAW.DOWN | LM]) {
    const g = blocked();
    assert.equal(until(g, 'repel', raw, 12), null);
    assert.equal(g.players[1].state, 'blockStand');
  }
});

test('Repel keeps the blockstun it had, and the defender can still block the next hit', () => {
  const plain = blocked();
  let n = 0;
  while (plain.players[1].state !== 'idle' && n < 100) { step(plain, [0, BACK2], W); n++; }
  const g = blocked();
  let m = 0;
  while (g.players[1].state !== 'idle' && m < 100) { step(g, [0, BACK2 | (m === 0 ? LM : 0)], W); m++; }
  assert.equal(m, n, 'same number of frames stuck');
  // Still a block state.
  const g2 = blocked();
  assert.ok(until(g2, 'repel', BACK2 | LM));
  g2.players[0].x = g2.players[1].x - px(100);
  g2.players[0].slide = 0; g2.players[0].slideLeft = 0;
  strike(g2, '5M', BACK2);
  assert.ok(g2.cues.some((c) => c.type === 'block'));
});

test('Repel: a 20-frame lockout before it can be used again', () => {
  for (const [wait, works] of [[10, false], [19, false], [20, true]]) {
    const g = blocked();
    const d = g.players[1];
    assert.ok(until(g, 'repel', BACK2 | LM));
    const at = g.frame;
    // Blocking again (put straight into blockstun), pressing so the Repel would come out `wait` frames later.
    while (g.frame < at + wait - 1) {
      step(g, [0, BACK2], W);
      enterState(d, T, 'blockStand');
      d.stun = 30;
      d.hitstop = 0;
    }
    step(g, [0, BACK2 | LM], W);
    assert.equal(g.cues.some((c) => c.type === 'repel'), works, `${wait} frames after the first`);
    assert.equal(g.frame - at, wait);
  }
});

test('Repel: penitent gains 10 Devotion; a balanced character gains none', () => {
  for (const [name, gain] of [['penitent', 10], ['balanced', 0]]) {
    const w = loadWorld(T, CH[name]);
    const g = blocked('long', -100, 100, w);
    const d = g.players[1];
    go(g, 3, [0, BACK2], w);
    const before = d.meter;
    assert.ok(until(g, 'repel', BACK2 | LM, 20, 0, w));
    assert.equal(d.meter - before, gain * D, name);
  }
});

test('Draw (two attack buttons, holding forward): costs 100, pulls the attacker a step closer, leaves them at -4', () => {
  const g = blocked('long', -150, 150);
  const [a, d] = g.players;
  d.meter = 130 * D;
  const x = a.x;
  const dx = d.x;
  const cue = until(g, 'draw', FWD2 | LM);
  assert.ok(cue);
  assert.equal(cue.whiffed, false);
  assert.equal(d.meter, 30 * D);
  assert.deepEqual([d.state, a.state], ['draw', 'drawn']);
  // Frame advantage: the defender is free 4 frames before the attacker.
  const freeAt = [null, null];
  for (let i = 0; i < 60 && freeAt.includes(null); i++) {
    step(g, [0, 0], W);
    for (const p of g.players) if (freeAt[p.id] === null && p.state === 'idle') freeAt[p.id] = g.frame;
  }
  assert.equal(freeAt[0] - freeAt[1], 4, 'the attacker is at -4');
  assert.equal(a.x - x, px(RULES.draw.step), 'one step toward the defender');
  assert.equal(d.x, dx, 'the defender did not move');
});

test('Draw works the same whichever side the defender is on (neither player goes first)', () => {
  // Mirror: P2 attacks, P1 defends.
  const g = setup(-150, 150);
  const [d, a] = g.players;
  enterState(a, T, 'long');
  a.frame = T.states.long.move.startup - 2;
  step(g, [RAW.LEFT, 0], W);
  assert.equal(d.state, 'blockStand');
  d.meter = 100 * D;
  let got = null;
  for (let i = 0; i < 20 && !got; i++) { step(g, [RAW.RIGHT | LM, 0], W); got = g.cues.find((c) => c.type === 'draw'); }
  assert.ok(got);
  const freeAt = [null, null];
  for (let i = 0; i < 60 && freeAt.includes(null); i++) {
    step(g, [0, 0], W);
    for (const p of g.players) if (freeAt[p.id] === null && p.state === 'idle') freeAt[p.id] = g.frame;
  }
  assert.equal(freeAt[1] - freeAt[0], 4);
});

test('Draw never pulls the attacker inside the defender', () => {
  const g = blocked('long', -40, 40);
  const [a, d] = g.players;
  d.meter = 100 * D;
  assert.ok(until(g, 'draw', FWD2 | LM));
  go(g, 20);
  assert.ok(d.x - a.x >= px(RULES.draw.minGap), `gap ${(d.x - a.x) / 100}`);
});

test('Draw cannot be used without 100 Devotion', () => {
  const g = blocked();
  g.players[1].meter = 99 * D;
  assert.equal(until(g, 'draw', FWD2 | LM, 12), null);
  assert.equal(g.players[1].meter, 99 * D);
  assert.equal(g.players[0].state, 'long');
});

test('a Draw with no attack being blocked does nothing and still costs', () => {
  // A projectile is blocked; its owner has already recovered.
  const g = setup(-300, 100);
  const [a, d] = g.players;
  arrange(g, 0, 'throwBall', 5);
  assert.ok(until(g, 'block', BACK2, 80));
  enterState(a, T, 'idle');
  d.meter = 150 * D;
  const x = a.x;
  const cue = until(g, 'draw', FWD2 | LM);
  assert.ok(cue);
  assert.equal(cue.whiffed, true);
  assert.equal(d.meter, 50 * D, 'it still costs');
  assert.equal(d.state, 'blockStand', 'nothing happened');
  assert.equal(a.state, 'idle');
  go(g, 10);
  assert.equal(a.x, x);
});

test('penitent: a punish within 30 frames after a Draw refunds 50; later, or for anyone else, nothing', () => {
  const run = (name, wait) => {
    const w = loadWorld(T, CH[name]);
    const g = blocked('long', -150, 150, w);
    const [a, d] = g.players;
    d.meter = 100 * D;
    assert.ok(until(g, 'draw', FWD2 | LM, 20, 0, w));
    const at = g.frame;
    while (g.frame < at + wait - 1) step(g, [0, 0], w);
    // The defender's hit lands `wait` frames after the Draw.
    enterState(d, w.chars[1], '5L');
    d.frame = 2;
    if (a.state !== 'drawn') enterState(a, T, 'slow'); // (later on they are free: keep them hittable)
    step(g, [0, 0], w);
    assert.ok(a.combo, `${name}, ${wait} frames: the punish landed`);
    return a.combo.by.draw ?? 0;
  };
  assert.equal(run('penitent', 10), 50 * D);
  assert.equal(run('penitent', 30), 50 * D);
  assert.equal(run('penitent', 31), 0);
  assert.equal(run('balanced', 10), 0);
});

test('Absolve, Repel and Draw survive rollback: 4000 frames, rewinding 8 frames every frame', () => {
  const rnd = lcg(4242);
  let absolves = 0, repels = 0, draws = 0;
  const r = runSyncTest(W, (g) => {
    for (const c of g.cues) { if (c.type === 'burst') absolves++; if (c.type === 'repel') repels++; if (c.type === 'draw') draws++; }
    return [0, 1].map((i) => {
      const p = g.players[i];
      const o = g.players[1 - i];
      // Both start with full Devotion (set before the first step, so every rewind sees it).
      if (g.frame === 0) p.meter = 400 * D;
      const toward = o.x > p.x ? RAW.RIGHT : RAW.LEFT;
      const awayDir = toward === RAW.RIGHT ? RAW.LEFT : RAW.RIGHT;
      const roll = rnd() % 100;
      if (p.state.startsWith('block')) return roll < 30 ? awayDir | LM : roll < 60 ? toward | LM : awayDir;
      if (p.state === 'hitStand') return roll < 40 ? RS : 0;
      if (W.chars[o.id].states[o.state].move) return roll < 92 ? awayDir : 0;
      return roll < 8 ? toward | [RAW.L, RAW.M, RAW.H][rnd() % 3] : roll < 40 ? toward : 0;
    });
  }, { frames: 4000, distance: 8 });
  assert.ok(r.ok, `desync at frame ${r.failFrame}: ${r.diff}`);
  assert.ok(repels > 0 && draws > 0 && absolves > 0, `Repels ${repels}, Draws ${draws}, Absolves ${absolves}`);
});
