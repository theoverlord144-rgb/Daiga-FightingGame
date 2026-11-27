// Khai'ro's Back Heavy (4H; owner, Nov 26): three kicks from one sheet, and the last one reaches a downed opponent.
// It is two moves in his file: `backHeavy` (kicks 1 and 2) runs straight on into `backHeavyEnd` (kick 3), so the
// third kick alone carries the OTG and can be tuned by itself. The numbers are first guesses and are read from his
// file here; what is pinned is the behaviour: three separate hits, each on its own drawing, that combo, and only
// the third picks up a downed opponent.
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
const A = FILE.moves.find((m) => m.id === 'backHeavy');
const B = FILE.moves.find((m) => m.id === 'backHeavyEnd');
const len = (m) => m.startup + m.active + m.recovery - 1;
const LENGTH = len(A) + len(B);

test('Back Heavy: back + H, three separate hits, on drawings 3, 4 and 5 of its nine', () => {
  assert.equal(A.input, '4H');
  assert.equal(A.next, 'backHeavyEnd');
  assert.equal(B.input, undefined, 'the third kick only comes out of the first two');
  const def = loadChar(PATH);
  const a = def.states.backHeavy, b = def.states.backHeavyEnd;
  assert.equal(a.duration, len(A)); assert.equal(b.duration, len(B));
  assert.ok(fs.existsSync('data/characters/khairo/sheets/backheavy.png'));
  const drawings = (st) => { const m = new Map(); st.frames.forEach((f) => { if (f.hit.length) m.set(f.hitId, [...new Set([...(m.get(f.hitId) ?? []), f.sprite.index + 1])]); }); return [...m.values()]; };
  assert.deepEqual(drawings(a), [[3], [4]], 'the mid kick, then the kick straight up');
  assert.deepEqual(drawings(b), [[5]], 'the cut down');
  assert.ok(a.frames[A.startup - 1].hit.length > 0, 'the first kick is out on the first active frame');
  assert.deepEqual([...new Set([...a.frames, ...b.frames].map((f) => f.sprite.index + 1))], [1, 2, 3, 4, 5, 6, 7, 8, 9], 'all nine drawings, in order');
  assert.equal(!!a.move.otg, false); assert.equal(b.move.otg, true, 'only the last kick is the OTG one');
});

test('Back Heavy: up close all three kicks combo; neutral H is still his Standing Heavy', () => {
  const world = loadWorld(PATH, MALIK);
  let game = createGame(world);
  game.players[0].x = -px(45); game.players[1].x = px(45);
  const hp = game.players[1].health; let most = 0; const seen = [];
  for (const raw of script(`4+H 5*${LENGTH + 50}`)) { step(game, [raw, 0], world); most = Math.max(most, game.players[1].combo?.hits ?? 0); if (seen.at(-1) !== game.players[0].state) seen.push(game.players[0].state); }
  assert.deepEqual(seen.slice(0, 3), ['backHeavy', 'backHeavyEnd', 'idle']);
  assert.equal(most, 3, 'a three-hit combo');
  assert.ok(game.players[1].health < hp);
  game = createGame(world);
  game.players[0].x = -px(45); game.players[1].x = px(45);
  seen.length = 0;
  for (const raw of script('5+H 5*20')) { step(game, [raw, 0], world); seen.push(game.players[0].state); }
  assert.ok(seen.includes('5H') && !seen.includes('backHeavy'));
});

test('Back Heavy: whiffed, it still plays all three kicks (46 frames)', () => {
  const world = loadWorld(PATH, MALIK);
  const game = createGame(world);
  let frames = 0;
  for (const raw of script(`4+H 5*${LENGTH + 10}`)) { step(game, [raw, 0], world); if (/^backHeavy/.test(game.players[0].state)) frames++; }
  assert.equal(frames, LENGTH);
});

test('Back Heavy: the first two kicks pass over a downed opponent, the third picks them up', () => {
  const world = loadWorld(PATH, MALIK);
  const game = createGame(world);
  const [a, d] = game.players;
  a.x = -px(40); d.x = px(40);
  // A light starts the combo, then the opponent is laid in the hard knockdown.
  for (const raw of script('5+L 5*5')) step(game, [raw, 0], world);
  assert.ok(d.combo, 'a combo is running');
  enterState(a, world.chars[0], 'idle');
  enterState(d, world.chars[1], 'knockdown');
  d.y = 0; d.vx = 0; d.vy = 0; a.hitstop = 0; d.hitstop = 0;
  const hits = [];
  for (const raw of script(`4+H 5*${LENGTH}`)) {
    step(game, [raw, 0], world);
    for (const c of game.cues) if (c.type === 'hit') hits.push({ move: c.move, otg: !!c.otg });
  }
  assert.deepEqual(hits, [{ move: 'backHeavyEnd', otg: true }], 'only the third kick touched them, as an OTG');
});
