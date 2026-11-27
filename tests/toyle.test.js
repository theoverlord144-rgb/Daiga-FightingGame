// Toyle (owner, Nov 26): only his idle and forward walk are drawn, and by the owner's word that is all he has for
// now. He loads, stands and walks in his own art and can be put in a match; he has no attacks of his own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const PATH = 'data/characters/toyle/toyle.toska.json';
const AVNER = 'data/characters/avner/avner.toska.json';

test('Toyle: loads, and stands and walks in his own art, every drawing shown', () => {
  const c = loadChar(PATH);
  assert.equal(c.id, 'toyle');
  assert.equal(c.name, 'Toyle');
  for (const [state, sheet, length] of [['idle', 'idle', 60], ['walkF', 'walk', 48], ['walkB', 'walk-back', 48]]) {
    const st = c.states[state];
    assert.equal(st.duration, length, state);
    assert.ok(st.frames.every((f) => f.sprite), `${state}: every frame is drawn`);
    assert.deepEqual([...new Set(st.frames.map((f) => f.sprite.index))], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], `${state}: all ten drawings`);
    assert.ok(fs.existsSync(`data/characters/toyle/sheets/${sheet}.png`), sheet);
  }
});

test('Toyle: every sprite block in his file matches the cut sheet', () => {
  const file = loadJSON(PATH), manifest = loadJSON('data/characters/toyle/sheets/manifest.json');
  for (const m of file.moves) {
    const name = /^sheets\/(.+)\.png$/.exec(m.sprite.image)[1];
    assert.deepEqual(m.sprite, manifest[name].sprite, m.id);
  }
});

test('Toyle: in a match he walks both ways, and has no attacks of his own yet', () => {
  const world = loadWorld(PATH, AVNER);
  const own = loadJSON(PATH).moves.filter((m) => m.input);
  assert.deepEqual(own, [], 'no moves with an input in his file');
  let game = createGame(world);
  const x0 = game.players[0].x;
  for (let i = 0; i < 20; i++) step(game, [script('6')[0], 0], world);
  assert.equal(game.players[0].state, 'walkF');
  assert.ok(game.players[0].x > x0, 'forward');
  game = createGame(world);
  for (let i = 0; i < 20; i++) step(game, [script('4')[0], 0], world);
  assert.equal(game.players[0].state, 'walkB');
  assert.ok(game.players[0].x < x0, 'back');
  // A button does nothing of his own: he stays standing.
  game = createGame(world);
  for (const raw of script('5+L 5*10 5+H 5*10')) step(game, [raw, 0], world);
  assert.equal(game.players[0].state, 'idle');
  // He can be hit like anyone.
  const w2 = loadWorld(AVNER, PATH), g2 = createGame(w2);
  g2.players[0].x = -3000; g2.players[1].x = 3000;
  const hp = g2.players[1].health;
  for (const raw of script('5+L 5*12')) step(g2, [raw, 0], w2);
  assert.ok(g2.players[1].health < hp, 'Avner\'s light hits him');
});
