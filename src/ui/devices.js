// Keyboard and gamepad -> the raw input bitmask the core reads (see RAW in src/core/input.js).
// Bindings are rebindable and saved in the browser (localStorage).
//
// A "source" is one physical thing a person holds: 'kb0' (the Player 1 key layout), 'kb1' (the Player 2 key layout),
// or 'pad:N' (the controller the browser lists at index N: pads, arcade sticks, hit boxes).
// Normally player i reads key layout i plus one controller. After the side select (versus), `seats` says exactly which
// sources each player reads, so the keyboard can sit on either side and a stick on the other.

import { RAW } from '../core/input.js';

export const ACTIONS = ['up', 'down', 'left', 'right', 'L', 'M', 'H', 'S', 'R'];
const ACTION_BIT = { up: RAW.UP, down: RAW.DOWN, left: RAW.LEFT, right: RAW.RIGHT, L: RAW.L, M: RAW.M, H: RAW.H, S: RAW.S, R: RAW.R };

// Standard gamepad layout: 0 bottom, 1 right, 2 left, 3 top face button; 5 right shoulder; 12-15 d-pad up/down/left/right.
// pad.index 'auto': the player takes whichever controller is used first (Player 1), then the next one (Player 2).
export const DEFAULT_BINDINGS = {
  version: 2,
  players: [
    {
      keys: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', L: 'KeyJ', M: 'KeyK', H: 'KeyL', S: 'KeyI', R: 'KeyO' },
      pad: { index: 'auto', buttons: { up: 12, down: 13, left: 14, right: 15, L: 2, M: 3, H: 1, S: 0, R: 5 } },
    },
    {
      keys: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', L: 'Numpad1', M: 'Numpad2', H: 'Numpad3', S: 'Numpad5', R: 'Numpad6' },
      pad: { index: 'auto', buttons: { up: 12, down: 13, left: 14, right: 15, L: 2, M: 3, H: 1, S: 0, R: 5 } },
    },
  ],
};

const STORAGE_KEY = 'toska.bindings.v1';
const STICK_DEADZONE = 0.5;
const HAT_AXIS = 9; // where browsers put a stick's lever when it reports as a "hat switch"
// Hat positions clockwise from up; the axis runs from -1 (up) to 1 (up-left) in 8 even steps, and rests outside that.
const HAT_DIRS = [RAW.UP, RAW.UP | RAW.RIGHT, RAW.RIGHT, RAW.DOWN | RAW.RIGHT, RAW.DOWN, RAW.DOWN | RAW.LEFT, RAW.LEFT, RAW.UP | RAW.LEFT];

/** The directions held on a hat-switch axis value (0 when resting or not a hat). */
export function hatDirections(v) {
  if (typeof v !== 'number' || v < -1.05 || v > 1.05) return 0;
  const k = (v + 1) * 3.5;
  const n = Math.round(k);
  return Math.abs(k - n) < 0.15 ? HAT_DIRS[n] : 0;
}

/** Bindings saved before a control existed (the Rite button) get that control's default. */
export function fillBindings(saved) {
  saved.players.forEach((p, i) => {
    const d = DEFAULT_BINDINGS.players[i];
    for (const a of ACTIONS) {
      if (p.keys[a] === undefined) p.keys[a] = Object.values(p.keys).includes(d.keys[a]) ? '' : d.keys[a];
      // A default that an older save already gave to something else stays unbound (-1) until the player picks one.
      if (p.pad.buttons[a] === undefined) p.pad.buttons[a] = Object.values(p.pad.buttons).includes(d.pad.buttons[a]) ? -1 : d.pad.buttons[a];
    }
  });
  return saved;
}

export function loadBindings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.players) && saved.players.length === 2) {
      fillBindings(saved);
      if (saved.version === 2) return saved;
      if (saved.version === 1) {
        // Older saves pinned Player 1 to "Pad 1" and Player 2 to "Pad 2": keep the keys and buttons, pick pads by use.
        for (const p of saved.players) p.pad.index = 'auto';
        saved.version = 2;
        return saved;
      }
    }
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
  let seats = null; // [[source, ...], [source, ...]] after a side select; null = the normal layout
  const autoPads = []; // controller indexes in the order they were first used: [Player 1's, Player 2's]

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

  function pressed(b) {
    return !!(b && (b.pressed || b.value > 0.5));
  }

  /** The raw bitmask from one controller, using `buttons` (action -> button number). */
  function readPad(pad, buttons) {
    let raw = 0;
    for (const a of ACTIONS) if (pressed(pad.buttons[buttons[a]])) raw |= ACTION_BIT[a];
    const [ax = 0, ay = 0] = pad.axes;
    if (ax < -STICK_DEADZONE) raw |= RAW.LEFT;
    if (ax > STICK_DEADZONE) raw |= RAW.RIGHT;
    if (ay < -STICK_DEADZONE) raw |= RAW.UP;
    if (ay > STICK_DEADZONE) raw |= RAW.DOWN;
    if (pad.mapping !== 'standard') raw |= hatDirections(pad.axes[HAT_AXIS]);
    return raw;
  }

  function readKeys(layout) {
    const keys = bindings.players[layout].keys;
    let raw = 0;
    for (const a of ACTIONS) if (down.has(keys[a]) || tapped.has(keys[a])) raw |= ACTION_BIT[a];
    return raw;
  }

  /** Is anything at all held on this controller? */
  function padActive(pad) {
    return pad.buttons.some(pressed) || readPad(pad, DEFAULT_BINDINGS.players[0].pad.buttons) !== 0;
  }

  /** Keeps the "first used, second used" list of controllers current. */
  function trackPads(list) {
    for (let k = autoPads.length - 1; k >= 0; k--) if (!list.some((g) => g.index === autoPads[k])) autoPads.splice(k, 1);
    for (const g of list) if (autoPads.length < 2 && !autoPads.includes(g.index) && padActive(g)) autoPads.push(g.index);
  }

  /** The controllers player i reads right now. */
  function padsFor(i) {
    const list = pads();
    if (seats) return seats[i].filter((s) => s.startsWith('pad:')).map((s) => list.find((g) => g.index === Number(s.slice(4)))).filter(Boolean);
    const want = bindings.players[i].pad.index;
    if (want !== 'auto') return list.filter((g) => g.index === want);
    // A controller the other player picked by number is theirs, not up for grabs.
    const other = bindings.players[1 - i].pad.index;
    trackPads(list.filter((g) => g.index !== other));
    const mine = autoPads.filter((n) => n !== other);
    const otherAuto = other === 'auto';
    const idx = otherAuto ? mine[i] : mine[0];
    return list.filter((g) => g.index === idx);
  }

  /** The raw bitmask from one source, with player `as`'s button numbers for controllers. */
  function readSource(src, as = 0) {
    if (src === 'kb0') return readKeys(0);
    if (src === 'kb1') return readKeys(1);
    const pad = pads().find((g) => g.index === Number(src.slice(4)));
    return pad ? readPad(pad, bindings.players[as].pad.buttons) : 0;
  }

  /** The raw bitmask for player i (0 or 1) right now. */
  function read(i) {
    if (seats) {
      let raw = 0;
      for (const s of seats[i]) raw |= readSource(s, i);
      return raw;
    }
    let raw = readKeys(i);
    for (const pad of padsFor(i)) raw |= readPad(pad, bindings.players[i].pad.buttons);
    return raw;
  }

  function startOn(pad) {
    return !!(pad && pad.buttons[9] && pad.buttons[9].pressed);
  }

  /** Player i's gamepad Start button (standard layout button 9): pause and menus. */
  function readStart(i) {
    return padsFor(i).some(startOn);
  }

  /** Everything a person could be holding right now: [{ id, label }]. */
  function sources() {
    const out = [{ id: 'kb0', label: 'KEYBOARD' }];
    pads().forEach((g, k) => out.push({ id: `pad:${g.index}`, label: /stick|arcade|fight/i.test(g.id) ? `STICK ${k + 1}` : `CONTROLLER ${k + 1}`, name: g.id }));
    return out;
  }

  return {
    read,
    readStart,
    readSource,
    /** Start on one source (keyboard sources have no Start button: menus use Enter). */
    readSourceStart(src) { return src.startsWith('pad:') && startOn(pads().find((g) => g.index === Number(src.slice(4)))); },
    sources,
    /** Who reads what: [[source, ...], [source, ...]], or null for the normal layout. */
    get seats() { return seats; },
    setSeats(s) { seats = s; },
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
