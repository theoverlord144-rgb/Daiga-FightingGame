// The editor's CANCELS page (its model) and the frame timing on the HIT SETTINGS page.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJSON, SYSTEM } from './helpers.js';
import { compileCharacter } from '../src/core/character.js';
import { cancelMoves, cancelTargets, readCancels, reachedFrom, chainMakesSense, toggleChain, setChainOn, setGroup, setWindow } from '../src/editor/cancel-model.js';
import { settingsTarget, readSetting, writeSetting, resetSetting } from '../src/editor/move-model.js';

const MALIK = 'data/characters/malik/malik.toska.json';
const AVNER = 'data/characters/avner/avner.toska.json';
const RULES = { combo: loadJSON('data/system/combo.json'), battle: loadJSON('data/system/battle.json') };
const clone = (v) => JSON.parse(JSON.stringify(v));
const compile = (raw) => compileCharacter(raw, SYSTEM);
/** What the compiled move allows into `target` (a move id or a group like "#special"): 'no' | 'hit' | 'block' | 'both'. */
function allowed(def, id, target) {
  let hit = false, block = false;
  for (const w of def.states[id].cancels) if (w.into.has(target)) { hit ||= w.hit; block ||= w.block; }
  return hit ? (block ? 'both' : 'hit') : block ? 'block' : 'no';
}

for (const file of [MALIK, AVNER]) {
  test(`cancels: what the editor shows is what the game allows, for every move (${file.split('/').at(-1)})`, () => {
    const raw = loadJSON(file);
    const def = compile(raw);
    const moves = cancelMoves(raw, def);
    const targets = cancelTargets(raw, def);
    assert.ok(moves.length > 10 && targets.length > 5);
    for (const a of moves) {
      const c = readCancels(raw, def, a.id);
      for (const b of targets) assert.equal(allowed(def, a.id, b.id), c.chains.includes(b.id) ? c.chainOn : 'no', `${a.id} into ${b.id}`);
      if (c.extra) continue; // a hand-written window may add routes of its own
      assert.equal(allowed(def, a.id, '#special'), c.special.value, `${a.id} into a special`);
      assert.equal(allowed(def, a.id, '#super'), c.super.value, `${a.id} into a super`);
      assert.equal(allowed(def, a.id, '#jump'), c.jump.value, `${a.id} into a jump`);
      assert.equal(allowed(def, a.id, '#superjump'), c.superJump ? 'hit' : 'no', `${a.id} into a super jump`);
      const w = def.states[a.id].cancels.find((x) => x.into.has('#special') || x.into.has('#super'));
      if (w) assert.deepEqual([w.from, w.to], [c.from, c.to], `${a.id}: the window`);
    }
  });
}

test('cancels: adding and removing a chain, hit-only chains, and who reaches a move', () => {
  const raw = loadJSON(MALIK);
  raw.gatlings = { '5L': ['5M'], '5M': ['5H'] };
  let def = compile(raw);
  toggleChain(raw, def, '5L', '2M');
  toggleChain(raw, def, '5L', '5L');
  assert.deepEqual(raw.gatlings['5L'], ['5L', '5M', '2M'], 'kept in the order of the move list');
  def = compile(raw);
  assert.equal(allowed(def, '5L', '2M'), 'both');
  assert.deepEqual(reachedFrom(raw, '5M'), ['5L']);
  setChainOn(raw, '5L', 'hit');
  assert.deepEqual(raw.gatlings['5L'], { into: ['5L', '5M', '2M'], on: ['hit'] });
  def = compile(raw);
  assert.equal(allowed(def, '5L', '5M'), 'hit');
  assert.equal(readCancels(raw, def, '5L').chainOn, 'hit');
  toggleChain(raw, def, '5L', '5H');
  assert.deepEqual(raw.gatlings['5L'].on, ['hit'], 'still hit only after another is added');
  setChainOn(raw, '5L', 'both');
  assert.ok(Array.isArray(raw.gatlings['5L']), 'back to the short form');
  for (const t of ['5L', '5M', '2M', '5H']) toggleChain(raw, def, '5L', t);
  assert.equal('5L' in raw.gatlings, false, 'an empty list is taken out of the file');
  assert.equal(allowed(compile(raw), '5L', '5M'), 'no');
  // A move with no chains yet gets a list.
  toggleChain(raw, def, '2H', '5S');
  assert.deepEqual(raw.gatlings['2H'], ['5S']);
  // Ground normals and air normals are not offered to each other.
  const by = Object.fromEntries(cancelMoves(raw, def).map((x) => [x.id, x]));
  assert.equal(chainMakesSense(by['5L'], by['j.L']), false);
  assert.equal(chainMakesSense(by['5L'], by['5M']), true);
  assert.equal(chainMakesSense(by['j.L'], by['j.M']), true);
});

test('cancels: special, super and jump routes; only what differs from the default is written', () => {
  const raw = loadJSON(MALIK);
  const m = raw.moves.find((x) => x.id === '5M');
  for (const k of ['specialCancel', 'superCancel', 'jumpCancel', 'cancelFrom', 'cancelTo', 'launch', 'launcher']) delete m[k];
  let def = compile(raw);
  let c = readCancels(raw, def, '5M');
  assert.deepEqual([c.special, c.super.value, c.jump], [{ value: 'both', own: false }, 'both', { value: 'no', own: false }]);
  setGroup(raw, def, '5M', 'special', 'hit');
  assert.equal(m.specialCancel, 'hit');
  def = compile(raw);
  assert.equal(allowed(def, '5M', '#special'), 'hit');
  assert.equal(readCancels(raw, def, '5M').super.value, 'hit', 'supers follow specials unless set');
  setGroup(raw, def, '5M', 'super', 'both');
  assert.equal(m.superCancel, true);
  assert.equal(allowed(compile(raw), '5M', '#super'), 'both');
  setGroup(raw, def, '5M', 'special', 'no');
  assert.equal(m.specialCancel, false);
  assert.equal(allowed(compile(raw), '5M', '#special'), 'no');
  setGroup(raw, def, '5M', 'special', 'both');
  assert.equal('specialCancel' in m, false, 'the default is not written');
  setGroup(raw, def, '5M', 'jump', 'hit');
  assert.equal(m.jumpCancel, 'hit');
  assert.equal(allowed(compile(raw), '5M', '#jump'), 'hit');
  setGroup(raw, def, '5M', 'jump', 'both');
  assert.equal(m.jumpCancel, true);
  setGroup(raw, def, '5M', 'jump', 'no');
  assert.equal('jumpCancel' in m, false);
  assert.throws(() => setGroup(raw, def, '5M', 'special', 'sometimes'));
  // The window.
  def = compile(raw);
  c = readCancels(raw, def, '5M');
  assert.equal(c.from, def.states['5M'].move.startup - 1, 'opens on the first active frame');
  assert.equal(c.to, def.states['5M'].frames.length - 1, 'closes at the end');
  setWindow(raw, def, '5M', 'to', c.from + 4);
  def = compile(raw);
  const w = def.states['5M'].cancels.find((x) => x.into.has('#special'));
  assert.deepEqual([w.from, w.to], [c.from, c.from + 4]);
  assert.throws(() => setWindow(raw, def, '5M', 'from', c.from + 9), /after it closes/);
  setWindow(raw, def, '5M', 'to', null);
  assert.equal('cancelTo' in m, false);
});

test('timing: startup, active and recovery change the length and everything timed to it moves along', () => {
  const raw = loadJSON(MALIK);
  let checked = 0;
  for (const m of raw.moves) {
    const before = compile(raw).states[m.id];
    if (!before?.move || m.startup === undefined || !m.sprite?.holds) continue;
    const start = clone(m);
    const t = settingsTarget(raw, SYSTEM, m.id);
    if (t.kind !== 'move' || t.layers.length > 1) continue;
    const total = before.frames.length;
    const firstHit = before.frames.findIndex((f) => f.hit.length);
    const spawnAt = before.onEnter.findIndex((evs) => (evs || []).some((e) => e.type === 'spawn'));
    writeSetting(raw, t, 'startup', m.startup + 3, RULES);
    let now = compile(raw).states[m.id];
    assert.equal(now.frames.length, total + 3, `${m.id}: three frames longer`);
    assert.equal(m.sprite.holds.reduce((a, b) => a + b, 0), total + 3, `${m.id}: the drawings fill it`);
    if (firstHit >= 0) assert.equal(now.frames.findIndex((f) => f.hit.length), firstHit + 3, `${m.id}: hits three frames later`);
    if (spawnAt >= 0) assert.equal(now.onEnter.findIndex((evs) => (evs || []).some((e) => e.type === 'spawn')), spawnAt + 3, `${m.id}: its projectile comes out three frames later`);
    if (firstHit >= 0) assert.equal(now.frames[firstHit + 3].sprite.index, before.frames[firstHit].sprite.index, `${m.id}: the same drawing on the first hitting frame`);
    writeSetting(raw, t, 'recovery', (m.recovery ?? 0) + 5, RULES);
    now = compile(raw).states[m.id];
    assert.equal(now.frames.length, total + 8);
    assert.equal(m.sprite.holds.reduce((a, b) => a + b, 0), total + 8);
    assert.equal(m.sprite.holds.at(-1), start.sprite.holds.at(-1) + 5, `${m.id}: the last drawing holds the extra recovery`);
    writeSetting(raw, t, 'recovery', m.recovery - 5, RULES);
    writeSetting(raw, t, 'startup', m.startup - 3, RULES);
    assert.deepEqual(m, start, `${m.id}: there and back leaves it as it was`);
    checked++;
  }
  assert.ok(checked >= 20, `checked ${checked} moves`);
});

test('timing: shortening takes frames from the drawings without dropping any, and refuses what cannot be', () => {
  const raw = loadJSON(MALIK);
  const m = raw.moves.find((x) => x.id === '5H');
  const t = settingsTarget(raw, SYSTEM, '5H');
  const total = compile(raw).states['5H'].frames.length;
  writeSetting(raw, t, 'active', m.active + 2, RULES);
  assert.equal(compile(raw).states['5H'].frames.filter((f) => f.hit.length).length, m.active, 'two more hitting frames');
  writeSetting(raw, t, 'active', m.active - 2, RULES);
  writeSetting(raw, t, 'recovery', 1, RULES);
  assert.ok(m.sprite.holds.every((h) => h >= 1), 'every drawing still shows');
  assert.equal(m.sprite.holds.reduce((a, b) => a + b, 0), compile(raw).states['5H'].frames.length);
  assert.ok(compile(raw).states['5H'].frames.length < total);
  // 3 active + 1 recovery leaves room for a startup of 3 at the least: six drawings need six frames.
  const held = clone(m);
  assert.throws(() => writeSetting(raw, t, 'startup', 0, RULES), /Too short for its 6 drawings/);
  assert.deepEqual(m, held, 'a refused change leaves the move untouched');
  writeSetting(raw, t, 'startup', 3, RULES);
  assert.equal(compile(raw).states['5H'].frames.length, 6);
  assert.deepEqual(m.sprite.holds, [1, 1, 1, 1, 1, 1]);
  assert.throws(() => resetSetting(raw, t, 'startup'), /UNDO/);
  assert.equal(readSetting(raw, t, 'startup', RULES).value, 3);
  // Not for projectiles, EX versions, or moves shared by every character.
  assert.throws(() => writeSetting(raw, settingsTarget(raw, SYSTEM, 'proj:palm5'), 'startup', 5, RULES), /not a setting/);
  const v = settingsTarget(raw, SYSTEM, 'vow_strike');
  assert.throws(() => writeSetting(raw, v, 'startup', 5, RULES), /shared by every character/);
  // A move's own cancel window moves with its startup.
  const a = loadJSON(AVNER);
  const ls = a.moves.find((x) => x.id === 'lightstep');
  const win = clone(ls.cancels[0]);
  writeSetting(a, settingsTarget(a, SYSTEM, 'lightstep'), 'startup', ls.startup + 2, RULES);
  const moved = ls.cancels[0];
  assert.ok(moved.to === win.to + 2 || moved.from === win.from + 2, 'the hand-written window moved with it');
  compile(a);
});

test('cancels and timing: saving writes them into the file text and changes only a few lines', async () => {
  const fs = await import('node:fs');
  const { diffOps } = await import('../src/editor/box-model.js');
  const { editJSON } = await import('../scripts/json-edit.mjs');
  for (const file of [MALIK, AVNER]) {
    const text = fs.readFileSync(file, 'utf8');
    const base = JSON.parse(text);
    const raw = clone(base);
    const def = compile(raw);
    toggleChain(raw, def, '5H', '2M'); // add to a list
    toggleChain(raw, def, '5L', '5M'); // remove from a list
    toggleChain(raw, def, '2H', '5S'); // a move with no list yet
    setChainOn(raw, '5M', 'hit'); // a list becomes { into, on }
    setGroup(raw, def, '5M', 'jump', 'hit');
    setGroup(raw, def, '2M', 'special', 'no');
    setWindow(raw, def, '5L', 'to', 6);
    writeSetting(raw, settingsTarget(raw, SYSTEM, '2L'), 'recovery', raw.moves.find((m) => m.id === '2L').recovery + 3, RULES);
    const out = editJSON(text, diffOps(base, raw));
    assert.deepEqual(JSON.parse(out), raw, `${file}: the saved file holds the changes`);
    const before = text.split('\n');
    const after = out.split('\n');
    const changed = after.filter((l) => !before.includes(l)).length;
    assert.ok(changed <= 12, `${file}: ${changed} lines changed`);
    compile(JSON.parse(out));
  }
});
