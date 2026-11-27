// Khai'ro's Sky Maul (j.214 L / M / H and the EX; owner's brief, Nov 26): an air command grab he can combo into.
// The numbers are first guesses and are read from his file; what is pinned is the brief's behaviour: who the grab
// takes, that the opponent is held where his drawings say, the rakes per strength, the ride down, the slam, the miss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const PATH = 'data/characters/khairo/khairo.toska.json';
const MALIK = 'data/characters/malik/malik.toska.json';
const FILE = loadJSON(PATH);
const move = (id) => FILE.moves.find((m) => m.id === id);

/** Both in the air, the opponent just in front of him in `their` state; he does j.214 + buttons. Returns what happened. */
function run(buttons = 'L', their = 'hitAir', { meter = 0, frames = 260, grounded = false } = {}) {
  const world = loadWorld(PATH, MALIK);
  const game = createGame(world);
  const [a, d] = game.players;
  a.x = -px(40); d.x = px(30); a.meter = meter;
  enterState(a, world.chars[0], 'jump'); a.y = px(200); a.vy = 0; a.vx = 0;
  if (!grounded) { enterState(d, world.chars[1], their); d.y = px(230); d.vy = 0; d.stun = 40; }
  const out = { world, game, a, d, states: [], theirs: [], hits: [], held: [], hp: d.health };
  for (const raw of script(`2 1 4+${buttons} 5*${frames}`)) {
    step(game, [raw, their === 'jump' ? script('4')[0] : 0], world);
    if (out.states.at(-1) !== a.state) out.states.push(a.state);
    if (out.theirs.at(-1) !== d.state) out.theirs.push(d.state);
    for (const c of game.cues) if (c.type === 'hit') out.hits.push(c.move);
    if (d.state === 'grabbed') out.held.push({ state: a.state, frame: a.frame, dx: (d.x - a.x) * a.facing, dy: d.y - a.y, ay: a.y, by: d.heldBy });
    if (a.state === 'idle' && game.frame > 40 && !d.combo) break;
  }
  return out;
}

test('Sky Maul: 214 in the air, three strengths; on the ground 214 is still Low Blade; the sheets are cut', () => {
  for (const k of ['L', 'M', 'H']) {
    const m = move(`skyMaul${k}`);
    assert.equal(m.input, `j.214${k}`);
    assert.equal(m.grab, true); assert.equal(m.hitsGrounded, false);
    assert.equal(m.startup, 5, 'the grab comes out on frame 5'); assert.equal(m.active, 3, 'and stays out through frame 7');
    assert.equal(move(`lowBlade${k}`).input, `214${k}`);
  }
  for (const f of ['skymaul', 'skymaul-slam']) assert.ok(fs.existsSync(`data/characters/khairo/sheets/${f}.png`));
  const def = loadChar(PATH);
  assert.equal(def.states.skyMaulL.frames[4].sprite.index, 1, 'the grab is out on the lunge drawing');
});

test('Sky Maul: grabs an airborne opponent in hitstun, holds them where his drawings say, and nothing lets them out', () => {
  const r = run('L');
  assert.deepEqual(r.states, ['jump', 'skyMaulL', 'skyMaulLMaul', 'skyMaulLRide', 'skyMaulLSlam', 'idle']);
  assert.deepEqual(r.theirs.slice(0, 2), ['hitAir', 'grabbed']);
  assert.ok(r.held.length > 30);
  const def = r.world.chars[0];
  for (const h of r.held.slice(1)) {
    assert.equal(h.by, 0);
    const hold = def.states[h.state].frames[Math.min(h.frame, def.states[h.state].frames.length - 1)].hold;
    if (!hold) continue; // the frame that lets go
    assert.equal(h.dx, hold.x, `${h.state} frame ${h.frame}: forward`);
    assert.equal(h.dy, Math.max(-h.ay, hold.y), `${h.state} frame ${h.frame}: height (never under the floor)`);
  }
  // per-drawing places are data on his frames: in front of his chest while he rakes, under him on the ride
  const chest = def.states.skyMaulLMaul.frames[0].hold, under = def.states.skyMaulLRide.frames[0].hold;
  assert.ok(chest.x > 0 && under.y < chest.y);
  assert.equal(under.rot !== chest.rot, true, 'the opponent is turned for the ride');
});

test('Sky Maul: L rakes twice, M three times, H four times (the fourth is the big one), then the slam on landing', () => {
  const rakes = {};
  for (const k of ['L', 'M', 'H']) {
    const r = run(k);
    rakes[k] = r.hits.filter((h) => h === `skyMaul${k}Maul`).length;
    assert.equal(r.hits[0], `skyMaul${k}`, 'the grab');
    assert.equal(r.hits.at(-1), `skyMaul${k}Slam`, 'the slam is the last hit');
    assert.equal(r.hits.length, rakes[k] + 2);
    assert.ok(r.d.health < r.hp);
  }
  assert.deepEqual(rakes, { L: 2, M: 3, H: 4 });
  const big = move('skyMaulHMaul').timeline.find((e) => e.hitProps);
  assert.ok(big.hitProps.damage > move('skyMaulHMaul').damage && big.hitProps.hitstop > move('skyMaulHMaul').hitstop);
  // L: the hard knockdown (so an OTG can follow); M: thrown along the ground
  assert.ok(run('L').theirs.includes('knockdown'));
  assert.ok(run('M').theirs.includes('slide'));
});

test('Sky Maul: the ride falls half as fast again as a normal fall, so a higher grab rides longer', () => {
  const def = loadChar(PATH);
  for (const k of ['L', 'M', 'H', 'Ex']) {
    assert.equal(def.states[`skyMaul${k}Ride`].gravityPct, 15000);
    assert.equal(def.states[`skyMaul${k}Ride`].landTo, `skyMaul${k}Slam`);
  }
  assert.equal(def.states.fall.gravityPct, 10000);
});

test('Sky Maul: never a grounded opponent, never one in air blockstun; it does take one who is only jumping and holding back', () => {
  assert.equal(run('L', 'idle', { grounded: true }).hits.length, 0);
  const blocked = run('L', 'blockAir');
  assert.equal(blocked.hits.length, 0);
  assert.ok(!blocked.theirs.includes('grabbed'));
  const jumping = run('L', 'jump');
  assert.equal(jumping.theirs[1], 'grabbed', 'it cannot be air-blocked');
});

test('Sky Maul: a miss holds the lunge, falls helpless and lands in 14 frames of recovery', () => {
  const r = run('L', 'blockAir');
  assert.deepEqual(r.states, ['jump', 'skyMaulL', 'skyMaulFall', 'skyMaulWhiffLand', 'idle']);
  const def = loadChar(PATH);
  assert.equal(def.states.skyMaulWhiffLand.duration, 14);
  assert.equal(def.states.skyMaulFall.frames[0].sprite.index, 1, 'the lunge drawing');
  assert.equal(def.states.skyMaulFall.cancels.length, 0, 'nothing can be done on the way down');
});

test('Sky Maul EX: the motion with S for one bar; four rakes and the hardest slam', () => {
  const none = run('LS', 'hitAir', { meter: 0 });
  assert.ok(none.states.includes('skyMaulL') && !none.states.includes('skyMaulL_ex'), 'no bar: the plain version');
  const r = run('LS', 'hitAir', { meter: 10000 });
  assert.ok(r.states.includes('skyMaulL_ex'));
  assert.ok(r.states.includes('skyMaulExMaul') && r.states.includes('skyMaulExRide') && r.states.includes('skyMaulExSlam'));
  assert.equal(r.a.meter < 10000, true, 'it cost Devotion');
  assert.equal(r.hits.filter((h) => h === 'skyMaulExMaul').length, 4);
  assert.ok(move('skyMaulExSlam').damage > move('skyMaulHSlam').damage);
});
