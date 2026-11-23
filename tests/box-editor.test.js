// The box editor's model and its file writer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadJSON, SYSTEM } from './helpers.js';
import { compileCharacter } from '../src/core/character.js';
import { px } from '../src/core/fixed.js';
import { sourcesAt, boxesOf, setBoxes, editable, overrideMove, overrideFromFrame, addHitboxField, removeSource, diffOps, applyOps, stateInfo, projectileNames, projectileSource } from '../src/editor/box-model.js';
import { editJSON, format } from '../scripts/json-edit.mjs';

const FILES = ['data/characters/avner/avner.toska.json', 'data/characters/proto/proto.toska.json'];
const units = (list) => list.map((b) => b.map(px));
const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * Avner's file with every hurtbox override taken out, so these tests start from the same place whatever boxes
 * have been tuned in the editor since (the tests are about the editor, not about Avner's numbers).
 */
function plainAvner() {
  const raw = loadJSON(FILES[0]);
  for (const k of ['standHurt', 'crouchHurt', 'airHurt']) delete raw.character.stats[k];
  for (const m of raw.moves) {
    if (!['5L', '5M'].includes(m.id)) continue;
    delete m.hurtboxes;
    if (m.timeline) m.timeline = m.timeline.filter((e) => e.hurt === undefined);
    if (m.timeline && !m.timeline.length) delete m.timeline;
  }
  if (raw.states?.idle?.timeline) raw.states.idle.timeline = raw.states.idle.timeline.filter((e) => e.hurt === undefined);
  return raw;
}

for (const file of FILES) {
  test(`box editor: on every frame of every state, the editor finds the boxes the game uses (${file.split('/').at(-1)})`, () => {
    const raw = loadJSON(file);
    const def = compileCharacter(raw, SYSTEM);
    let checked = 0;
    for (const [name, st] of Object.entries(def.states)) {
      for (let f = 0; f < st.frames.length; f++) {
        const src = sourcesAt(raw, SYSTEM, name, st.stance, f);
        assert.deepEqual(units(boxesOf(raw, SYSTEM, src.hurt)), st.frames[f].hurt, `${name} frame ${f}: hurtboxes`);
        assert.deepEqual(units(boxesOf(raw, SYSTEM, src.hit)), st.frames[f].hit, `${name} frame ${f}: hitboxes`);
        checked++;
      }
    }
    assert.ok(checked > 500);
  });
}

test('box editor: an edit lands where the game reads it, and nowhere else', () => {
  const raw = loadJSON(FILES[0]);
  const before = compileCharacter(raw, SYSTEM);
  const f = before.states['5L'].move.startup - 1;
  const src = sourcesAt(raw, SYSTEM, '5L', 'stand', f).hit;
  assert.ok(editable(src));
  setBoxes(raw, src, [[25, 101, 70, 22]]);
  const after = compileCharacter(raw, SYSTEM);
  assert.deepEqual(after.states['5L'].frames[f].hit, units([[25, 101, 70, 22]]));
  assert.deepEqual(after.states['5M'].frames, before.states['5M'].frames, 'other moves untouched');
  assert.deepEqual(after.states['5L'].frames[0].hit, [], 'still nothing out during startup');
});

test('box editor: hurtbox overrides (whole move, from a frame) and removing them again', () => {
  const raw = plainAvner();
  const start = clone(raw);
  const stand = compileCharacter(raw, SYSTEM).states.idle.frames[0].hurt;
  assert.equal(sourcesAt(raw, SYSTEM, '5M', 'stand', 0).hurt.kind, 'stat', 'a normal starts on the shared standing box');

  overrideMove(raw, SYSTEM, '5M', [[-20, 0, 50, 150]]);
  let def = compileCharacter(raw, SYSTEM);
  assert.ok(def.states['5M'].frames.every((fr) => JSON.stringify(fr.hurt) === JSON.stringify(units([[-20, 0, 50, 150]]))));
  assert.deepEqual(def.states.idle.frames[0].hurt, stand, 'the shared box is untouched');

  overrideFromFrame(raw, SYSTEM, '5M', 4, [[-20, 0, 90, 150]]);
  def = compileCharacter(raw, SYSTEM);
  assert.deepEqual(def.states['5M'].frames[3].hurt, units([[-20, 0, 50, 150]]));
  assert.deepEqual(def.states['5M'].frames[4].hurt, units([[-20, 0, 90, 150]]));
  assert.deepEqual(def.states['5M'].frames.at(-1).hurt, units([[-20, 0, 90, 150]]), 'lasts to the end of the move');

  removeSource(raw, sourcesAt(raw, SYSTEM, '5M', 'stand', 4).hurt);
  removeSource(raw, sourcesAt(raw, SYSTEM, '5M', 'stand', 4).hurt);
  assert.deepEqual(raw, start, 'both overrides gone: the file is as it was');

  // A system state (idle) gets its override under the character's "states".
  overrideFromFrame(raw, SYSTEM, 'idle', 0, [[-25, 0, 50, 170]]);
  def = compileCharacter(raw, SYSTEM);
  assert.deepEqual(def.states.idle.frames[10].hurt, units([[-25, 0, 50, 170]]));
  assert.deepEqual(def.states.walkF.frames[0].hurt, stand);
  removeSource(raw, sourcesAt(raw, SYSTEM, 'idle', 'stand', 0).hurt);
  assert.deepEqual(raw, start);
});

test('box editor: the shared stance box changes every state of that stance, and resets to the default', () => {
  const raw = plainAvner();
  const src = sourcesAt(raw, SYSTEM, 'idle', 'stand', 0).hurt;
  assert.deepEqual(src, { kind: 'stat', stat: 'standHurt' });
  setBoxes(raw, src, [[-26, 0, 52, 172]]);
  const def = compileCharacter(raw, SYSTEM);
  for (const name of ['idle', 'walkF', '5L', 'hitStand']) assert.deepEqual(def.states[name].frames[0].hurt, units([[-26, 0, 52, 172]]), name);
  assert.deepEqual(def.states.crouch.frames[0].hurt, units(SYSTEM.defaults.stats.crouchHurt));
  removeSource(raw, src);
  assert.deepEqual(compileCharacter(raw, SYSTEM).states.idle.frames[0].hurt, units(SYSTEM.defaults.stats.standHurt));
});

test('box editor: what cannot be edited says so', () => {
  const raw = loadJSON(FILES[0]);
  assert.equal(sourcesAt(raw, SYSTEM, 'knockdown', 'crouch', 5).hurt.kind, 'system', 'no hurtbox on the floor is a system rule');
  assert.equal(sourcesAt(raw, SYSTEM, '5L', 'stand', 0).hit.kind, 'none', 'no hitbox during startup');
  assert.equal(stateInfo(raw, SYSTEM, 'burst').type, 'universal');
  assert.throws(() => setBoxes(raw, { kind: 'none', value: [] }, [[0, 0, 1, 1]]));
  assert.throws(() => overrideMove(raw, SYSTEM, 'idle', []));
  // A move with active frames but no hitboxes can be given some.
  const m = raw.moves.find((x) => x.id === '5L');
  delete m.hitboxes;
  addHitboxField(raw, SYSTEM, '5L', [[20, 100, 60, 20]]);
  assert.deepEqual(m.hitboxes, [[20, 100, 60, 20]]);
});

test('saving: the changes are found, applied to the text, and nothing else in the file moves', () => {
  for (const file of FILES) {
    const text = fs.readFileSync(file, 'utf8');
    const base = JSON.parse(text);
    const raw = clone(base);
    const name = raw.moves.find((m) => m.hitboxes).id;
    const def = compileCharacter(raw, SYSTEM);
    const f = def.states[name].move.startup - 1;
    setBoxes(raw, sourcesAt(raw, SYSTEM, name, def.states[name].stance, f).hit, [[21, 99, 61, 21], [5, 5, 10, 10]]);
    overrideFromFrame(raw, SYSTEM, name, 2, [[-10, 0, 40, 140]]);
    overrideFromFrame(raw, SYSTEM, 'crouch', 0, [[-30, 0, 60, 90]]);
    setBoxes(raw, { kind: 'stat', stat: 'airHurt' }, [[-20, 10, 40, 120]]);
    const ops = diffOps(base, raw);
    const out = editJSON(text, ops);
    assert.deepEqual(JSON.parse(out), raw, 'the file reads back as the edit');
    assert.deepEqual(applyOps(clone(base), ops), raw);
    // Only the touched lines changed.
    const a = text.split('\n'), b = out.split('\n');
    assert.equal(a.length, b.length, 'no lines added or lost');
    const changed = a.filter((l, i) => l !== b[i]).length;
    assert.ok(changed >= 2 && changed <= 5, `${changed} lines changed`);
    // And back again.
    const back = editJSON(out, diffOps(raw, base));
    assert.deepEqual(JSON.parse(back), base);
  }
});

test('saving: the text editor handles sets, adds and removes in objects and lists', () => {
  const text = '{\n  "a": [[1, 2, 3, 4]],\n  "b": { "x": 1, "y": "two" },\n  "c": []\n}\n';
  const run = (ops) => editJSON(text, ops);
  assert.equal(run([{ op: 'set', path: ['a', 0, 2], value: 30 }]), text.replace('3,', '30,'));
  assert.equal(run([{ op: 'add', path: ['a', 1], value: [5, 6, 7, 8] }]), text.replace('[[1, 2, 3, 4]]', '[[1, 2, 3, 4], [5, 6, 7, 8]]'));
  assert.equal(run([{ op: 'add', path: ['c', 0], value: { at: 4, hurt: [] } }]), text.replace('"c": []', '"c": [{ "at": 4, "hurt": [] }]'));
  assert.equal(run([{ op: 'add', path: ['b', 'z'], value: true }]), text.replace('"two" }', '"two", "z": true }'));
  assert.equal(run([{ op: 'remove', path: ['b', 'x'] }]), text.replace('"x": 1, ', ''));
  assert.equal(run([{ op: 'remove', path: ['b', 'y'] }]), text.replace(', "y": "two"', ''));
  assert.equal(run([{ op: 'remove', path: ['a', 0] }]), text.replace('[[1, 2, 3, 4]]', '[]'));
  assert.equal(run([{ op: 'remove', path: ['c'] }]), '{\n  "a": [[1, 2, 3, 4]],\n  "b": { "x": 1, "y": "two" }\n}\n');
  assert.throws(() => run([{ op: 'set', path: ['nope'], value: 1 }]));
  assert.throws(() => run([{ op: 'add', path: ['b', 'x'], value: 1 }]));
  assert.equal(format({ at: 4, hurt: [[-1, 0, 2.5, 3]], s: 'a"b' }), '{ "at": 4, "hurt": [[-1, 0, 2.5, 3]], "s": "a\\"b" }');
});

test('projectiles: every one in the cast can be found, read, edited and saved as one box', () => {
  for (const file of ['data/characters/avner/avner.toska.json', 'data/characters/malik/malik.toska.json']) {
    const ids = projectileNames(loadJSON(file));
    assert.ok(ids.length > 0, file + ' has projectiles');
    for (const id of ids) {
      const raw = loadJSON(file); // a fresh copy per projectile: each is edited and saved by itself
      const src = projectileSource(raw, id);
      assert.ok(editable(src));
      // What the editor shows is what the game uses.
      assert.deepEqual(units(boxesOf(raw, SYSTEM, src)), compileCharacter(raw, SYSTEM).projectiles[id].hitbox, id);
      // Move and resize it: the game gets the new box, and nothing else in the file changes.
      const before = clone(raw);
      const [b] = boxesOf(raw, SYSTEM, src);
      const moved = [b[0] - 7, b[1] + 3, b[2] + 20, b[3] + 11];
      setBoxes(raw, src, [moved]);
      assert.deepEqual(raw.projectiles[id].hitbox, moved);
      assert.deepEqual(compileCharacter(raw, SYSTEM).projectiles[id].hitbox, units([moved]));
      const ops = diffOps(before, raw);
      assert.ok(ops.length > 0 && ops.every((o) => o.op === 'set' && o.path.slice(0, 3).join('/') === 'projectiles/' + id + '/hitbox'), JSON.stringify(ops));
      // Saving: the file's text changes only in those numbers, and reads back as the edited character.
      const text = fs.readFileSync(file, 'utf8');
      const out = editJSON(text, ops);
      assert.deepEqual(JSON.parse(out), raw);
      assert.equal(out.split('\n').length, text.split('\n').length, 'no lines added or removed');
      // One box, always: it can't be deleted, doubled, or removed as an override.
      assert.throws(() => setBoxes(raw, src, []), /exactly one/);
      assert.throws(() => setBoxes(raw, src, [moved, moved]), /exactly one/);
      assert.throws(() => removeSource(raw, src), /Nothing to remove/);
    }
  }
  assert.throws(() => projectileSource(loadJSON('data/characters/avner/avner.toska.json'), 'nope'), /No projectile/);
  assert.deepEqual(projectileNames({ moves: [] }), []);
});
