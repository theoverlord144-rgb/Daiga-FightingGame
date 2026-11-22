// Replays: a match is nothing but its inputs. Because the core is deterministic, replaying the same inputs from the
// same start reproduces the match exactly, frame for frame. A replay file stores the characters, the inputs
// (run-length encoded: a held button costs one entry, not one per frame) and checkpoints of the game's fingerprint,
// so a replay can prove it played back correctly, or say where it went wrong.

import { createGame, step } from '../core/game.js';
import { hashState } from '../core/state.js';

export const REPLAY_FORMAT = 'toska-replay';
export const REPLAY_VERSION = 1;

export function createReplayRecorder({ chars, checkEvery = 600 }) {
  const frames = [];
  const checks = [];
  return {
    frames,
    /** Call once per frame with the inputs that were played and the game after the step. */
    record(raws, game) {
      frames.push([raws[0], raws[1]]);
      if (game && frames.length % checkEvery === 0) checks.push([frames.length, hashState(game)]);
    },
    /** The replay file (a plain object; JSON.stringify it to save). */
    finish(game) {
      return encodeReplay({ chars, frames, checks, finalHash: game ? hashState(game) : null });
    },
  };
}

export function encodeReplay({ chars, frames, checks = [], finalHash = null }) {
  const rle = [];
  for (const [a, b] of frames) {
    const last = rle[rle.length - 1];
    if (last && last[0] === a && last[1] === b) last[2]++;
    else rle.push([a, b, 1]);
  }
  return { format: REPLAY_FORMAT, version: REPLAY_VERSION, chars, frames: frames.length, inputs: rle, checks, finalHash };
}

/** Back to one [p1, p2] entry per frame. Throws a clear message for anything that isn't a replay. */
export function decodeReplay(file) {
  if (!file || file.format !== REPLAY_FORMAT) throw new Error('This is not a Toska replay file.');
  if (file.version !== REPLAY_VERSION) throw new Error(`Replay version ${file.version} is not supported (this engine reads version ${REPLAY_VERSION}).`);
  const frames = [];
  for (const [a, b, n] of file.inputs) for (let i = 0; i < n; i++) frames.push([a, b]);
  if (frames.length !== file.frames) throw new Error(`Replay is damaged: ${frames.length} frames of input, expected ${file.frames}.`);
  return frames;
}

/**
 * Plays a replay to the end (or `upTo` frames) and checks every checkpoint.
 * Returns { game, ok, failedAt } — failedAt is the first checkpoint frame that didn't match.
 */
export function playReplay(world, file, { upTo = Infinity, onFrame } = {}) {
  const frames = decodeReplay(file);
  const checks = new Map(file.checks);
  const game = createGame(world);
  let failedAt = null;
  const n = Math.min(upTo, frames.length);
  for (let f = 0; f < n; f++) {
    step(game, frames[f], world);
    onFrame?.(game, f);
    const want = checks.get(f + 1);
    if (want !== undefined && failedAt === null && hashState(game) !== want) failedAt = f + 1;
  }
  if (n === frames.length && file.finalHash !== null && failedAt === null && hashState(game) !== file.finalHash) failedAt = n;
  return { game, ok: failedAt === null, failedAt };
}
