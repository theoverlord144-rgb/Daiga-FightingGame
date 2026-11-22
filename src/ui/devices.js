// Keyboard and gamepad -> the raw input bitmask the core reads (see RAW in src/core/input.js).
// Bindings are rebindable and saved in the browser (localStorage). Keyboard and pad are OR-ed together.

import { RAW } from '../core/input.js';

export const ACTIONS = ['up', 'down', 'left', 'right', 'L', 'M', 'H', 'S'];
const ACTION_BIT = { up: RAW.UP, down: RAW.DOWN, left: RAW.LEFT, right: RAW.RIGHT, L: RAW.L, M: RAW.M, H: RAW.H, S: RAW.S };

// Standard gamepad layout: 0 bottom, 1 right, 2 left, 3 top face button; 12-15 d-pad up/down/left/right.
export const DEFAULT_BINDINGS = {
  version: 1,
  players: [
    {
      keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', L: 'KeyJ', M: 'KeyK', H: 'KeyL', S: 'KeyI' },
      pad: { index: 0, buttons: { up: 12, down: 13, left: 14, right: 15, L: 2, M: 3, H: 1, S: 0 } },
    },
    {
      keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', L: 'Numpad1', M: 'Numpad2', H: 'Numpad3', S: 'Numpad5' },
      pad: { index: 1, buttons: { up: 12, down: 13, left: 14, right: 15, L: 2, M: 3, H: 1, S: 0 } },
    },
  ],
};

const STORAGE_KEY = 'toska.bindings.v1';
const STICK_DEADZONE = 0.5;

export function loadBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.version === 1 && Array.isArray(saved.players) && saved.players.length === 2) return saved;
  } catch { /* private mode or bad data: use defaults */ }
  return structuredClone(DEFAULT_BINDINGS);
}

export function saveBindings(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); } catch { /* storage blocked: bindings last this visit only */ }
}

export function createDevices() {
  const down = new Set();
  // Keys pressed since the last game step. A tap shorter than one step (possible when several steps run between
  // two drawn frames on a slow machine) still counts as held for one step, so no press is ever lost.
  const tapped = new Set();
  let bindings = loadBindings();
  let captureKey = null; // (code) => void while rebinding

  const onKeyDown = (e) => {
    if (captureKey) { e.preventDefault(); const f = captureKey; captureKey = null; f(e.code); return; }
    if (isBound(e.code)) e.preventDefault();
    down.add(e.code);
    tapped.add(e.code);
  };
  const onKeyUp = (e) => down.delete(e.code);
  const onBlur = () => { down.clear(); tapped.clear(); };
  addEventListener('keydown', onKeyDown);
  addEventListener('keyup', onKeyUp);
  addEventListener('blur', onBlur);

  function isBound(code) {
    return bindings.players.some((p) => Object.values(p.keys).includes(code));
  }

  function pads() {
    return navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
  }

  function padFor(i) {
    const want = bindings.players[i].pad.index;
    return pads().find((g) => g.index === want) || null;
  }

  /** The raw bitmask for player i (0 or 1) right now. */
  function read(i) {
    const p = bindings.players[i];
    let raw = 0;
    for (const a of ACTIONS) if (down.has(p.keys[a]) || tapped.has(p.keys[a])) raw |= ACTION_BIT[a];
    const pad = padFor(i);
    if (pad) {
      for (const a of ACTIONS) {
        const b = pad.buttons[p.pad.buttons[a]];
        if (b && (b.pressed || b.value > 0.5)) raw |= ACTION_BIT[a];
      }
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -STICK_DEADZONE) raw |= RAW.LEFT;
      if (ax > STICK_DEADZONE) raw |= RAW.RIGHT;
      if (ay < -STICK_DEADZONE) raw |= RAW.UP;
      if (ay > STICK_DEADZONE) raw |= RAW.DOWN;
    }
    return raw;
  }

  /** Player i's gamepad Start button (standard layout button 9): pause and menus. */
  function readStart(i) {
    const pad = padFor(i);
    const b = pad && pad.buttons[9];
    return !!(b && b.pressed);
  }

  return {
    read,
    readStart,
    /** Call after every game step: taps have now been seen by that step. */
    endStep() { tapped.clear(); },
    pads,
    get bindings() { return bindings; },
    setBindings(b) { bindings = b; saveBindings(b); },
    resetBindings() { bindings = structuredClone(DEFAULT_BINDINGS); saveBindings(bindings); },
    /** Next key pressed goes to `cb(code)` instead of the game. */
    captureNextKey(cb) { captureKey = cb; },
    cancelCapture() { captureKey = null; },
    destroy() {
      removeEventListener('keydown', onKeyDown);
      removeEventListener('keyup', onKeyUp);
      removeEventListener('blur', onBlur);
    },
  };
}
