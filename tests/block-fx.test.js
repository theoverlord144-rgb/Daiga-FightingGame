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

// (Owner's brief, Nov 27, replacing the Nov 25 glass guard and its sparks: two layers on one timeline, used by every
// character. The holds are fitted, not given; the brief gives drawing 4 held for the blockstun.)
test('block effect: two layers (the shield flat at 70%, its glow as light on top), one timeline, drawing 4 held for the blockstun', () => {
  const B = FX.blockFx;
  assert.equal(B.on, true);
  assert.equal(B.bodyOpacity, 0.7, 'the body layer at 70% opacity');
  assert.equal(B.holdInHitstop, false, 'it plays through hitstop (owner, Nov 25)');
  const N = B.sets.normal, Hv = B.sets.heavy;
  assert.ok(!N.body.additive, 'the body is drawn normally');
  assert.ok(N.light.additive && Hv.light.additive, 'the light layers are drawn as light');
  assert.equal(N.body.count, N.light.count, 'body and light have the same drawings');
  assert.equal(B.lightOffset.length, N.body.count, 'the measured light offset is stored per drawing');
  for (const [name, S] of Object.entries(B.sets)) {
    assert.equal(S.in.length, 3, `${name}: drawings 1 to 3 play in`);
    assert.equal(S.loop.length, 1, `${name}: drawing 4 is the one held`);
    assert.equal(S.in.length + S.loop.length + S.out.length, S.light.count, `${name}: every drawing is used once`);
    if (S.body) assert.equal(S.body.count, S.light.count, name);
  }
  assert.equal(N.body.count, 8);
  assert.equal(Hv.light.count, 10);
  assert.equal(Hv.body, undefined, 'FX_BlockHeavy_Body has not been drawn yet: heavy blocks play their light alone');
  assert.equal(B.strengths.light.set, 'normal');
  assert.equal(B.strengths.medium.set, 'normal');
  assert.equal(B.strengths.heavy.set, 'heavy');
  assert.deepEqual(B.strengthOf.buttons, { L: 'light', M: 'medium' }, 'only L and M normals are light blocks; heavies, specials and supers are heavy');
  assert.equal(B.strengthOf.projectile, 'heavy');
  for (const st of ['stand', 'crouch', 'air']) assert.equal(B.guard[st].length, 2, `a guard point for ${st}`);
  assert.ok(B.guard.crouch[1] < B.guard.stand[1], 'lower when crouching');
  const R = B.repel;
  assert.equal(R.size, 1.3);
  assert.equal(R.outSpeed, 2, 'a Repel breaks apart twice as fast');
  assert.equal(R.drift, 6);
  for (const sp of [N.body, N.light, Hv.light]) assert.ok(fs.existsSync(`data/effects/${sp.image}`), sp.image);
  assert.deepEqual(fs.readdirSync('data/effects').filter((f) => f.startsWith('block-')).sort(), ['block-body.png', 'block-heavy-light.png', 'block-light.png'], 'no old guard, spark or shard strips');
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
