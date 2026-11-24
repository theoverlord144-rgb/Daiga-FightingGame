// Malik's Spirit Install (owner, Nov 23): while it is on, standing L / M / H are the guardian's attacks. Malik is
// committed for the move like any normal, but he is drawn holding his idle while the guardian behind him strikes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const FILE = 'data/characters/malik/malik.toska.json';
const M = loadChar(FILE);
const RAW = loadJSON(FILE);
const W = loadWorld(M, M);
W.battle.maxGapUnits = 0;
function setup(gap, install) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  if (install) g.players[0].vars.install = 600;
  return g;
}
function run(g, s) {
  const seen = [], cues = [];
  for (const raw of script(s)) { step(g, [raw, 0], W); seen.push(g.players[0].state); cues.push(...g.cues); }
  return { seen, cues };
}
const PAIRS = [['L', '5L', 'spirit5L'], ['M', '5M', 'spirit5M'], ['H', '5H', 'spirit5H']];

test('with the install on, standing L / M / H are the guardian\'s attacks; without it they are his own', () => {
  for (const [btn, own, spirit] of PAIRS) {
    const off = run(setup(400, false), `5+${btn} 5*3`);
    assert.ok(off.seen.includes(own) && !off.seen.includes(spirit), `no install: ${own}`);
    const on = run(setup(400, true), `5+${btn} 5*3`);
    assert.ok(on.seen.includes(spirit) && !on.seen.includes(own), `install: ${spirit}`);
  }
  // Crouching and air normals stay his own.
  assert.ok(run(setup(400, true), '2 2+L 2*3').seen.includes('2L'));
  // When the install runs out, his own normals are back.
  const g = setup(400, true);
  g.players[0].vars.install = 2;
  assert.ok(run(g, '5*5 5+L 5*3').seen.includes('5L'));
});

test('a guardian attack commits Malik like the normal it replaces, and hits where the guardian strikes', () => {
  for (const [btn, own, spirit] of PAIRS) {
    const a = M.states[own], b = M.states[spirit];
    assert.equal(b.duration, a.duration, `${spirit} lasts as long as ${own} (first pass: his own timing)`);
    assert.equal(b.move.startup, a.move.startup);
    // It reaches farther than his own normal: whiffs for him, hits for the guardian.
    const reach = RAW.moves.find((m) => m.id === spirit).hitboxes[0];
    const gap = reach[0] + reach[2] - 6 + 39; // the far edge of the box, less a little, plus the front of the opponent's body
    const hit = run(setup(gap, true), `5+${btn} 5*40`);
    assert.ok(hit.cues.some((c) => (c.type === 'hit' || c.type === 'counter') && c.move === spirit), `${spirit} hits at ${gap} px`);
    // He is stuck in the move for its whole length: holding forward does not walk him out of it.
    const g = setup(600, true);
    const x0 = g.players[0].x;
    const { seen } = run(g, `5+${btn} 6*${b.duration - 2}`);
    assert.ok(seen.slice(1).every((s) => s === spirit), 'committed');
    assert.equal(g.players[0].x, x0, 'he does not move');
  }
});

test('the guardian\'s attacks chain like his standing normals', () => {
  const g = setup(110, true);
  const { seen, cues } = run(g, '5+L 5*5 5+M 5*9 5+H 5*30');
  assert.deepEqual([...new Set(seen.filter((s) => s.startsWith('spirit')))], ['spirit5L', 'spirit5M', 'spirit5H']);
  assert.equal(cues.filter((c) => c.type === 'hit' || c.type === 'counter').length, 3);
  for (const [, own, spirit] of PAIRS) assert.deepEqual(RAW.gatlings[spirit], RAW.gatlings[own], `${spirit} chains like ${own}`);
});

test('drawing data: Malik holds his install idle through each attack while the guardian aura plays the strike', () => {
  const aura = RAW.mechanic.vars.install.aura.find((l) => l.effect === 'guardian');
  for (const [, , spirit] of PAIRS) {
    const mv = RAW.moves.find((m) => m.id === spirit);
    assert.equal(mv.sprite.image, 'sheets/install-idle.png');
    const fx = RAW.effects[aura.swap[spirit]];
    assert.ok(existsSync(`data/characters/malik/${fx.sprite.image}`), fx.sprite.image);
    assert.equal(fx.holds.length, fx.sprite.count);
    assert.equal(fx.holds.reduce((a, b) => a + b, 0), M.states[spirit].duration, `${spirit}: the guardian's drawings fill the move`);
    // The striking drawing is up on the first frame that can hit.
    const strike = { spirit5L: 2, spirit5M: 3, spirit5H: 3 }[spirit]; // the drawing with the palm wave or the orb out
    const before = fx.holds.slice(0, strike).reduce((a, b) => a + b, 0);
    assert.equal(before, mv.startup - 1, `${spirit}: the strike is drawn on the first frame that can hit`);
  }
  for (const st of ['installIdle', 'installWalkF', 'installDashF', 'installDashStop']) assert.ok(existsSync(`data/characters/malik/${RAW.states[st].sprite.image}`), st);
  assert.equal(M.states.installWalkF.frames.length, M.states.walkF.frames.length);
});
