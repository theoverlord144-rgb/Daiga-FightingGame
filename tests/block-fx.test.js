// The block effect and the see-through effects (owner, Nov 25): drawing only. These check the numbers the owner gave,
// that every effect has an opacity, and the player's setting.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadChar } from './helpers.js';
import { SETTING_OPTIONS, loadSettings, saveSettings, settingText } from '../src/ui/settings.js';
import { FXO } from '../src/render/fx-opacity.js';

const FX = JSON.parse(fs.readFileSync('data/system/effects.json', 'utf8'));
const unit = (v, what) => assert.ok(typeof v === 'number' && v >= 0 && v <= 1, `${what}: ${v}`);

test('see-through effects: the opacity of each kind of effect is as the owner gave it', () => {
  const O = FX.opacity;
  assert.equal(O.on, true);
  assert.equal(O.classes.hitSpark, 0.85);
  assert.equal(O.classes.block, 0.75);
  assert.equal(O.classes.burst, 0.8);
  assert.equal(O.classes.trail, 0.6);
  assert.equal(O.classes.dust, 0.7);
  assert.equal(O.classes.zone, 0.55);
  assert.equal(O.classes.aura, 0.55);
  assert.equal(O.flashFirst, 1, 'the first drawing of a hit spark is the flash, at full strength');
  assert.equal(O.coverShare, 0.5, 'an effect over more than half of a fighter');
  assert.equal(O.coverDrop, 0.15, 'drops a further 0.15');
});

test('see-through effects: every universal effect sheet has its own opacity', () => {
  for (const [group, sheets] of [['sparks', FX.sparks], ['slots', FX.slots.sheets], ['motion', FX.motion.sheets]]) {
    for (const [name, s] of Object.entries(sheets)) unit(s.opacity, `${group} ${name}`);
  }
  for (const s of Object.values(FX.sparks)) assert.equal(s.opacity, 0.85);
  for (const name of ['dashDustF', 'dashDustB', 'landF', 'landN', 'landB']) assert.equal(FX.motion.sheets[name].opacity, 0.7, name);
  const trail = FX.motion.sheets.airDashTrail;
  assert.ok(Math.abs(trail.alpha * trail.opacity - 0.6) < 0.01, 'the air dash trail comes to 0.6 with the alpha it already had');
});

test('see-through effects: every effect and projectile of each character has an opacity, and no name is stale', () => {
  for (const id of ['avner', 'malik']) {
    const c = loadChar(`data/characters/${id}/${id}.toska.json`);
    const list = c.art.opacity;
    assert.ok(list, id);
    for (const name of [...Object.keys(c.effects), ...Object.keys(c.projectiles)]) unit(list[name], `${id} ${name}`);
    for (const name of Object.keys(list)) assert.ok(name.startsWith('mark:') ? c.mechanic.vars[name.slice(5)] : c.effects[name] || c.projectiles[name], `${id}: ${name} exists`);
    for (const [name, p] of Object.entries(c.projectiles)) if (p.zone) assert.equal(list[name], 0.55, `${id} ${name} is a zone`);
  }
  const a = loadChar('data/characters/avner/avner.toska.json').art.opacity;
  for (const halo of ['haloBurstL', 'haloBurstM', 'haloBurstH', 'fullMoon', 'moonColumn']) assert.equal(a[halo], 0.8, halo);
});

// (Owner, Nov 25: one guard, no shield or sigil. Its sheet is the glass guard, ten drawings, which came with no
// holds: the timing below is fitted, not given. He then asked for the block sparks back, and no hold in hitstop.)
test('block effect: the guard, its holds and sizes', () => {
  const B = FX.blockFx;
  assert.equal(B.on, true);
  assert.equal(B.height, 0.5, 'the guard is 50% of the defender');
  assert.equal(B.opacity, 0.8, 'flat and a little see-through');
  assert.ok(!B.sprite.additive && !B.white.additive, 'ordinary drawing, not light');
  assert.equal(B.holdInHitstop, false, 'it plays through hitstop (owner, twice: the hold reads as the game freezing)');
  assert.equal(B.sprite.count, 10);
  assert.equal(B.in.length + B.loop.length + B.out.length, B.sprite.count, 'all ten drawings are used');
  assert.deepEqual(B.loop, [], 'owner, Nov 25: nothing is held while blockstun lasts; the animation plays straight through');
  assert.deepEqual(B.in, [2, 3, 3, 3], 'drawings 1 to 4 at their frame counts');
  assert.deepEqual(B.out, [2, 2, 2, 3, 3, 3], 'drawings 5 to 10 break into shards');
  assert.ok(B.pop.length === B.in.length && B.pop.every((v) => v > 0 && v <= 1), 'a fresh guard starts a little small');
  assert.equal(B.spin, 0, 'the guard itself does not turn: the drawn swirl does that (owner)');
  assert.equal(B.flash.frames, 2);
  assert.deepEqual(B.strengths.light, { size: 0.8, flash: false, spark: 'normal' });
  assert.deepEqual(B.strengths.medium, { size: 1, flash: false, spark: 'normal' });
  assert.deepEqual(B.strengths.heavy, { size: 1.15, flash: true, spark: ['heavy', 'shards'] }, 'heavies and physical specials also throw shards');
  assert.deepEqual(B.strengths.heavyProjectile, { size: 1.15, flash: true, spark: 'heavy' }, 'projectiles do not');
  assert.equal(B.strengthOf.projectile, 'heavyProjectile');
  assert.equal(B.sparks.shards.sprite.count, 7);
  assert.equal(B.sparks.shards.holds.length, 7);
  assert.deepEqual(B.sparks.normal.holds, [1, 2, 2, 3, 3]);
  assert.deepEqual(B.sparks.heavy.holds, [1, 2, 2, 3, 3, 4]);
  assert.equal(B.sparks.normal.sprite.count, 5);
  assert.equal(B.sparks.heavy.sprite.count, 6);
  assert.equal(B.sparks.normal.opacity, 0.85);
  assert.equal(B.repel.spark, 'heavy');
  assert.deepEqual(B.strengthOf.buttons, { L: 'light', M: 'medium' });
  const R = B.repel;
  assert.equal(R.size, 1.3);
  assert.equal(R.flash, true);
  assert.equal(R.outSpeed, 2, 'it breaks apart twice as fast');
  assert.equal(R.drift, 6);
  for (const k of ['shield', 'sigil']) assert.equal(B[k], undefined, `no ${k}`);
  for (const sp of [B.sprite, B.white, B.sparks.normal.sprite, B.sparks.heavy.sprite, B.sparks.shards.sprite]) assert.ok(fs.existsSync(`data/effects/${sp.image}`), sp.image);
  assert.deepEqual(fs.readdirSync('data/effects').filter((f) => f.startsWith('block-')).sort(), ['block-guard-white.png', 'block-guard.png', 'block-shards.png', 'block-spark-heavy.png', 'block-spark.png'], 'no shield or sigil strips');
});

test('effects opacity setting: 100% by default, and the chosen value reaches the drawing', () => {
  assert.equal(loadSettings().effectsOpacity, 1);
  assert.equal(FXO.global, 1);
  assert.ok(SETTING_OPTIONS.effectsOpacity.includes(1) && SETTING_OPTIONS.effectsOpacity.every((v) => v > 0 && v <= 1));
  assert.equal(settingText('effectsOpacity', 0.7), '70%');
  saveSettings({ ...loadSettings(), effectsOpacity: 0.5 });
  assert.equal(FXO.global, 0.5);
  saveSettings(loadSettings());
  assert.equal(FXO.global, 1);
});
