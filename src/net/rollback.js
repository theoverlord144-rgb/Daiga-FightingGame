// Rollback session (GGPO style). Each player runs the whole game locally:
//   - the local input is scheduled `delay` frames ahead (input delay),
//   - the remote input, until it arrives, is predicted: "the same as the last one we know",
//   - every frame's starting state is saved; when a real remote input arrives that differs from what was predicted,
//     the session restores that frame's state and re-simulates up to the present (at most `maxRollback` frames;
//     further ahead than that, it waits for the other side instead of guessing more),
//   - once a frame's inputs are known for both sides, its result is final: its checksum is sent so the two sides
//     can prove they agree (a mismatch = a desync, reported with the frame).
// Pure: no DOM, no clock, no network. Messages go out through `outbox` and come in through `receive`, so any
// transport works (the tests use a simulated network; the browser uses BroadcastChannel between two tabs).

import { createGame, step } from '../core/game.js';
import { cloneState, hashState } from '../core/state.js';

export function createSession(world, { local, delay = 2, maxRollback = 8, hashEvery = 10, redundancy = 64, keepInputs = false, onFinal = null } = {}) {
  const remote = 1 - local;
  let game = createGame(world);
  const localIn = new Map(); // frame -> raw
  const remoteIn = new Map(); // frame -> raw (confirmed)
  const usedRemote = new Map(); // frame -> the remote raw the current simulation of that frame used
  const saved = new Map(); // frame -> state at the start of that frame (game.frame === frame)
  for (let f = 0; f < delay; f++) { localIn.set(f, 0); remoteIn.set(f, 0); }
  let localNext = delay; // next frame to schedule a local input for
  let remoteContig = delay - 1; // every remote input up to here is known
  let remoteAck = delay - 1; // the remote side has all our inputs up to here
  let remoteFrame = 0; // the latest frame the remote side reported being on
  let rollbackFrom = null;
  const myHashes = new Map();
  const theirHashes = new Map();
  let hashedUpTo = -1;
  let lastWait = -100;
  const stats = { rollbacks: 0, rolledFrames: 0, maxRollback: 0, stalls: 0, waits: 0, desync: null };
  const outbox = [];

  const predicted = (f) => (remoteIn.has(f) ? remoteIn.get(f) : remoteIn.get(remoteContig) ?? 0);

  function simulate(f) {
    // game.frame === f here
    saved.set(f, cloneState(game));
    const r = predicted(f);
    usedRemote.set(f, r);
    const raws = [0, 0];
    raws[local] = localIn.get(f);
    raws[remote] = r;
    step(game, raws, world);
  }

  function confirmHashes() {
    // A frame is final once both inputs are known and no rollback before it is pending.
    const final = Math.min(remoteContig, localNext - 1, game.frame - 1);
    for (let f = hashedUpTo + 1; f <= final; f++) {
      if (onFinal) { // a frame whose inputs can never change again (for replays)
        const raws = [0, 0];
        raws[local] = localIn.get(f);
        raws[remote] = remoteIn.get(f);
        onFinal(f, raws, f + 1 === game.frame ? game : saved.get(f + 1));
      }
      if ((f + 1) % hashEvery === 0) {
        // The state after frame f = the saved start of frame f + 1 (or the live game if that's now).
        const s = f + 1 === game.frame ? game : saved.get(f + 1);
        const h = hashState(s);
        myHashes.set(f, h);
        outbox.push({ type: 'hash', frame: f, hash: h });
        check(f);
      }
      hashedUpTo = f;
    }
    // Drop what no rollback can ever need again.
    const keep = Math.min(final, game.frame - maxRollback - 1);
    for (const k of saved.keys()) if (k < keep) { saved.delete(k); usedRemote.delete(k); }
    if (keepInputs) return;
    for (const k of localIn.keys()) if (k < Math.min(keep, remoteAck)) localIn.delete(k);
    for (const k of remoteIn.keys()) if (k < keep - 1) remoteIn.delete(k);
  }

  function check(f) {
    if (stats.desync !== null) return;
    if (myHashes.has(f) && theirHashes.has(f) && myHashes.get(f) !== theirHashes.get(f)) stats.desync = f;
  }

  const s = {
    stats,
    outbox,
    get game() { return game; },
    get frame() { return game.frame; },
    get remoteConfirmed() { return remoteContig; },

    /** Hand over this frame's local controller input (it plays `delay` frames from now). */
    // Every tick sends a packet with every input the other side hasn't confirmed yet, even when nothing new was
    // added (while waiting): after an outage, that resend is what gets both sides moving again.
    addLocalInput(raw) {
      if (localNext - game.frame <= delay) { // otherwise already scheduled (we were waiting)
        localIn.set(localNext, raw);
        localNext++;
      }
      // Oldest unconfirmed first, so even a long backlog always makes progress.
      const from = remoteAck + 1;
      const to = Math.min(localNext, from + redundancy);
      const frames = [];
      for (let f = from; f < to; f++) frames.push(localIn.get(f));
      outbox.push({ type: 'input', start: from, frames, ack: remoteContig, frame: game.frame });
    },

    /** A message from the other side. */
    receive(msg) {
      if (msg.type === 'hash') {
        theirHashes.set(msg.frame, msg.hash);
        check(msg.frame);
        return;
      }
      if (msg.type !== 'input') return;
      remoteAck = Math.max(remoteAck, msg.ack);
      remoteFrame = Math.max(remoteFrame, msg.frame);
      msg.frames.forEach((raw, i) => {
        const f = msg.start + i;
        if (remoteIn.has(f) || f <= remoteContig) return;
        remoteIn.set(f, raw);
        // Simulated with a different guess? Then everything from that frame on is wrong: roll back.
        if (usedRemote.has(f) && usedRemote.get(f) !== raw && f < game.frame) {
          rollbackFrom = rollbackFrom === null ? f : Math.min(rollbackFrom, f);
        }
      });
      while (remoteIn.has(remoteContig + 1)) remoteContig++;
    },

    /** Should this tick be skipped to let the other side catch up? (Keeps both sides' frames level.) */
    shouldWait() {
      const ahead = game.frame - remoteFrame;
      if (ahead > 2 && game.frame - lastWait > 8) { lastWait = game.frame; stats.waits++; return true; }
      return false;
    },

    /** Run one frame (after rolling back if needed). Returns false if it had to wait for the other side. */
    advance() {
      if (rollbackFrom !== null) {
        const from = rollbackFrom;
        rollbackFrom = null;
        const to = game.frame;
        game = cloneState(saved.get(from));
        for (let f = from; f < to; f++) simulate(f);
        stats.rollbacks++;
        stats.rolledFrames += to - from;
        stats.maxRollback = Math.max(stats.maxRollback, to - from);
      }
      if (!localIn.has(game.frame) || game.frame - remoteContig > maxRollback) {
        stats.stalls++;
        confirmHashes();
        return false;
      }
      simulate(game.frame);
      confirmHashes();
      return true;
    },

    /** Testing only (needs keepInputs): the inputs this side has confirmed for both players, frame by frame. */
    confirmedInputs(upTo) {
      const out = [];
      for (let f = 0; f <= upTo; f++) {
        const raws = [0, 0];
        raws[local] = localIn.get(f);
        raws[remote] = remoteIn.get(f);
        out.push(raws);
      }
      return out;
    },
  };
  return s;
}
