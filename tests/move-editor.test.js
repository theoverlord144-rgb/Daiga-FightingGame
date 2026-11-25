// The editor's HIT SETTINGS page: the model that reads and writes a move's settings, the looping preview that
// plays the move against a dummy, and the attacker's recoil.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadJSON, SYSTEM } from './helpers.js';
import { compileCharacter } from '../src/core/character.js';
import { createWorld } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { FIELDS, settingsTarget, applies, readSetting, writeSetting, resetSetting, nudgeSetting, showSetting } from '../src/editor/move-model.js';
import { measure, reachOf, stateFor } from '../src/editor/preview.js';
import { diffOps } from '../src/editor/box-model.js';
import { editJSON } from '../scripts/json-edit.mjs';

const MALIK = 'data/characters/malik/malik.toska.json';
const RULES = { combo: loadJSON('data/system/combo.json'), battle: loadJSON('data/system/battle.json') };
const clone = (v) => JSON.parse(JSON.stringify(v));
const makeWorld = (a, b) => createWorld({ match: null, input: loadJSON('data/system/input.json'), battle: RULES.battle, combo: RULES.combo,
  meter: SYSTEM.meter, systems: SYSTEM.systems, burst: SYSTEM.burst, chars: [a, b] });
const play = (raw, entry, dummy = 'standing', distance = undefined) => {
  const def = compileCharacter(raw, SYSTEM);
  return measure({ def, dummyDef: def, makeWorld, entry, dummy, distance: distance ?? reachOf(def, entry) });
};
/** A move of Malik's with known numbers, so the tests don't depend on how he is tuned. */
function fixture() {
  const raw = loadJSON(MALIK);
  const m = raw.moves.find((x) => x.id === '5L');
  for (const k of ['launch', 'launcher', 'airHit', 'knockdown', 'recoil', 'selfPushback', 'untech', 'juggleCost', 'blockHitstop', 'chip']) delete m[k];
  Object.assign(m, { damage: 500, hitstun: 20, blockstun: 14, hitstop: 8, pushbackHit: 20, pushbackBlock: 30, guard: 'mid' });
  return raw;
}

for (const file of [MALIK, 'data/characters/avner/avner.toska.json']) {
  test(`hit settings: what the editor shows is what the game uses, for every move and projectile (${file.split('/').at(-1)})`, () => {
    const raw = loadJSON(file);
    const def = compileCharacter(raw, SYSTEM);
    let checked = 0;
    const check = (entry, move) => {
      const t = settingsTarget(raw, SYSTEM, entry);
      if (t.kind === 'none') return;
      const get = (key) => readSetting(raw, t, key, RULES).value;
      for (const key of ['damage', 'hitstun', 'blockstun', 'hitstop', 'blockHitstop', 'chip']) assert.equal(get(key), move[key], `${entry} ${key}`);
      for (const key of ['pushbackHit', 'pushbackBlock']) assert.equal(px(get(key)), move[key], `${entry} ${key}`);
      assert.equal(get('guard'), move.guard, `${entry} guard`);
      assert.equal(get('knockdown'), move.knockdown, `${entry} knockdown`);
      assert.equal(get('untech'), move.untech ?? move.hitstun, `${entry} untech`);
      assert.equal(get('launch.type'), move.launchType ?? 'none', `${entry} launch`);
      if (move.launchType) {
        const sys = move.launchType === 'hard' ? RULES.combo.hardLaunch : RULES.combo.softLaunch;
        const want = move.launch ?? { x: px(sys.x), y: px(sys.y) };
        assert.deepEqual([px(get('launch.x')), px(get('launch.y'))], [want.x, want.y], `${entry} launch speeds`);
      }
      const air = move.airHit ?? { x: px(RULES.battle.airHit.x), y: px(RULES.battle.airHit.y) };
      assert.deepEqual([px(get('airHit.x')), px(get('airHit.y'))], [air.x, air.y], `${entry} air hit`);
      checked++;
    };
    for (const [name, st] of Object.entries(def.states)) if (st.move) check(name, st.move);
    for (const [name, p] of Object.entries(def.projectiles)) {
      check(`proj:${name}`, p.move);
      const t = settingsTarget(raw, SYSTEM, `proj:${name}`);
      assert.equal(px(readSetting(raw, t, 'speed', RULES).value), p.speed);
      assert.equal(px(readSetting(raw, t, 'speedY', RULES).value), p.speedY);
      assert.equal(readSetting(raw, t, 'lifetime', RULES).value, p.lifetime);
      assert.deepEqual([px(readSetting(raw, t, 'spawn.0', RULES).value), px(readSetting(raw, t, 'spawn.1', RULES).value)], p.spawn);
    }
    assert.ok(checked > 20, `checked ${checked}`);
  });
}

test('hit settings: a change lands where the game reads it, only there, and "back to default" takes it out of the file', () => {
  const raw = fixture();
  const start = clone(raw);
  const t = settingsTarget(raw, SYSTEM, '5L');
  assert.equal(t.kind, 'move');
  writeSetting(raw, t, 'pushbackHit', 64, RULES);
  writeSetting(raw, t, 'recoil', 12, RULES);
  writeSetting(raw, t, 'guard', 'low', RULES);
  writeSetting(raw, t, 'knockdown', true, RULES);
  const m = compileCharacter(raw, SYSTEM).states['5L'].move;
  assert.deepEqual([m.pushbackHit, m.recoil, m.guard, m.knockdown], [px(64), px(12), 'low', true]);
  const ops = diffOps(start, raw);
  assert.ok(ops.length >= 4);
  assert.ok(ops.every((o) => o.path[0] === 'moves' && raw.moves[o.path[1]].id === '5L'), 'only 5M changed');
  assert.deepEqual(readSetting(raw, t, 'recoil', RULES), { value: 12, own: true });
  for (const key of ['recoil', 'knockdown']) resetSetting(raw, t, key);
  assert.equal('recoil' in t.write, false);
  assert.equal('knockdown' in t.write, false);
  assert.deepEqual(readSetting(raw, t, 'recoil', RULES), { value: 0, own: false });
  // Limits, steps and choices.
  writeSetting(raw, t, 'hitstop', 999, RULES);
  assert.equal(t.write.hitstop, 60, 'held to its limit');
  nudgeSetting(raw, t, 'damage', 1, false, RULES);
  assert.equal(t.write.damage, 510);
  nudgeSetting(raw, t, 'damage', -1, true, RULES);
  assert.equal(t.write.damage, 410);
  nudgeSetting(raw, t, 'guard', 1, false, RULES);
  assert.equal(t.write.guard, 'high');
  assert.throws(() => writeSetting(raw, t, 'guard', 'sideways', RULES));
  assert.throws(() => writeSetting(raw, t, 'speed', 4, RULES), /not a setting/);
  assert.equal(showSetting('guard', 'low'), 'crouching only');
  assert.equal(showSetting('pushbackHit', 20), '20 px');
});

test('hit settings: launch: none, soft or hard, with its own direction and strength, written the way the game reads it', () => {
  const raw = fixture();
  const t = settingsTarget(raw, SYSTEM, '5L');
  const move = () => compileCharacter(raw, SYSTEM).states['5L'].move;
  assert.equal(readSetting(raw, t, 'launch.type', RULES).value, 'none');
  assert.equal(readSetting(raw, t, 'launch.x', RULES).off, true);
  assert.throws(() => writeSetting(raw, t, 'launch.y', 10, RULES), /does not launch/);
  writeSetting(raw, t, 'launch.type', 'soft', RULES);
  assert.equal(t.write.launch, 'soft', 'plain soft follows the speeds of the system');
  assert.equal(move().launchType, 'soft');
  assert.deepEqual([readSetting(raw, t, 'launch.x', RULES).value, readSetting(raw, t, 'launch.y', RULES).value], [RULES.combo.softLaunch.x, RULES.combo.softLaunch.y]);
  writeSetting(raw, t, 'launch.x', 6, RULES);
  assert.deepEqual(t.write.launch, { type: 'soft', x: 6, y: RULES.combo.softLaunch.y });
  writeSetting(raw, t, 'launch.y', 9, RULES);
  assert.deepEqual(move().launch, { x: px(6), y: px(9) });
  writeSetting(raw, t, 'launch.type', 'hard', RULES);
  assert.deepEqual(t.write.launch, { type: 'hard', x: 6, y: 9 }, 'its own speeds are kept');
  assert.equal(move().launchType, 'hard');
  resetSetting(raw, t, 'launch.y');
  assert.equal(t.write.launch, 'hard', 'back to the system speeds');
  writeSetting(raw, t, 'launch.type', 'none', RULES);
  assert.equal('launch' in t.write, false);
  assert.equal(move().launchType, null);
  // The air hit: how an opponent already in the air is knocked.
  writeSetting(raw, t, 'airHit.y', -9, RULES);
  assert.deepEqual(t.write.airHit, { x: RULES.battle.airHit.x, y: -9 });
  assert.deepEqual(move().airHit, { x: px(RULES.battle.airHit.x), y: px(-9) });
  resetSetting(raw, t, 'airHit.x');
  assert.equal('airHit' in t.write, false);
  // An older "launcher: true" move keeps being a hard launcher when its direction is changed.
  const s = raw.moves.find((x) => x.launcher === true && x.launch);
  assert.ok(s, 'Malik has one (his S launcher)');
  const ts = settingsTarget(raw, SYSTEM, s.id);
  assert.equal(readSetting(raw, ts, 'launch.type', RULES).value, 'hard');
  writeSetting(raw, ts, 'launch.x', 3, RULES);
  const after = compileCharacter(raw, SYSTEM).states[s.id].move;
  assert.equal(after.launchType, 'hard');
  assert.equal(after.launch.x, px(3));
});

test('hit settings: projectiles, and what cannot be edited', () => {
  const raw = loadJSON(MALIK);
  const t = settingsTarget(raw, SYSTEM, 'proj:palm5');
  assert.equal(t.kind, 'projectile');
  assert.equal(applies(FIELDS.find((f) => f.key === 'recoil'), t), false, 'a projectile cannot push its owner');
  assert.equal(applies(FIELDS.find((f) => f.key === 'speed'), t), true);
  writeSetting(raw, t, 'speed', 20, RULES);
  writeSetting(raw, t, 'spawn.1', 130, RULES);
  writeSetting(raw, t, 'pushbackHit', 55, RULES);
  const p = compileCharacter(raw, SYSTEM).projectiles.palm5;
  assert.deepEqual([p.speed, p.spawn[1], p.move.pushbackHit], [px(20), px(130), px(55)]);
  assert.equal(settingsTarget(raw, SYSTEM, 'idle').write, null);
  assert.equal(settingsTarget(raw, SYSTEM, 'hitStand').write, null);
  assert.match(settingsTarget(raw, SYSTEM, 'idle').why, /not an attack/);
  // A universal move the character has an entry for can be tuned for that character; the entry holds the change.
  const v = settingsTarget(raw, SYSTEM, 'vow_strike');
  assert.equal(v.kind, 'move');
  const sys = readSetting(raw, v, 'damage', RULES);
  assert.equal(sys.own, false, 'read from the shared move until changed');
  writeSetting(raw, v, 'damage', sys.value + 100, RULES);
  assert.equal(compileCharacter(raw, SYSTEM).states.vow_strike.move.damage, sys.value + 100);
});

test('hit settings: saving writes only the changed numbers into the file text', () => {
  const text = fs.readFileSync(new URL(`../${MALIK}`, import.meta.url), 'utf8');
  const base = JSON.parse(text);
  const raw = clone(base);
  const t = settingsTarget(raw, SYSTEM, '5L');
  writeSetting(raw, t, 'pushbackHit', readSetting(raw, t, 'pushbackHit', RULES).value + 7, RULES);
  writeSetting(raw, t, 'launch.type', 'soft', RULES);
  writeSetting(raw, t, 'launch.x', 4, RULES);
  const out = editJSON(text, diffOps(base, raw));
  assert.deepEqual(JSON.parse(out), raw);
  const was = text.split('\n');
  const now = out.split('\n');
  assert.ok(Math.abs(now.length - was.length) <= 2, 'the file keeps its shape');
  assert.ok(now.filter((line) => !was.includes(line)).length <= 3, 'a few lines changed, the rest are as written');
});

test('preview: the move plays against a dummy and is measured; changing a setting changes what happens', () => {
  const raw = fixture();
  const base = play(raw, '5L');
  assert.equal(base.result, 'hit');
  assert.equal(base.damage, 500);
  assert.equal(base.pushed, 20);
  assert.equal(base.peak, 0);
  const t = settingsTarget(raw, SYSTEM, '5L');
  writeSetting(raw, t, 'pushbackHit', 60, RULES);
  writeSetting(raw, t, 'hitstun', 30, RULES);
  const pushed = play(raw, '5L');
  assert.equal(pushed.pushed, 60);
  assert.equal(pushed.advantage, base.advantage + 10, 'ten more frames of hitstun = ten more frames of advantage');
  // A blocking dummy.
  const blocked = play(raw, '5L', 'blocking');
  assert.equal(blocked.result, 'block');
  assert.equal(blocked.pushed, 30);
  assert.equal(blocked.damage, 0);
  // Soft launch: up and forward; stronger numbers go higher and farther.
  writeSetting(raw, t, 'launch.type', 'soft', RULES);
  writeSetting(raw, t, 'launch.x', 3, RULES);
  writeSetting(raw, t, 'launch.y', 10, RULES);
  const low = play(raw, '5L');
  assert.ok(low.launched && low.peak > 20, `launched (${low.peak})`);
  assert.ok(low.landed > 0, 'forward');
  writeSetting(raw, t, 'launch.y', 18, RULES);
  writeSetting(raw, t, 'launch.x', 7, RULES);
  const high = play(raw, '5L');
  assert.ok(high.peak > low.peak + 40, `higher (${low.peak} -> ${high.peak})`);
  assert.ok(high.landed > low.landed + 40, `farther (${low.landed} -> ${high.landed})`);
  writeSetting(raw, t, 'launch.x', -4, RULES);
  assert.ok(play(raw, '5L').landed < 0, 'a negative forward speed brings them toward the attacker');
  // A dummy already in the air is knocked by the air hit numbers.
  writeSetting(raw, t, 'launch.type', 'none', RULES);
  const air1 = play(raw, '5L', 'in the air');
  writeSetting(raw, t, 'airHit.y', 16, RULES);
  const air2 = play(raw, '5L', 'in the air');
  assert.equal(air1.result, 'hit');
  assert.ok(air2.peak > air1.peak + 20, `air hit up (${air1.peak} -> ${air2.peak})`);
  // Out of range: nothing touches.
  assert.equal(play(raw, '5L', 'standing', 600).result, 'whiff');
});

test('preview: a projectile entry plays the move that releases it', () => {
  const raw = loadJSON(MALIK);
  const def = compileCharacter(raw, SYSTEM);
  assert.equal(stateFor(def, 'proj:palm5'), 'rite_5');
  assert.equal(stateFor(def, 'proj:palmJ'), 'rite_j');
  assert.equal(stateFor(def, 'idle'), 'idle');
  assert.equal(play(raw, 'proj:palm5').result, 'hit');
  const j = play(raw, 'proj:palmJ');
  assert.equal(j.result, 'hit');
  assert.ok(j.launched, 'the ground hand launches');
});

test('recoil: the attacker slides back whenever the move touches, on hit and on block, and not on a whiff', () => {
  const raw = fixture();
  const t = settingsTarget(raw, SYSTEM, '5L');
  const before = play(raw, '5L');
  const beforeBlock = play(raw, '5L', 'blocking');
  writeSetting(raw, t, 'recoil', 40, RULES);
  assert.equal(compileCharacter(raw, SYSTEM).states['5L'].move.recoil, px(40));
  const hit = play(raw, '5L');
  assert.equal(hit.recoiled, before.recoiled + 40);
  assert.equal(hit.pushed, before.pushed, 'the pushback of the opponent is its own number');
  assert.equal(play(raw, '5L', 'blocking').recoiled, beforeBlock.recoiled + 40);
  // It still happens when the hit launches (there is no ordinary pushback then).
  writeSetting(raw, t, 'launch.type', 'soft', RULES);
  assert.equal(play(raw, '5L').recoiled, before.recoiled + 40);
  // A whiff: nothing.
  assert.equal(play(raw, '5L', 'standing', 600).recoiled, 0);
});

test('hit settings: a move that only releases a projectile shows the settings of that projectile', async () => {
  const { hitOwner } = await import('../src/editor/preview.js');
  const def = compileCharacter(loadJSON(MALIK), SYSTEM);
  assert.equal(hitOwner(def, 'rite_j'), 'proj:palmJ');
  assert.equal(hitOwner(def, 'rite_5'), 'proj:palm5');
  assert.equal(hitOwner(def, '5L'), '5L', 'a move with its own hitbox keeps its own');
  assert.equal(hitOwner(def, 'proj:palmJ'), 'proj:palmJ');
  assert.equal(hitOwner(def, 'idle'), 'idle');
});

test('"Hits airborne" is yes unless the file says no, and the switch writes only what differs from that', () => {
  const raw = loadJSON('data/characters/avner/avner.toska.json');
  const field = FIELDS.find((f) => f.key === 'hitsAirborne');
  const wave = settingsTarget(raw, SYSTEM, 'proj:tideWaveL');
  assert.ok(applies(field, wave));
  raw.projectiles.tideWaveL.hitsAirborne = false;
  assert.equal(readSetting(raw, wave, 'hitsAirborne', RULES).value, false);
  writeSetting(raw, wave, 'hitsAirborne', true, RULES);
  assert.ok(!('hitsAirborne' in raw.projectiles.tideWaveL), 'yes is the usual value: nothing is written');
  assert.equal(compileCharacter(raw, SYSTEM).projectiles.tideWaveL.move.hitsAirborne, true);
  writeSetting(raw, wave, 'hitsAirborne', false, RULES);
  assert.equal(raw.projectiles.tideWaveL.hitsAirborne, false);
  assert.equal(compileCharacter(raw, SYSTEM).projectiles.tideWaveL.move.hitsAirborne, false);
  // A plain move reads yes, and the older yes/no setting still defaults to no.
  const jab = settingsTarget(raw, SYSTEM, '5L');
  assert.equal(readSetting(raw, jab, 'hitsAirborne', RULES).value, true);
  assert.equal(readSetting(raw, jab, 'knockdown', RULES).value, false);
  writeSetting(raw, jab, 'knockdown', true, RULES);
  writeSetting(raw, jab, 'knockdown', false, RULES);
  assert.ok(!('knockdown' in raw.moves.find((m) => m.id === '5L')));
});
