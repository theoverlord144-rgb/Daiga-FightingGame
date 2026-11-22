// Shared test helpers.
import { readFileSync } from 'node:fs';
import { RAW } from '../src/core/input.js';

export const loadJSON = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

/** Raw bits for a numpad direction (screen directions). */
export function rawDir(d) {
  const n = Number(d);
  let r = 0;
  if ([1, 4, 7].includes(n)) r |= RAW.LEFT;
  if ([3, 6, 9].includes(n)) r |= RAW.RIGHT;
  if ([7, 8, 9].includes(n)) r |= RAW.UP;
  if ([1, 2, 3].includes(n)) r |= RAW.DOWN;
  return r;
}

/**
 * Turn a script like "2 3 6+L" or "4*30 6 6+L" into raw input frames.
 * Each token is one frame: a direction, optional "+BUTTONS", optional "*N" repeat.
 */
export function script(str) {
  const out = [];
  for (const tok of str.trim().split(/\s+/)) {
    const [body, times] = tok.split('*');
    const [dir, buttons = ''] = body.split('+');
    let r = rawDir(dir);
    for (const b of buttons) r |= RAW[b];
    for (let i = 0; i < Number(times ?? 1); i++) out.push(r);
  }
  return out;
}

// ---------- Worlds ----------
import { compileCharacter } from '../src/core/character.js';
import { createWorld } from '../src/core/game.js';

export const SYSTEM = {
  defaults: loadJSON('data/system/fighter-defaults.json'),
  common: loadJSON('data/system/common-states.json'),
  meter: loadJSON('data/system/meter.json'),
  burst: loadJSON('data/system/burst.json'),
};

export const loadChar = (rel) => compileCharacter(loadJSON(rel), SYSTEM);

/** A world with two characters (default: Avner vs Avner). */
export function loadWorld(a = 'data/characters/avner/avner.toska.json', b = a, { match = null } = {}) {
  return createWorld({
    match,
    input: loadJSON('data/system/input.json'),
    battle: loadJSON('data/system/battle.json'),
    combo: loadJSON('data/system/combo.json'),
    meter: SYSTEM.meter,
    burst: SYSTEM.burst,
    chars: [typeof a === 'string' ? loadChar(a) : a, typeof b === 'string' ? loadChar(b) : b],
  });
}

// ---------- Random fights ----------

/** A small deterministic random generator for tests (tests may use any maths; the core may not). */
export function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
}

/**
 * Random inputs that actually fight: mostly toward the opponent, often pressing buttons, sometimes jumping,
 * crouching or backing off. Each player holds a choice for a few frames, like a person would.
 */
export function fightInputs(seed) {
  const rnd = lcg(seed);
  const hold = [0, 0];
  const cur = [0, 0];
  return (game) => {
    const out = [0, 0];
    for (let i = 0; i < 2; i++) {
      if (hold[i] <= 0) {
        const me = game.players[i];
        const them = game.players[1 - i];
        const toward = them.x >= me.x ? 2 : 1; // RAW.RIGHT : RAW.LEFT
        const away = toward === 2 ? 1 : 2;
        const r = rnd() % 100;
        let raw = r < 45 ? toward : r < 60 ? away : r < 70 ? 8 : r < 78 ? 4 | toward : r < 85 ? 8 | away : 0;
        if (rnd() % 100 < 40) raw |= 16 << (rnd() % 4);
        cur[i] = raw;
        hold[i] = 1 + (rnd() % 8);
      }
      hold[i]--;
      out[i] = cur[i];
    }
    return out;
  };
}
