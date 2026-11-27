// Khai'ro's 236 Bracelet Slam (owner's brief, Nov 26): a lobbed projectile. The path and its shape, when it can
// hit, the stage clamp, the EX's tracking, the lock until it is home, and when he is free. The rules only: nothing
// here draws. The owner tunes the timings (how long each hangs, the wind-up), so the frames are read from his file
// and what is pinned is how the move behaves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { frameOf } from '../src/core/character.js';
import { lobRise, lobDrop, lobAges } from '../src/core/lob.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const PATH = 'data/characters/khairo/khairo.toska.json';
const FILE = loadJSON(PATH);
const KH = loadChar(PATH);
const MALIK = loadChar('data/characters/malik/malik.toska.json');
const D = 100; // Devotion points are kept times 100 (as in the other tests)
const MOVE = (b) => FILE.moves.find((m) => m.id === 'bracelet' + b);
const RELEASE = (b) => MOVE(b).timeline[0].at + 1; // the frame of the move the bracelet leaves his hand
const LENGTH = (b) => MOVE(b).startup + MOVE(b).active + MOVE(b).recovery - 1;
const LOB = (kind) => KH.projectiles[kind].lob;

function game(gap = 600, ax = -300) {
  const W = loadWorld(KH, MALIK);
  W.battle.maxGapUnits = 0;
  const g = createGame(W);
  g.players[0].x = px(ax); g.players[1].x = px(ax + gap);
  return { g, W, a: g.players[0], d: g.players[1] };
}
/** Throw it. ages[n] = the bracelet at age n ({ x, y, hit, over: its x minus the opponent's }); states[f] = his state on frame f of the move. */
function thrown(button, { gap = 600, ax = -300, frames = 120, ex = false } = {}) {
  const G = game(gap, ax);
  if (ex) G.a.meter = 400 * D;
  const ages = [], states = [];
  let f = 0, out = 0, anyHit = false;
  for (const r of script(`2 3 6+${button}${ex ? 'S' : ''} 5*${frames}`)) {
    step(G.g, [r, 0], G.W);
    if (G.a.state.startsWith('bracelet') || f > 0) { f++; states[f] = G.a.state; }
    const pr = G.g.projectiles[0];
    if (pr) { if (!out) out = f; ages[pr.age] = { kind: pr.kind, x: pr.x, y: pr.y, hit: !!pr.hit, over: pr.x - G.d.x, ahead: (pr.x - G.a.x) / px(1) }; }
    if (G.d.combo) anyHit = true;
  }
  return { ...G, ages, states, out, anyHit };
}

test('L, M and H: it leaves his hand on the release frame, climbs to the apex over its landing spot slowing down, hangs, then falls straight and faster', () => {
  for (const b of ['L', 'M', 'H']) {
    const L = LOB('bracelet' + b), [rise, hang, landed] = lobAges(L);
    const { ages, out } = thrown(b);
    assert.equal(out, RELEASE(b), `${b}: out on the release frame`);
    assert.equal(ages[0].kind, 'bracelet' + b);
    const at = (n) => [ages[n].ahead, ages[n].y / px(1)];
    const spot = [L.land / px(1), L.apex / px(1)];
    for (let n = rise; n <= hang; n++) assert.deepEqual(at(n), spot, `${b}: at the apex, age ${n}`);
    for (let n = 1; n <= rise; n++) {
      assert.ok(at(n)[0] > at(n - 1)[0] && at(n)[1] >= at(n - 1)[1], `${b}: up and forward, age ${n}`);
      if (n > 2) assert.ok(at(n)[1] - at(n - 1)[1] <= at(n - 1)[1] - at(n - 2)[1], `${b}: slowing toward the apex (age ${n})`);
    }
    for (let n = hang + 1; n <= landed; n++) {
      assert.equal(at(n)[0], spot[0], `${b}: straight down`);
      assert.ok(at(n)[1] < at(n - 1)[1], `${b}: falling, age ${n}`);
      if (n > hang + 1) assert.ok(at(n - 1)[1] - at(n)[1] >= at(n - 2)[1] - at(n - 1)[1], `${b}: speeding up (age ${n})`);
    }
    assert.equal(at(landed)[1], 0, `${b}: on the floor`);
    assert.ok(at(landed - 1)[1] > 0);
  }
});

test('The stronger the throw, the longer it hangs at the top (owner, Nov 26): L barely, M a moment, H much longer; each lands later than the last', () => {
  const hang = (b) => LOB('bracelet' + b).hang, lands = (b) => lobAges(LOB('bracelet' + b))[2];
  assert.ok(hang('L') < hang('M') && hang('M') < hang('H'), `${hang('L')} < ${hang('M')} < ${hang('H')}`);
  assert.ok(hang('H') >= hang('M') * 2, 'H much longer than M');
  assert.ok(lands('L') < lands('M') && lands('M') < lands('H'));
});

test('He is free on the frame after the move ends, the same for every strength, with M and H still in the air', () => {
  assert.ok(LENGTH('L') === LENGTH('M') && LENGTH('M') === LENGTH('H'));
  for (const b of ['L', 'M', 'H']) {
    const { states, ages } = thrown(b);
    assert.equal(states[LENGTH(b)], 'bracelet' + b);
    assert.equal(states[LENGTH(b) + 1], 'idle', b);
    if (b !== 'L') assert.ok(ages[LENGTH(b) + 1 - RELEASE(b)].y > 0, `${b}: still up when he can move`);
  }
});

test('No hit while it rises or hangs; it hits on the way down, and its shockwave hits along the floor for 3 frames', () => {
  for (const b of ['L', 'M', 'H']) {
    const P = KH.projectiles['bracelet' + b], [, hang, landed] = lobAges(P.lob), ahead = P.lob.land / px(1);
    // Standing right under the apex (Malik is tall): the bracelet touches nobody until the drop begins.
    const under = thrown(b, { gap: ahead });
    for (let n = 0; n <= hang; n++) assert.equal(under.ages[n].hit, false, `${b}: nothing at age ${n}`);
    assert.ok(under.ages.slice(hang + 1, landed + 1).some((r) => r.hit), `${b}: the drop hits`);
    // Standing beside the landing spot, out of the ring's way: only the shockwave reaches, on the landing frame.
    const beside = thrown(b, { gap: ahead + 60 });
    for (let n = 0; n < landed; n++) assert.equal(beside.ages[n].hit, false, `${b}: the ring misses at age ${n}`);
    assert.equal(beside.ages[landed].hit, true, `${b}: the shockwave on landing`);
    // Its boxes are its phases: none before the drop, the wide low one for exactly 3 frames from the landing.
    assert.deepEqual(P.phases.map((ph) => [ph.from, ph.to]), [[hang + 1, landed - 1], [landed, landed + 2]]);
    assert.ok(P.phases[1].box[0][2] > P.phases[0].box[0][2] * 2 && P.phases[1].box[0][1] === 0, 'wide and on the floor');
    assert.equal(P.move.guard, 'mid');
  }
  // Far away: it lands and touches nobody.
  assert.equal(thrown('L', { gap: 600 }).anyHit, false);
});

test('What each strength does: H knocks down hard without lifting them, EX pops them up for a combo', () => {
  assert.equal(FILE.projectiles.braceletH.hitReaction, 'hardKD');
  assert.ok(FILE.projectiles.braceletEX.launch && FILE.projectiles.braceletEX.groundBounce);
  const G = game(LOB('braceletH').land / px(1));
  let peak = 0;
  for (const r of script('2 3 6+H 5*100')) { step(G.g, [r, 0], G.W); peak = Math.max(peak, G.d.y); if (G.d.state === 'knockdown') break; }
  assert.equal(G.d.state, 'knockdown');
  assert.equal(peak, 0, 'a standing opponent goes straight down (no launch on H)');
});

test('Thrown toward a wall, it comes down inside the stage', () => {
  const L = LOB('braceletH'), landed = lobAges(L)[2];
  const edge = (W) => W.battle.halfWidthUnits - L.margin;
  const near = thrown('H', { ax: 600, gap: 100 });
  assert.equal(near.ages[landed].x, edge(near.W), 'H near the right wall: clamped');
  assert.ok(near.ages.every((r) => r.x <= edge(near.W)));
  const mid = thrown('H', { ax: -300, gap: 700 });
  assert.equal(mid.ages[landed].ahead, L.land / px(1), 'mid-screen: its full distance');
});

test('EX: up the arc, then it hovers and follows the opponent (never faster than its top speed), then slams straight down', () => {
  const L = LOB('braceletEX'), [rise, hang, landed] = lobAges(L), top = L.track / px(1);
  assert.ok(top > 0 && L.hang > LOB('braceletH').hang, 'it hovers longer than any other');
  const far = thrown('M', { ex: true, gap: 1200, ax: -600 });
  assert.equal(far.ages[0].kind, 'braceletEX');
  assert.ok(far.a.meter < 400 * D, 'it costs meter');
  const x = (n) => far.ages[n].ahead;
  assert.deepEqual([x(rise), far.ages[rise].y / px(1)], [L.land / px(1), L.apex / px(1)], 'the apex of its arc');
  for (let n = rise + 1; n <= hang; n++) assert.equal(x(n) - x(n - 1), top, `age ${n}: at its top speed toward a far opponent`);
  for (let n = hang + 1; n <= landed; n++) assert.equal(x(n), x(hang), 'straight down from where it stopped');
  assert.equal(far.ages[landed].y, 0);
  assert.ok(far.ages[landed - 1].y > 0);
  if (L.land / px(1) + top * L.hang < 1200) assert.ok(x(hang) < 1200, 'an opponent that far is not reached');
  // A nearer opponent: it is over them when the drop starts, and comes down on them.
  const near = thrown('M', { ex: true, gap: 420 });
  assert.equal(near.ages[hang].over, 0, 'over them when the drop starts');
  assert.ok(near.ages.some((r) => r.hit));
});

test('One bracelet at a time: 236 does nothing until it is home, then it works again', () => {
  const G = game();
  const P = KH.projectiles.braceletM, total = lobAges(P.lob)[4];
  assert.ok(P.lob.back > 0);
  assert.equal(P.lifetime, total);
  const early = Math.max(1, RELEASE('M') + total - LENGTH('M') - 6); // a second try as soon as he is free, the bracelet not yet home
  const seen = [];
  for (const r of script(`2 3 6+M 5*${LENGTH('M')} 2 3 6+L 5*${early + 12} 2 3 6+H 5*60`)) {
    step(G.g, [r, 0], G.W);
    if (seen.at(-1) !== G.a.state) seen.push(G.a.state);
    assert.ok(G.g.projectiles.length <= 1, 'never two');
  }
  assert.deepEqual(seen.filter((s) => s.startsWith('bracelet')), ['braceletM', 'braceletH'], 'the 236 L while it was out did nothing; the 236 H after it came home worked');
  for (const m of ['L', 'M', 'H']) assert.deepEqual(MOVE(m).oneAtATime, ['braceletL', 'braceletM', 'braceletH', 'braceletEX']);
});

test('Already thrown is thrown: if he is hit while it is up, it still finishes its path and still hits', () => {
  const G = game(LOB('braceletH').land / px(1));
  let landed = false, hurt = false, struck = false;
  for (const r of script('2 3 6+H 5*120')) {
    if (G.g.projectiles[0] && !hurt) { G.a.state = 'hitStand'; G.a.frame = 0; G.a.stun = 20; hurt = true; } // he is struck after the release
    step(G.g, [r, 0], G.W);
    const pr = G.g.projectiles[0];
    if (pr?.y === 0 && pr.age > 0) landed = true;
    if (pr?.hit) struck = true;
  }
  assert.ok(hurt && landed && struck);
});

test('The path is whole numbers and a pure function of its age', () => {
  const L = LOB('braceletH');
  for (let a = 0; a <= L.rise; a++) {
    const p = lobRise(L, 123, 15000, 54321, a);
    assert.ok(Number.isInteger(p[0]) && Number.isInteger(p[1]));
    assert.deepEqual(p, lobRise(L, 123, 15000, 54321, a));
  }
  assert.deepEqual(lobRise(L, 0, 15000, 54000, 0), [0, 15000]);
  assert.deepEqual(lobRise(L, 0, 15000, 54000, L.rise), [54000, L.apex]);
  assert.equal(lobDrop(L, 0), L.apex);
  assert.equal(lobDrop(L, L.drop), 0);
  for (let u = 0; u <= L.drop; u++) assert.ok(Number.isInteger(lobDrop(L, u)));
});

test('The throwing arm itself hits for 4 frames starting on the release frame (owner, Nov 26)', () => {
  for (const b of ['L', 'M', 'H']) {
    const on = [];
    for (let f = 0; f < LENGTH(b); f++) if (frameOf(KH, 'bracelet' + b, f).hit.length) on.push(f + 1);
    assert.deepEqual(on, [0, 1, 2, 3].map((k) => RELEASE(b) + k), b);
  }
  // Point blank the arm connects before the bracelet could; from further away only the bracelet can.
  const close = game(90);
  let armHit = false;
  for (const r of script(`2 3 6+M 5*${RELEASE('M') + 3}`)) { step(close.g, [r, 0], close.W); if (close.d.combo) armHit = true; }
  assert.ok(armHit, 'the swing hits a fighter standing next to him');
  const away = game(200);
  for (const r of script(`2 3 6+M 5*${RELEASE('M') + 3}`)) { step(away.g, [r, 0], away.W); assert.ok(!away.d.combo); }
});
