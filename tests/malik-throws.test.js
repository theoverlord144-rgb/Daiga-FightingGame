// Malik's throws (owner, Nov 23): forward (6H) and back (4H) up close, the same rules and numbers as Avner's.
// The drawings are placeholders (copies of his Standing Heavy and Back Heavy) until the throws are drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const FILE = 'data/characters/malik/malik.toska.json';
const M = loadChar(FILE);
const W = loadWorld(M, M);
function setup(gap) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
function run(g, s, p2 = '') {
  const a = script(s), b = script(p2), cues = [];
  for (let i = 0; i < a.length; i++) { step(g, [a[i], b[i] ?? 0], W); cues.push(...g.cues); }
  return cues;
}

test('Malik: 6H up close is the forward throw; it lands for its damage and he stays on his side', () => {
  const g = setup(60);
  const [p, d] = g.players;
  run(g, '6+H 5*3');
  assert.equal(p.state, 'throwHold');
  assert.equal(d.state, 'thrown');
  run(g, '5*60');
  assert.equal(d.health, M.stats.health - M.states['6H'].move.damage);
  assert.ok(p.x < d.x, 'the opponent is still in front of him');
});

test('Malik: 4H up close is the back throw and swaps sides; from farther away 4H is Back Heavy and 6H is Standing Heavy', () => {
  const g = setup(60);
  const [p, d] = g.players;
  run(g, '4+H 5*3');
  assert.equal(p.state, 'throwHold');
  run(g, '5*60');
  assert.ok(d.x < p.x, 'thrown behind him');
  assert.ok(d.health < M.stats.health);
  const far = setup(300);
  run(far, '4+H 5*2');
  assert.equal(far.players[0].state, 'backHeavy');
  const far2 = setup(300);
  run(far2, '6+H 5*2');
  assert.equal(far2.players[0].state, '5H');
});

test('Malik: the throw can be broken with H, and an opponent in the air is not thrown', () => {
  const g = setup(60);
  const cues = run(g, '6+H 5*20', '5*3 5+H 5*20');
  assert.ok(cues.some((c) => c.type === 'tech'), 'throw break');
  assert.equal(g.players[1].health, M.stats.health, 'no damage');
  const air = setup(60);
  run(air, '5*6 6+H 5*2', '8 5*20');
  assert.notEqual(air.players[0].state, 'throwHold');
});

test('Malik: both throws have their drawn art (grab, hold, finish)', () => {
  const raw = loadJSON(FILE);
  const image = (id) => raw.moves.find((m) => m.id === id).sprite.image;
  for (const id of ['6H', 'throwHold', 'throwFinish']) {
    assert.ok(!image(id).includes('placeholder'), `${id}: ${image(id)}`);
    assert.ok(existsSync(`data/characters/malik/${image(id)}`));
  }
  assert.ok(!image('4H').includes('placeholder'));
  assert.ok(existsSync(`data/characters/malik/${image('4H')}`));
  // The back throw's own hold and slam drawings (drawing only): they fill the same two states.
  const own = raw.art.throws['4H'];
  for (const st of ['throwHold', 'throwFinish']) assert.ok(existsSync(`data/characters/malik/${own[st].sprite.image}`), st);
  assert.equal(own.throwHold.holds.reduce((a, b) => a + b, 0), M.stats.throwBreak);
  assert.equal(own.throwFinish.holds.reduce((a, b) => a + b, 0), M.states.throwFinish.duration);
  // The hold drawings fill the time the opponent has to break the throw; the push fills the finish.
  assert.equal(M.states.throwFinish.frames.at(-1).sprite.index, 3);
  assert.equal(M.states.throwFinish.duration, 18);
});
