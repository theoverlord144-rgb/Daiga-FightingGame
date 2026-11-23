// The art of the universal systems: every sheet the data names is really there, drawings fill their moves, and the
// effect rules only name effects that exist. (Drawing data: the game never reads it, so nothing here is a rule.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadChar, loadJSON } from './helpers.js';

const FILES = { avner: 'data/characters/avner/avner.toska.json', malik: 'data/characters/malik/malik.toska.json' };
const here = (p) => new URL(`../${p}`, import.meta.url);

/** Every "image" a parsed JSON value names, anywhere inside it. */
function images(value, out = []) {
  if (Array.isArray(value)) for (const v of value) images(v, out);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) (k === 'image' && typeof v === 'string' ? out.push(v) : images(v, out));
  return out;
}

test('every sheet a character file names exists in its folder', () => {
  for (const [id, file] of Object.entries(FILES)) {
    const named = [...new Set(images(loadJSON(file)))];
    assert.ok(named.length > 20, `${id} names its sheets`);
    for (const image of named) assert.ok(existsSync(here(`data/characters/${id}/${image}`)), `${id}: ${image} is missing`);
  }
});

test('every universal effect sheet exists, and every effect rule names a sheet that is there', () => {
  const fx = loadJSON('data/system/effects.json');
  for (const image of new Set(images(fx))) assert.ok(existsSync(here(`data/effects/${image}`)), `data/effects/${image} is missing`);
  const S = fx.slots;
  const rules = [...Object.values(S.cues).flat(), ...Object.values(S.while)];
  assert.ok(rules.length >= 10);
  for (const r of rules) assert.ok(S.sheets[r.play], `slot rule plays "${r.play}", which is not a sheet`);
  assert.ok(S.sheets[S.flash.lines], 'the super flash lines');
  for (const r of [...Object.values(fx.motion.enter), ...Object.values(fx.motion.leave)]) {
    for (const name of [r.play, r.trail, ...(r.byDrift || [])].filter(Boolean)) assert.ok(fx.motion.sheets[name], `movement rule plays "${name}"`);
  }
  // The effects the owner drew are in (not placeholders); only these three still wait for art.
  const waiting = Object.entries(S.sheets).filter(([, s]) => s.sprite.image.includes('placeholder')).map(([k]) => k).sort();
  assert.deepEqual(waiting, ['ex_flash', 'perfect_flash', 'witness_flash']);
});

test("Malik: every drawn attack's drawings fill the move exactly", () => {
  const c = loadChar(FILES.malik);
  let checked = 0;
  for (const [name, st] of Object.entries(c.states)) {
    const sheet = c.sheets[name];
    if (!st.move || !sheet?.holds) continue;
    const total = sheet.holds.slice(0, sheet.count).reduce((a, b) => a + b, 0);
    assert.equal(total, st.duration, `${name}: holds add up to ${total}, the move lasts ${st.duration}`);
    checked++;
  }
  assert.ok(checked >= 25, `checked ${checked} moves`);
});

test('Malik: the universal systems use his own drawings, timed to the rules', () => {
  const c = loadChar(FILES.malik);
  const real = ['vow_start', 'vow_hold', 'vow_absorb', 'vow_strike_quick', 'vow_strike', 'vow_strike_full', 'absolve', 'absolve_air',
    'absolve_recovery', 'repel', 'draw', 'crumple', 'rite_5', 'rite_2', 'rite_6', 'rite_j'];
  for (const name of real) assert.ok(c.sheets[name] && !c.sheets[name].image.includes('placeholder'), `${name} has its own art`);
  for (const name of ['palm5', 'palm2', 'palm6', 'palmJ']) assert.ok(!c.projectiles[name].sprite.image.includes('placeholder'), `${name} has its own art`);
  // Still waiting for a drawing (stand-ins): being pulled in by a Draw, and the baited Absolve falling.
  for (const name of ['drawn', 'absolve_recovery_air']) assert.ok(c.sheets[name].image.includes('placeholder'), name);

  // The owner's call: on an absorbed hit, drawing 2 is the emphasis, and it holds.
  const absorb = c.sheets.vow_absorb.holds;
  assert.equal(absorb.indexOf(Math.max(...absorb)), 1, 'drawing 2 is held the longest');
  assert.ok(absorb[1] >= 6, 'through the whole hitstop of an absorbed hit (6 frames)');
  assert.equal(c.states.vow_absorb.duration, absorb.reduce((a, b) => a + b, 0), 'and the pose lasts as long as its drawings');
  assert.equal(c.states.vow_absorb.frames[2].sprite.index, 1);

  // The guard loop repeats without a hold at its end.
  assert.equal(c.states.vow_hold.duration, c.sheets.vow_hold.holds.reduce((a, b) => a + b, 0));
  // Each strike's hitting drawing (the palm out) is on screen when the hitbox comes out.
  for (const [name, drawing] of [['vow_strike_quick', 2], ['vow_strike', 3], ['vow_strike_full', 3]]) {
    const st = c.states[name];
    const first = st.frames.findIndex((f) => f.hit.length);
    assert.equal(st.frames[first].sprite.index, drawing, `${name}: drawing ${drawing + 1} shows on the first hitting frame`);
  }
  // Each Rite move shows the thrust on the frame the hand appears.
  for (const name of ['rite_5', 'rite_2', 'rite_6', 'rite_j']) {
    const st = c.states[name];
    const at = st.onEnter.findIndex((evs) => (evs || []).some((e) => e.type === 'spawn'));
    assert.ok(at > 0, `${name} spawns its hand`);
    assert.ok(st.frames[at].sprite.index >= 1, `${name}: past the wind-up drawing when the hand appears`);
  }
});
