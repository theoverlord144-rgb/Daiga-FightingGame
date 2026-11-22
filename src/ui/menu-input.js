// Menu controls from the same devices as the fight: edges (a press, not a hold) per player, with auto-repeat on
// held directions. Confirm = L, back = M (or Enter / Escape on the keyboard), start = Enter / Escape / pad Start.

import { RAW } from '../core/input.js';

const REPEAT_DELAY = 18;
const REPEAT_EVERY = 5;

export function createMenuInput(devices) {
  const prev = [0, 0];
  const held = [{}, {}];
  const keys = []; // keyboard presses since the last step
  let prevStart = [false, false];
  const onKey = (e) => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'NumpadEnter') keys.push('enter');
    if (e.code === 'Escape' || e.code === 'Backspace') keys.push('escape');
  };
  addEventListener('keydown', onKey);

  /** One entry per player: { up, down, left, right, confirm, back, start, buttons: {L, M, H, S} } (true = pressed now). */
  function read() {
    const out = [0, 1].map((i) => {
      const raw = devices.read(i);
      const edge = raw & ~prev[i];
      prev[i] = raw;
      const dir = (bit) => {
        if (!(raw & bit)) { held[i][bit] = 0; return false; }
        const n = (held[i][bit] = (held[i][bit] || 0) + 1);
        return n === 1 || (n > REPEAT_DELAY && (n - REPEAT_DELAY) % REPEAT_EVERY === 0);
      };
      const start = devices.readStart(i);
      const startEdge = start && !prevStart[i];
      prevStart[i] = start;
      return {
        up: dir(RAW.UP), down: dir(RAW.DOWN), left: dir(RAW.LEFT), right: dir(RAW.RIGHT),
        buttons: { L: !!(edge & RAW.L), M: !!(edge & RAW.M), H: !!(edge & RAW.H), S: !!(edge & RAW.S) },
        confirm: !!(edge & RAW.L), back: !!(edge & RAW.M), start: startEdge,
      };
    });
    for (const k of keys) {
      if (k === 'enter') { out[0].confirm = true; out[0].start = true; }
      if (k === 'escape') { out[0].back = true; out[0].start = true; out[0].escape = true; }
    }
    keys.length = 0;
    return out;
  }

  /** Forget held buttons (after a screen change, so a held confirm doesn't fire twice). */
  function sync() {
    prev[0] = devices.read(0);
    prev[1] = devices.read(1);
    prevStart = [devices.readStart(0), devices.readStart(1)];
    keys.length = 0;
  }

  return { read, sync };
}
