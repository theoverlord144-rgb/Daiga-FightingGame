// A simple CPU opponent, for testing. It is an input device: each frame it looks at the game and returns the
// buttons it is holding, exactly like a controller. It never touches the game state. No DOM, its own seeded random
// numbers, so a CPU match is repeatable (and testable in Node).
//
// What it does, in order of priority:
//   1. Blocks: when the opponent's attack is coming and in range (low attacks crouching, overheads and jump-ins
//      standing), if its block roll for that attack succeeded. Keeps blocking through blockstun.
//   2. Punishes: when the opponent is stuck recovering for longer than one of its moves takes to hit, and it's in
//      range, it uses the strongest move that's fast enough. On hit it chains the next stronger button.
//   3. Pokes: in range of one of its normals and not under attack, now and then.
//   4. Walks: forward to get in range; sometimes backs off a little.
// The level sets the chances (out of 10000).

import { RAW } from '../core/input.js';
import { frameOf } from '../core/character.js';
import { CONTACT } from '../core/fighter.js';

export const CPU_LEVELS = {
  easy: { block: 2500, punish: 2500, poke: 120, backOff: 60 },
  normal: { block: 6500, punish: 6500, poke: 250, backOff: 90 },
  hard: { block: 9500, punish: 9500, poke: 400, backOff: 120 },
};
const BUTTON_RAW = { L: RAW.L, M: RAW.M, H: RAW.H, S: RAW.S };
const ORDER = ['L', 'M', 'H', 'S'];
const UNIT = 100;

function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s >>> 8;
  };
}

/** Frames from `frame` until the state's next hitbox (0 = now), or -1 if none is coming. */
export function framesToHit(def, state, frame) {
  const st = def.states[state];
  if (!st || !st.move) return -1;
  for (let i = frame; i < st.frames.length; i++) if (st.frames[i].hit.length || st.frames[i].throw.length) return i - frame;
  return -1;
}

/** Frames until a fighter in a move can act again, if the move's hitboxes are all spent; otherwise -1. */
export function recoveryLeft(def, p) {
  const st = def.states[p.state];
  if (!st || !st.move || st.loop) return -1;
  if (framesToHit(def, p.state, p.frame) !== -1) return -1;
  return st.duration - p.frame - 1;
}

/** Gap (units) between `me` and the nearest edge of the opponent's hurtboxes along x. */
function gapTo(me, op, opDef) {
  const fr = frameOf(opDef, op.state, op.frame);
  let best = Infinity;
  for (const [bx, , bw] of fr.hurt) {
    const lo = op.facing > 0 ? op.x + bx : op.x - bx - bw;
    const hi = lo + bw;
    const d = me.x < lo ? lo - me.x : me.x > hi ? me.x - hi : 0;
    if (d < best) best = d;
  }
  return best === Infinity ? Math.abs(op.x - me.x) : best;
}

/** The ground normals the CPU knows how to press: { id, raw, startup, reach (units), damage, button, crouch }. */
function groundNormals(def) {
  const out = [];
  for (const c of def.commands) {
    if (c.kind !== 'normal' || c.air || c.motion || c.buttons.length !== 1 || !c.neutral) continue;
    if (c.dir !== '5' && c.dir !== '2') continue;
    const st = def.states[c.move];
    const m = st.move;
    if (!m || !(m.damage > 0) || st.frames.some((f) => f.throw.length)) continue; // strikes only
    out.push({ id: c.move, raw: BUTTON_RAW[c.buttons] | (c.dir === '2' ? RAW.DOWN : 0), startup: m.startup, reach: m.reach,
      damage: m.damage, button: c.buttons, crouch: c.dir === '2' });
  }
  return out;
}

export function createCpu(world, side, { level = 'normal', seed = 1 } = {}) {
  // level: a name from CPU_LEVELS, or the chances themselves ({ block, punish, poke, backOff }).
  const L = typeof level === 'object' ? level : CPU_LEVELS[level] || CPU_LEVELS.normal;
  const rnd = lcg(seed * 7919 + side + 1);
  const roll = (chance) => rnd() % 10000 < chance;
  const myDef = world.chars[side];
  const opDef = world.chars[1 - side];
  const normals = groundNormals(myDef);
  const longest = normals.reduce((a, n) => Math.max(a, n.reach), 0);
  let seenAttack = ''; // the opponent's move instance we've rolled for (state + start frame)
  let willBlock = false;
  let punishFor = ''; // the opponent recovery we've rolled a punish for
  let willPunish = false;
  let pokeWait = 30;
  let backOff = 0; // frames left walking back
  let chainedFrom = ''; // our move instance we've already chained from

  function input(game) {
    const me = game.players[side];
    const op = game.players[1 - side];
    const toward = op.x >= me.x ? RAW.RIGHT : RAW.LEFT;
    const away = toward === RAW.RIGHT ? RAW.LEFT : RAW.RIGHT;
    const mySt = myDef.states[me.state];
    const gap = gapTo(me, op, opDef);
    if (game.match && game.match.phase !== 'fight') return 0;
    if (pokeWait > 0) pokeWait--;

    // 1. The opponent's attack: roll once per attack whether to block it.
    const opSt = opDef.states[op.state];
    const opAttack = opSt && opSt.move ? `${op.state}@${game.frame - op.frame}` : '';
    if (opAttack && opAttack !== seenAttack) { seenAttack = opAttack; willBlock = roll(L.block); }
    const toHit = opAttack ? framesToHit(opDef, op.state, op.frame) : -1;
    const opReach = opSt?.move ? opSt.move.reach || 0 : 0;
    const threat = toHit !== -1 && toHit <= 20 && gap <= opReach + 30 * UNIT;
    const blocking = me.state.startsWith('block');
    if ((threat && willBlock) || (blocking && opAttack)) {
      const guard = opSt.move.guard;
      const crouch = op.y === 0 && (guard === 'low' || (guard === 'mid' && me.state !== 'blockStand'));
      return away | (crouch ? RAW.DOWN : 0);
    }

    // Busy in our own move: on hit, chain into the next stronger button once.
    if (mySt.move) {
      const inst = `${me.state}@${game.frame - me.frame}`;
      if (me.contact === CONTACT.HIT && chainedFrom !== inst) {
        chainedFrom = inst;
        const mine = normals.find((n) => n.id === me.state);
        if (mine) {
          // The next stronger button that will still reach once this hit's pushback has played out.
          const after = gap + (mySt.move.pushbackHit || 0);
          const next = normals
            .filter((n) => ORDER.indexOf(n.button) > ORDER.indexOf(mine.button) && n.reach >= after)
            .sort((x, y) => ORDER.indexOf(x.button) - ORDER.indexOf(y.button))[0];
          if (next) return next.raw;
        }
      }
      return 0;
    }
    if (!mySt.free) return 0;

    // 2. Punish: the opponent is stuck in recovery long enough for one of our moves to land.
    const left = recoveryLeft(opDef, op);
    if (left > 0) {
      const key = `${op.state}@${game.frame - op.frame}`;
      if (key !== punishFor) { punishFor = key; willPunish = roll(L.punish); }
      if (willPunish) {
        const options = normals.filter((n) => n.startup <= left && gap <= n.reach);
        if (options.length) {
          options.sort((a, b) => b.damage - a.damage);
          return options[0].raw;
        }
      }
    }

    // 3. Poke.
    if (!opAttack && pokeWait === 0) {
      const options = normals.filter((n) => gap <= n.reach && n.startup <= 9);
      if (options.length && roll(L.poke)) {
        pokeWait = 25 + (rnd() % 50);
        return options[rnd() % options.length].raw;
      }
    }

    // 4. Movement.
    if (backOff > 0) { backOff--; return away; }
    if (gap > longest) return toward;
    if (rnd() % 10000 < L.backOff) { backOff = 8 + (rnd() % 16); return away; }
    return 0;
  }

  return { input, level };
}
