// War'Teun's Wiretap mark as it is shown (owner's brief, Nov 26): which drawing of the mark plays, when it counts as
// live (2R can come out), and that the HUD icon and the mark above the opponent read the same rule. Display helpers
// only (src/render/mark-live.js); the mark itself is the var `wiretap` in the game state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { px } from '../src/core/fixed.js';
import { markLive, markFrame } from '../src/render/mark-live.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const FILE = loadJSON('data/characters/warteun/warteun.toska.json');
const WT = loadChar('data/characters/warteun/warteun.toska.json');
const MALIK = loadChar('data/characters/malik/malik.toska.json');
const M = FILE.mechanic.vars.wiretap.mark;
const sum = (a) => a.reduce((x, y) => x + y, 0);

function game() {
  const W = loadWorld(WT, MALIK);
  W.battle.maxGapUnits = 0;
  const g = createGame(W);
  g.players[0].x = -px(250); g.players[1].x = px(250);
  return { g, W, a: g.players[0], d: g.players[1] };
}

test('The mark and its shatter: the brief\'s holds, the sheets exist, opacity 0.85, never mirrored', () => {
  assert.deepEqual(M.intro, [3, 3, 3]);
  assert.deepEqual(M.loop, [8, 8, 8, 8]);
  assert.deepEqual(M.fade, [4, 4, 4]);
  assert.equal(M.intro.length + M.loop.length + M.fade.length, M.sprite.count, 'ten drawings');
  assert.equal(M.live.hold, 6);
  assert.equal(M.live.gain, 1.2);
  assert.equal(M.flash.frames, 4);
  assert.deepEqual(M.shatter.holds, [2, 2, 1, 2, 3, 4, 4]);
  assert.equal(M.shatter.sprite.count, 7);
  assert.deepEqual([M.shatter.ring.frame, M.shatter.ring.scale], [3, 0.5]);
  assert.equal(FILE.art.opacity['mark:wiretap'], 0.85);
  for (const s of [M.sprite, M.shatter.sprite]) assert.ok(fs.existsSync(`data/characters/warteun/${s.image}`), s.image);
  assert.equal(FILE.mechanic.vars.wiretap.max, 360, 'six seconds');
});

test('Which drawing shows: the intro once, the loop (faster while live), the fade over its last 12 frames', () => {
  const at = (since, left, live = false) => markFrame(M, since, left, live);
  assert.deepEqual([0, 2, 3, 5, 6, 8].map((t) => at(t, 300)), [0, 0, 1, 1, 2, 2], 'intro: 3 frames a drawing');
  assert.deepEqual([9, 16, 17, 25, 33, 40, 41].map((t) => at(t, 300)), [3, 3, 4, 5, 6, 6, 3], 'loop: drawings 4-7 at 8 frames each, round again');
  assert.deepEqual([9, 14, 15, 21, 27, 32, 33].map((t) => at(t, 300, true)), [3, 3, 4, 5, 6, 6, 3], 'live: 6 frames each');
  assert.deepEqual([12, 9, 8, 5, 4, 1].map((left) => at(200, left)), [7, 7, 8, 8, 9, 9], 'fade: 4 frames a drawing, ending as the mark does');
  assert.equal(at(200, 13), at(200, 300), 'no fade before its last 12 frames');
  for (let t = 0; t < 400; t++) for (const live of [false, true]) { const i = at(t, 360 - t, live); assert.ok(i >= 0 && i < M.sprite.count, `frame ${t}`); }
});

test('The mark lasts six seconds on the opponent wherever they go, then is gone', () => {
  const { g, W, a, d } = game();
  a.vars.wiretap = 360;
  d.y = px(200); enterState(d, MALIK, 'fall'); // they are in the air: it is a var of his, nothing they do removes it
  let frames = 0;
  while (a.vars.wiretap > 0 && frames < 500) { step(g, [0, frames % 40 < 20 ? 2 : 1], W); frames++; }
  assert.equal(frames, 360);
});

test('Live = the mark is up and he could do 2R now; the HUD icon and the mark read the same rule', () => {
  const { g, W, a } = game();
  assert.equal(markLive(a, WT, 'wiretap'), false, 'no mark: not live');
  a.vars.wiretap = 300;
  assert.equal(markLive(a, WT, 'wiretap'), true, 'marked and standing free: live');
  assert.equal(markLive(a, WT, 'resonance'), false, 'a var with no live rule never is');
  // In the air he cannot do 2R: not live, though the mark is still up.
  for (const r of script('8 5*6')) step(g, [r, 0], W);
  assert.ok(a.y > 0 && a.vars.wiretap > 0);
  assert.equal(markLive(a, WT, 'wiretap'), false);
  for (let i = 0; i < 60; i++) step(g, [0, 0], W);
  assert.equal(a.state, 'idle');
  assert.equal(markLive(a, WT, 'wiretap'), true);
  // Stunned: not live.
  enterState(a, WT, 'hitStand'); a.stun = 10;
  assert.equal(markLive(a, WT, 'wiretap'), false);
  // Whenever it is live, 2R really comes out; and using it ends the mark.
  const h = game();
  h.a.vars.wiretap = 300;
  assert.equal(markLive(h.a, WT, 'wiretap'), true);
  const states = [];
  for (const r of script('2*2 2+R 5*40')) { step(h.g, [r, 0], h.W); states.push(h.a.state); }
  assert.ok(states.includes('pursuit'));
  assert.equal(h.a.vars.wiretap, 0);
  assert.equal(markLive(h.a, WT, 'wiretap'), false);
  // Both drawings import the one function.
  for (const f of ['src/render/hud.js', 'src/render/fight-renderer.js']) assert.match(fs.readFileSync(f, 'utf8'), /markLive\(/, f);
});
