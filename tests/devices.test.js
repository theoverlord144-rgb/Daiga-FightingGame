// Keyboard, controllers and arcade sticks -> raw input: which device each player reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RAW } from '../src/core/input.js';

// A tiny stand-in for the browser: key events, saved bindings, and a list of plugged-in controllers.
const listeners = {};
let padList = [];
let stored = null;
globalThis.addEventListener = (type, fn) => { listeners[type] = fn; };
globalThis.removeEventListener = () => {};
globalThis.localStorage = { getItem: () => stored, setItem: (k, v) => { stored = v; } };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => padList }, configurable: true });

const { createDevices, hatDirections } = await import('../src/ui/devices.js');

const key = (code, isDown = true) => listeners[isDown ? 'keydown' : 'keyup']({ code, preventDefault() {} });
function pad(index, { held = [], axes = [0, 0], mapping = 'standard' } = {}) {
  const buttons = Array.from({ length: 17 }, (_, n) => ({ pressed: held.includes(n), value: held.includes(n) ? 1 : 0 }));
  return { index, id: 'test pad ' + index, mapping, buttons, axes };
}
function fresh() { padList = []; stored = null; return createDevices(); }

test('controllers: Player 1 gets the first one used, whatever number the browser gave it', () => {
  const d = fresh();
  // Something idle sits at index 0; the stick is at index 2.
  padList = [pad(0), pad(2, { held: [2] })];
  assert.equal(d.read(0), RAW.L);
  assert.equal(d.read(1), 0);
  // A second controller joins later: it is Player 2's.
  padList = [pad(0, { held: [15] }), pad(2, { held: [2] })];
  assert.equal(d.read(0), RAW.L);
  assert.equal(d.read(1), RAW.RIGHT);
  // Start (button 9) follows the same assignment.
  padList = [pad(0), pad(2, { held: [9] })];
  assert.equal(d.readStart(0), true);
  assert.equal(d.readStart(1), false);
});

test('controllers: the lever is read as d-pad buttons, analog axes, or a hat switch', () => {
  const d = fresh();
  padList = [pad(0, { held: [12, 14] })];
  assert.equal(d.read(0), RAW.UP | RAW.LEFT);
  padList = [pad(0, { axes: [1, 1] })];
  assert.equal(d.read(0), RAW.DOWN | RAW.RIGHT);
  const hat = (v) => pad(0, { mapping: '', axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, v] });
  padList = [hat(-1)];
  assert.equal(d.read(0), RAW.UP);
  padList = [hat(1 / 7)];
  assert.equal(d.read(0), RAW.DOWN);
  padList = [hat(-1 + (2 / 7) * 5)];
  assert.equal(d.read(0), RAW.DOWN | RAW.LEFT);
  padList = [hat(1.28571)];
  assert.equal(d.read(0), 0, 'resting');
  assert.equal(hatDirections(0), 0, 'an unrelated axis resting at 0 is not a direction');
});

test('controllers: old saved bindings keep their keys and buttons and move to the automatic pick', () => {
  padList = [];
  stored = JSON.stringify({ version: 1, players: [
    { keys: { up: 'KeyT', down: 'KeyS', left: 'KeyA', right: 'KeyD', L: 'KeyJ', M: 'KeyK', H: 'KeyL', S: 'KeyI' }, pad: { index: 0, buttons: { up: 12, down: 13, left: 14, right: 15, L: 5, M: 3, H: 1, S: 0 } } },
    { keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', L: 'Numpad1', M: 'Numpad2', H: 'Numpad3', S: 'Numpad5' }, pad: { index: 1, buttons: { up: 12, down: 13, left: 14, right: 15, L: 2, M: 3, H: 1, S: 0 } } },
  ] });
  const d = createDevices();
  assert.equal(d.bindings.players[0].keys.up, 'KeyT');
  assert.equal(d.bindings.players[0].pad.index, 'auto');
  padList = [pad(3, { held: [5] })];
  assert.equal(d.read(0), RAW.L, 'the rebound button still works, on whatever controller is used');
});

test('side select: the keyboard can be Player 2 and a stick Player 1', () => {
  const d = fresh();
  padList = [pad(1, { held: [3] })];
  d.setSeats([['pad:1'], ['kb0']]);
  key('KeyJ');
  assert.equal(d.read(0), RAW.M, 'Player 1 reads only the stick');
  assert.equal(d.read(1), RAW.L, 'Player 2 reads only the keyboard');
  key('KeyJ', false); d.endStep();
  // Back to normal: the keyboard is Player 1 again.
  d.setSeats(null);
  key('KeyJ');
  assert.equal(d.read(0) & RAW.L, RAW.L);
  assert.equal(d.read(1) & RAW.L, 0);
  key('KeyJ', false); d.endStep();
  assert.deepEqual(d.sources().map((s) => s.id), ['kb0', 'pad:1']);
});

test('the Rite button: bound by default, and bindings saved before it existed get it without losing anything', () => {
  const d = fresh();
  for (const p of d.bindings.players) { assert.ok(p.keys.R); assert.equal(p.pad.buttons.R, 5); }
  key('KeyO');
  assert.equal(d.read(0), RAW.R);
  key('KeyO', false);
  d.endStep();
  padList = [pad(0, { held: [5] })];
  assert.equal(d.read(0), RAW.R, 'right shoulder on a pad');
  // An older save: no R anywhere, and Player 1 had already put Light on button 5.
  padList = [];
  stored = JSON.stringify({ version: 2, players: [
    { keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', L: 'KeyO', M: 'KeyK', H: 'KeyL', S: 'KeyI' }, pad: { index: 'auto', buttons: { up: 12, down: 13, left: 14, right: 15, L: 5, M: 3, H: 1, S: 0 } } },
    { keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', L: 'Numpad1', M: 'Numpad2', H: 'Numpad3', S: 'Numpad5' }, pad: { index: 'auto', buttons: { up: 12, down: 13, left: 14, right: 15, L: 2, M: 3, H: 1, S: 0 } } },
  ] });
  const e = createDevices();
  const [a, b] = e.bindings.players;
  assert.equal(a.keys.L, 'KeyO', 'their own key is kept');
  assert.equal(a.keys.R, '', 'the default key was taken: R waits to be bound');
  assert.equal(a.pad.buttons.L, 5);
  assert.equal(a.pad.buttons.R, -1, 'the default button was taken too');
  assert.equal(b.keys.R, 'Numpad6');
  assert.equal(b.pad.buttons.R, 5);
  padList = [pad(0, { held: [5] })];
  assert.equal(e.read(0), RAW.L, 'one button, one action');
});
