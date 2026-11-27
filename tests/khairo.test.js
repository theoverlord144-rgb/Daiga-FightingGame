// Khai'ro's normals (owner's brief, Nov 26): the frame data, holds, guards and chains he wrote, and the combo he
// asked to have checked. Boxes, damage and stun are first guesses and are not pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const PATH = 'data/characters/khairo/khairo.toska.json';
const FILE = loadJSON(PATH);
const KH = loadChar(PATH);
const MALIK = loadChar('data/characters/malik/malik.toska.json');
const move = (id) => FILE.moves.find((m) => m.id === id);
const sum = (a) => a.reduce((x, y) => x + y, 0);

// id: [startup, active, recovery, holds, the hit drawing (from 1), guard]
const BRIEF = {
  '5L': [5, 2, 8, [2, 2, 2, 3, 3, 2], 3, 'mid'],
  '5M': [8, 3, 15, [7, 2, 1, 4, 5, 6], 2, 'mid'],
  '5H': [12, 4, 20, [3, 4, 4, 3, 1, 5, 7, 8], 4, 'mid'],
  '5S': [11, 4, 24, [3, 3, 4, 3, 1, 6, 8, 10], 4, 'mid'],
  '2L': [5, 2, 9, [2, 2, 2, 3, 3, 3], 3, 'low'],
  '2M': [9, 3, 17, [3, 3, 2, 2, 1, 7, 10], 4, 'low'],
  '2H': [10, 5, 24, [3, 3, 3, 3, 2, 6, 8, 10], 4, 'mid'],
  'j.L': [5, 3, 10, [2, 2, 3, 4, 6], 3, 'high'],
  'j.M': [7, 4, 14, [3, 3, 3, 1, 6, 8], 3, 'high'],
  'j.H': [10, 5, 18, [3, 3, 3, 3, 2, 8, 10], 4, 'high'],
  'j.S': [13, 4, 20, [4, 4, 4, 3, 1, 8, 12], 4, 'high'],
};

test('Every normal: the brief\'s frame data, holds and guard; the hit drawing shows on the first hitting frame', () => {
  for (const [id, [startup, active, recovery, holds, hitDrawing, guard]] of Object.entries(BRIEF)) {
    const m = move(id);
    assert.deepEqual([m.startup, m.active, m.recovery], [startup, active, recovery], id);
    assert.deepEqual(m.sprite.holds, holds, `${id} holds`);
    assert.equal(sum(holds), startup - 1 + active + recovery, `${id}: the holds fill the move exactly`);
    assert.equal(sum(holds.slice(0, hitDrawing - 1)), startup - 1, `${id}: the hit drawing starts on the first active frame`);
    assert.equal(m.sprite.count, holds.length, `${id} drawings`);
    assert.equal(m.guard, guard, id);
    assert.ok(fs.existsSync(`data/characters/khairo/${m.sprite.image}`), m.sprite.image);
  }
  assert.equal(move('5M').sprite.count, 6, '5M: the extreme wind-up drawing is gone');
});

test('Every sheet his file names matches what the cutting tool wrote', () => {
  const manifest = loadJSON('data/characters/khairo/sheets/manifest.json');
  for (const m of FILE.moves) {
    if (!m.sprite) continue;
    const key = m.sprite.image.replace('sheets/', '').replace('.png', '');
    for (const f of ['columns', 'count', 'frameW', 'frameH', 'originX', 'originY']) assert.equal(m.sprite[f], manifest[key].sprite[f], `${m.id} ${f}`);
  }
});

test('Chains: L > M > H > S on the ground, j.L > j.M > j.H > j.S in the air; a triple jump', () => {
  const G = FILE.gatlings;
  for (const l of ['5L', '2L']) for (const to of ['5L', '2L', '5M', '2M', '5H', '2H', '5S']) assert.ok(G[l].includes(to), `${l} > ${to}`);
  for (const m of ['5M', '2M']) for (const to of ['5H', '2H', '5S']) assert.ok(G[m].includes(to), `${m} > ${to}`); // the owner adds routes in the editor (2M > 5M, Nov 26): the brief's ones must stay
  for (const h of ['5H', '2H']) assert.ok(G[h].includes('5S'), h + ' > 5S'); // the owner added 5H > Back Heavy in the editor (Nov 26): the brief's route must stay
  assert.deepEqual([G['j.L'], G['j.M'], G['j.H']], [['j.M', 'j.H', 'j.S'], ['j.H', 'j.S'], ['j.S']]);
  // Owner, Nov 26 (after the triple jump): he must be able to attack again after an air jump, so no once-until-landing limit.
  for (const id of ['j.L', 'j.M', 'j.H', 'j.S']) assert.equal(move(id).perJump, undefined, id);
  assert.equal(FILE.character.stats.airJumps, 2, 'a triple jump');
  assert.equal(move('5S').launch, 'hard');
  assert.equal(move('5S').jumpCancel, 'hit');
  assert.ok(move('j.S').groundBounce, 'j.S bounces them off the floor');
});

test('2H: his upper body cannot be hit on frames 5-14 (only the leg box is out); it is back afterwards', () => {
  const st = KH.states['2H'];
  const top = (f) => Math.max(...st.frames[f].hurt.map((b) => b[1] + b[3]));
  for (let f = 4; f <= 13; f++) assert.ok(top(f) <= px(55), `frame ${f + 1}: legs only`);
  assert.ok(top(3) > px(90), 'frame 4: whole body');
  assert.ok(top(14) > px(150), 'frame 15: whole body, standing tall');
});

test('The steps: 5H, 5S and 2M carry him forward; 5L and 5M do not', () => {
  const travel = (input, frames) => {
    const W = loadWorld(KH, MALIK);
    const g = createGame(W);
    g.players[0].x = -px(300); g.players[1].x = px(300);
    const x0 = g.players[0].x;
    for (const r of script(`${input} ${input[0]}*${frames}`)) step(g, [r, 0], W);
    return (g.players[0].x - x0) / px(1);
  };
  assert.equal(travel('5+H', 40), 56);
  assert.equal(travel('5+S', 44), 28);
  assert.equal(travel('2+M', 34), 42);
  assert.equal(travel('5+L', 20), 0);
  assert.equal(travel('5+M', 30), 0);
});

// The owner tunes the boxes and knockback in the editor, so this pins the ROUTE (every cancel is allowed and comes
// out in order, the ground string and the launcher connect, the super jump follows), not how many air hits reach.
test('The brief\'s route: 2L > 2M > 5H > 5S > super jump > j.M > j.H > j.S come out in order; the ground string and launcher connect', () => {
  const W = loadWorld(KH, MALIK);
  const g = createGame(W);
  const a = g.players[0], d = g.players[1];
  a.x = -px(60); d.x = px(60);
  const mash = (tok, n) => Array.from({ length: n }, () => `${tok} ${tok[0]}`).join(' ');
  const seq = `5*5 2+L 2*3 ${mash('2+M', 6)} ${mash('5+H', 8)} ${mash('5+S', 6)} 5*24 8*16 ${mash('5+M', 4)} ${mash('5+H', 6)} ${mash('5+S', 10)} 5*90`;
  const order = [];
  let peak = 0;
  for (const r of script(seq)) {
    step(g, [r, 0], W);
    if (order.at(-1) !== a.state) order.push(a.state);
    peak = Math.max(peak, d.combo ? d.combo.hits : 0);
  }
  const moves = order.filter((s) => ['2L', '2M', '5H', '5S', 'superJump', 'j.M', 'j.H', 'j.S'].includes(s));
  assert.deepEqual(moves, ['2L', '2M', '5H', '5S', 'superJump', 'j.M', 'j.H', 'j.S']);
  assert.ok(peak >= 4, `2L, 2M, 5H and 5S all hit (${peak} hits)`);
});
