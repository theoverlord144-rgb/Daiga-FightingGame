// The editor's FX page (src/editor/fx-model.js): which effects a character owns and where their size, rotation,
// opacity and colour are written. Drawing-only settings: nothing here may change the compiled rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadJSON, SYSTEM } from './helpers.js';
import { compileCharacter } from '../src/core/character.js';
import { fxEntries, fxEntry, spriteOf, FX_FIELDS, SWATCHES, readFx, writeFx, resetFx, nudgeFx, showFx, fxPlayback, fxFrameAt } from '../src/editor/fx-model.js';
import { diffOps } from '../src/editor/box-model.js';
import { editJSON } from '../scripts/json-edit.mjs';

const CLASSES = loadJSON('data/system/effects.json').opacity.classes;
const PATH = (id) => `data/characters/${id}/${id}.toska.json`;
const clone = (v) => JSON.parse(JSON.stringify(v));

test('Every effect sheet of every character is listed, readable and playable', () => {
  for (const id of ['avner', 'malik', 'warteun']) {
    const raw = loadJSON(PATH(id));
    const list = fxEntries(raw);
    assert.equal(list.filter((e) => e.kind === 'effect').length, Object.values(raw.effects ?? {}).filter((e) => e.sprite).length, `${id}: every named effect`);
    assert.equal(new Set(list.map((e) => e.id)).size, list.length, `${id}: ids are unique`);
    for (const e of list) {
      for (const f of FX_FIELDS) { const v = readFx(raw, e, f.key, CLASSES); assert.ok(v.value !== undefined, `${id} ${e.id} ${f.key}`); showFx(f.key, v.value); }
      const play = fxPlayback(raw, e);
      const s = spriteOf(raw, e);
      assert.ok(play.seq.length > 0, `${id} ${e.id}: it has drawings to play`);
      for (const [index, hold] of play.seq) assert.ok(index >= 0 && index < (s.count ?? s.columns * (s.rows ?? 1)) && hold > 0, `${id} ${e.id}: drawing ${index} exists`);
      const total = play.seq.reduce((a, [, h]) => a + h, 0);
      assert.equal(fxFrameAt(play, 0)[0], play.seq[0][0]);
      assert.equal(fxFrameAt(play, total), null, 'a short gap before it loops');
      assert.deepEqual(fxFrameAt(play, total + 12), fxFrameAt(play, 0));
    }
  }
});

test('WarTeun: the list has his one-shot effects, the vacuum with its fire and smoke, and the ripple', () => {
  const ids = fxEntries(loadJSON(PATH('warteun'))).map((e) => e.id);
  for (const id of ['fx:note', 'fx:chord', 'fx:warpPop', 'proj:vacuum', 'proj:vacuum:fire', 'proj:vacuum:smoke', 'proj:ripple']) assert.ok(ids.includes(id), id);
});

test('Each setting is written where the game reads it, and back-to-default takes it out again', () => {
  const start = loadJSON(PATH('warteun'));
  const raw = clone(start);
  const note = fxEntry(raw, 'fx:note'), vac = fxEntry(raw, 'proj:vacuum'), fire = fxEntry(raw, 'proj:vacuum:fire'), ripple = fxEntry(raw, 'proj:ripple');
  const fireSprite = () => raw.projectiles.vacuum.burstArt.fire.sprite;
  delete fireSprite().tint; delete fireSprite().angle; // whatever the owner has tuned, start these from nothing
  fireSprite().scale = 0.5;
  delete raw.effects.note.sprite.tint;
  delete raw.projectiles.vacuum.sprite.tint; delete raw.projectiles.vacuum.sprite.opacity;
  const base = clone(raw);

  // Size and rotation live on the sheet.
  writeFx(raw, note, 'scale', 0.8);
  writeFx(raw, note, 'angle', 45);
  assert.equal(raw.effects.note.sprite.scale, 0.8);
  assert.equal(raw.effects.note.sprite.angle, 45);
  writeFx(raw, note, 'angle', 0);
  assert.ok(!('angle' in raw.effects.note.sprite), 'rotation 0 is not written');
  writeFx(raw, note, 'angle', 999);
  assert.equal(raw.effects.note.sprite.angle, 180, 'clamped');
  assert.throws(() => resetFx(raw, note, 'scale'), /no default/);

  // Opacity: a named effect and a projectile in art.opacity; a burst's sheet on the sheet; a layer on the layer.
  writeFx(raw, note, 'opacity', 0.4);
  assert.equal(raw.art.opacity.note, 0.4);
  writeFx(raw, ripple, 'opacity', 0.5);
  assert.equal(raw.art.opacity.ripple, 0.5);
  resetFx(raw, ripple, 'opacity');
  assert.ok(!('ripple' in raw.art.opacity));
  assert.deepEqual(readFx(raw, ripple, 'opacity', CLASSES), { value: CLASSES.projectile, own: false }, 'back to the class default');
  assert.deepEqual(readFx(raw, vac, 'opacity', CLASSES), { value: 1, own: false }, 'the vacuum is solid unless told otherwise');
  writeFx(raw, vac, 'opacity', 0.7);
  assert.equal(raw.projectiles.vacuum.sprite.opacity, 0.7);
  assert.ok(!('vacuum' in raw.art.opacity), 'no effect-opacity rule is given to the vacuum');
  writeFx(raw, vac, 'opacity', 1);
  assert.ok(!('opacity' in raw.projectiles.vacuum.sprite));
  writeFx(raw, fire, 'opacity', 0.6);
  assert.equal(raw.projectiles.vacuum.burstArt.fire.opacity, 0.6);

  // Colour: a swatch, a mix, none.
  assert.equal(readFx(raw, fire, 'tint').value, null);
  writeFx(raw, fire, 'tint', '#FF4040');
  assert.equal(fireSprite().tint, '#ff4040');
  writeFx(raw, fire, 'tint.g', 200);
  assert.equal(fireSprite().tint, '#ffc840');
  assert.equal(readFx(raw, fire, 'tint.b').value, 0x40);
  writeFx(raw, note, 'tint.r', 100);
  assert.equal(raw.effects.note.sprite.tint, '#64ffff', 'mixing from no colour starts at white');
  assert.throws(() => writeFx(raw, fire, 'tint', 'red'), /#rrggbb/);
  nudgeFx(raw, vac, 'tint', 1, false, CLASSES);
  assert.equal(raw.projectiles.vacuum.sprite.tint, SWATCHES[1]);
  nudgeFx(raw, vac, 'tint', -1, false, CLASSES);
  assert.ok(!('tint' in raw.projectiles.vacuum.sprite), 'stepping back to NONE removes it');
  resetFx(raw, fire, 'tint');
  assert.ok(!('tint' in fireSprite()));

  // Nudging steps by the field's step.
  nudgeFx(raw, fire, 'scale', 1, false, CLASSES);
  assert.equal(fireSprite().scale, 0.55);
  nudgeFx(raw, fire, 'angle', -1, true, CLASSES);
  assert.equal(fireSprite().angle, -15);

  // The edited file still compiles, the settings reach the drawing data, and the rules did not move.
  const was = compileCharacter(base, SYSTEM), now = compileCharacter(raw, SYSTEM);
  assert.equal(now.effects.note.sprite.angle, 180);
  assert.equal(now.effects.note.sprite.tint, '#64ffff');
  assert.equal(now.projectiles.vacuum.burstArt.fire.sprite.angle, -15);
  assert.equal(now.art.opacity.note, 0.4);
  assert.deepEqual(Object.keys(now.states), Object.keys(was.states));
  for (const name of Object.keys(was.states)) assert.deepEqual(now.states[name].frames, was.states[name].frames, `${name}: frames unchanged`);
  for (const name of Object.keys(was.projectiles)) assert.deepEqual(now.projectiles[name].move, was.projectiles[name].move, `${name}: hit unchanged`);

  // And it saves the way the editor saves: only those values change in the file's text.
  const text = fs.readFileSync(PATH('warteun'), 'utf8');
  const saved = JSON.parse(editJSON(text, diffOps(start, raw)));
  assert.deepEqual(saved, raw);
});

test('An effect that carries its own opacity is edited in place', () => {
  const raw = clone(loadJSON(PATH('malik')));
  raw.effects.pillar.opacity = 0.9;
  const e = fxEntry(raw, 'fx:pillar');
  assert.deepEqual(readFx(raw, e, 'opacity', CLASSES), { value: 0.9, own: true });
  writeFx(raw, e, 'opacity', 0.3);
  assert.equal(raw.effects.pillar.opacity, 0.3);
  assert.equal(raw.art.opacity.pillar, loadJSON(PATH('malik')).art.opacity.pillar, 'the name rule is left alone');
});
