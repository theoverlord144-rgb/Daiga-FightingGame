import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter, importToska, parseInput, frameOf } from '../src/core/character.js';
import { createGame, step } from '../src/core/game.js';
import { CONTACT } from '../src/core/fighter.js';
import { px } from '../src/core/fixed.js';
import { loadJSON, loadWorld, script, SYSTEM } from './helpers.js';

const V1 = loadJSON('tests/fixtures/v1-sample.toska.json');

/** Run P1's script (P2 idle); returns [{state, frame}] after each step. */
function drive(world, game, p1Script) {
  const out = [];
  for (const r of script(p1Script)) {
    step(game, [r, 0], world);
    const p = game.players[0];
    out.push({ state: p.state, frame: p.frame });
  }
  return out;
}

/** An inline test character (version 2). */
function testChar(moves, states = {}) {
  return compileCharacter({ engine: 'Toska', version: 2, character: { id: 'tester', stats: {} }, moves, states }, SYSTEM);
}

// ---------- Loading ----------

test('a version 1 export loads: ids, commands, frame data, durations', () => {
  const c = compileCharacter(V1, SYSTEM);
  assert.equal(c.version, 2);
  assert.equal(c.upgradedFrom, 1);
  assert.equal(c.id, 'sample');
  assert.ok(c.states['5L'] && c.states['623H'], 'ids default to the input');
  assert.equal(c.states['5L'].duration, 3 - 1 + 2 + 6);
  assert.equal(c.states['623H'].kind, 'special');
  assert.equal(c.states['5L'].kind, 'normal');
  assert.equal(c.states['5L'].move.damage, 300);
  assert.equal(c.states['5L'].move.pushbackBlock, px(20));
  assert.deepEqual(c.commands.map((k) => k.move), ['623H', '5L'], 'specials first');
});

test('version 1 sprite sheets drive sprite events: holds, and an even spread without holds', () => {
  const c = compileCharacter(V1, SYSTEM);
  const idx = (st) => c.states[st].frames.map((f) => f.sprite.index);
  assert.deepEqual(idx('5L'), [0, 0, 1, 2, 2, 3, 3, 3, 4, 4], 'holds 2,1,2,3,3');
  const spread = idx('623H');
  assert.equal(spread.length, 30);
  assert.deepEqual([0, 3, 7, 11, 15, 18, 22, 26].map((f) => spread[f]), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(c.states.idle.frames[8].sprite.index, 1, 'a v1 move named like a system state gives it a sheet');
  assert.equal(c.states['5L'].frames[0].sprite.sheet, '5L');
});

test('bad files are refused with a clear message', () => {
  assert.throws(() => importToska({ engine: 'Other', version: 1 }), /Not a Toska file/);
  assert.throws(() => importToska({ engine: 'Toska', version: 99, character: {}, moves: [] }), /Unsupported Toska version 99/);
  assert.throws(() => testChar([{ id: 'a', input: '5L', cancels: [{ into: ['nope'] }] }]), /unknown move nope/);
  assert.throws(() => testChar([{ id: 'a', input: '5L' }, { id: 'a', input: '5M' }]), /duplicate/);
});

test('importing never changes the file it was given', () => {
  const copy = structuredClone(V1);
  compileCharacter(V1, SYSTEM);
  assert.deepEqual(V1, copy);
});

test('numpad notation parses', () => {
  assert.deepEqual(parseInput('5L'), { air: false, motion: null, dir: '5', buttons: 'L' });
  assert.deepEqual(parseInput('j.236S'), { air: true, motion: '236', dir: null, buttons: 'S' });
  assert.deepEqual(parseInput('[4]6H'), { air: false, motion: '[4]6', dir: null, buttons: 'H' });
  assert.deepEqual(parseInput('2M'), { air: false, motion: null, dir: '2', buttons: 'M' });
});

// ---------- Playback ----------

test('a move plays its frames in order, then returns to idle', () => {
  const world = loadWorld();
  const g = createGame(world);
  const len = world.chars[0].states['5L'].duration; // 4-1+2+7 = 12
  const seen = drive(world, g, `5+L 5*${len}`);
  for (let i = 0; i < len; i++) assert.deepEqual(seen[i], { state: '5L', frame: i }, `step ${i + 1}`);
  assert.equal(seen[len].state, 'idle');
});

test('hitboxes are out exactly on the active frames', () => {
  const c = loadWorld().chars[0];
  const st = c.states['5H']; // 9 startup, 3 active
  const active = st.frames.map((f, i) => (f.hit.length ? i : -1)).filter((i) => i >= 0);
  assert.deepEqual(active, [8, 9, 10]);
  assert.ok(st.frames.every((f) => f.hurt.length), 'hurtbox on every frame');
});

test('timeline events fire on the right frames: velocity, cues, ranges, multi-hit ids', () => {
  const c = testChar([{
    id: 'dash-punch', input: '5H', startup: 5, active: 4, recovery: 6,
    hitboxes: [[0, 50, 40, 20]],
    timeline: [
      { at: 2, vel: { x: 6 }, sound: 'whoosh' },
      { at: 6, hit: [[0, 50, 50, 20]] },
      { from: 1, to: 3, invuln: { strike: true } },
      { at: 4, fx: 'spark' },
    ],
  }]);
  const st = c.states['dash-punch'];
  assert.deepEqual(st.onEnter[2].map((s) => s.type), ['vel', 'sound']);
  assert.deepEqual(st.onEnter[4].map((s) => s.type), ['fx']);
  assert.deepEqual(st.frames.map((f) => f.invStrike), [false, true, true, true, false, false, false, false, false, false, false, false, false, false]);
  assert.deepEqual(st.frames.slice(3, 10).map((f) => f.hitId), [0, 1, 1, 2, 2, 0, 0], 'a new hit event is a new hit');

  const world = loadWorld(c, c);
  const g = createGame(world);
  const startX = g.players[0].x;
  step(g, [script('5+H')[0], 0], world); // frame 0
  step(g, [0, 0], world); // frame 1
  assert.equal(g.cues.length, 0);
  step(g, [0, 0], world); // frame 2: velocity set, sound cue
  assert.deepEqual(g.cues.map((q) => q.name), ['whoosh']);
  assert.equal(g.players[0].vx, px(6));
  assert.equal(g.players[0].x, startX + px(6), 'moved on the same frame');
  step(g, [0, 0], world);
  assert.equal(g.cues.length, 0, 'cues last one frame');
});

test('cancel windows open and close on time (5L: frames 3-9, on hit or block)', () => {
  const world = loadWorld();
  const run = (pressAt, contact) => {
    const g = createGame(world);
    step(g, [script('5+L')[0], 0], world);
    g.players[0].contact = contact;
    const states = ['5L'];
    for (let f = 1; f < 14; f++) {
      step(g, [f === pressAt ? script('5+M')[0] : 0, 0], world);
      states.push(`${g.players[0].state}@${g.players[0].frame}`);
    }
    return states;
  };
  // Pressed on frame 1: buffered, comes out the moment the window opens at frame 3.
  const early = run(1, CONTACT.HIT);
  assert.equal(early[2], '5L@2');
  assert.equal(early[3], '5M@0');
  // Pressed on the last open frame (9): cancels.
  assert.equal(run(9, CONTACT.BLOCK)[9], '5M@0');
  // Pressed after the window (frame 10): no cancel. 5L plays out in full; the press is still in the 4-frame
  // buffer when 5L ends, so 5M starts as a fresh move on the first free frame.
  const late = run(10, CONTACT.HIT);
  assert.equal(late.indexOf('5L@11'), 11, late.join(' '));
  assert.equal(late[12], '5M@0', late.join(' '));
  // On whiff, this window stays shut.
  assert.ok(run(5, CONTACT.NONE).every((s) => !s.startsWith('5M')));
});

test('cancels obey their list: 5H cannot cancel into 5L', () => {
  const world = loadWorld();
  const g = createGame(world);
  step(g, [script('5+H')[0], 0], world);
  g.players[0].contact = CONTACT.HIT;
  for (let f = 1; f < 12; f++) step(g, [f === 9 ? script('5+L')[0] : 0, 0], world);
  assert.equal(g.players[0].state, '5H');
});

test('commands: specials beat normals, exact directions beat 5, crouch and air normals', () => {
  const c = testChar([
    { id: '5H', input: '5H', startup: 5, active: 2, recovery: 5 },
    { id: '6H', input: '6H', startup: 5, active: 2, recovery: 5 },
    { id: '236H', input: '236H', startup: 5, active: 2, recovery: 5 },
    { id: '2H', input: '2H', startup: 5, active: 2, recovery: 5 },
    { id: 'j.H', input: 'j.H', startup: 5, active: 2, recovery: 5 },
  ]);
  const world = loadWorld(c, c);
  const last = (s) => { const g = createGame(world); const r = drive(world, g, s); return r[r.length - 1].state; };
  assert.equal(last('5 2 3 6+H'), '236H');
  assert.equal(last('5 6+H'), '6H');
  assert.equal(last('5 5+H'), '5H');
  assert.equal(last('5 4+H'), '5H', 'back + H is still the 5 normal');
  assert.equal(last('5 2+H'), '2H');
  assert.equal(last('5 8*8 5+H'), 'j.H', 'in the air, H is the air normal');
});

test('one press, one move: holding the button does not repeat it', () => {
  const world = loadWorld();
  const g = createGame(world);
  const seen = drive(world, g, '5+L*40');
  const starts = seen.filter((s) => s.state === '5L' && s.frame === 0).length;
  assert.equal(starts, 1);
});

test('fighters face each other and walk, crouch and jump from data', () => {
  const world = loadWorld();
  const g = createGame(world);
  assert.equal(g.players[0].facing, 1);
  assert.equal(g.players[1].facing, -1);
  const x0 = g.players[0].x;
  drive(world, g, '6*10');
  assert.equal(g.players[0].state, 'walkF');
  assert.equal(g.players[0].x, x0 + 10 * world.chars[0].stats.walkForward);
  drive(world, g, '2');
  assert.equal(g.players[0].state, 'crouch');
  const seen = drive(world, g, '5*10 8 5*200'); // neutral first: down straight into up is a super jump
  assert.ok(seen.some((s) => s.state === 'jump'));
  assert.equal(g.players[0].y, 0, 'landed');
  assert.equal(g.players[0].state, 'idle');
  assert.equal(frameOf(world.chars[0], 'idle', 999).hurt.length, 1, 'frameOf clamps past the end');
});
