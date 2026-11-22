// Sync test (the standard rollback safety check). Every frame: step forward and record the checksum, then rewind
// `distance` frames, re-simulate them with the same inputs, and demand the identical checksum. Anything in the
// game that isn't fully captured by the saved state, or that isn't deterministic, shows up as a mismatch, with
// the frame and the first field that differs.

import { createGame, step as coreStep } from '../core/game.js';
import { cloneState, hashState, diffState } from '../core/state.js';

/**
 * inputFn(game, frame) -> [raw1, raw2]. Returns { ok, frames, checks, failFrame, diff }.
 * `stepFn` is injectable so the tests can prove a broken step gets caught.
 */
export function runSyncTest(world, inputFn, { frames = 1000, distance = 8, stepFn = coreStep } = {}) {
  let game = createGame(world);
  const saved = []; // saved[f] = state at the start of frame f
  const inputs = [];
  let checks = 0;
  for (let f = 0; f < frames; f++) {
    saved[f] = cloneState(game);
    inputs[f] = inputFn(game, f);
    stepFn(game, inputs[f], world);
    const forward = cloneState(game);
    const h = hashState(game);
    if (f >= distance) {
      // Rewind and replay the last `distance` frames.
      let g = cloneState(saved[f - distance + 1]);
      for (let k = f - distance + 1; k <= f; k++) stepFn(g, inputs[k], world);
      checks++;
      if (hashState(g) !== h) return { ok: false, frames: f + 1, checks, failFrame: f, diff: diffState(forward, g) };
      game = g; // carry on from the replayed state, as a real rollback would
    }
    saved[f - distance - 1] = undefined;
  }
  return { ok: true, frames, checks, failFrame: null, diff: null };
}
