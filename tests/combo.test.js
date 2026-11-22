import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { decayAt } from '../src/core/combat.js';
import { RAW } from '../src/core/input.js';
import { px, pct } from '../src/core/fixed.js';
import { loadWorld, loadChar, script, SYSTEM } from './helpers.js';

const BIG = [[0, -400, 200, 900]]; // reaches the defender anywhere nearby, any height
const base = { startup: 3, active: 2, recovery: 5, damage: 1000, hitstun: 20, blockstun: 10, hitstop: 0,
  pushbackHit: 0, pushbackBlock: 0, hitboxes: [[0, 90, 80, 30]] };
const C_CHAR = compileCharacter({
  engine: 'Toska', version: 2, character: { id: 'c', stats: {} },
  gatlings: { '5L': ['5L', '5M'] },
  moves: [
    { ...base, id: '5L', input: '5L', starterProration: 8000, comboProration: 9000 },
    { ...base, id: '5M', input: '5M', starterProration: 10000, comboProration: 9500 },
    { ...base, id: 'pop', input: '5H', untech: 40, launch: { x: 0, y: 10 }, hitboxes: BIG },
    { ...base, id: 'wall', input: '6H', untech: 60, launch: { x: 20, y: 4 }, wallBounce: { x: 5, y: 12 }, hitboxes: BIG },
    { ...base, id: 'wall2', input: '4H', untech: 60, launch: { x: 20, y: 4 }, wallBounce: { x: 5, y: 12 }, bounceLimit: 2, hitboxes: BIG },
    { ...base, id: 'spike', input: '2H', untech: 30, airHit: { x: 0, y: -12 }, groundBounce: { y: 10 }, hitboxes: BIG },
  ],
}, SYSTEM);
const W = loadWorld(C_CHAR, C_CHAR);
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
const cuesOf = (g, n, type) => { let k = 0; for (let i = 0; i < n; i++) { step(g, [0, 0], W); k += g.cues.filter((c) => c.type === type).length; } return k; };

// ---------- Proration ----------

test('proration: the first hit is full, the starter and combo prorations scale what follows', () => {
  const g = setup();
  hit(g, '5L');
  const d = g.players[1];
  assert.equal(d.health, 10000 - 1000);
  assert.equal(d.combo.scale, pct(pct(10000, 8000), 9000), 'starter 80% then combo 90% = 72%');
  hit(g, '5M');
  assert.equal(d.health, 10000 - 1000 - 720, 'the second hit does 72%');
  assert.equal(d.combo.scale, pct(7200, 9500), 'the second move only applies its combo proration');
  assert.equal(d.combo.hits, 2);
  assert.equal(d.combo.damage, 1720);
});

test('same-move penalty: using a move again in one combo costs extra', () => {
  const g = setup();
  hit(g, '5L');
  hit(g, '5L');
  assert.equal(g.players[1].health, 10000 - 1000 - pct(720, C.repeatPenalty));
  hit(g, '5L');
  const scale3 = pct(7200, 9000);
  assert.equal(g.players[1].combo.damage, 1000 + pct(720, C.repeatPenalty) + pct(pct(pct(1000, scale3), C.repeatPenalty), C.repeatPenalty));
});

test('scaling never drops below the minimum', () => {
  const g = setup();
  for (let i = 0; i < 60; i++) hit(g, i % 2 ? '5L' : '5M');
  assert.equal(g.players[1].combo.scale, C.minScale);
});

// ---------- Combo time ----------

test('combo time shrinks hitstun (and untechable time) by the decay tables', () => {
  for (const t of [0, 120, 300, 500, 700, 900]) {
    const g = setup();
    hit(g, '5L');
    g.players[1].combo.time = t;
    hit(g, '5M');
    assert.equal(g.players[1].stun, Math.max(1, pct(20, decayAt(C.hitstunDecay, t))), `hitstun at combo time ${t}`);
    const g2 = setup();
    hit(g2, '5L');
    g2.players[1].combo.time = t;
    hit(g2, 'pop');
    assert.equal(g2.players[1].stun, Math.max(1, pct(40, decayAt(C.untechDecay, t))), `untech at combo time ${t}`);
  }
});

test('combo time counts frames while the combo is alive, not during hitstop', () => {
  const g = setup();
  hit(g, '5L');
  go(g, 10);
  assert.equal(g.players[1].combo.time, 10);
});

test('a long combo ends on its own: a self-chaining jab with no pushback eventually drops', () => {
  // P2 is in the corner holding back: helpless in hitstun, but the first frame they're free, they block.
  const wall = W.battle.halfWidthUnits / 100;
  const g = setup(wall - 122, wall - 22);
  hit(g, '5L');
  let maxHits = 0;
  let frames = 0;
  for (; frames < 3000; frames++) {
    step(g, [frames % 2 ? RAW.L : 0, RAW.RIGHT], W);
    const d = g.players[1];
    if (d.combo) maxHits = Math.max(maxHits, d.combo.hits);
    if (maxHits > 5 && !d.combo) break;
  }
  const last = g.players[1].lastCombo;
  assert.ok(frames < 3000, 'the combo dropped');
  assert.ok(maxHits > 20, `it was a long combo first (${maxHits} hits)`);
  assert.ok(last.time >= C.hitstunDecay[C.hitstunDecay.length - 2][0], `it lasted into the heavy decay (${last.time} frames)`);
});

test('a finished combo is kept for display; the next hit starts a fresh one', () => {
  const g = setup();
  hit(g, '5L');
  go(g, 40);
  const d = g.players[1];
  assert.equal(d.combo, null);
  assert.equal(d.lastCombo.hits, 1);
  hit(g, '5M');
  assert.equal(d.health, 10000 - 1000 - 1000, 'a new combo starts at full damage');
});

// ---------- Juggle gravity, air tech ----------

test('juggle gravity rises with the number of hits', () => {
  const g = setup();
  hit(g, 'pop');
  const d = g.players[1];
  const fall = () => { const v = d.vy; step(g, [0, 0], W); return v - d.vy; };
  const g1 = fall();
  assert.equal(g1, pct(C_CHAR.stats.gravity, 10000 + C.juggleGravityPerHit));
  d.combo.hits = 100;
  assert.equal(fall(), pct(C_CHAR.stats.gravity, 10000 + C.juggleGravityMax), 'capped');
});

test('air tech: not during untechable time, any button after it', () => {
  const g = setup();
  hit(g, 'pop');
  const d = g.players[1];
  g.players[1].y = px(1000); // high enough to stay airborne past the untechable time
  go(g, 20, [0, RAW.L]);
  assert.equal(d.state, 'hitAir', 'holding or pressing during untech does nothing');
  go(g, 25);
  assert.equal(d.state, 'tumble', 'untech over (40 frames)');
  step(g, [0, RAW.M], W);
  assert.equal(d.state, 'airTech');
  assert.ok(W.chars[1].states.airTech.frames[0].invStrike, 'air tech starts invincible');
  go(g, 3);
  assert.equal(d.combo, null, 'teching ends the combo');
});

// ---------- Bounces ----------

test('wall bounce: once per combo by default', () => {
  const wall = W.battle.halfWidthUnits / 100;
  const g = setup(wall - 160, wall - 100);
  hit(g, 'wall');
  assert.equal(cuesOf(g, 30, 'wallbounce'), 1, 'first wall hit bounces');
  const d = g.players[1];
  assert.equal(d.combo.wb, 1);
  g.players[0].x = d.x - px(60);
  hit(g, 'wall');
  assert.equal(cuesOf(g, 40, 'wallbounce'), 0, 'the second one does not');
});

test('a move can allow more bounces than the default', () => {
  const wall = W.battle.halfWidthUnits / 100;
  const g = setup(wall - 160, wall - 100);
  hit(g, 'wall2');
  assert.equal(cuesOf(g, 30, 'wallbounce'), 1);
  g.players[0].x = g.players[1].x - px(60);
  hit(g, 'wall2');
  assert.equal(cuesOf(g, 40, 'wallbounce'), 1, 'limit 2: bounces again');
});

test('ground bounce: once per combo, then a knockdown', () => {
  const g = setup();
  hit(g, 'pop');
  const d = g.players[1];
  go(g, 8);
  hit(g, 'spike');
  assert.ok(d.vy < 0, 'spiked down');
  let bounced = 0;
  for (let i = 0; i < 40 && !bounced; i++) { step(g, [0, 0], W); bounced = g.cues.filter((c) => c.type === 'groundbounce').length; }
  assert.equal(bounced, 1);
  assert.equal(d.state, 'hitAir', 'back up in hitstun, not knocked down');
  assert.ok(d.vy > 0);
  go(g, 10);
  hit(g, 'spike');
  let n = 0;
  for (let i = 0; i < 60 && d.state !== 'knockdown'; i++) { step(g, [0, 0], W); n += g.cues.filter((c) => c.type === 'groundbounce').length; }
  assert.equal(n, 0);
  assert.equal(d.state, 'knockdown');
});

// ---------- Gatlings and cancels from data ----------

test('gatling legality comes from the table: forward routes only, on contact only', () => {
  const A = loadChar('tests/fixtures/fighter.toska.json');
  const into = (m) => new Set(A.states[m].cancels.flatMap((c) => [...c.into]));
  assert.ok(into('5L').has('5M') && into('5L').has('5S'));
  assert.ok(!into('5M').has('5L'), 'no going back down');
  assert.ok(!into('5H').has('5M'));
  for (const m of ['5L', '5M', '2H']) assert.ok(into(m).has('#special') && into(m).has('#super'), `${m} special-cancels`);
  assert.ok(A.states['5L'].cancels.every((c) => !c.whiff), 'nothing cancels on whiff');
  const jc = A.states['j.M'].cancels.find((c) => c.into.has('#jump'));
  assert.ok(jc && jc.hit && !jc.block, 'j.M jump-cancels on hit only');
  const sj = A.states['5S'].cancels.find((c) => c.into.has('#superjump'));
  assert.ok(sj && sj.hit && !sj.block, 'the launcher super-jump cancels on hit');
  assert.ok(!A.states['6H'].cancels.some((c) => c.into.has('#special')), 'throws opt out');
  // The window opens on the first active frame and lasts the rest of the move.
  const w = A.states['5L'].cancels[0];
  assert.equal(w.from, 3);
  assert.equal(w.to, A.states['5L'].duration - 1);
});

test('gatlings in play: 5L > 5M works on hit, 5M > 5L does not', () => {
  const g = setup();
  hit(g, '5L');
  step(g, [RAW.M, 0], W);
  assert.equal(g.players[0].state, '5M');
  const A = loadChar('tests/fixtures/fighter.toska.json');
  const w = loadWorld(A, A);
  const g2 = createGame(w);
  g2.players[0].x = px(-60);
  g2.players[1].x = px(60);
  const run = (s) => { for (const r of script(s)) step(g2, [r, 0], w); };
  run('5+M 5*6');
  assert.equal(g2.players[0].contact, 1, '5M hit');
  run('5+L');
  assert.equal(g2.players[0].state, '5M', '5L is not a gatling from 5M');
});

// ---------- Launcher into air combo ----------

test('launcher: both fighters go up, and the air combo connects', () => {
  const A = loadChar('tests/fixtures/fighter.toska.json');
  const w = loadWorld(A, A);
  const g = createGame(w);
  g.players[0].x = px(-50);
  g.players[1].x = px(50);
  const [a, d] = g.players;
  const run = (s) => { for (const r of script(s)) step(g, [r, 0], w); };
  run('5+S 5*7');
  assert.equal(d.state, 'hitAir', 'launched');
  assert.ok(d.vy > 0);
  run('5*12'); // hitstop
  run('9');
  assert.equal(a.state, 'superJump', 'up on hit = super jump, no pre-jump');
  let hits = 0;
  for (let i = 0; i < 60; i++) {
    run(i % 3 === 0 ? '5+L' : i % 3 === 1 ? '5+M' : '5');
    hits += g.cues.filter((c) => c.type === 'hit' && c.move.startsWith('j.')).length;
  }
  assert.ok(hits >= 2, `air hits after the launcher: ${hits}`);
  assert.ok(d.combo && d.combo.hits >= 3, 'still one combo');
});
