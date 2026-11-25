// Shockwave rings on big hits (owner, Nov 25): drawing only. These check the numbers and which moves ask for them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadChar } from './helpers.js';

const FX = JSON.parse(fs.readFileSync('data/system/effects.json', 'utf8')).shockwave;

test('shockwave: the default pair, the bigger pair and the three-ring set are as the owner gave them', () => {
  const d = FX.sets.default;
  assert.equal(d.scale, 1);
  assert.deepEqual(d.rings[0], { delay: 0, startAt: 2, life: 16, radius: 0.45, thick: [18, 30], strength: 14 });
  assert.deepEqual([d.rings[1].delay, d.rings[1].life, d.rings[1].radius, d.rings[1].strength], [4, 14, 0.3, 9]);
  assert.equal(FX.sets.big.scale, 1.3);
  assert.deepEqual(FX.sets.big.rings, d.rings, 'the same pair, larger');
  assert.equal(FX.sets.super.scale, 1.6);
  assert.equal(FX.sets.super.rings.length, 3);
  assert.ok(FX.sets.super.pulse.frames > 0 && FX.sets.super.pulse.alpha > 0, 'with a brief whole-screen pulse');
  assert.ok(FX.max >= 6, 'at least six rings at once');
  assert.ok(Math.abs(FX.edge - 0.1) < 1e-9, 'the edge is about 10% white');
  for (const set of Object.values(FX.sets)) for (const r of set.rings) assert.ok(r.life > 0 && r.radius > 0 && r.strength > 0 && r.thick.length === 2);
});

test('shockwave: the system hits name real sets, and nothing is set for light or medium hits or blocks', () => {
  assert.deepEqual(FX.when, { counter: 'big', crumple: 'big', launcher: 'big', slam: 'big', groundbounce: 'big', wallbounce: 'big', superLast: 'super', ko: 'super' });
  for (const name of Object.values(FX.when)) assert.ok(FX.sets[name], name);
  assert.equal(FX.when.block, undefined);
});

test('shockwave: each character lists its heavy moves, every name is a real move or projectile, and no light or medium is listed', () => {
  for (const id of ['avner', 'malik']) {
    const c = loadChar(`data/characters/${id}/${id}.toska.json`);
    const list = c.art.shockwave;
    assert.ok(list && Object.keys(list).length >= 8, id);
    for (const [name, set] of Object.entries(list)) {
      assert.ok(c.states[name] || c.projectiles[name], `${id}: ${name} exists`);
      assert.ok(FX.sets[set], `${id}: ${name} names the set ${set}`);
      assert.ok(!/(^|\.)\d?[LM]$|[a-z][LM]$/.test(name), `${id}: ${name} is not a light or medium`);
    }
    for (const heavy of ['5H', '2H', 'j.H', 'backHeavy']) assert.equal(list[heavy], 'default', `${id} ${heavy}`);
  }
});
