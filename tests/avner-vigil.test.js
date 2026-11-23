// Avner's Vigil stance (spec: docs/specs/avner-vigil.md): the held stance, Snap, the Vigil Crescent projectile,
// Anchor, Flare, the exit, the Brand rules they share, and the Back Heavy's doubled reach. Also the engine pieces
// behind them, which are general: projectiles as game-state objects, held stances with a time limit, hits that need
// a condition, extra hitstun on a condition, hits at any distance, and animation branches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { cloneState, hashState, serializeState, deserializeState } from '../src/core/state.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, script } from './helpers.js';

const AVNER = 'data/characters/_archive/avner_chain/avner.toska.json';
const C = loadChar(AVNER);
const W = loadWorld(C, C);

function placed(gap, at = 0) {
  const g = createGame(W);
  g.players[0].x = px(at - gap / 2);
  g.players[1].x = px(at + gap / 2);
  return g;
}
const run = (g, s1, s2 = '') => {
  const a = script(s1);
  const b = s2 ? script(s2) : [];
  const cues = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) { step(g, [a[i] ?? 0, b[i] ?? 0], W); cues.push(...g.cues.map((c) => ({ ...c }))); }
  return cues;
};
/** Step (holding the given inputs) until pred(g) holds; returns how many steps it took. */
function until(g, pred, in1 = '5', in2 = '5', max = 400) {
  const [a] = script(in1), [b] = script(in2);
  for (let n = 1; n <= max; n++) { step(g, [a, b], W); if (pred(g)) return n; }
  throw new Error(`never happened (P1 ${g.players[0].state}, P2 ${g.players[1].state})`);
}
/** P1 presses R (it was 22S until the universal systems spec, section 8, moved Vigil to the Rite button) and is left on the first frame of the stance loop. p2 = what P2 holds meanwhile. */
function intoStance(g, p2 = '5') {
  run(g, '5 5 5+R', `${p2}*3`);
  until(g, (s) => s.players[0].state === 'vigilStance', '5', p2);
}
const brand = (g) => g.players[0].vars.brand;
const branded = (g) => { g.players[0].vars.brand = 300; };
const holds = (name) => C.sheets[name].holds;
const activeFrames = (name) => C.states[name].frames.map((f, i) => (f.hit.length ? i : -1)).filter((i) => i >= 0);

// ---------- Frame data ----------

test('Vigil: every move has the frame data and drawing holds of the spec', () => {
  const s = C.states;
  assert.equal(s.vigil.duration, 20, 'entry: 20 frames');
  assert.ok(s.vigil.frames.every((f) => !f.armor && !f.invStrike && !f.invThrow && f.hurt.length), 'entry: no armor, no invulnerability');
  assert.equal(s.vigil.next, 'vigilStance');
  assert.deepEqual([s.vigilStance.duration, s.vigilStance.loop, s.vigilStance.timeout, s.vigilStance.timeoutTo, s.vigilStance.onBack], [24, true, 120, 'vigilExit', 'vigilExit']);
  assert.deepEqual(holds('vigilStance'), [3, 3, 3, 3, 3, 3, 3, 3], 'loop: 8 drawings, 3 frames each');
  assert.ok(!s.vigilStance.free, 'no walking or blocking in the stance');

  assert.deepEqual([s.vigilSnap.move.startup, s.vigilSnap.move.active, s.vigilSnap.move.recovery, s.vigilSnap.move.guard], [7, 3, 14, 'low']);
  assert.deepEqual(activeFrames('vigilSnap'), [6, 7, 8]);
  assert.deepEqual(holds('vigilSnap'), [3, 3, 3, 7, 7]);
  assert.equal(s.vigilSnap.next, 'vigilStance');

  assert.equal(s.vigilM.onEnter.findIndex((e) => e.some((x) => x.type === 'spawn')), 15, 'the crescent leaves on frame 16');
  assert.equal(s.vigilM.duration, 16 + 22, 'startup 16, then 22 frames of recovery');
  assert.equal(s.vigilM.frames[15].sprite.index, 4, 'it leaves on drawing 5');
  assert.equal(s.vigilM.next, 'vigilStance');

  assert.deepEqual(activeFrames('vigilAnchor'), [12, 13, 14, 15, 16, 17, 18, 19], 'startup 13, active 8');
  assert.deepEqual(holds('vigilAnchor'), [3, 5, 4, 3, 5]);
  assert.deepEqual([s.vigilAnchorCatch.duration, s.vigilAnchorCatch.next], [22, 'idle']);
  assert.deepEqual(holds('vigilAnchorCatch'), [8, 8, 6]);
  assert.deepEqual([s.vigilAnchorMiss.duration, s.vigilAnchorMiss.next], [34, 'idle']);
  assert.deepEqual(holds('vigilAnchorMiss'), [12, 12, 10]);

  assert.equal(s.vigilFlare.duration, 10, 'startup 11: the Brand bursts on the 11th frame');
  assert.deepEqual([...holds('vigilFlare'), ...holds('vigilFlareBurst')], [3, 4, 3, 3, 8, 8]);
  assert.deepEqual(activeFrames('vigilFlareBurst'), [0]);
  assert.equal(s.vigilFlareBurst.duration - holds('vigilFlareBurst')[0], 16, '16 frames of recovery after the snap drawing');
  assert.equal(s.vigilFlareBurst.next, 'vigilStance');
  assert.equal(s.vigilFlareBurst.move.guard, 'unblockable');
  assert.deepEqual(holds('vigilFlareFizzle'), [3, 6, 6]);
  assert.deepEqual([s.vigilFlareFizzle.duration, s.vigilFlareFizzle.next], [15, 'idle']);

  assert.deepEqual([s.vigilExit.duration, s.vigilExit.next], [12, 'idle']);
  assert.deepEqual(holds('vigilExit'), [3, 3, 3, 3]);
  for (const n of ['vigilExit', 'vigilAnchorMiss', 'vigilFlareFizzle']) assert.ok(s[n].frames.every((f) => f.hurt.length && !f.invStrike), `${n} is punishable`);
});

test('Vigil: drawing 1 of every follow-up is the stance loop\'s first drawing', () => {
  for (const n of ['vigilM', 'vigilFlare']) {
    assert.deepEqual(C.states[n].frames[0].sprite, { sheet: 'vigilStance', index: 0 }, n);
    assert.equal(C.states[n].frames[holds(n)[0]].sprite.sheet, n, `${n}: its own drawings after that`);
  }
  // Every state of the kit is drawn on every frame (placeholders included).
  for (const n of ['vigil', 'vigilStance', 'vigilSnap', 'vigilM', 'vigilAnchor', 'vigilAnchorCatch', 'vigilAnchorMiss', 'vigilFlare', 'vigilFlareBurst', 'vigilFlareFizzle', 'vigilExit']) {
    assert.ok(C.states[n].frames.every((f) => f.sprite), `${n}: every frame has a drawing`);
    const sheet = C.sheets[n];
    assert.equal(sheet.holds.reduce((a, b) => a + b, 0), C.states[n].duration, `${n}: the drawings fill it exactly`);
  }
});

// ---------- The stance ----------

test('Vigil stance: R enters it after 20 frames; it lasts 120 frames, then exits by itself in 12', () => {
  const g = placed(600);
  run(g, '5 5 5+R');
  assert.equal(g.players[0].state, 'vigil');
  assert.equal(until(g, (s) => s.players[0].state === 'vigilStance'), 20);
  assert.equal(until(g, (s) => s.players[0].state === 'vigilExit'), 120, 'the time limit');
  assert.equal(until(g, (s) => s.players[0].state === 'idle'), 12);
});

test('Vigil stance: back leaves it; it cannot block; a hit ends it with a normal hit reaction', () => {
  const g = placed(600);
  intoStance(g);
  run(g, '5*30 4');
  assert.equal(g.players[0].state, 'vigilExit', 'back steps out');
  assert.equal(until(g, (s) => s.players[0].state !== 'vigilExit', '5'), 12);

  // Entry is punishable: a jab during the 20 frames hits.
  const e = placed(70);
  run(e, '5 5 5+R 5*10', '5*4 5+L 5*9');
  assert.equal(e.players[0].state, 'hitStand', 'hit out of the entry');

  // In the stance: hit, even while the stance holder does nothing (and he has no guard to hold: back would exit).
  const h = placed(70);
  intoStance(h);
  run(h, '5*12', '5+L 5*11');
  assert.equal(h.players[0].state, 'hitStand');
  until(h, (s) => s.players[0].state === 'idle');
});

test('Vigil stance: follow-ups come out from the first frame of the loop, whatever direction is held', () => {
  for (const [btn, move] of [['L', 'vigilSnap'], ['M', 'vigilM'], ['H', 'vigilAnchor'], ['S', 'vigilFlare']]) {
    const g = placed(600);
    run(g, '5 5 5+R');
    until(g, (s) => s.players[0].state === 'vigil' && s.players[0].frame === 19); // the entry's last frame
    run(g, `5+${btn}`);
    assert.equal(g.players[0].state, move, `${btn} on the first loop frame`);
    const d = placed(600);
    intoStance(d);
    run(d, `5*5 2+${btn}`);
    assert.equal(d.players[0].state, move, `${btn} while holding down`);
  }
  // Outside the stance these buttons are his normals.
  const n = placed(600);
  run(n, '5+L');
  assert.equal(n.players[0].state, '5L');
});

// ---------- The Brand ----------

test('Brand: lasts 300 frames, one at a time (placing it again refreshes), and getting hit does not remove it', () => {
  const g = placed(90);
  intoStance(g);
  run(g, '5+L');
  until(g, (s) => brand(s) > 0);
  assert.equal(brand(g), 300);
  assert.equal(until(g, (s) => brand(s) === 0, '5', '5', 400), 300, 'it fades after 300 frames');

  const r = placed(90);
  intoStance(r);
  run(r, '5+L');
  until(r, (s) => brand(s) > 0);
  until(r, (s) => s.players[0].state === 'vigilStance');
  until(r, (s) => s.players[1].state === 'idle');
  const before = brand(r);
  assert.ok(before < 300);
  run(r, '5+L');
  until(r, (s) => brand(s) > before);
  assert.equal(brand(r), 300, 'refreshed, not stacked');

  // Avner is hit while his opponent carries the Brand: it stays (it only ticks down).
  const h = placed(70);
  branded(h);
  run(h, '5*20', '5+L 5*19');
  assert.equal(h.players[0].lastCombo?.hits ?? h.players[0].combo?.hits, 1, 'Avner was hit');
  assert.equal(brand(h), 280);
  // And the branded opponent being hit by something else keeps it too.
  const o = placed(70);
  branded(o);
  run(o, '5+L 5*10');
  assert.ok(o.players[1].combo || o.players[1].lastCombo);
  assert.equal(brand(o), 289);
});

// ---------- Snap ----------

function snapOn(g, p2 = '5') {
  intoStance(g); // P2 only starts guarding as the Snap comes out (holding back earlier would walk away)
  run(g, '5+L', p2);
  let stun = -1;
  const cues = [];
  for (let i = 0; i < 40 && g.players[0].state === 'vigilSnap'; i++) {
    step(g, [0, script(p2)[0]], W);
    cues.push(...g.cues.map((c) => c.type));
    if (stun < 0 && (cues.includes('hit') || cues.includes('block'))) stun = g.players[1].stun;
  }
  return { stun, cues };
}

test('Snap: on an unbranded opponent it places the Brand; on a branded one it staggers (+12) without consuming it', () => {
  const g = placed(90);
  const a = snapOn(g);
  assert.ok(a.cues.includes('hit'));
  assert.equal(a.stun, 16);
  assert.ok(brand(g) > 0, 'Brand placed on hit');
  assert.equal(g.players[0].state, 'vigilStance', 'recovers back into the stance');

  const b = placed(90);
  branded(b);
  const r = snapOn(b);
  assert.equal(r.stun, 16 + 12, 'the stagger');
  assert.ok(brand(b) >= 270, 'not consumed (refreshed to 300 on the hit, then ticking)');
});

test('Snap: low (blocked crouching only), short range, and a block places no Brand', () => {
  const stand = placed(90);
  assert.ok(snapOn(stand, '6').cues.includes('hit'), 'standing guard is hit');
  const crouch = placed(90);
  const r = snapOn(crouch, '3');
  assert.ok(r.cues.includes('block') && !r.cues.includes('hit'));
  assert.equal(brand(crouch), 0, 'no Brand on block');
  const far = placed(260);
  const w = snapOn(far);
  assert.ok(!w.cues.includes('hit') && !w.cues.includes('block'), 'whiffs from farther than about a body length');
});

// ---------- Vigil M: the crescent ----------

/** P1 in the stance throws the crescent; steps until it is gone. Returns the cues and P2's stun on contact. */
function crescent(g, p2 = '5', max = 200) {
  intoStance(g, p2);
  run(g, '5+M', p2);
  const cues = [];
  let stun = -1, seen = false, peak = 0;
  for (let i = 0; i < max; i++) {
    step(g, [0, script(p2)[0]], W);
    cues.push(...g.cues.map((c) => ({ ...c })));
    if (g.projectiles.length) seen = true;
    peak = Math.max(peak, g.projectiles.length);
    if (stun < 0 && cues.some((c) => c.type === 'hit' || c.type === 'block')) stun = g.players[1].stun;
    if (seen && !g.projectiles.length) break;
  }
  return { cues, stun, seen, peak, end: cues.find((c) => c.type === 'projectileEnd') };
}

test('Vigil M: the crescent spawns on frame 16, flies 9 px a frame at chest height, and is a real object in the game state', () => {
  const g = placed(1200);
  intoStance(g);
  run(g, '5+M');
  assert.equal(g.players[0].state, 'vigilM');
  assert.equal(until(g, (s) => s.projectiles.length === 1), 15, 'frame 16 of the move');
  const pr = { ...g.projectiles[0] };
  assert.deepEqual([pr.owner, pr.kind, pr.facing, pr.age], [0, 'vigilCrescent', 1, 0]);
  assert.ok(pr.x > g.players[0].x && pr.y > px(60) && pr.y < px(130), 'in front of him, at chest height');
  run(g, '5*10');
  assert.equal(g.projectiles[0].x - pr.x, 10 * px(9));
  assert.equal(g.projectiles[0].y, pr.y, 'straight forward');
  assert.deepEqual(deserializeState(serializeState(g)).projectiles, g.projectiles, 'plain data: saves and loads');
  const d = C.projectiles.vigilCrescent;
  const [, , w, h] = d.hitbox[0];
  assert.ok(h >= px(160) && w <= px(30), 'a tall thin hitbox, about his height');
  assert.equal(d.move.guard, 'mid');
  until(g, (s) => s.players[0].state === 'vigilStance');
});

test('Vigil M: hitting an unbranded opponent places the Brand; a branded one is staggered (+14) and keeps it', () => {
  const g = placed(500);
  const a = crescent(g);
  assert.equal(a.end.why, 'hit');
  assert.equal(a.stun, 18);
  assert.ok(brand(g) > 0);
  assert.equal(g.projectiles.length, 0, 'one hit, then it is gone');
  assert.equal(g.players[1].combo.hits, 1);
  assert.ok(g.players[1].health < C.stats.health && g.players[1].health > C.stats.health - 600, 'low damage');
  assert.equal(g.players[0].hitstop, 0, "the crescent's hit does not freeze Avner");

  const b = placed(500);
  branded(b);
  const r = crescent(b);
  assert.equal(r.stun, 18 + 14, 'the stagger, from range');
  assert.ok(brand(b) > 200, 'not consumed');
});

test('Vigil M: blocked high or low it places no Brand and disappears', () => {
  for (const guard of ['6', '3']) {
    const g = placed(500);
    const r = crescent(g, guard);
    assert.equal(r.end.why, 'block', `guard ${guard}`);
    assert.equal(brand(g), 0);
    assert.equal(g.projectiles.length, 0);
    assert.ok(g.players[1].state.startsWith('block'));
  }
});

test('Vigil M: it disappears when it runs out of screen, and at the stage edge', () => {
  // Too far to reach: it runs its distance (lifetime in data) and vanishes.
  const g = placed(1440);
  const r = crescent(g, '5', 300);
  assert.equal(r.end.why, 'edge');
  assert.equal(g.players[1].health, C.stats.health);
  const life = C.projectiles.vigilCrescent.lifetime;
  assert.ok(Math.abs(r.end.x - g.players[0].x) <= px(9) * life + px(100));
  // The stage edge itself: a crescent flying at the wall with nobody in the way.
  const e = placed(200, -500);
  e.projectiles.push({ owner: 1, kind: 'vigilCrescent', x: px(700), y: px(95), facing: 1, age: 0 });
  const cues = run(e, '5*20');
  const end = cues.find((c) => c.type === 'projectileEnd');
  assert.equal(end.why, 'edge');
  assert.ok(end.x > W.battle.halfWidthUnits && end.x <= W.battle.halfWidthUnits + px(9));
  assert.equal(e.projectiles.length, 0);
});

test('Vigil M: two crescents that meet both vanish, and nobody is hit', () => {
  const g = placed(700);
  run(g, '5 5 5+R', '5 5 5+R');
  until(g, (s) => s.players[0].state === 'vigilStance' && s.players[1].state === 'vigilStance');
  const cues = run(g, '5+M 5*80', '5+M 5*80');
  const ends = cues.filter((c) => c.type === 'projectileEnd');
  assert.equal(ends.length, 2);
  assert.ok(ends.every((c) => c.why === 'clash'));
  assert.equal(g.projectiles.length, 0);
  assert.ok(!cues.some((c) => c.type === 'hit' || c.type === 'block'));
  assert.deepEqual(g.players.map((p) => p.health), [C.stats.health, C.stats.health]);
});

test('Vigil M: locked out while a crescent is on screen, available again once it is gone', () => {
  const g = placed(1440);
  intoStance(g);
  run(g, '5+M');
  until(g, (s) => s.players[0].state === 'vigilStance'); // recovered; the crescent is still flying
  assert.equal(g.projectiles.length, 1);
  run(g, '5+M 5*3');
  assert.equal(g.players[0].state, 'vigilStance', 'M does nothing while it is out');
  assert.equal(g.projectiles.length, 1);
  run(g, '5+L');
  assert.equal(g.players[0].state, 'vigilSnap', 'the other follow-ups still work');
  until(g, (s) => s.projectiles.length === 0);
  until(g, (s) => s.players[0].state === 'vigilStance');
  run(g, '5+M');
  assert.equal(g.players[0].state, 'vigilM');
});

// ---------- Anchor ----------

test('Anchor: catches a branded opponent standing in its path, consumes the Brand, pulls them in and leaves Avner +20', () => {
  const g = placed(260);
  branded(g);
  intoStance(g);
  run(g, '5+H');
  until(g, (s) => s.players[0].state === 'vigilAnchorCatch');
  assert.equal(brand(g), 0, 'the Brand is consumed');
  assert.equal(g.players[1].state, 'hitStand');
  let free0 = -1, free1 = -1, n = 0;
  while (free0 < 0 || free1 < 0) {
    step(g, [0, 0], W); n++;
    if (free0 < 0 && g.players[0].state === 'idle') free0 = n;
    if (free1 < 0 && g.players[1].state === 'idle') free1 = n;
    if (free0 === n) assert.equal(Math.abs(g.players[1].x - g.players[0].x), C.states.vigilAnchor.move.pull.to, 'pulled to the fixed combo distance by the time the catch ends');
    assert.ok(n < 200);
  }
  assert.equal(free1 - free0, 20, 'Avner is +20');
  // It is a real hit from Avner: a combo follows.
  const c = placed(260);
  branded(c);
  intoStance(c);
  run(c, '5+H');
  until(c, (s) => s.players[0].state === 'idle');
  run(c, '5+L 5*8');
  assert.equal(c.players[1].combo.hits, 2, '5L links after the catch');
});

test('Anchor: against an unbranded opponent standing in its path it does not hit at all, and the whiff is 34 frames', () => {
  const g = placed(260);
  intoStance(g);
  const cues = run(g, '5+H 5*19');
  assert.equal(g.players[0].state, 'vigilAnchor');
  run(g, '5');
  assert.equal(g.players[0].state, 'vigilAnchorMiss', 'the miss branch');
  assert.ok(!cues.some((c) => ['hit', 'block', 'counter', 'clash'].includes(c.type)));
  assert.deepEqual([g.players[1].state, g.players[1].health], ['idle', C.stats.health], 'untouched, though standing on the chain');
  assert.equal(until(g, (s) => s.players[0].state === 'idle'), 34);
  // Branded but out of its reach: also a whiff, and the Brand stays.
  const far = placed(900);
  branded(far);
  intoStance(far);
  run(far, '5+H 5*20');
  assert.equal(far.players[0].state, 'vigilAnchorMiss');
  assert.ok(brand(far) > 0);
  const reach = C.states.vigilAnchor.frames[12].hit[0];
  assert.ok(reach[0] + reach[2] >= px(250), 'about three body lengths along the ground');
});

// ---------- Flare ----------

test('Flare: detonates the Brand from full screen: a small unblockable hit, 20 frames of hitstun, Brand consumed, back to the stance', () => {
  for (const p2 of ['5', '6', '3']) { // standing, guarding high, guarding low: it can't be blocked
    const g = placed(1400);
    branded(g);
    intoStance(g, p2);
    run(g, '5+S', p2);
    assert.equal(until(g, (s) => s.cues.some((c) => c.type === 'hit'), '5', p2), 10, 'the Brand bursts on frame 11');
    assert.equal(g.players[0].state, 'vigilFlareBurst');
    assert.equal(g.players[1].stun, 20);
    assert.equal(g.players[1].combo.hits, 1, "a hit from Avner, wherever the opponent is");
    assert.equal(brand(g), 0, 'consumed');
    assert.ok(g.players[1].health < C.stats.health && g.players[1].health >= C.stats.health - 400, 'low damage');
    until(g, (s) => s.players[0].state !== 'vigilFlareBurst', '5', p2);
    assert.equal(g.players[0].state, 'vigilStance');
  }
});

test('Flare: with no Brand it fizzles: nothing happens to the opponent and Avner drops out of the stance', () => {
  const g = placed(1400);
  intoStance(g);
  run(g, '5+S');
  const cues = [];
  assert.equal(until(g, (s) => { cues.push(...s.cues.map((c) => c.type)); return s.players[0].state === 'vigilFlareFizzle'; }), 10);
  assert.equal(until(g, (s) => { cues.push(...s.cues.map((c) => c.type)); return s.players[0].state === 'idle'; }), 15, 'ends standing');
  assert.ok(!cues.includes('hit'));
  assert.deepEqual([g.players[1].state, g.players[1].health], ['idle', C.stats.health]);
});

// ---------- The Back Heavy ----------

test('Back Heavy (4H): reach and hitbox length doubled, everything else as it was', () => {
  const m = C.states.backHeavy.move;
  assert.deepEqual([m.startup, m.active, m.recovery, m.damage, m.selfPushback], [11, 3, 22, 850, px(22)]);
  assert.equal(m.reach, px(200));
  const box = C.states.backHeavy.frames[m.startup - 1].hit[0];
  assert.equal(box[2], px(180), 'hitbox length, in data');
  assert.equal(box[0] + box[2], px(200));
  const g = placed(190 + 30); // P2's body starts 30 px in front of its centre
  run(g, '4+H 5*13');
  assert.equal(g.players[1].state, 'hitStand', 'hits at twice the old distance');
  const out = placed(240 + 30);
  run(out, '4+H 5*13');
  assert.equal(out.players[1].state, 'idle');
});

// ---------- Determinism ----------

test('the Vigil kit is deterministic and rollback-safe: same inputs, same game; a saved state resumes identically', () => {
  const s1 = script('5 5 5+R 5*22 5+M 5*40 5+L 5*30 5+S 5*40 5+H 5*60 4 5*20');
  const s2 = script('5*10 5 5 5+R 5*24 5+M 5*50 6*30 3*30 5*80');
  const play = (from = null, start = 0) => {
    const g = from ? cloneState(from) : placed(520);
    const hashes = [];
    let saved = null;
    for (let i = start; i < s1.length; i++) {
      if (i === 46) saved = cloneState(g);
      step(g, [s1[i], s2[i] ?? 0], W);
      hashes.push(hashStateOf(g));
    }
    return { hashes, saved };
  };
  const hashStateOf = (g) => hashState(g);
  const a = play();
  const b = play();
  assert.deepEqual(a.hashes, b.hashes);
  assert.ok(a.saved.projectiles.length > 0, 'the save point has a crescent in flight');
  const c = play(a.saved, 46);
  assert.deepEqual(c.hashes, a.hashes.slice(46), 'resumed from a save with a projectile in the air');
});

test('Vigil entry: no drawing is held; it runs into the stance loop without a pause', () => {
  const fr = C.states.vigil.frames.map((f) => f.sprite.sheet + f.sprite.index);
  let run = 1, longest = 1;
  for (let i = 1; i < fr.length; i++) { run = fr[i] === fr[i - 1] ? run + 1 : 1; longest = Math.max(longest, run); }
  assert.ok(longest <= 5, 'no drawing stays longer than 5 frames');
  assert.equal(fr[0], 'vigil0', 'it opens on the wind-up drawing');
  assert.deepEqual(C.states.vigil.frames.at(-1).sprite, { sheet: 'vigilStance', index: 7 }, 'ends on the last loop drawing, so the loop continues from its first');
  assert.equal(C.states.vigil.duration, 20, 'still 20 frames');
});
