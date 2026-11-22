// Phase 9 pieces outside the core: palettes, stages, and the character-select rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { compileCharacter } from '../src/core/character.js';
import { recolorPixels, hexToRgb, placeholderColors } from '../src/render/palette.js';
import { createSelectScreen } from '../src/ui/screens/select.js';
import { loadChar, loadJSON, SYSTEM } from './helpers.js';

const AVNER = loadChar('data/characters/avner/avner.toska.json');
const PROTO = loadChar('data/characters/proto/proto.toska.json');

test('a palette swap recolours exactly the base colours and leaves everything else alone', () => {
  const base = ['#d9534f', '#ff8a7a'];
  const alt = ['#3f7fcf', '#8ac2ff'];
  const px = (hex, a = 255) => [...hexToRgb(hex), a];
  const data = new Uint8ClampedArray([...px('#d9534f'), ...px('#ff8a7a', 128), ...px('#000000', 0), ...px('#123456')]);
  const stray = recolorPixels(data, base, alt);
  assert.deepEqual([...data.slice(0, 4)], px('#3f7fcf'));
  assert.deepEqual([...data.slice(4, 8)], px('#8ac2ff', 128), 'alpha kept');
  assert.deepEqual([...data.slice(8, 12)], px('#000000', 0), 'transparent untouched');
  assert.deepEqual([...data.slice(12, 16)], px('#123456'), 'a colour outside the palette is left alone');
  assert.equal(stray, 1, 'and reported');
});

test('every character has at least four colour sets matching its base palette', () => {
  for (const c of [AVNER, PROTO]) {
    assert.ok(c.palettes.colors.length >= 4, c.id);
    for (const set of c.palettes.colors) assert.equal(set.colors.length, c.palettes.base.length);
    assert.equal(placeholderColors(c.palettes, 0).body, c.palettes.base[0], 'colour 1 is the original');
  }
});

test('a broken palette is an error when the character loads', () => {
  const file = (palettes) => ({ engine: 'Toska', version: 2, character: { id: 'p', stats: {} }, palettes,
    moves: [{ id: '5L', input: '5L', startup: 3, active: 2, recovery: 5 }] });
  assert.throws(() => compileCharacter(file({ base: ['#ffffff', '#000000'], colors: [{ name: 'Short', colors: ['#ff0000'] }] }), SYSTEM), /Short.*2/);
  assert.throws(() => compileCharacter(file({ base: ['white'], colors: [{ colors: ['#ff0000'] }] }), SYSTEM), /base/);
  // No palettes at all: the default set.
  assert.ok(compileCharacter(file(undefined), SYSTEM).palettes.colors.length >= 4);
});

test('every stage file is well formed (known layer types, parallax 0 to 1)', () => {
  const KNOWN = new Set(['sky', 'sun', 'ridge', 'haze', 'arches', 'railing', 'floor']);
  const files = readdirSync(new URL('../data/stages/', import.meta.url)).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 1);
  for (const f of files) {
    const s = loadJSON(`data/stages/${f}`);
    assert.equal(`${s.id}.json`, f, 'the id matches the file name');
    assert.ok(s.name);
    for (const L of s.layers) {
      assert.ok(KNOWN.has(L.type), `${f}: unknown layer ${L.type}`);
      if (L.parallax !== undefined) assert.ok(L.parallax >= 0 && L.parallax <= 1, `${f}: parallax ${L.parallax}`);
    }
    assert.equal(s.layers.at(-1).type, 'floor', `${f}: the floor is drawn last`);
  }
});

// ---------- Character select ----------

function fakeApp() {
  const went = [];
  return {
    went,
    app: { ctx: null, W: 960, H: 540, cast: [{ id: 'avner', def: AVNER, test: false }, { id: 'proto', def: PROTO, test: true }], go: (...a) => went.push(a) },
  };
}
const idle = () => ({ up: false, down: false, left: false, right: false, confirm: false, back: false, start: false, buttons: { L: false, M: false, H: false, S: false } });
const press = (k) => ({ ...idle(), [k]: true });
const run = (screen, frames) => { for (const f of frames) screen.step(f); };

test('select: same fighter in the same colour gets bumped to the next colour', () => {
  const { app, went } = fakeApp();
  const s = createSelectScreen(app, { mode: 'versus', last: [{ id: 'avner', pal: 2 }, { id: 'avner', pal: 2 }] });
  run(s, [[press('confirm'), idle()], [idle(), press('confirm')], ...Array(31).fill([idle(), idle()])]);
  const [name, params] = went[0];
  assert.equal(name, 'versus');
  assert.deepEqual(params.picks, [{ id: 'avner', pal: 2 }, { id: 'avner', pal: 3 }]);
});

test('select (versus CPU): Player 1 picks their fighter, then the CPU\'s; back undoes one pick at a time', () => {
  const { app, went } = fakeApp();
  const s = createSelectScreen(app, { mode: 'cpu' });
  run(s, [
    [press('confirm'), idle()], // P1: Avner
    [press('right'), idle()], // move the CPU's cursor to Proto
    [press('back'), idle()], // undo P1's pick
    [press('right'), idle()], // P1's cursor moves now: Proto
    [press('confirm'), idle()], // P1: Proto
    [press('down'), idle()], // CPU colour 2
    [press('confirm'), idle()], // CPU: Proto (colour 2 unless it clashes)
    ...Array(31).fill([idle(), idle()]),
  ]);
  const [name, params] = went[0];
  assert.equal(name, 'versus');
  assert.equal(params.mode, 'cpu');
  assert.equal(params.picks[0].id, 'proto');
  assert.equal(params.picks[1].id, 'proto');
  assert.notEqual(params.picks[0].pal, params.picks[1].pal);
});

test('select: back with nothing picked returns to the title; training goes to the training screen', () => {
  let { app, went } = fakeApp();
  let s = createSelectScreen(app, { mode: 'training' });
  s.step([press('back'), idle()]);
  assert.equal(went[0][0], 'title');
  ({ app, went } = fakeApp());
  s = createSelectScreen(app, { mode: 'training' });
  run(s, [[press('confirm'), idle()], [press('confirm'), idle()], ...Array(31).fill([idle(), idle()])]);
  assert.equal(went[0][0], 'training');
});
