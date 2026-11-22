// Netplay between two browser tabs on this computer (BroadcastChannel), with optional fake lag, so rollback can
// be felt without a server. Open ?mode=netplay&side=1 in one tab and ?mode=netplay&side=2 in another.
// &lag=N holds every packet N frames each way (6 = 100 ms of ping); &delay=N sets input delay (default 2).
// Internet play needs a matchmaking/relay server, which this engine doesn't have yet; the session code doesn't care
// what carries the packets.

import { createSession } from '../net/rollback.js';
import { cloneState, hashState } from '../core/state.js';
import { createGame, step } from '../core/game.js';

export function createNetplay(world, { side, lag = 0, delay = 2, room = 'toska-netplay' }) {
  const local = side - 1;
  const session = createSession(world, { local, delay });
  const ch = new BroadcastChannel(room);
  const inbox = []; // { at, msg }
  let tick = 0;
  let started = false;
  let peerSeen = false;
  let lastPing = null;

  ch.onmessage = (e) => {
    const m = e.data;
    if (m.from === local) return;
    inbox.push({ at: tick + lag, msg: m });
  };
  const send = (msg) => ch.postMessage({ ...msg, from: local });

  return {
    session,
    get started() { return started; },
    get lag() { return lag; },
    get ping() { return lastPing; },

    /** One 60 Hz tick: returns true if the game advanced. */
    step(raw) {
      tick++;
      const ready = inbox.filter((x) => x.at <= tick);
      for (const x of ready) inbox.splice(inbox.indexOf(x), 1);
      for (const { msg } of ready) {
        if (msg.type === 'hello') { peerSeen = true; if (!msg.reply) send({ type: 'hello', reply: true }); continue; }
        if (msg.type === 'ping') { send({ type: 'pong', t: msg.t }); continue; }
        if (msg.type === 'pong') { lastPing = Math.round(((tick - msg.t) * 1000) / 60); continue; }
        session.receive(msg);
      }
      if (!peerSeen) {
        if (tick % 30 === 1) send({ type: 'hello' });
        return false;
      }
      started = true;
      if (tick % 60 === 0) send({ type: 'ping', t: tick });
      let moved = false;
      if (!session.shouldWait()) {
        session.addLocalInput(raw);
        moved = session.advance();
      }
      for (const m of session.outbox.splice(0)) send(m);
      return moved;
    },
    close() { ch.close(); },
  };
}

/**
 * Live sync test for ?mode=synctest: plays normally, and every frame rewinds `distance` frames and replays them,
 * checking the result is identical. Reports the first frame that differs.
 */
export function createLiveSyncTest(world, distance = 8) {
  let game = createGame(world);
  const saved = [];
  const inputs = [];
  const status = { checks: 0, failFrame: null };
  return {
    status,
    get game() { return game; },
    step(raws) {
      const f = game.frame;
      saved.push(cloneState(game));
      inputs.push(raws);
      step(game, raws, world);
      if (saved.length > distance) {
        saved.shift();
        inputs.shift();
        const g = cloneState(saved[0]);
        for (const r of inputs) step(g, r, world);
        status.checks++;
        if (status.failFrame === null && hashState(g) !== hashState(game)) status.failFrame = f;
        game = g;
      }
    },
  };
}
