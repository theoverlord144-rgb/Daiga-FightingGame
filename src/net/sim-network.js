// A simulated network between two endpoints, for tests and for trying rollback on one machine.
// Time is counted in ticks (one per frame). Lag, jitter and packet loss come from a seeded LCG, so a run repeats
// exactly. Messages are copied through JSON, as a real network would.

export function createSimNetwork({ latency = 3, jitter = 0, loss = 0, seed = 1 } = {}) {
  let rng = seed >>> 0;
  const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng >>> 8; };
  let now = 0;
  const queues = [[], []]; // messages in flight to endpoint 0 / 1: { at, seq, data }
  let seq = 0;
  const stats = { sent: 0, lost: 0 };
  let cut = false;

  return {
    stats,
    get now() { return now; },
    /** Endpoint `from` sends a message to the other one. */
    send(from, msg) {
      stats.sent++;
      if (cut || (loss > 0 && rand() % 10000 < loss)) { stats.lost++; return; }
      const delay = latency + (jitter > 0 ? rand() % (jitter + 1) : 0);
      queues[1 - from].push({ at: now + delay, seq: seq++, data: JSON.stringify(msg) });
    },
    /** Messages that have arrived at endpoint `to` by now (in arrival order). */
    receive(to) {
      const q = queues[to];
      const ready = q.filter((m) => m.at <= now).sort((a, b) => a.at - b.at || a.seq - b.seq);
      queues[to] = q.filter((m) => m.at > now);
      return ready.map((m) => JSON.parse(m.data));
    },
    tick() { now++; },
    /** Drop everything for a while (a cable pulled). */
    setCut(v) { cut = v; },
  };
}
