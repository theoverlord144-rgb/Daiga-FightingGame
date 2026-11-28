// The box editor's drawing timing (owner, Nov 28): trading frames between neighbouring drawings so an attack's
// animation can be fine-tuned. The state's length and everything that is not a drawing must stay exactly as it was.
// The small cases use a made-up character; the sweep runs over the real cast's files (read, never written).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileCharacter } from '../src/core/character.js';
import { drawingRuns, timingPlan, moveChange, snapApplies } from '../src/editor/timing-model.js';
import { loadJSON, SYSTEM } from './helpers.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const sheet = (count, holds) => ({ image: 'sheets/x.png', columns: count, rows: 1, count, ...(holds ? { holds } : {}) });
const base = { startup: 5, active: 3, recovery: 10, damage: 500, hitstun: 20, blockstun: 10, hitboxes: [[0, 50, 60, 30]] }; // 17 frames
const file = () => ({
  engine: 'Toska', version: 2, character: { id: 't', stats: {} },
  moves: [
    { ...base, id: '5L', input: '5L', sprite: sheet(4, [3, 4, 5, 5]) },
    { ...base, id: '5M', input: '5M', sprite: sheet(4) }, // no holds: spread evenly
    { ...base, id: '5H', input: '5H', sprite: sheet(3, [17]), timeline: [{ at: 6, sprite: 1 }, { at: 9, sprite: 2, vel: { x: 4 } }] },
    { ...base, id: '236L', input: '236L', sprite: sheet(3, [5, 6, 6]), ex: { damage: 900 } },
  ],
  states: { pose: { stance: 'stand', duration: 12, next: 'idle', sprite: sheet(3, [4, 4, 4]) } },
});
const lens = (raw, name) => drawingRuns(compileCharacter(raw, SYSTEM).states[name]).map((r) => r.len);
/** Everything in a compiled state except which drawing shows. */
const rules = (st) => JSON.stringify({ ...st, frames: st.frames.map(({ sprite, ...f }) => f) }); // eslint-disable-line no-unused-vars

test('holds: the two drawings either side of the line trade frames, the move keeps its 17', () => {
  const raw = file();
  moveChange(raw, SYSTEM, '5L', 2, 2); // drawing 2 two frames longer, drawing 3 two shorter
  assert.deepEqual(raw.moves[0].sprite.holds, [3, 6, 3, 5]);
  assert.deepEqual(lens(raw, '5L'), [3, 6, 3, 5]);
  moveChange(raw, SYSTEM, '5L', 1, -1);
  assert.deepEqual(raw.moves[0].sprite.holds, [2, 7, 3, 5]);
});

test('no holds yet: the drawings on screen are written as holds, with the change made', () => {
  const raw = file();
  const before = lens(raw, '5M');
  moveChange(raw, SYSTEM, '5M', 1, 1);
  assert.deepEqual(raw.moves[1].sprite.holds, [before[0] + 1, before[1] - 1, before[2], before[3]]);
});

test('timeline drawings: the event moves; an event that does more on its frame gives up only its drawing', () => {
  const raw = file();
  moveChange(raw, SYSTEM, '5H', 1, -2);
  assert.equal(raw.moves[2].timeline[0].at, 4);
  assert.deepEqual(lens(raw, '5H'), [4, 5, 8]);
  moveChange(raw, SYSTEM, '5H', 2, 1);
  assert.deepEqual(raw.moves[2].timeline[1], { at: 9, vel: { x: 4 } }, 'the slide stays on frame 9');
  assert.deepEqual(raw.moves[2].timeline[2], { at: 10, sprite: 2 });
  assert.deepEqual(lens(raw, '5H'), [4, 6, 7]);
});

test('a character\'s own state can be retimed too', () => {
  const raw = file();
  moveChange(raw, SYSTEM, 'pose', 2, -3);
  assert.deepEqual(raw.states.pose.sprite.holds, [4, 1, 7]);
});

test('refused: a drawing would vanish, the line does not exist, the EX shares its drawings, a shared system state', () => {
  const raw = file();
  const keep = clone(raw);
  assert.throws(() => moveChange(raw, SYSTEM, '5L', 1, 4), /at least one frame/); // drawing 2 has 4
  assert.throws(() => moveChange(raw, SYSTEM, '5L', 1, -3), /at least one frame/); // drawing 1 has 3
  assert.throws(() => moveChange(raw, SYSTEM, '5L', 4, 1), /not a change/);
  assert.throws(() => moveChange(raw, SYSTEM, '236L_ex', 1, 1), /normal version/);
  assert.ok(!timingPlan(raw, SYSTEM, '236L_ex').ok);
  assert.ok(!timingPlan(raw, SYSTEM, 'hitStand').ok, 'no art of its own in this file');
  assert.deepEqual(raw, keep, 'nothing changed by a refusal');
});

test('snap timing applies only while the holds are the ones it was made from', () => {
  const raw = file();
  const snap = { moves: { '5L': { holds: [3, 4, 5, 5], snap: [2, 5, 5, 5], roles: ['a', 'b', 'c', 'd'] } } };
  assert.ok(snapApplies(snap, compileCharacter(raw, SYSTEM), '5L'));
  moveChange(raw, SYSTEM, '5L', 1, 1);
  assert.ok(!snapApplies(snap, compileCharacter(raw, SYSTEM), '5L'));
});

test('the cast: every line of every retimeable state moves both ways, and nothing but the drawings changes', () => {
  for (const id of ['avner', 'malik', 'warteun', 'khairo', 'toyle']) {
    const raw = loadJSON(`data/characters/${id}/${id}.toska.json`);
    const def = compileCharacter(raw, SYSTEM);
    let moved = 0;
    for (const name of Object.keys(def.states)) {
      const runs = drawingRuns(def.states[name]);
      if (runs.length < 2 || !timingPlan(raw, SYSTEM, name).ok) continue;
      for (let b = 1; b < runs.length; b++) {
        for (const d of [1, -1]) {
          if (runs[b - 1].len + d < 1 || runs[b].len - d < 1) continue;
          const r = clone(raw);
          try { moveChange(r, SYSTEM, name, b, d); } catch (err) {
            if (name.endsWith('_ex') && /normal version/.test(err.message)) continue; // drawn by the normal version
            throw new Error(`${id} ${name} line ${b} by ${d}: ${err.message}`);
          }
          const after = compileCharacter(r, SYSTEM).states[name];
          assert.equal(after.frames.length, def.states[name].frames.length, `${id} ${name}: length`);
          assert.equal(rules(after), rules(def.states[name]), `${id} ${name}: only the drawings may change`);
          moved++;
        }
        if (b >= 3) break; // the first three lines of each state are plenty (and keep the test quick)
      }
    }
    assert.ok(moved > 0, `${id}: nothing could be retimed`);
  }
});
