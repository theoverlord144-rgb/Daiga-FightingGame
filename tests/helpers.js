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
