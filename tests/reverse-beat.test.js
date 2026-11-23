// Reverse beat: normals chain in any order the character's table allows (strong back down to weak), and each
// normal comes out a limited number of times in one string (data/system/combo.json `chainUses`), so free-order
// chains cannot loop. Tested on a small made-up character, so the cast can be retuned freely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { compileCharacter } from '../src/core/character.js';
import { px } from '../src/core/fixed.js';
import { cloneState, hashState } from '../src/core/state.js';
import { runSyncTest } from '../src/net/sync-test.js';
import { loadWorld, loadJSON, script, SYSTEM } from './helpers.js';

const normal = (id, extra = {}) => ({ id, input: id, startup: 3, active: 2, recovery: 14, damage: 100, hitstun: 30, blockstun: 20, hitstop: 0,
  pushbackHit: 0, pushbackBlock: 0, selfPushback: 0, hitboxes: [[0, 50, 140, 100]], ...extra });
const ALL = ['5L', '5M', '5H'];
function world(extra = {}) {
  const c = compileCharacter({
    engine: 'Toska', version: 2, character: { id: 't', stats: {} },
    moves: [normal('5L'), normal('5M'), normal('5H'), { id: '236L', input: '236L', startup: 5, active: 2, recovery: 10, damage: 100, hitstun: 30, hitstop: 0, pushbackHit: 0, hitboxes: [[0, 50, 140, 100]] }],
    gatlings: { '5L': ALL, '5M': ALL, '5H': ALL },
    ...extra,
  }, SYSTEM);
  return loadWorld(c, c);
}
const without = (w) => ({ ...w, combo: { ...w.combo, chainUses: null } });

/** Play P1's script (P2 holds `p2`) and list the moves P1 started, in order. */
function started(w, s1, p2 = 0) {
  const g = createGame(w);
  g.players[0].x = -px(40);
  g.players[1].x = px(40);
  const out = [];
  let last = { state: g.players[0].state, frame: 0 };
  for (const raw of script(s1)) {
    step(g, [raw, p2], w);
    const p = g.players[0];
    if (w.chars[0].states[p.state].move && (p.state !== last.state || p.frame < last.frame)) out.push(p.state);
    last = { state: p.state, frame: p.frame };
  }
  return { out, g };
}
const BACK = script('6')[0]; // P2 stands on the right: holding right is holding back

test('the rule is in the system data: every normal once per string, lights twice', () => {
  assert.deepEqual(loadJSON('data/system/combo.json').chainUses, { default: 1, L: 2 });
});

test('reverse beat: a heavy chains back down into a medium, then a light', () => {
  const w = world();
  assert.deepEqual(started(w, '5+H 5*5 5+M 5*5 5+L 5*30').out, ['5H', '5M', '5L']);
  assert.deepEqual(started(w, '5+M 5*5 5+L 5*5 5+H 5*30').out, ['5M', '5L', '5H'], 'any order');
});

test('each normal comes out once in a string: the same one again is refused, on hit and on block', () => {
  const w = world();
  for (const p2 of [0, BACK]) {
    const { out, g } = started(w, '5+M 5*5 5+H 5*5 5+M 5*5 5+H 5*5 5+L 5*4', p2);
    assert.deepEqual(out, ['5M', '5H', '5L'], p2 ? 'blocked' : 'hit');
    if (p2) assert.equal(g.players[1].combo, null, 'it really was blocked');
  }
});

test('lights may come out twice, not three times', () => {
  const w = world();
  assert.deepEqual(started(w, '5+L 5*5 5+L 5*5 5+L 5*5 5+L 5*5 5+M 5*4').out, ['5L', '5L', '5M']);
  // The count is per string, across other normals in between.
  assert.deepEqual(started(w, '5+L 5*5 5+M 5*5 5+L 5*5 5+H 5*5 5+L 5*4').out, ['5L', '5M', '5L', '5H']);
});

test('a string cannot go on for ever: mashing every button uses each normal up and the fighter recovers', () => {
  const w = world();
  const mash = Array.from({ length: 60 }, (_, i) => `5+${'LMH'[i % 3]} 5*2`).join(' ');
  const { out } = started(w, `${mash} 5*40`);
  const first = out.slice(0, 4);
  assert.equal(first.length, 4, 'two lights, a medium and a heavy');
  assert.deepEqual([...first].sort(), ['5H', '5L', '5L', '5M']);
  // With the limit off, the same mashing never lets go.
  assert.ok(started(without(w), `${mash} 5*40`).out.length > 20);
});

test('a new string starts fresh: after recovering, and after a special', () => {
  const w = world();
  assert.deepEqual(started(w, '5+M 5*40 5+M 5*5 5+H 5*30').out, ['5M', '5M', '5H'], 'recovered in between');
  // 5M, special cancel, then the special ends and 5M is available again in a new string.
  const { out, g } = started(w, '5+M 5*4 2 3 6+L 5*40 5+M 5*5 5+M 5*4');
  assert.deepEqual(out, ['5M', '236L', '5M']);
  assert.deepEqual(g.players[0].string, { '5M': 1 });
});

test('the limit only concerns normals: a special is never refused by it', () => {
  const w = world();
  assert.deepEqual(started(w, '5+L 5*5 5+L 5*4 2 3 6+L 5*30').out, ['5L', '5L', '236L']);
});

test('switched off, a normal chains into itself as before', () => {
  const w = without(world());
  assert.deepEqual(started(w, '5+M 5*5 5+M 5*5 5+M 5*5 5+M 5*4').out, ['5M', '5M', '5M', '5M']);
});

test('the string count lives in the game state: copies match and rollback replays it exactly', () => {
  const w = world();
  const { g } = started(w, '5+L 5*5 5+M 5*3');
  assert.deepEqual(g.players[0].string, { '5L': 1, '5M': 1 });
  assert.equal(hashState(cloneState(g)), hashState(g));
  const seq = script('5+L 5*4 5+H 5*4 5+M 5*4 5+L 5*4 5+L 5*4 5+M 5*20 2 3 6+L 5*30');
  const r = runSyncTest(w, (game) => [seq[game.frame % seq.length] ?? 0, game.frame % 90 < 30 ? BACK : 0], { frames: 1500, distance: 8 });
  assert.equal(r.ok, true, r.ok ? '' : `diverged at frame ${r.frame}: ${r.path}`);
});
