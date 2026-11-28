// The relic: an object a character owns and sets down in the world (Avner's lantern). All of its rules live here
// and every number comes from the character's `relic` data (compiled in character.js). Its state is plain data on
// the owner (`p.relic`), so rollback copies it like everything else.
//
//   p.relic = {
//     mode:   'hand' (carried; his drawings show it) | 'fly' (on its way to where it was set) | 'slide' (skimming
//             the floor) | 'rest' (set, hanging) | 'pendulum' (set, swinging) | 'wait' (a recall held back) |
//             'return' (flying home),
//     x, y:   its pivot (the middle of its gold ring), game units, y up from the floor,
//     facing: the way its owner faced when it was set (its boxes face that way),
//     t:      frames into the current mode, frames: how long the current travel lasts,
//     x0, y0, tx, ty: where the current travel started and ends, arc: the travel's rise (units),
//     height: 'low' | 'mid' | 'high' (stored with its position: what passes through it does different things),
//     act:    the action that set the current mode, life: frames since it was set (it comes home by itself),
//     lock:   frames before the opponent can strike it again, struck: frames its struck drawing shows,
//     dark:   1 = out of flames, flying home dark, relight: frames into relighting the next flame (in hand only),
//     hitOn / hitDone / hitN: whether its current travel hits, whether that hit landed, hits landed this use,
//     home:   1 = a recall curving through a marked opponent first, pulse / moon: a hit to resolve this frame,
//     toss:   frames a fighter thrown at it can still bounce off it,
//   }
// The interface to the rest of the character is three mechanic vars (names in relic.vars): the lantern's state
// (0 in hand, 1 set, 2 returning: moves pick their version by it), its flames, and the mark on the opponent.

import { worldBox, overlaps, strikeRemote, floorBlocks } from './combat.js';
import { enterState, isAirborne } from './fighter.js';
import { frameOf } from './character.js';
import { held, BTN } from './input.js';

const abs = (n) => (n < 0 ? -n : n);
const sgn = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);
const clampTo = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** A fresh relic, in its owner's hand. */
export function createRelic() {
  return { mode: 'hand', x: 0, y: 0, facing: 1, t: 0, frames: 0, x0: 0, y0: 0, tx: 0, ty: 0, arc: 0, height: 'mid', act: '',
    life: 0, lock: 0, struck: 0, dark: 0, relight: 0, hitOn: 0, hitDone: 0, hitN: 0, home: 0, pulse: 0, moon: 0, toss: 0 };
}

const isSet = (r) => r.mode === 'fly' || r.mode === 'slide' || r.mode === 'rest' || r.mode === 'pendulum' || r.mode === 'wait';

/** The lantern var: 0 in hand, 1 set, 2 returning. */
function syncVar(p, R) {
  const r = p.relic;
  p.vars[R.vars.state] = r.mode === 'hand' ? 0 : r.mode === 'return' ? 2 : 1;
}

function spendFlame(game, p, R, why) {
  const f = R.vars.flames;
  if ((p.vars[f] | 0) <= 0) return false;
  p.vars[f]--;
  game.cues.push({ type: 'relicFlame', p: p.id, flames: p.vars[f], why, x: p.relic.x, y: p.relic.y });
  return true;
}

/** Out of flames while set: it goes dark and flies home by itself. */
function checkDark(game, p, R) {
  const r = p.relic;
  if (!isSet(r) || (p.vars[R.vars.flames] | 0) > 0) return;
  goHome(p, R, { dark: 1 });
  game.cues.push({ type: 'relicDark', p: p.id, x: r.x, y: r.y });
}

function goHome(p, R, { dark = 0, hit = 0 } = {}) {
  const r = p.relic;
  r.mode = 'return';
  r.t = 0;
  r.dark = dark;
  r.hitOn = hit;
  r.hitDone = 0;
  r.pulse = r.moon = 0;
  r.x0 = r.x; r.y0 = r.y;
  syncVar(p, R);
}

/** Where his rear hand takes the lantern back (the catch drawing's hand), in world units. */
const catchPoint = (p, R) => [p.x + p.facing * R.catch.at[0], p.y + R.catch.at[1]];

/** The middle of the lantern's body (its pivot is the ring above it). */
const bodyY = (r, R) => r.y - R.body;

function heightOf(y, R) {
  return y <= R.heights.low ? 'low' : y >= R.heights.high ? 'high' : 'mid';
}

function inStage(x, world, R) {
  const edge = world.battle.halfWidthUnits - R.margin;
  return clampTo(x, -edge, edge);
}

/**
 * A timeline event `relic: "<action>"` on the owner's current frame. Actions are named in the data; their type
 * says what they do: place (set it down somewhere), slide (send it skimming the floor), recall, pendulum, pulse,
 * moon (a second Rising Moon from it), fx (an effect at it, nothing else).
 */
export function relicAction(game, p, def, world, name) {
  const R = def.relic;
  const A = R.actions[name];
  const r = p.relic;
  if (!A || !r) return;
  // t starts at -1: the frame the action fires, the lantern is drawn where it leaves his hand (t 0), not a step on.
  switch (A.type) {
    case 'place':
    case 'slide': {
      if (r.mode !== 'hand') return;
      r.x0 = r.x = p.x + p.facing * A.from[0];
      r.y0 = r.y = p.y + A.from[1];
      r.facing = p.facing;
      r.t = -1;
      r.frames = Math.max(1, A.frames);
      r.act = name;
      r.life = 0;
      r.lock = 0;
      r.hitOn = A.type === 'slide' ? 1 : 0;
      r.hitDone = 0;
      r.hitN = 0;
      r.home = 0;
      if (A.type === 'slide') {
        r.mode = 'slide';
        r.tx = inStage(p.x + p.facing * A.dist, world, R);
        r.ty = A.floor;
      } else {
        r.mode = 'fly';
        r.tx = A.to ? inStage(p.x + p.facing * A.to[0], world, R) : r.x;
        r.ty = A.to ? p.y + A.to[1] : r.y;
        r.arc = A.arc;
      }
      r.height = heightOf(r.ty, R);
      syncVar(p, R);
      game.cues.push({ type: 'relicSet', p: p.id, act: name, x: r.x, y: r.y });
      return;
    }
    case 'recall':
      if (!isSet(r) || r.dark) return;
      r.mode = 'wait';
      r.t = -1;
      r.act = name;
      r.pulse = r.moon = 0;
      syncVar(p, R);
      return;
    case 'pendulum':
      if (!isSet(r) || r.dark) return;
      if (r.mode === 'fly' || r.mode === 'slide') { r.x = r.tx; r.y = r.ty; } // a travel still going ends where it was going
      r.mode = 'pendulum';
      r.t = -1;
      r.act = name;
      r.hitN = 0;
      r.hitDone = 0;
      syncVar(p, R);
      game.cues.push({ type: 'relicSwing', p: p.id, x: r.x, y: r.y });
      return;
    case 'pulse':
      if (!isSet(r) || r.dark) return;
      r.pulse = 1;
      return;
    case 'moon':
      if (!isSet(r) || r.dark) return;
      for (let i = 0; i < A.cost; i++) if (!spendFlame(game, p, R, 'moon')) return;
      r.moon = 1;
      game.cues.push({ type: 'relicFx', p: p.id, name: A.fx, x: r.x, y: bodyY(r, R), facing: p.facing });
      return;
    case 'fx':
      if (!isSet(r) || r.dark) return;
      game.cues.push({ type: 'relicFx', p: p.id, name: A.fx, x: r.x, y: bodyY(r, R), facing: p.facing });
      return;
  }
}

/** Which way a fighter at `d` would go to reach a set lantern of `a`'s (+1 / -1), or 0 when it isn't set. */
export function relicSide(a, d) {
  const r = a.relic;
  if (!r || !isSet(r) || r.dark) return 0;
  return sgn(r.x - d.x);
}

/**
 * A hit that throws its victim at the attacker's set lantern (`toRelic` on a move, the rekka's full moon): they fly
 * at it, and bounce off it if they reach it (see the bounce in resolveRelics). Nothing happens without a set lantern
 * with a flame left.
 */
export function relicToss(game, world, a, d, T) {
  const R = world.chars[a.id].relic;
  const r = a.relic;
  if (!R || !r || !isSet(r) || r.dark || (a.vars[R.vars.flames] | 0) <= 0) return;
  const dx = r.x - d.x;
  const dy = bodyY(r, R) - (d.y + R.aim);
  const t = Math.max(1, Math.ceil(abs(dx) / T.speed));
  // Reach the lantern's height after t frames of falling: vy * t - g * t * (t + 1) / 2 = dy.
  const g = world.chars[d.id].stats.gravity;
  d.vx = sgn(dx || a.facing) * Math.min(T.speed, abs(dx));
  d.vy = clampTo(Math.trunc((dy + Math.trunc((g * t * (t + 1)) / 2)) / t), -T.maxUp, T.maxUp);
  if (d.y === 0 && d.vy > 0) d.y = 1;
  r.toss = t + T.grace;
}

/** Every relic's frame: its travel, its timers, flames relighting, coming home, and what it does to projectiles. */
export function moveRelics(game, world) {
  for (const p of game.players) {
    const R = world.chars[p.id].relic;
    const r = p.relic;
    if (!R || !r) continue;
    const def = world.chars[p.id];
    const F = R.vars.flames;
    if (r.lock > 0) r.lock--;
    if (r.struck > 0) r.struck--;
    if (r.toss > 0 && !(game.players[1 - p.id].hitstop > 0)) r.toss--; // a throw at it: its window waits out the hit's freeze
    // Flames come back one at a time, and only while it is in his hand.
    if (r.mode === 'hand' && (p.vars[F] | 0) < R.flames) {
      if (++r.relight >= R.relight) {
        r.relight = 0;
        p.vars[F]++;
        game.cues.push({ type: 'relicFlame', p: p.id, flames: p.vars[F], why: 'relight', x: p.x, y: p.y });
      }
    } else r.relight = 0;
    if (isSet(r)) {
      if (++r.life >= R.autoReturn) { goHome(p, R); game.cues.push({ type: 'relicHome', p: p.id, x: r.x, y: r.y }); }
    }
    r.t++;
    switch (r.mode) {
      case 'fly': {
        // A straight line with a rise in the middle (the lob's arc), done in `frames`.
        const n = r.frames, t = Math.min(r.t, n);
        r.x = r.x0 + Math.trunc(((r.tx - r.x0) * t) / n);
        r.y = r.y0 + Math.trunc(((r.ty - r.y0) * t) / n) + Math.trunc((4 * r.arc * t * (n - t)) / (n * n));
        if (r.t >= n) { r.mode = 'rest'; r.t = 0; }
        break;
      }
      case 'slide': {
        // Down to the floor in its first frames, then along it, slowing to a stop where it was sent.
        const A = R.actions[r.act];
        const n = r.frames, t = Math.min(r.t, n), left = n - t;
        r.x = r.x0 + Math.trunc(((r.tx - r.x0) * (n * n - left * left)) / (n * n));
        r.y = t >= A.drop ? r.ty : r.y0 + Math.trunc(((r.ty - r.y0) * t) / A.drop);
        if (r.t >= n) { r.mode = 'rest'; r.t = 0; r.hitOn = 0; r.height = 'low'; }
        break;
      }
      case 'pendulum':
        if (r.t >= R.actions[r.act].frames) { r.mode = 'rest'; r.t = 0; }
        break;
      case 'wait': {
        // A recall held back: it waits while the button stays down, for at most `hold` frames.
        const A = R.actions[r.act];
        if (r.t >= A.hold || !held(p.input, BTN[A.button])) {
          const marked = (p.vars[R.vars.mark] | 0) > 0;
          goHome(p, R, { hit: 1 });
          r.home = marked ? 1 : 0;
          game.cues.push({ type: 'relicRecall', p: p.id, x: r.x, y: r.y, curve: r.home });
        }
        break;
      }
      case 'return':
        flyHome(game, world, p, def, R);
        break;
    }
    // Out of flames and done with what it was doing (a swing, a pulse): it goes dark and comes home.
    if (r.mode === 'rest') checkDark(game, p, R);
    if (r.mode !== 'hand' && r.mode !== 'return') r.height = r.mode === 'rest' || r.mode === 'pendulum' ? heightOf(r.y, R) : r.height;
    bendProjectiles(game, world, p, R);
  }
}

/** Flying home: dark (it takes `dark` frames, whatever the distance), a recall (it can curve through a marked opponent first), or at its plain speed. */
function flyHome(game, world, p, def, R) {
  const r = p.relic;
  const o = game.players[1 - p.id];
  const A = R.actions[r.act];
  let [tx, ty] = catchPoint(p, R);
  if (r.home) { tx = o.x; ty = o.y + R.aim + R.body; } // through the marked opponent's middle first
  const dx = tx - r.x, dy = ty - r.y;
  let step;
  if (r.dark) {
    const left = Math.max(1, R.darkFrames - r.t + 1);
    r.x += Math.trunc(dx / left);
    r.y += Math.trunc(dy / left);
    step = left === 1;
  } else {
    const sp = r.hitOn && A?.speed ? A.speed : R.returnSpeed;
    const far = Math.max(abs(dx), abs(dy));
    if (far <= sp) { r.x = tx; r.y = ty; step = true; } else { r.x += Math.trunc((dx * sp) / far); r.y += Math.trunc((dy * sp) / far); step = false; }
  }
  if (!step) return;
  if (r.home) {
    // Through them: the mark is used up, and it turns for home.
    r.home = 0;
    p.vars[R.vars.mark] = 0;
    game.cues.push({ type: 'markUsed', p: p.id, x: o.x, y: o.y, why: 'recall' });
    return;
  }
  arrive(game, world, p, def, R);
}

/** Home: in his hand again. Standing free, he plays the catch; in the middle of anything else it is simply back. */
function arrive(game, world, p, def, R) {
  const r = p.relic;
  const st = def.states[p.state];
  r.mode = 'hand';
  r.t = 0;
  r.dark = 0;
  r.hitOn = r.hitDone = r.home = r.pulse = r.moon = 0;
  r.relight = 0;
  syncVar(p, R);
  const catches = (st.free || R.catch.during.includes(p.state)) && st.stance !== 'air' && p.y === 0 && def.states[R.catch.state];
  if (catches) {
    enterState(p, def, R.catch.state);
    p.x = inStage(p.x - p.facing * R.catch.shift, world, R);
  }
  game.cues.push({ type: 'relicCaught', p: p.id, x: p.x, y: p.y, played: catches ? 1 : 0 });
}

/**
 * Projectiles that know the relic (`bend` in their data, Rising Moon's orb): one passing near a set lantern curves
 * toward it; one passing through it spends a flame and becomes another projectile (the Full Crescent), aimed at the
 * opponent from the lantern: along the floor from a low lantern, down from a high one, homing in on a marked
 * opponent (which uses the mark up).
 */
function bendProjectiles(game, world, p, R) {
  const r = p.relic;
  if (!isSet(r) || r.dark || r.mode === 'wait') return;
  const o = game.players[1 - p.id];
  for (const pr of game.projectiles) {
    if (pr.owner !== p.id) continue;
    const pd = world.chars[p.id].projectiles[pr.kind];
    if (pr.home) { home(pr, pd, o, R); continue; }
    const B = pd.bend;
    if (!B) continue;
    const vx = pr.vx ?? pd.speed * pr.facing;
    const dx = r.x - pr.x, dy = bodyY(r, R) - pr.y;
    // Through it: its hitbox touches the lantern's body grown by `through` on every side.
    const body = R.hurt.map((b) => worldBox({ x: r.x, y: r.y, facing: r.facing }, [b[0] - B.through, b[1] - B.through, b[2] + 2 * B.through, b[3] + 2 * B.through]));
    const touches = pd.hitbox.some((h) => { const w = worldBox(pr, h); return body.some((b) => overlaps(w, b)); });
    if (touches && (p.vars[R.vars.flames] | 0) > 0) {
      transform(game, world, p, R, pr, B, o);
      continue;
    }
    if (abs(dx) > B.range || abs(dy) > B.rangeY || sgn(dx) !== sgn(vx) || vx === 0) continue;
    // A gentle pull: its rise or fall turns toward the lantern, a little each frame.
    const t = Math.max(1, Math.ceil(abs(dx) / abs(vx)));
    const want = Math.trunc(dy / t);
    const vy = pr.vy ?? pd.speedY;
    pr.vx = vx;
    pr.vy = clampTo(want, vy - B.pull, vy + B.pull);
  }
}

function transform(game, world, p, R, pr, B, o) {
  const r = p.relic;
  spendFlame(game, p, R, 'crescent');
  const into = world.chars[p.id].projectiles[B.into];
  pr.kind = B.into;
  pr.age = 0;
  pr.x = r.x;
  pr.y = bodyY(r, R);
  pr.n = 0;
  pr.cool = 0;
  const dir = sgn(o.x - r.x) || pr.facing;
  pr.facing = dir;
  pr.vx = dir * into.speed;
  if (r.height === 'low') {
    pr.y = B.floorY; // along the floor
    pr.vy = 0;
  } else {
    const dx = abs(o.x - r.x), dy = o.y + R.aim - pr.y;
    const t = Math.max(1, Math.ceil(dx / into.speed));
    pr.vy = clampTo(Math.trunc(dy / t), -into.speed, into.speed); // down from above, or straight at them
  }
  if ((p.vars[R.vars.mark] | 0) > 0) {
    pr.home = 1;
    p.vars[R.vars.mark] = 0;
    game.cues.push({ type: 'markUsed', p: p.id, x: o.x, y: o.y, why: 'crescent' });
  }
  game.cues.push({ type: 'relicCrescent', p: p.id, x: pr.x, y: pr.y, facing: dir, height: r.height, home: pr.home | 0 });
}

/** Homing: its climb or dive turns toward the opponent's middle, `turn` a frame at most. */
function home(pr, pd, o, R) {
  const vx = pr.vx ?? pd.speed * pr.facing;
  const dx = o.x - pr.x;
  if (sgn(dx) !== sgn(vx)) return; // past them: it flies on
  const t = Math.max(1, Math.ceil(abs(dx) / Math.max(1, abs(vx))));
  const want = Math.trunc((o.y + R.aim - pr.y) / t);
  const vy = pr.vy ?? pd.speedY;
  pr.vy = clampTo(want, vy - pd.homeTurn, vy + pd.homeTurn);
}

/**
 * The relic in the hit stage (after the fighters' and the projectiles' hits): its owner hit while it is set loses a
 * flame and stops what it is doing; the opponent striking it takes a flame; then its own hits; then a fighter thrown
 * at it bouncing off.
 */
export function resolveRelics(game, world) {
  for (const p of game.players) {
    const R = world.chars[p.id].relic;
    const r = p.relic;
    if (!R || !r) continue;
    const o = game.players[1 - p.id];
    const odef = world.chars[o.id];
    const recalling = r.mode === 'return' && r.hitOn === 1;
    if ((isSet(r) || recalling) && !r.dark) {
      // Its owner was hit this frame (a hit or a throw by the opponent, from any source).
      const hurt = game.cues.some((c) => c.p === o.id && (c.type === 'hit' || c.type === 'counter' || c.type === 'witness' || c.type === 'throw'));
      if (hurt) {
        spendFlame(game, p, R, 'hurt');
        if (r.mode === 'pendulum' || r.mode === 'wait' || recalling) { r.mode = 'rest'; r.t = 0; r.home = 0; }
        r.pulse = r.moon = 0;
        r.hitOn = 0;
        syncVar(p, R);
        checkDark(game, p, R);
      }
    }
    if (isSet(r) && !r.dark && r.lock === 0) {
      // Struck: the opponent's active hitbox on the lantern's body.
      const fo = frameOf(odef, o.state, o.frame);
      if (fo.hit.length && fo.hitId && o.hitsDone !== -1) {
        const hurtBox = R.hurt.map((b) => worldBox({ x: r.x, y: r.y, facing: r.facing }, b));
        const touched = fo.hit.some((b) => { const w = worldBox(o, b); return hurtBox.some((h) => overlaps(w, h)); });
        if (touched) {
          r.lock = R.strikeLock;
          r.struck = R.struckShow;
          spendFlame(game, p, R, 'struck');
          game.cues.push({ type: 'relicStruck', p: p.id, by: o.id, x: r.x, y: bodyY(r, R) });
          if (r.mode === 'pendulum' || r.mode === 'wait') { r.mode = 'rest'; r.t = 0; }
          r.pulse = r.moon = 0;
          syncVar(p, R);
          checkDark(game, p, R);
        }
      }
    }
    relicHits(game, world, p, R, o, odef);
    // The bounce: a fighter thrown at it (relicToss) who reaches it is knocked back off it, up, for a pickup.
    if (r.toss > 0 && isSet(r) && !r.dark && o.combo) {
      const T = R.toss;
      if (abs(o.x - r.x) <= T.reach && abs(o.y + R.aim - bodyY(r, R)) <= T.reachY && spendFlame(game, p, R, 'bounce')) {
        const marked = (p.vars[R.vars.mark] | 0) > 0;
        const away = sgn(o.x - r.x) || -r.facing;
        o.vx = away * T.bounce[0]; // back off it, the way they came
        o.vy = T.bounce[1] + (marked ? T.markFloat : 0);
        o.stun = Math.max(o.stun, T.untech + (marked ? T.markUntech : 0));
        if (marked) { p.vars[R.vars.mark] = 0; game.cues.push({ type: 'markUsed', p: p.id, x: o.x, y: o.y, why: 'bounce' }); }
        r.toss = 0;
        r.struck = R.struckShow;
        game.cues.push({ type: 'relicBounce', p: p.id, x: r.x, y: bodyY(r, R), marked: marked ? 1 : 0 });
        checkDark(game, p, R);
      }
    }
  }
}

/** The relic's own hits this frame: the slide, the pendulum's swings, the pulse, the second moon, a recall on its way home. */
function relicHits(game, world, p, R, o, odef) {
  const r = p.relic;
  const A = R.actions[r.act];
  const fo = frameOf(odef, o.state, o.frame);
  const boxAt = (list) => list.map((b) => worldBox({ x: r.x, y: r.y, facing: r.facing }, b));
  const touch = (list) => {
    for (const b of boxAt(list)) for (const h of fo.hurt) { const w = worldBox(o, h); if (overlaps(b, w)) return [Math.max(b[0], w[0]), Math.max(b[1], w[1]), Math.min(b[2], w[2]), Math.min(b[3], w[3])]; }
    return null;
  };
  const can = (move) => !fo.invStrike && !floorBlocks(world, move, o) && !(move.hitsAirborne === false && isAirborne(odef, o));
  const away = sgn(o.x - p.x) || p.facing;
  const strike = (move, rect, id) => {
    const first = r.hitN === 0;
    const kind = strikeRemote(game, world, { a: p, d: o, move, rect, away, moveId: id, firstOfUse: first });
    r.hitN++;
    return kind;
  };

  if (r.mode === 'slide' && r.hitOn && !r.hitDone && A && r.t >= A.hitFrom && can(A.hit)) {
    const rect = touch(A.box);
    if (rect) {
      const sliding = o.state === 'slide';
      const kd = o.kd;
      strike(A.hit, rect, `relic:${r.act}`);
      r.hitDone = 1;
      if (sliding && o.combo) {
        // A sliding fighter keeps sliding a little further; the lantern stops just past them.
        enterState(o, odef, 'slide');
        o.y = 0; o.vy = 0;
        o.vx = r.facing * A.sliding.speed;
        o.stun = A.sliding.frames;
        o.kd = kd;
        o.slideV = o.slideT = 0;
      }
      // It stops just past where they will end up (the extra slide is speed x frames further).
      const past = inStage(o.x + r.facing * ((sliding && o.combo ? A.sliding.speed * A.sliding.frames : 0) + A.pastBy), world, R);
      if ((r.tx - past) * r.facing > 0) { r.tx = past; r.x0 = r.x; r.frames = Math.max(1, r.frames - r.t); r.t = 0; r.y0 = r.y; }
    }
  }
  if (r.mode === 'pendulum' && A) {
    if (A.hitAt.includes(r.t) && can(A.hit)) { // t = frames since the swing started
      const rect = touch(A.box);
      if (rect) strike(A.hit, rect, `relic:${r.act}`);
    }
  }
  if (r.mode === 'return' && r.hitOn && !r.hitDone && A?.hit && can(A.hit)) {
    const rect = touch(A.box);
    if (rect) { strike(A.hit, rect, `relic:${r.act}`); r.hitDone = 1; }
  }
  if (r.pulse) {
    r.pulse = 0;
    const P = Object.values(R.actions).find((x) => x.type === 'pulse');
    const dx = abs(o.x - r.x), dy = abs(o.y + R.aim - bodyY(r, R));
    const near = dx <= P.near && dy <= P.near;
    const marked = (p.vars[R.vars.mark] | 0) > 0;
    const move = near ? P.hit : P.far;
    game.cues.push({ type: 'relicPulse', p: p.id, x: r.x, y: bodyY(r, R), near: near ? 1 : 0 });
    if ((near || marked) && can(move)) {
      const rect = fo.hurt[0] ? worldBox(o, fo.hurt[0]) : [o.x, o.y, o.x, o.y];
      r.hitN = 0;
      const kind = strike(move, rect, 'relic:pulse');
      if (!near) { p.vars[R.vars.mark] = 0; game.cues.push({ type: 'markUsed', p: p.id, x: o.x, y: o.y, why: 'pulse' }); }
      if (kind === 'block') {
        p.vars[R.vars.mark] = R.markFrames; // a blocked pulse marks them, and costs nothing
        game.cues.push({ type: 'marked', p: p.id, x: o.x, y: o.y });
      } else if (kind !== 'absorb') {
        spendFlame(game, p, R, 'pulse');
        checkDark(game, p, R);
      }
    }
  }
  if (r.moon) {
    r.moon = 0;
    const M = Object.values(R.actions).find((x) => x.type === 'moon');
    if (can(M.hit)) {
      const rect = touch(M.box);
      r.hitN = 0;
      if (rect) strike(M.hit, rect, 'relic:moon');
    }
    checkDark(game, p, R);
  }
}
