import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { cloneState, serializeState, deserializeState, statesEqual, diffState, hashState } from '../src/core/state.js';
import { loadWorld, fightInputs } from './helpers.js';

const WORLD = loadWorld();

function play(frames, seed) {
  const g = createGame(WORLD);
  const inputs = fightInputs(seed);
  for (let i = 0; i < frames; i++) step(g, inputs(g), WORLD);
  return g;
}

test('the state is plain data: it survives a JSON round trip unchanged', () => {
  const g = play(300, 1);
  assert.ok(statesEqual(deserializeState(serializeState(g)), g));
});

test('a clone is equal but independent', () => {
  const g = play(100, 2);
  const c = cloneState(g);
  assert.ok(statesEqual(c, g));
  step(c, [0, 0], WORLD);
  assert.equal(statesEqual(c, g), false, 'stepping the clone does not touch the original');
  assert.notEqual(diffState(c, g), true);
});

test('diffState names the first difference', () => {
  const g = play(10, 3);
  const c = cloneState(g);
  c.players[1].input.head += 1;
  assert.equal(diffState(g, c), '$.players.1.input.head');
});

test('same inputs, same game: two runs are identical, hashes match', () => {
  const a = play(3000, 42);
  const b = play(3000, 42);
  assert.ok(statesEqual(a, b));
  assert.equal(hashState(a), hashState(b));
  assert.notEqual(hashState(a), hashState(play(3000, 43)));
});

test('stepping from a restored clone matches stepping the original (rollback groundwork)', () => {
  const g = createGame(WORLD);
  const gen = fightInputs(7);
  const inputs = [];
  let saved = null;
  for (let i = 0; i < 600; i++) {
    if (i === 300) saved = cloneState(g);
    inputs.push(gen(g));
    step(g, inputs[i], WORLD);
  }
  for (let i = 300; i < 600; i++) step(saved, inputs[i], WORLD);
  assert.ok(statesEqual(saved, g));
});

test('every position, velocity and timer in the state is an integer', () => {
  const g = play(3000, 9);
  const walk = (v, path) => {
    if (typeof v === 'number') assert.ok(Number.isInteger(v), `${path} = ${v} is not an integer`);
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(g, '$');
});

test('the random fights used by these tests really fight: hits, blocks and both players hurt', () => {
  const g = createGame(WORLD);
  const inputs = fightInputs(13); // a seed whose fight has hits and blocks under the current rules (11 stopped having a block when soft knockdowns arrived)
  const seen = new Set();
  for (let i = 0; i < 3000; i++) { step(g, inputs(g), WORLD); for (const c of g.cues) seen.add(c.type); }
  assert.ok(seen.has('hit') && seen.has('block'), [...seen].join(','));
  assert.ok(g.players[0].health < 10000 && g.players[1].health < 10000);
});
