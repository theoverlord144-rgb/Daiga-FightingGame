import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { hashState } from '../src/core/state.js';
import { createCpu, recoveryLeft } from '../src/ui/cpu.js';
import { loadWorld, loadJSON, script } from './helpers.js';

const W = loadWorld();
const PERFECT = { block: 10000, punish: 10000, poke: 0, backOff: 0 };

function setup(gap) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
/** Run P1's script against the CPU on P2; returns P2's states seen. */
function vs(g, cpu, s, extra = 0) {
  const seen = [];
  const raws = script(s);
  for (let i = 0; i < raws.length + extra; i++) {
    step(g, [raws[i] ?? 0, cpu.input(g)], W);
    seen.push(g.players[1].state);
  }
  return seen;
}

test('CPU walks in from far away', () => {
  const g = setup(700);
  const cpu = createCpu(W, 1, { level: { ...PERFECT, punish: 0 } });
  const x0 = g.players[1].x;
  vs(g, cpu, '5*40');
  assert.ok(g.players[1].x < x0 - px(60), 'moved toward Player 1');
});

test('CPU blocks low attacks crouching and jump-ins standing', () => {
  let g = setup(90);
  let cpu = createCpu(W, 1, { level: { ...PERFECT, punish: 0 } });
  const hp = g.players[1].health;
  const seen = vs(g, cpu, '2+M 5*30 2+M 5*30');
  assert.ok(seen.includes('blockCrouch'), [...new Set(seen)].join(' '));
  assert.equal(g.players[1].health, hp);
  g = setup(140); // a jump-in that reaches: j.H on the way down
  cpu = createCpu(W, 1, { level: { ...PERFECT, punish: 0 } });
  const seen2 = vs(g, cpu, '9 5*18 5+H 5*40');
  assert.ok(seen2.includes('blockStand'), [...new Set(seen2)].join(' '));
  assert.equal(g.players[1].health, hp, 'no damage');
});

test('CPU blocks a move that is unsafe on block, then punishes it', () => {
  const g = setup(80);
  const cpu = createCpu(W, 1, { level: PERFECT });
  const hp = g.players[0].health;
  const seen = vs(g, cpu, '5+S', 60);
  assert.ok(seen.includes('blockCrouch') || seen.includes('blockStand'), 'blocked it first');
  assert.equal(g.players[1].health, W.chars[1].stats.health, 'took nothing');
  assert.ok(g.players[0].health < hp, 'Player 1 got punished');
});

test('CPU chains into a stronger normal when its hit connects close up', () => {
  const g = setup(70);
  const cpu = createCpu(W, 1, { level: { block: 0, punish: 0, poke: 3000, backOff: 0 } });
  let best = 0;
  for (let i = 0; i < 300; i++) {
    step(g, [0, cpu.input(g)], W);
    const c = g.players[0].combo || g.players[0].lastCombo;
    if (c) best = Math.max(best, c.hits);
  }
  assert.ok(best >= 2, `a combo of ${best}`);
});

test('CPU whiff-punishes a short move with a longer one', () => {
  // 5S (reach 90) misses at this distance; the CPU's 5H (reach 130) does not.
  const g = setup(130);
  const cpu = createCpu(W, 1, { level: PERFECT });
  const hp = g.players[0].health;
  vs(g, cpu, '5+S', 50);
  assert.equal(g.players[1].health, W.chars[1].stats.health, 'the 5S whiffed');
  assert.ok(g.players[0].health < hp, 'and got punished');
});

test('CPU does not punish safe pressure or anything at a distance it cannot reach', () => {
  const g = setup(600);
  const cpu = createCpu(W, 1, { level: PERFECT });
  const hp = g.players[0].health;
  vs(g, cpu, '5+H', 14);
  assert.equal(g.players[0].health, hp);
  assert.ok(recoveryLeft(W.chars[0], g.players[0]) > 0, 'Player 1 was still recovering, just too far away');
});

test('CPU pokes when in range', () => {
  const g = setup(100);
  const cpu = createCpu(W, 1, { level: { block: 0, punish: 0, poke: 2000, backOff: 0 } });
  const seen = vs(g, cpu, '5*120');
  assert.ok(seen.some((s) => W.chars[1].states[s].move), 'attacked at least once');
});

test('CPU sits still between rounds and is repeatable with the same seed', () => {
  const rules = loadJSON('data/system/match.json');
  const w = loadWorld(undefined, undefined, { match: rules });
  const run = (seed) => {
    const g = createGame(w);
    const a = createCpu(w, 0, { level: 'normal', seed });
    const b = createCpu(w, 1, { level: 'hard', seed: seed + 1 });
    for (let i = 0; i < 3000; i++) {
      const ra = a.input(g);
      const rb = b.input(g);
      if (g.match.phase === 'intro') assert.equal(ra | rb, 0);
      step(g, [ra, rb], w);
    }
    return { hash: hashState(g), match: g.match };
  };
  const r1 = run(3);
  assert.equal(r1.hash, run(3).hash);
  assert.ok(r1.match.round > 1 || r1.match.wins.some((x) => x > 0) || r1.match.phase !== 'intro', 'the CPUs fought');
});
