// Toyle (owner, Nov 26): only his idle and forward walk are drawn, and by the owner's word that is all he has for
// now. He loads, stands and walks in his own art and can be put in a match; he has no attacks of his own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';
import { advantageFromData } from '../src/ui/training/frame-meter.js';

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

test('Toyle: in a match he walks both ways; his only attacks are 5H and 6H (owner, Nov 27)', () => {
  const world = loadWorld(PATH, AVNER);
  const own = loadJSON(PATH).moves.filter((m) => m.input);
  assert.deepEqual(own.map((m) => m.input), ['5H', '6H'], 'only his two heavies have an input');
  let game = createGame(world);
  const x0 = game.players[0].x;
  for (let i = 0; i < 20; i++) step(game, [script('6')[0], 0], world);
  assert.equal(game.players[0].state, 'walkF');
  assert.ok(game.players[0].x > x0, 'forward');
  game = createGame(world);
  for (let i = 0; i < 20; i++) step(game, [script('4')[0], 0], world);
  assert.equal(game.players[0].state, 'walkB');
  assert.ok(game.players[0].x < x0, 'back');
  // L does nothing of his own; H is his High Side Kick.
  game = createGame(world);
  for (const raw of script('5+L 5*10')) step(game, [raw, 0], world);
  assert.equal(game.players[0].state, 'idle');
  for (const raw of script('5+H')) step(game, [raw, 0], world);
  assert.equal(game.players[0].state, '5H');
  // He can be hit like anyone.
  const w2 = loadWorld(AVNER, PATH), g2 = createGame(w2);
  g2.players[0].x = -3000; g2.players[1].x = 3000;
  const hp = g2.players[1].health;
  for (const raw of script('5+L 5*12')) step(g2, [raw, 0], w2);
  assert.ok(g2.players[1].health < hp, 'Avner\'s light hits him');
});

test('Toyle: 5H High Side Kick and 6H Spin Elbow Drop are the owner\'s frame data (Nov 27)', () => {
  const def = loadChar(PATH);
  const k = def.states['5H'], e = def.states['6H'];
  assert.deepEqual([k.move.startup, k.move.active, k.move.recovery, k.frames.length], [13, 4, 22, 38]);
  assert.deepEqual([e.move.startup, e.move.active, e.move.recovery, e.frames.length], [22, 4, 20, 45]);
  assert.equal(k.move.guard, 'mid');
  assert.equal(e.move.guard, 'high', 'overhead');
  assert.equal(advantageFromData(k.move, { block: true }), -6);
  assert.equal(advantageFromData(k.move), 1);
  assert.equal(advantageFromData(e.move, { block: true }), -6);
  assert.equal(k.move.blockstun, 19);
  assert.equal(k.move.hitstun, 26);
  assert.equal(e.move.blockstun, 17);
  assert.ok(e.move.knockdown, 'hard knockdown');
  const raw = loadJSON(PATH).moves;
  assert.deepEqual(raw.find((m) => m.id === '5H').sprite.holds, [2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
  assert.deepEqual(raw.find((m) => m.id === '6H').sprite.holds, [2, 2, 2, 2, 2, 3, 4, 4, 2, 2, 8, 12], 'his holds, the last one 10 to 12 to fill his 45 frames');
  assert.equal(raw.find((m) => m.id === '6H').specialCancel, 'hit', 'specials on hit only');
});

test('Toyle: 6H\'s spin hits first (owner, Nov 27), mid, and on hit the elbow drop combos after it', () => {
  // Toyle 100 px from a standing Avner presses 6H: the spin hits on frame 7, the elbow on 22 while Avner is still in hitstun.
  const world = loadWorld(PATH, AVNER), g = createGame(world);
  g.players[0].x = -5000; g.players[1].x = 5000;
  const hits = [];
  for (let f = 0; f < 60; f++) {
    const before = g.players[1].state;
    step(g, [f === 2 ? script('6+H')[0] : 0, 0], world);
    for (const c of g.cues) if (c.type === 'hit' && c.p === 0) hits.push({ frame: g.players[0].frame + 1, damage: c.damage, before, combo: g.players[1].combo?.hits ?? null });
  }
  assert.deepEqual(hits.map((h) => h.frame), [7, 22], 'the spin on frame 7, the elbow on frame 22');
  assert.equal(hits[0].damage, 300);
  assert.equal(hits[1].before, 'hitStand', 'still in the spin\'s hitstun when the elbow lands');
  assert.equal(g.players[1].state === 'knockdown' || g.players[1].state === 'wakeup', true, 'the elbow still knocks down');
  // Crouch-blocking the spin (it is mid) leaves him open to the overhead elbow.
  const w2 = loadWorld(PATH, AVNER), g2 = createGame(w2);
  g2.players[0].x = -5000; g2.players[1].x = 5000;
  const seen = [];
  for (let f = 0; f < 60; f++) { step(g2, [f === 2 ? script('6+H')[0] : 0, script('3')[0]], w2); for (const c of g2.cues) if (c.p === 0 && (c.type === 'hit' || c.type === 'block')) seen.push(c.type); }
  assert.deepEqual(seen, ['block', 'hit']);
});
