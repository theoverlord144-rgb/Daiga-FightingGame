// The move editor's preview: the real game, played by itself. One fighter does one move against a dummy, over and
// over, so a change to pushback or launch is seen at once; and it measures what happened (how far, how high, who
// recovers first). No drawing here: the screen draws `game` with the fight renderer.
import { createGame, step } from '../core/game.js';
import { enterState } from '../core/fighter.js';
import { RAW } from '../core/input.js';
import { UNIT, px } from '../core/fixed.js';

const WARM = 14; // frames both stand still before the move starts
const REST = 26; // frames both are free before it starts again
const LIMIT = 420; // a loop never runs longer than this
const AIR_HEIGHT = 110; // where an air move starts, and where an "in the air" dummy hangs
export const DUMMIES = ['standing', 'crouching', 'in the air', 'blocking'];

/** A spawn event's projectile name: the event's value is the name, or { name, x, y, under } (placed elsewhere). */
const spawned = (e) => (typeof e.value === 'string' ? e.value : e.value?.name);

/** The state that does `entry`: the move itself, or for "proj:<name>" the move that releases that projectile. */
export function stateFor(def, entry) {
  if (!entry.startsWith('proj:')) return def.states[entry] ? entry : null;
  const id = entry.slice(5);
  for (const [name, st] of Object.entries(def.states)) {
    if ((st.onEnter || []).some((evs) => (evs || []).some((e) => e.type === 'spawn' && spawned(e) === id))) return name;
  }
  return null;
}

/**
 * Whose hit settings a list entry really has. A move that has no hitbox of its own and releases a projectile
 * (a fireball, a spirit hand) hits with that projectile, so its damage, pushback and launch are the projectile's:
 * returns "proj:<name>" for such a move, else the entry itself.
 */
export function hitOwner(def, entry) {
  const st = def.states[entry];
  if (!st?.move || st.move.remote || st.frames.some((fr) => fr.hit.length || fr.throw.length)) return entry;
  for (const evs of st.onEnter || []) for (const e of evs || []) if (e.type === 'spawn') return `proj:${spawned(e)}`;
  return entry;
}

/**
 * The burst projectiles (a vacuum: wait, pull, explode) that a move with a hit of its own leaves behind. The preview
 * of such a move takes them out before they act, so what is seen and measured is the move's own hit alone; the
 * burst is tuned on its own entry. [] for a projectile's entry or a move that only hits with its projectile.
 */
export function leftOut(def, entry) {
  if (entry.startsWith('proj:') || hitOwner(def, entry) !== entry) return [];
  const st = def.states[entry];
  if (!st?.move || !st.frames.some((fr) => fr.hit.length || fr.throw.length)) return [];
  const names = new Set();
  for (const evs of st.onEnter || []) for (const e of evs || []) if (e.type === 'spawn' && def.projectiles[spawned(e)]?.burst) names.add(spawned(e));
  return [...names];
}

/**
 * The timeline of a move that releases projectiles (null when it releases none). Frames are counted from 0 here.
 *   { state, frames, ownHit: [first, last] | null, remote, spawns: [{ at, name, lifetime, speed, start, under, live }] }
 * at = the move's frame it appears on; live = [[from, to]] the ages its hitbox is out; speed in px a frame;
 * start = px in front of the fighter (null when it appears under the opponent).
 */
export function flightOf(def, entry) {
  const state = stateFor(def, entry);
  const st = state ? def.states[state] : null;
  if (!st) return null;
  const hits = st.frames.map((fr, i) => (fr.hit.length ? i : -1)).filter((i) => i >= 0);
  const spawns = [];
  (st.onEnter || []).forEach((evs, at) => {
    for (const e of evs || []) {
      if (e.type !== 'spawn') continue;
      const name = spawned(e);
      const d = def.projectiles[name];
      if (!d) continue;
      const placed = typeof e.value === 'object' && e.value ? e.value : {};
      const under = placed.under === 'opponent';
      const last = d.lifetime - 1;
      spawns.push({
        at, name, lifetime: d.lifetime, speed: (d.speed ?? 0) / UNIT, under,
        start: under ? null : Math.round((placed.x ?? d.spawn[0]) / UNIT),
        live: d.noHit ? [] : d.phases ? d.phases.map((ph) => [ph.from, Math.min(ph.to, last)]) : [[0, last]],
      });
    }
  });
  if (!spawns.length) return null;
  return { state, frames: st.frames.length, ownHit: hits.length ? [hits[0], hits.at(-1)] : null, remote: !!st.move?.remote, spawns };
}

/** The first frame (counted from 0, like stats.frame and flightOf) that `by` touched the dummy in a loop's stats. */
export const firstTouch = (stats, by) => stats?.touches?.find((q) => q.by === by)?.frame ?? null;

/**
 * What is wrong with the timing, in words, or null. A move whose own hit only lands on an opponent its projectile
 * has caught (a haul): the projectile has to arrive on an earlier frame (the fighter's hit is resolved first).
 */
export function flightWarning(flight, stats) {
  if (!flight?.remote || !flight.ownHit || !stats) return null;
  const own = flight.ownHit[1];
  for (const sp of flight.spawns) {
    const arrive = firstTouch(stats, sp.name);
    if (arrive !== null && arrive >= own) return `${sp.name} reaches the dummy on frame ${arrive + 1}, not before the move's own hit (frame ${own + 1}): from here that hit finds nobody.`;
  }
  return null;
}

/** A sensible distance (px between the fighters) for a move: close enough that its first hitbox reaches. */
export function reachOf(def, entry) {
  const name = stateFor(def, entry);
  if (!name) return 120;
  let far = 0;
  for (const fr of def.states[name].frames) for (const b of fr.hit) far = Math.max(far, (b[0] + b[2]) / UNIT);
  if (entry.startsWith('proj:')) {
    const d = def.projectiles[entry.slice(5)];
    far = Math.max(far, (d.spawn[0] + d.hitbox[0][0] + d.hitbox[0][2]) / UNIT + (d.speed / UNIT) * Math.min(8, d.lifetime));
  }
  return Math.max(70, Math.min(700, Math.round(far) + 10));
}

/**
 * opts: { def (the edited character), dummyDef, makeWorld(a, b), entry (a state name or "proj:<name>"),
 *         dummy (one of DUMMIES), distance (px) }.
 * Returns { game, world, step(), stats, last, state }: stats = this loop so far, last = the loop before it.
 */
export function createPreview({ def, dummyDef, makeWorld, entry, dummy = 'standing', distance = 120 }) {
  const world = makeWorld(def, dummyDef);
  const state = stateFor(def, entry);
  const air = !!state && def.states[state].stance === 'air';
  const skip = leftOut(def, entry);
  const out = { world, state, game: null, stats: null, last: null, loops: 0, step: tick, leftOut: skip };
  let t, freeFor, x0, done;

  function reset() {
    const g = createGame(world);
    const [a, d] = g.players;
    a.x = -px(distance / 2);
    d.x = px(distance / 2);
    a.facing = 1;
    d.facing = -1;
    out.game = g;
    t = 0;
    freeFor = 0;
    done = false;
    x0 = [a.x, d.x];
    out.stats = { result: 'whiff', frame: -1, pushed: 0, recoiled: 0, peak: 0, landed: null, attackerFree: -1, dummyFree: -1, advantage: null, launched: false, damage: 0, touches: [], now: 0 };
  }
  const free = (i) => !!world.chars[i].states[out.game.players[i].state].free && out.game.players[i].y === 0;

  function tick() {
    const g = out.game;
    const [a, d] = g.players;
    const s = out.stats;
    if (t === WARM && state) {
      if (air) { a.y = px(AIR_HEIGHT); a.vy = px(4); }
      enterState(a, def, state);
    }
    const untouched = s.result === 'whiff';
    // The dummy: crouching or blocking by holding a direction; "in the air" hangs in place until something hits it.
    let hold = 0;
    if (dummy === 'crouching') hold = RAW.DOWN;
    if (dummy === 'blocking' && untouched && t >= WARM) {
      // Holding back blocks, but it also walks away: so the dummy only holds it once the attack is nearly out
      // (or its projectile is flying), and is stood back where it started.
      const m = state ? def.states[state].move : null;
      const soon = g.projectiles.length > 0 || (a.state === state && (!m || a.frame >= m.startup - 3));
      if (soon) hold = d.x > a.x ? RAW.RIGHT : RAW.LEFT;
      if (d.y === 0) d.x = x0[1];
    }
    if (dummy === 'in the air' && untouched) {
      if (dummyDef.states[d.state].stance !== 'air') enterState(d, dummyDef, 'fall');
      d.y = px(AIR_HEIGHT);
      d.vy = 0;
      d.vx = 0;
    }
    const dWas = d.x;
    step(g, [0, hold], world);
    // A move with its own hit: the vacuum it leaves is shown waiting, then taken out before it pulls or bursts.
    if (skip.length) g.projectiles = g.projectiles.filter((q) => !(q.owner === 0 && skip.includes(q.kind) && q.age >= q.fuse - 1));
    t++;
    s.now = t - WARM; // the move's frame just played, counted like stats.frame
    for (const q of g.cues) if (q.p === 0 && ['hit', 'counter', 'witness', 'block'].includes(q.type)) s.touches.push({ frame: s.now, by: q.move });
    if (untouched) {
      const c = g.cues.find((q) => q.p === 0 && ['hit', 'counter', 'witness', 'block', 'absorb', 'armor'].includes(q.type));
      if (c) {
        s.result = c.type === 'block' ? 'block' : c.type === 'absorb' || c.type === 'armor' ? c.type : 'hit';
        s.frame = t - WARM;
        if (hold && d.y === 0) x0[1] += d.x - dWas; // the step back it took while starting to block is not pushback
        s.damage = dummyDef.stats.health - d.health;
      }
    } else {
      s.damage = dummyDef.stats.health - d.health;
      s.peak = Math.max(s.peak, Math.round(d.y / UNIT));
      if (d.y > 0) s.launched = dummy !== 'in the air' || s.launched;
      s.pushed = Math.round((d.x - x0[1]) / UNIT);
      s.recoiled = Math.round((x0[0] - a.x) / UNIT);
      if (s.attackerFree < 0 && free(0)) s.attackerFree = t;
      if (s.dummyFree < 0 && free(1)) { s.dummyFree = t; s.landed = Math.round((d.x - x0[1]) / UNIT); }
      if (s.attackerFree >= 0 && s.dummyFree >= 0 && s.advantage === null) s.advantage = s.dummyFree - s.attackerFree;
    }
    const idle = t > WARM + 1 && free(0) && free(1) && !g.projectiles.length;
    freeFor = idle ? freeFor + 1 : 0;
    if (!done && (freeFor >= REST || t >= LIMIT)) {
      done = true;
      out.last = { ...s };
      out.loops++;
      reset();
    }
  }

  reset();
  return out;
}

/** Run one whole loop without drawing and return what it measured (tests, and the numbers under the preview). */
export function measure(opts) {
  const p = createPreview(opts);
  for (let i = 0; i < LIMIT + 2 && !p.loops; i++) p.step();
  return p.last;
}
