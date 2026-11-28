// Characters: import a Toska file (any supported version), then compile it into the runtime definition the
// simulation reads. The definition is static data; it never lives in the game state (only names point into it).
// Format reference: docs/toska-format.md.

import { px } from './fixed.js';
import { compileArchetype } from './devotion.js';
import { universalContent, HIT_REACTIONS } from './systems.js';

export const LATEST_VERSION = 2;
const SUPPORTED = [1, 2];

// ---------- Import (any version -> latest) ----------

/** Validate and upgrade a Toska file to the latest version. Returns a new object; the input is untouched. */
export function importToska(file) {
  if (!file || file.engine !== 'Toska') throw new Error('Not a Toska file (engine must be "Toska")');
  if (!SUPPORTED.includes(file.version)) throw new Error(`Unsupported Toska version ${file.version}`);
  if (!file.character || !Array.isArray(file.moves)) throw new Error('A Toska file needs "character" and "moves"');
  let f = structuredClone(file);
  if (f.version === 1) f = upgrade1to2(f);
  return f;
}

/** Version 1 -> 2: fill the fields version 2 expects. Version 1 data itself is kept as-is. */
function upgrade1to2(f) {
  const moves = f.moves.map((m) => {
    const id = m.id ?? m.input ?? m.name;
    if (!id) throw new Error('A move needs an id, input or name');
    return { ...m, id };
  });
  return {
    engine: 'Toska',
    version: 2,
    character: { stats: {}, ...f.character },
    moves,
    states: {},
    upgradedFrom: 1,
  };
}

// ---------- Commands (numpad notation) ----------

const BUTTON_LETTERS = 'LMHSR';

/** "j.236L" -> { air, motion, dir, buttons }. motion = "236" etc., dir = single digit for normals. */
export function parseInput(input) {
  if (typeof input !== 'string' || !input) return null;
  let s = input.trim();
  const air = s.startsWith('j.');
  if (air) s = s.slice(2);
  let i = s.length;
  while (i > 0 && BUTTON_LETTERS.includes(s[i - 1])) i--;
  const buttons = s.slice(i);
  const dirs = s.slice(0, i);
  if (!buttons) return null;
  if (dirs.length <= 1) return { air, motion: null, dir: dirs || '5', buttons };
  return { air, motion: dirs, dir: null, buttons };
}

const KIND_RANK = { super: 3, special: 2, vow: 1.5, normal: 1 };

function inferKind(m, parsed) {
  if (m.kind) return m.kind;
  if (parsed && parsed.motion && parsed.motion.length >= 6) return 'super'; // 236236, 214214
  return parsed && parsed.motion ? 'special' : 'normal';
}

function inferStance(m, parsed) {
  if (m.stance) return m.stance;
  if (!parsed) return 'stand';
  if (parsed.air) return 'air';
  if (parsed.dir && '123'.includes(parsed.dir)) return 'crouch';
  return 'stand';
}

// ---------- Compile ----------

// Stats counted in frames, counts or percentages (everything else is a distance or speed, converted to units).
const FRAME_STATS = new Set(['health', 'prejump', 'landing', 'throwBreak', 'throwHold', 'airTech', 'airTechInvuln', 'dashFrames', 'dashCancel', 'dashRecovery',
  'backdashFrames', 'backdashInvuln', 'backdashRecovery', 'airdashFrames', 'airdashCancel', 'airdashBackFrames',
  'airdashKeep', 'airJumps', 'airDashes', 'meterBars', 'meterStart']);
const BOX_STATS = new Set(['standHurt', 'crouchHurt', 'airHurt', 'standPush', 'crouchPush', 'airPush']);

const boxes = (list) => (list || []).map(([x, y, w, h]) => [px(x), px(y), px(w), px(h)]);

function compileStats(defaults, own) {
  const raw = { ...defaults, ...own };
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (FRAME_STATS.has(k)) out[k] = Math.round(v);
    else if (BOX_STATS.has(k)) out[k] = boxes(v);
    else if (typeof v === 'number') out[k] = px(v);
    else out[k] = v;
  }
  return { raw, units: out };
}

/** Resolve "@stat" / "-@stat" references. kind: 'px' converts to units, 'frames' keeps whole frames. */
function ref(v, stats, kind) {
  if (typeof v === 'string') {
    const neg = v.startsWith('-');
    const name = v.replace(/^-?@/, '');
    if (!(name in stats.raw)) throw new Error(`Unknown stat reference ${v}`);
    const base = stats.raw[name];
    const n = kind === 'frames' ? Math.round(base) : px(base);
    return neg ? -n : n;
  }
  if (typeof v !== 'number') return v;
  return kind === 'frames' ? Math.round(v) : px(v);
}

const LASTING = ['sprite', 'hit', 'hitProps', 'hurt', 'push', 'throw', 'throwHurt', 'invuln', 'armor', 'counter', 'gravity', 'catch', 'hold'];
const ONE_SHOT = ['vel', 'addVel', 'velScale', 'sound', 'fx', 'jump', 'superFlash', 'meter', 'gauge', 'addVar', 'setVar', 'toOpponent', 'spawn', 'endProjectile', 'warp', 'detonate', 'relic'];

const STANCE_BOX = { stand: ['standHurt', 'standPush'], crouch: ['crouchHurt', 'crouchPush'], air: ['airHurt', 'airPush'] };

/**
 * Resource changes: { meter, gauge, vars: { name: n } } -> the same with defaults filled in. `meter` is written
 * in Devotion points; `unit` turns it into game units.
 */
function resources(r, unit = 1) {
  if (!r) return null;
  return { meter: Math.round((r.meter ?? 0) * unit), gauge: r.gauge | 0, vars: { ...(r.vars || {}) } };
}

/** Frame data of a move, converted to units (distances) and frames. ctx = { kind, meter (the Devotion rules) }. */
function compileMoveData(m, ctx = {}) {
  const kind = ctx.kind ?? 'normal';
  const M = ctx.meter;
  const U = M?.unit ?? 1;
  // An EX move: flagged (`ex: true`), or a special done with two buttons (attack + S). An `ex` OBJECT is the EX
  // version's overrides on a normal special (see exVersions), not a flag on the move that carries it.
  const ex = typeof m.ex === 'boolean' ? m.ex : kind === 'special' && ctx.chord === true;
  const cost = resources(m.cost, U) ?? { meter: 0, gauge: 0, vars: {} };
  // A super's level (1 or 3) sets its cost; an EX costs exCost; a move may name its own (`meterCost`, Devotion).
  const level = kind === 'super' ? m.level ?? 1 : 0;
  if (M && level && M.superCost[level] === undefined) throw new Error(`A super's level must be one of ${Object.keys(M.superCost).join(', ')} (got ${level})`);
  if (m.meterCost !== undefined) cost.meter = Math.round(m.meterCost * U);
  else if (!m.cost?.meter && M) cost.meter = kind === 'super' ? M.superCost[level] : ex ? M.exCost : 0;
  const own = (v) => (v === undefined ? null : Math.round(v * U));
  // Launch: "hard" | "soft" (the system's speeds) or { type, x, y } (its own). No type = soft; `launcher: true` = hard.
  const lsrc = m.launch;
  // The hit reaction (hit states, combo.json): the older flags `knockdown` and `crumple` still mean hardKD and crumple.
  const hitReaction = m.hitReaction ?? (m.knockdown ? 'hardKD' : m.crumple ? 'crumple' : 'normal');
  for (const r of [hitReaction, m.counterReaction, m.airReaction]) if (r != null && !HIT_REACTIONS.includes(r)) throw new Error(`hitReaction must be one of ${HIT_REACTIONS.join(', ')} (got ${JSON.stringify(r)})`);
  // inZone: { hitReaction, airReaction, juggleCost }: what the hit does instead while the fighter it lands on stands in
  // a zone of the attacker's (a projectile with `zone`: Avner's moonlight). Anything left out stays the move's own.
  const zsrc = m.inZone ?? null;
  for (const r of [zsrc?.hitReaction, zsrc?.airReaction]) if (r != null && !HIT_REACTIONS.includes(r)) throw new Error(`inZone reactions must be one of ${HIT_REACTIONS.join(', ')} (got ${JSON.stringify(r)})`);
  // whileVar: { var, hitReaction, airReaction, juggleCost, slideEnds, launch: "none", airHit }: what the hit does
  // instead while that var of the attacker's is above 0 (War'Teun's explosion after Silent Drop landed). It wins over
  // inZone. launch "none" = the move's launch is left out; airHit = the speed an airborne fighter is sent at.
  const vsrc = m.whileVar ?? null;
  if (vsrc && typeof vsrc.var !== 'string') throw new Error('whileVar needs "var": the name of a var of the mechanic');
  for (const r of [vsrc?.hitReaction, vsrc?.airReaction]) if (r != null && !HIT_REACTIONS.includes(r)) throw new Error(`whileVar reactions must be one of ${HIT_REACTIONS.join(', ')} (got ${JSON.stringify(r)})`);
  for (const e of [m.slideEnds, vsrc?.slideEnds]) if (e != null && e !== 'hardKD' && e !== 'softKD') throw new Error(`slideEnds must be "hardKD" or "softKD" (got ${JSON.stringify(e)})`);
  // spin and tumble are air states: a move that names one and no launch pops a grounded fighter up (a soft launch).
  const launchType = typeof lsrc === 'string' ? lsrc : lsrc ? lsrc.type ?? (m.launcher ? 'hard' : 'soft') : hitReaction === 'spin' || hitReaction === 'tumble' ? 'soft' : null;
  if (launchType && launchType !== 'hard' && launchType !== 'soft') throw new Error(`launch must be "hard", "soft" or { type, x, y } (got ${JSON.stringify(lsrc)})`);
  const launchVel = lsrc && typeof lsrc === 'object' && (lsrc.x !== undefined || lsrc.y !== undefined) ? { x: px(lsrc.x ?? 0), y: px(lsrc.y ?? 0) } : null;
  return {
    kind,
    ex: !!ex,
    level,
    startup: m.startup ?? 1,
    active: m.active ?? 0,
    recovery: m.recovery ?? 0,
    damage: m.damage ?? 0,
    hitstun: m.hitstun ?? 0,
    blockstun: m.blockstun ?? 0,
    hitstop: m.hitstop ?? 0,
    pushbackHit: px(m.pushbackHit ?? 0),
    pushbackBlock: px(m.pushbackBlock ?? 0),
    selfPushback: px(m.selfPushback ?? 0),
    recoil: px(m.recoil ?? 0), // the attacker slides back this far whenever the move touches (hit or block)
    guard: m.guard ?? 'mid',
    reach: px(m.reach ?? 0),
    chip: m.chip ?? 0,
    blockHitstop: m.blockHitstop ?? m.hitstop ?? 0,
    airBlockable: m.airBlockable ?? true,
    knockdown: hitReaction === 'hardKD',
    hitReaction, // normal | slide | spin | tumble | crumple | softKD | hardKD
    airReaction: m.airReaction ?? null, // the reaction on a fighter already in the air (null = the same as hitReaction)
    counterReaction: m.counterReaction ?? null, // the reaction when the hit is a counter or Witness counter (null = the same)
    otg: !!m.otg, // can hit a fighter lying in a hard knockdown (once per combo, for a share of its damage)
    launchType, // 'hard' | 'soft' | null (no launch)
    launch: launchVel, // its own launch speeds; null with a launchType = the system's (combo.json)
    juggleCost: m.juggleCost ?? null, // null = the default in combo.json
    zoneHit: zsrc ? { hitReaction: zsrc.hitReaction ?? null, airReaction: zsrc.airReaction ?? null, juggleCost: zsrc.juggleCost ?? null } : null, // inside the attacker's zone
    varHit: vsrc ? { var: vsrc.var, hitReaction: vsrc.hitReaction ?? null, airReaction: vsrc.airReaction ?? null, juggleCost: vsrc.juggleCost ?? null, slideEnds: vsrc.slideEnds ?? null, noLaunch: vsrc.launch === 'none', airHit: vsrc.airHit ? { x: px(vsrc.airHit.x ?? 0), y: px(vsrc.airHit.y ?? 0) } : null } : null, // while the attacker's var runs
    slideEnds: m.slideEnds ?? null, // the knockdown its slide ends in: "hardKD" | "softKD" (null = the system's, combo.json)
    airHit: m.airHit ? { x: px(m.airHit.x ?? 0), y: px(m.airHit.y ?? 0) } : null,
    throwSwap: !!m.throwSwap,
    throwDistance: px(m.throwDistance ?? 70),
    throwHit: m.throwHit ?? 0, // frames after the hold ends before the throw's damage and knockdown (the hit drawing)
    throwFx: m.throwFx ? [px(m.throwFx[0]), px(m.throwFx[1])] : null, // where its hit spark shows: [forward, up] from the thrower
    // Combo (Phase 5). null = use the default in data/system/combo.json.
    starterProration: m.starterProration ?? null,
    comboProration: m.comboProration ?? null,
    untech: m.untech ?? null,
    launcher: launchType === 'hard',
    wallBounce: m.wallBounce ? { x: px(m.wallBounce.x ?? 0), y: px(m.wallBounce.y ?? 0) } : null,
    groundBounce: m.groundBounce ? { y: px(m.groundBounce.y ?? 0) } : null,
    bounceLimit: m.bounceLimit ?? null,
    // Pull-in: on hit the defender slides toward the attacker, ending `to` px in front of them, over `frames`.
    pull: m.pull ? { to: px(m.pull.to ?? 70), frames: Math.max(1, m.pull.frames ?? 8) } : null,
    perCombo: m.perCombo ?? 0, // > 0: the move can hit at most this many times in one combo (no loops)
    // Used again in the same combo, a move's own share of damage, hitstun and launch height (out of 10000 each; null
    // = combo.json's repeat rules; repeatLaunch applies once per earlier use, so each one goes lower).
    repeatDamage: m.repeatDamage ?? null,
    repeatHitstun: m.repeatHitstun ?? null,
    repeatLaunch: m.repeatLaunch ?? null,
    // slideLimit: { perCombo, then }: this move's slide is counted on its own, not against the shared slide limit;
    // past perCombo it does `then` (a hit reaction) instead. key: the count it shares (default: the move's own).
    slideLimit: m.slideLimit ? { perCombo: m.slideLimit.perCombo ?? 1, then: m.slideLimit.then ?? 'hardKD', key: m.slideLimit.key ?? null } : null,
    slideTo: m.slideTo ?? null, // "relic": the slide it starts heads for the attacker's set lantern (away from them if none)
    // toRelic: { speed, maxUp, grace }: on hit the fighter is thrown at the attacker's set lantern (relic.js bounces
    // them off it). Nothing without a set lantern with a flame.
    toRelic: m.toRelic ? { speed: px(m.toRelic.speed ?? 14), maxUp: px(m.toRelic.maxUp ?? 16), grace: m.toRelic.grace ?? 12 } : null,
    // Conditions on the attacker's own resources (same shape as `requires`), read at the moment of the hit:
    hitRequires: m.hitRequires ? condition(m.hitRequires) : null, // unmet: the hitbox touches nothing at all
    stagger: m.stagger ? { when: condition(m.stagger.when), hitstun: m.stagger.hitstun | 0 } : null, // met: extra hitstun
    onBlockState: m.onBlockState ?? null, // when it is blocked the attacker switches to this state (Absolve's bait)
    onHitState: m.onHitState ?? null, // on hit (not block) the attacker switches to this state (an animation branch)
    remote: !!m.remote, // the hit lands wherever the opponent is (no box check)
    pierce: !!m.pierce, // hits through Vow's guard (supers always do)
    crumple: hitReaction === 'crumple', // a grounded hit puts the opponent in the crumple (Vow's stronger strikes)
    vowStrike: !!m.vowStrike, // Vow's release strike: landing it forgives the Debt
    oneAtATime: m.oneAtATime ? [m.oneAtATime].flat() : null, // projectile names: the move can't start while the fighter has one of them out
    needsOut: m.needsOut ?? null, // a projectile name: the move only starts while the fighter has one out
    perJump: m.perJump ?? null, // a group name: one move of that group per jump (counted until the fighter lands)
    noZoneMark: !!m.noZoneMark, // true: this hit never adds a zone's mark (the hit that spends the mark)
    hitsAirborne: m.hitsAirborne !== false, // false: the hit passes through a fighter who is in the air
    hitsGrounded: m.hitsGrounded !== false, // false: the hit passes through a fighter who is on the ground
    // grab: a hit that takes hold instead of knocking away (an air command grab): it cannot be blocked, passes through a
    // fighter in blockstun, and puts the one it touches in `grabbed`, kept where the grabber's frames say (`hold`).
    grab: !!m.grab,
    noFallOut: !!m.noFallOut, // this hit keeps its stun and reaction past the juggle limit (the hits of a grab)
    // Drawing only (the core never reads these): a chain drawn from the hand to the hit, and an effect on hit.
    chain: m.chain ?? null,
    hitFx: m.hitFx ?? null,
    pinFx: m.pinFx ?? null, // drawing only: { effect, fromSprite } an effect pinned to the lantern from that drawing on
    // Devotion and the character mechanic. `meter: { hit, block }` on a move replaces the usual gain from damage
    // (Devotion points, before the character's give); null = the usual rule.
    devGain: m.meter ? { hit: own(m.meter.hit), block: own(m.meter.block) } : null,
    cost, // paid when the move starts: { meter, gauge, vars }
    requires: m.requires ? resources(m.requires, U) : null,
    onHit: resources(m.onHit, U),
    onBlock: resources(m.onBlock, U),
    onWhiff: resources(m.onWhiff, U),
  };
}

/** A condition on a fighter's resources: { meter, gauge, vars: { name: min or [min, max] } }. */
const condition = (r) => ({ meter: r?.meter | 0, gauge: r?.gauge | 0, vars: { ...(r?.vars || {}) } });

/**
 * Projectiles: objects a move spawns with a `spawn` timeline event. Each lives in the game state (position, age),
 * flies straight, and hits once with its own frame data (the same fields as a move's).
 *   projectiles: { name: { speed, spawn: [x, y], hitbox: [x, y, w, h] (from its leading edge), lifetime, ...frame data } }
 */
function compileProjectiles(src, meter) {
  const out = {};
  for (const [name, p] of Object.entries(src || {})) {
    const sp = p.spawn ?? [0, 0];
    out[name] = {
      name,
      speed: px(p.speed ?? 0),
      speedY: px(p.speedY ?? 0), // per frame, up is positive (a rising or diving projectile)
      spawn: [px(sp[0]), px(sp[1])],
      fromGround: !!p.fromGround, // spawn[1] is a height above the floor, not above the fighter (it erupts from the ground)
      hitbox: boxes([p.hitbox ?? [0, 0, 0, 0]]),
      // phases: [[fromAge, toAge, [x, y, w, h]]]: the hitbox is only out during these ages, with that box (none
      // given = its `hitbox`). Without phases the hitbox is out all its life.
      phases: p.phases ? p.phases.map(([from, to, box]) => ({ from, to, box: boxes([box ?? p.hitbox ?? [0, 0, 0, 0]]) })) : null,
      noHit: !!p.noHit, // true: it never hits anything (a marker in the world, like a light or a beam that is only seen)
      persist: !!p.persist, // it stays after its hit (it still hits only once) and never clashes with other projectiles
      // zone: { box: [x, y, w, h] from its position, gravityPct, markVar }: an opponent inside falls at gravityPct of
      // their gravity, and any hit their attacker lands on them there adds 1 to the attacker's var markVar.
      zone: p.zone ? { box: boxes([p.zone.box])[0], gravityPct: p.zone.gravityPct ?? 10000, markVar: p.zone.markVar ?? null } : null,
      onEnd: p.onEnd?.setVar ?? null, // { var: n }: set on its owner when it ends, however it ends
      ownerOnHit: p.ownerOnHit ?? null, // on hit, an owner still in the move that made it switches to this state
      endsOnGround: !!p.endsOnGround, // it ends when it reaches the floor (a diving projectile)
      hits: Math.max(1, p.hits ?? 1), // how many times it hits before it is used up
      rehit: Math.max(1, p.rehit ?? 8), // frames between those hits
      // bend: { range, rangeY, pull, through, into, floorY }: near its owner's set relic it curves toward it (pull px a
      // frame, within range px ahead and rangeY above or below); through it (its hitbox touching the relic's body grown
      // by `through` px) it spends a flame and becomes the projectile `into` (relic.js).
      bend: p.bend ? { range: px(p.bend.range ?? 70), rangeY: px(p.bend.rangeY ?? p.bend.range ?? 70), pull: px(p.bend.pull ?? 1.5), through: px(p.bend.through ?? 8), into: p.bend.into, floorY: px(p.bend.floorY ?? 24) } : null,
      homeTurn: px(p.homeTurn ?? 2), // homing (a projectile made by `bend` on a marked opponent): how fast it turns, px a frame
      // burst: a projectile that waits, pulls, then bursts once (a vacuum). All numbers in px / frames / percent:
      //   fuse (frames before the collapse), collapse (frames of pull before the burst), active (frames the burst's
      //   box is out), linger (frames it stays after, for its drawing), limit (most of them out; one more makes the
      //   oldest collapse now), pull { range, reachY, speed, markVar, markRangePct } (an opponent this near slides
      //   toward it during the collapse; wider while the owner's markVar runs), scale { var, per, sizePct, damagePct }
      //   (each `per` of the owner's var makes the burst that much bigger and stronger), resonate { gap, pct }
      //   (detonated together within `gap` of each other, they burst as one, pct of the size and damage).
      // Its hit knocks away from its centre and is blocked holding either way. A spawn may give its own fuse / collapse.
      burst: p.burst ? {
        fuse: p.burst.fuse ?? 0, collapse: p.burst.collapse ?? 0, delay: Math.max(0, p.burst.delay ?? 0), active: Math.max(1, p.burst.active ?? 1), linger: p.burst.linger ?? 0, limit: p.burst.limit ?? 0,
        pull: p.burst.pull ? { range: px(p.burst.pull.range ?? 0), reachY: px(p.burst.pull.reachY ?? 9999), bodyY: px(p.burst.pull.bodyY ?? 0), speed: px(p.burst.pull.speed ?? 0), markVar: p.burst.pull.markVar ?? null, markRangePct: Math.round((p.burst.pull.markRangePct ?? 100) * 100) } : null,
        scale: p.burst.scale ? { var: p.burst.scale.var, per: Math.max(1, p.burst.scale.per ?? 1), sizePct: Math.round((p.burst.scale.sizePct ?? 0) * 100), damagePct: Math.round((p.burst.scale.damagePct ?? 0) * 100) } : null,
        resonate: p.burst.resonate ? { gap: px(p.burst.resonate.gap ?? 0), pct: Math.round((p.burst.resonate.pct ?? 100) * 100) } : null,
      } : null,
      // lob: a thrown projectile (src/core/lob.js): it rises for `rise` frames along an arc to `apex` px above the floor,
      // over the spot `land` px ahead of its owner (kept `margin` px inside the stage walls), hangs `hang` frames (with
      // `track` it slides toward the opponent, at most that many px a frame), drops for `drop` frames, stays `impact`
      // frames on the floor, then is `back` frames on its way home before it is gone (a move with `oneAtATime` is
      // locked until then). Its hitboxes are its `phases`, by age; give it `persist` so a hit does not remove it.
      lob: p.lob ? { rise: Math.max(1, p.lob.rise | 0), hang: Math.max(0, p.lob.hang | 0), drop: Math.max(1, p.lob.drop | 0), land: px(p.lob.land ?? 0), apex: px(p.lob.apex ?? 0),
        track: px(p.lob.track ?? 0), impact: Math.max(0, p.lob.impact | 0), back: Math.max(0, p.lob.back | 0), margin: px(p.lob.margin ?? 40) } : null,
      lobArt: p.lobArt ?? null, // drawing only: a lobbed projectile's layers
      endFx: p.endFx ?? null, // drawing only: { why: effect name } played where it ended (why = hit, block, ground, edge...)
      lifetime: p.lifetime ?? (p.lob ? Math.max(1, p.lob.rise | 0) + Math.max(0, p.lob.hang | 0) + Math.max(1, p.lob.drop | 0) + Math.max(0, p.lob.impact | 0) + Math.max(0, p.lob.back | 0) : 600),
      move: compileMoveData(p, { kind: 'special', meter }),
      sprite: p.sprite ?? null, // drawing only
      anim: p.anim ?? null,
      burstArt: p.burstArt ?? null, // drawing only: which drawings a burst projectile shows in each phase
    };
  }
  return out;
}

/**
 * The character mechanic slot: a named gauge and named counters ("vars") that moves and timeline events can
 * require, spend and build. All values are integers kept in the game state.
 *   mechanic: { name, gauge: { max, start, perFrame, onHit, onBlock, onHurt, label },
 *               vars: { name: { start, min, max, perFrame, label } },
 *               modifiers: [{ when: { gauge: n, vars: { name: [min, max] } }, damagePct }] }
 */
function compileMechanic(src) {
  if (!src) return { name: null, gauge: null, vars: {}, modifiers: [] };
  const g = src.gauge;
  const gauge = g ? { max: g.max ?? 10000, start: g.start ?? 0, perFrame: g.perFrame ?? 0, onHit: g.onHit ?? 0,
    onBlock: g.onBlock ?? 0, onHurt: g.onHurt ?? 0, label: g.label ?? src.name ?? 'Gauge' } : null;
  const vars = {};
  for (const [k, v] of Object.entries(src.vars || {})) {
    vars[k] = { start: v.start ?? 0, min: v.min ?? 0, max: v.max ?? 99, perFrame: v.perFrame ?? 0, label: v.label ?? k, show: v.show ?? true,
      display: v.display ?? 'count', // HUD only: 'count', 'timer' (frames shown as a draining bar) or 'pips' (levels of `per`)
      per: v.per ?? 1, // HUD only, for 'pips': how much of the var is one level
      // drain: { after, by }: after that many frames without the var going up, it drops by that much (and again each time).
      drain: v.drain ? { after: Math.max(1, v.drain.after | 0), by: v.drain.by | 0 } : null,
      mark: v.mark ?? null, // drawing only: a colour; while the var is above 0 the opponent glows with it (a brand)
      // Drawing only, while the var is above 0 (an install): `aura` = [{ effect, behind }], named effects looping on the
      // fighter; `art` = { state: otherState }, that state is drawn with the other state's drawings.
      aura: v.aura ?? null, art: v.art ?? null };
  }
  const modifiers = (src.modifiers || []).map((x) => ({ when: x.when || {}, damagePct: x.damagePct ?? 10000 }));
  return { name: src.name ?? null, gauge, vars, modifiers };
}

/**
 * The relic (relic.js): an object the character owns and sets down (Avner's lantern). Distances in px, times in
 * frames, all turned into game units here.
 *   relic: { vars: { state, flames, mark }, flames, relight, autoReturn, darkFrames, strikeLock, struckShow,
 *            returnSpeed, margin, body, aim, markFrames, heights: { low, high }, hurtbox, catch: { state, at },
 *            toss: { reach, reachY, bounce: [x, y], untech, markFloat, markUntech }, actions: { name: {...} } }
 */
function compileRelic(src, meter) {
  if (!src) return null;
  const P = (a) => (a ? [px(a[0]), px(a[1])] : null);
  const hit = (h) => (h ? compileMoveData(h, { kind: 'special', meter }) : null);
  const actions = {};
  for (const [name, a] of Object.entries(src.actions || {})) {
    if (!['place', 'slide', 'recall', 'pendulum', 'pulse', 'moon', 'fx'].includes(a.type)) throw new Error(`relic action ${name}: type must be place, slide, recall, pendulum, pulse, moon or fx (got ${a.type})`);
    const hitAt = a.hitAt ?? [];
    actions[name] = {
      name, type: a.type,
      from: P(a.from), // where it leaves his hand: [forward, up] px from his position, in the release drawing
      to: P(a.to), // where it is set: [forward, up] from his position (none: it stays where it left his hand)
      frames: Math.max(1, a.frames ?? 1), arc: px(a.arc ?? 0), // its travel, and how much the travel rises
      dist: px(a.dist ?? 0), floor: px(a.floor ?? 0), drop: Math.max(1, a.drop ?? 1), // slide: how far, at what height, how fast it gets there
      hitFrom: a.hitFrom ?? 0, pastBy: px(a.pastBy ?? 30), sliding: a.sliding ? { speed: px(a.sliding.speed ?? 6), frames: a.sliding.frames ?? 10 } : null,
      hold: a.hold ?? 0, button: a.button ?? 'R', speed: px(a.speed ?? 14), // recall
      hitAt, half: hitAt.length > 1 ? hitAt[1] - hitAt[0] : 30, // pendulum: the ages it passes the bottom (and hits)
      near: px(a.near ?? 0), // pulse: within this of the lantern it always hits
      fx: a.fx ?? null,
      cost: a.cost ?? 0, // flames it spends when it fires (the second moon)
      trail: a.trail ?? null, // drawing only: named effects that follow it while it travels (the slide's sparks and dust)
      box: boxes(a.box ? [a.box] : []), // its hitbox from the ring, [x, y, w, h] px (y up)
      hit: hit(a.hit), far: a.hit && a.far ? hit({ ...a.hit, ...a.far }) : null,
    };
  }
  const T = src.toss ?? {};
  return {
    vars: { state: src.vars?.state ?? 'lantern', flames: src.vars?.flames ?? 'flames', mark: src.vars?.mark ?? 'mark' },
    flames: src.flames ?? 3, relight: src.relight ?? 120, autoReturn: src.autoReturn ?? 480, darkFrames: src.darkFrames ?? 30,
    strikeLock: src.strikeLock ?? 20, struckShow: src.struckShow ?? 6, returnSpeed: px(src.returnSpeed ?? 12), margin: px(src.margin ?? 20),
    body: px(src.body ?? 22), aim: px(src.aim ?? 85), markFrames: src.markFrames ?? 300,
    heights: { low: px(src.heights?.low ?? 50), high: px(src.heights?.high ?? 170) },
    hurt: boxes([src.hurtbox ?? [-12, -46, 24, 40]]),
    // catch: the state he plays when it reaches his hand standing free, where his hand is in its first drawing (from
    // his position as he stands now, empty-handed), and how far back his position moves as it starts (his two stances
    // stand at different places over the same rear foot).
    catch: { state: src.catch?.state ?? null, at: P(src.catch?.at ?? [0, 90]), shift: px(src.catch?.shift ?? 0), during: src.catch?.during ?? [] }, // during: moves that end in the catch too (the Recall)
    toss: { reach: px(T.reach ?? 40), reachY: px(T.reachY ?? 60), bounce: P(T.bounce ?? [6, 12]), untech: T.untech ?? 30, markFloat: px(T.markFloat ?? 4), markUntech: T.markUntech ?? 10 },
    actions,
  };
}

/**
 * EX versions. A special with `ex: { ...overrides }` gets a second move, `<id>_ex`, made of the normal move with
 * the overrides laid over it (a field the overrides name replaces the normal one whole). Its input is the same
 * motion and attack button plus S, so the attack button still picks the strength.
 */
function exVersions(charId, moves) {
  const out = [];
  for (const m of moves) {
    if (!m.ex || typeof m.ex !== 'object') continue;
    const p = parseInput(m.input);
    if (!p || !p.motion || p.buttons.length !== 1 || !'LMH'.includes(p.buttons)) {
      throw new Error(`${charId}: move ${m.id} has an EX version, so its input must be a motion and one of L, M, H (got ${m.input})`);
    }
    const { ex, ...base } = m;
    const input = `${m.input}S`;
    if (moves.some((o) => o.input === input)) throw new Error(`${charId}: move ${m.id} has an EX version, but another move already uses ${input}`);
    out.push({ ...base, ...ex, id: `${m.id}_ex`, name: ex.name ?? `${m.name ?? m.id} (EX)`, input, exOf: m.id });
  }
  return out;
}

/** Sprite timeline from a sheet: [{ at, index }]. holds[i] frames per sprite; missing = spread evenly. */
function spriteEvents(sheet, duration) {
  if (!sheet || !sheet.count) return [];
  const out = [];
  if (Array.isArray(sheet.holds) && sheet.holds.length) {
    let t = 0;
    for (let i = 0; i < sheet.count && t < duration; i++) {
      out.push({ at: t, index: i });
      t += Math.max(1, sheet.holds[i] ?? sheet.holds[sheet.holds.length - 1]);
    }
  } else {
    for (let i = 0; i < sheet.count; i++) {
      const at = Math.floor((i * duration) / sheet.count);
      if (!out.length || out[out.length - 1].at !== at) out.push({ at, index: i });
    }
  }
  return out;
}

/** Turn a state description (system state or move) into per-frame tables. */
function compileState(name, src, stats, extra = {}) {
  const stance = src.stance ?? 'stand';
  const isMove = !!extra.move;
  let duration;
  // Stun states last as long as the stun counter; their table is only as long as their art (holds), and the last
  // frame repeats (frameOf clamps), so a block can show its pushback drawing, then hold the guard.
  if (src.stun) duration = Array.isArray(extra.sheet?.holds) ? Math.max(1, extra.sheet.holds.slice(0, extra.sheet.count).reduce((a, b) => a + b, 0)) : 1;
  else if (src.duration !== undefined) duration = ref(src.duration, stats, 'frames');
  else if (isMove) duration = Math.max(1, extra.move.startup - 1 + extra.move.active + extra.move.recovery);
  else duration = 1;

  // Collect events: generated ones first (from frame data and the sprite sheet), then explicit ones.
  const events = [];
  const [hurtStat, pushStat] = STANCE_BOX[stance] ?? STANCE_BOX.stand;
  events.push({ at: 0, hurt: stats.units[hurtStat], push: stats.units[pushStat], throwHurt: stats.units[pushStat], gravity: stance === 'air' });
  if (isMove) {
    const m = extra.move;
    const first = m.startup - 1;
    if (extra.hurtboxes) events.push({ at: 0, hurt: boxes(extra.hurtboxes) });
    // A remote hit has no real box: an empty-sized one keeps the usual "a hit is out" bookkeeping (hit ids).
    const hb = extra.hitboxes ?? (m.remote ? [[0, 0, 0, 0]] : null);
    if (hb && m.active > 0) {
      events.push({ at: first, hit: boxes(hb) });
      events.push({ at: first + m.active, hit: [] });
    }
    if (extra.throwboxes && m.active > 0) {
      events.push({ at: first, throw: boxes(extra.throwboxes) });
      events.push({ at: first + m.active, throw: [] });
    }
    // Counter state per frame: 1 = startup and active frames (a hit here is a counter hit), 2 = recovery (a hit
    // here is a Witness counter), 0 = neither. counterHit: "none" turns both off for the move.
    const ch = extra.counterHit ?? 'all';
    events.push({ at: 0, counter: ch !== 'none' ? 1 : 0 });
    if (ch !== 'none') events.push({ at: first + m.active, counter: ch === 'startup+active' ? 0 : 2 });
  }
  for (const s of spriteEvents(extra.sheet, duration)) events.push({ at: s.at, sprite: { sheet: extra.sheetName, index: s.index } });
  for (const e of src.timeline || []) events.push(normalizeEvent(e, stats, extra.sheetName));

  // Expand ranges into set + revert, then walk frame by frame.
  const sets = [];
  for (const e of events) {
    if (e.from !== undefined) {
      const { from, to, for: count, ...fields } = e;
      const last = count !== undefined ? from + count - 1 : to ?? from;
      sets.push({ at: from, fields, revertAt: last + 1 });
    } else {
      const { at, ...fields } = e;
      sets.push({ at: at ?? 0, fields });
    }
  }
  sets.forEach((s, i) => (s.order = i));
  sets.sort((a, b) => a.at - b.at || a.order - b.order);

  const cur = { sprite: null, hit: [], hitProps: null, hurt: [], push: [], throw: [], throwHurt: [], invuln: { strike: false, throw: false }, armor: 0, counter: 0, gravity: stance === 'air', catch: null, hold: null };
  const frames = [];
  const onEnter = [];
  const reverts = []; // { at, fields }
  let hitId = 0;
  let curHitId = 0;
  let si = 0;
  for (let f = 0; f < duration; f++) {
    const shots = [];
    for (const r of reverts.filter((r) => r.at === f)) Object.assign(cur, r.fields);
    while (si < sets.length && sets[si].at <= f) {
      const { fields, revertAt } = sets[si++];
      if (revertAt !== undefined) {
        const old = {};
        for (const k of Object.keys(fields)) if (LASTING.includes(k)) old[k] = cur[k];
        reverts.push({ at: revertAt, fields: old });
      }
      for (const [k, v] of Object.entries(fields)) {
        if (LASTING.includes(k)) {
          cur[k] = v;
          if (k === 'hit') curHitId = v.length ? ++hitId : 0;
        } else if (ONE_SHOT.includes(k)) {
          shots.push({ type: k, value: v });
        }
      }
    }
    frames.push({
      sprite: cur.sprite,
      hit: cur.hit,
      hitId: curHitId,
      hitProps: cur.hitProps,
      hurt: cur.hurt,
      push: cur.push,
      throw: cur.throw,
      throwHurt: cur.throwHurt,
      invStrike: !!cur.invuln?.strike,
      invThrow: !!cur.invuln?.throw,
      armor: cur.armor | 0,
      counter: cur.counter === true ? 1 : cur.counter | 0,
      gravity: !!cur.gravity,
      catch: cur.catch || null,
      hold: cur.hold || null,
    });
    onEnter.push(shots);
  }

  const cancels = (extra.cancels || src.cancels || []).map((c) => ({
    from: ref(c.from ?? 0, stats, 'frames'),
    to: ref(c.to ?? duration - 1, stats, 'frames'),
    into: new Set(c.into || []),
    hit: (c.on || ['hit', 'block']).includes('hit'),
    block: (c.on || ['hit', 'block']).includes('block'),
    whiff: (c.on || ['hit', 'block']).includes('whiff'),
  }));

  return {
    name,
    stance,
    kind: extra.kind ?? 'system',
    free: !!src.free,
    loop: !!src.loop,
    loopFrom: src.loopFrom ?? 0,
    stun: !!src.stun,
    keepVel: !!src.keepVel,
    throwVictim: !!src.throwVictim,
    vow: !!src.vow, // Vow's guard: hits are absorbed into Debt
    blocking: !!src.blocking, // counts as a block state (Repel's and Draw's poses): further hits can be blocked
    techable: !!src.techable,
    floor: !!src.floor, // lying in a hard knockdown: only an OTG move can touch the fighter
    next: src.next ?? (stance === 'air' ? 'fall' : 'idle'),
    // Branches and held stances (all optional):
    nextIf: (src.nextIf || []).map((b) => ({ when: condition(b.when), to: b.to })), // at the end: the first whose condition holds, else `next`
    timeout: src.timeout ?? 0, // frames in the state (loops included) before it leaves by itself to timeoutTo
    timeoutTo: src.timeoutTo ?? src.next ?? 'idle',
    onBack: src.onBack ?? null, // holding back leaves to this state (a pressed follow-up wins)
    layers: src.layers ?? null, // drawing only: effects drawn in step with the state's sprite
    landTo: src.landTo ?? 'land',
    gravityPct: src.gravityPct ?? 10000, // this state's share of gravity (15000 = falls half as fast again)
    duration,
    move: extra.move ?? null,
    frames,
    onEnter,
    cancels,
  };
}

/** Convert one explicit timeline event: units for distances, stat references resolved. */
function normalizeEvent(e, stats, sheetName) {
  const out = {};
  for (const [k, v] of Object.entries(e)) {
    if (['at', 'from', 'to', 'for'].includes(k)) out[k] = ref(v, stats, 'frames');
    else if (['hit', 'hurt', 'push', 'throw', 'throwHurt'].includes(k)) out[k] = boxes(v);
    else if (k === 'velScale') out[k] = { x: v.x === undefined ? undefined : ref(v.x, stats, 'frames'), y: v.y === undefined ? undefined : ref(v.y, stats, 'frames') };
    else if (k === 'vel' || k === 'addVel') {
      out[k] = {};
      if (v.x !== undefined) out[k].x = ref(v.x, stats, 'px');
      if (v.y !== undefined) out[k].y = ref(v.y, stats, 'px');
    } else if (k === 'sprite') out[k] = typeof v === 'number' ? { sheet: sheetName, index: v } : v;
    // A hit's own frame data: converted like the move's (distances to units), keeping only the fields it names.
    else if (k === 'hitProps') {
      const full = compileMoveData(v);
      out[k] = Object.fromEntries(Object.keys(v).filter((f) => f in full).map((f) => [f, full[f]]));
      if ('launch' in v) { out[k].launchType = full.launchType; out[k].launcher = full.launcher; }
      if ('airReaction' in v) out[k].airReaction = full.airReaction;
      if ('knockdown' in v || 'crumple' in v || 'hitReaction' in v) { out[k].hitReaction = full.hitReaction; out[k].knockdown = full.knockdown; out[k].crumple = full.crumple; }
    }
    // hold: where the fighter this one has grabbed is kept, from this fighter's feet: { x (forward), y (up) } px, and
    // rot (degrees, drawing only). null lets go. See holdVictims in combat.js.
    else if (k === 'hold') out[k] = v ? { x: px(v.x ?? 0), y: px(v.y ?? 0), rot: v.rot ?? 0 } : null;
    else if (k === 'toOpponent') out[k] = { to: ref(v.to ?? 70, stats, 'px'), frames: Math.max(1, v.frames ?? 6) };
    // spawn: a projectile name, or { name, x, y, under: "opponent" } to put this one somewhere else than its own spawn point.
    else if (k === 'spawn' && typeof v === 'object') out[k] = { name: v.name, x: v.x === undefined ? null : px(v.x), y: v.y === undefined ? null : px(v.y), under: v.under ?? null, fuse: v.fuse ?? null, collapse: v.collapse ?? null };
    // warp: an instant move. { x, y } px (x forward), or behind: true (to the far side of the opponent, `gap` px past
    // them), behindIf: "<var>" (behind only while that var of the fighter's runs, else x / y), or swap: true (the two
    // fighters trade places). After behind / swap the fighter faces the opponent. above: px with behind = he also
    // arrives that far above the opponent's feet, wherever they are (War'Teun's Wiretap Pursuit); aboveAir: px = the
    // height used instead while the opponent is off the ground (0 = level with them).
    else if (k === 'warp') out[k] = { x: px(v.x ?? 0), y: px(v.y ?? 0), behind: !!v.behind, behindIf: v.behindIf ?? null, gap: px(v.gap ?? 70), swap: !!v.swap, stop: px(v.stop ?? 0), face: !!v.face, above: v.above === undefined ? null : px(v.above), aboveAir: v.aboveAir === undefined ? null : px(v.aboveAir) };
    // detonate: { name, collapse }: the fighter's projectiles of that kind burst `collapse` frames from now.
    else if (k === 'detonate') out[k] = typeof v === 'string' ? { name: v, collapse: 0 } : { name: v.name, collapse: v.collapse | 0 };
    // catch: { to, hitstop }: while it lasts, a strike that would hit is caught instead: no damage, the fighter
    // switches to state `to`, the attacker freezes for `hitstop`. Throws, projectiles and supers are not caught.
    else if (k === 'catch') out[k] = v ? { to: v.to, hitstop: v.hitstop | 0 } : null;
    else out[k] = v;
  }
  return out;
}

/**
 * Compile an imported Toska file (any version) plus the shared system data into a runtime character.
 * system = { defaults: fighter-defaults.json, common: common-states.json }
 */
export function compileCharacter(file, system) {
  const t = importToska(file);
  const ch = t.character;
  if (!ch.id) throw new Error('character.id is required');
  const stats = compileStats(system.defaults.stats, ch.stats || {});
  const states = {};
  const sheets = {};
  const commands = [];
  const mechanic = compileMechanic(t.mechanic ?? file.mechanic);
  const exMoves = exVersions(ch.id, t.moves);
  const moveIds = new Set([...t.moves, ...exMoves].map((m) => m.id));
  if (moveIds.size !== t.moves.length + exMoves.length) throw new Error(`${ch.id}: duplicate move ids`);

  // System states, with character overrides (v2 "states") and v1-style sprite moves sharing a system name.
  const content = universalContent(system);
  const common = content.states;
  for (const [name, base] of Object.entries(common)) {
    const over = t.states?.[name] || {};
    const spriteMove = t.moves.find((m) => m.id === name);
    const src = { ...base, ...over, timeline: [...(base.timeline || []), ...(over.timeline || []), ...(spriteMove?.timeline || [])] };
    if (spriteMove?.sprite) sheets[name] = spriteMove.sprite;
    states[name] = compileState(name, src, stats, { sheet: spriteMove?.sprite, sheetName: name });
  }
  // A character's own states (stances, animation branches) can carry art, like moves do.
  for (const [name, src] of Object.entries(t.states || {})) {
    if (states[name]) continue;
    if (src.sprite) sheets[name] = src.sprite;
    states[name] = compileState(name, src, stats, { sheet: src.sprite, sheetName: name });
  }
  const projectiles = compileProjectiles(t.projectiles ?? file.projectiles, system.meter);
  const relic = compileRelic(t.relic ?? file.relic, system.meter);
  if (relic) {
    for (const v of Object.values(relic.vars)) if (!mechanic.vars[v]) throw new Error(`${ch.id}: relic names var ${v}, which the mechanic doesn't declare`);
    for (const p of Object.values(projectiles)) if (p.bend && !projectiles[p.bend.into]) throw new Error(`${ch.id}: projectile ${p.name} bends into unknown projectile ${p.bend.into}`);
  }
  for (const p of Object.values(projectiles)) checkVars(ch.id, p.name, mechanic, [p.move.onHit, p.move.onBlock, p.move.stagger?.when, { vars: p.onEnd || {} }, { vars: p.zone?.markVar ? { [p.zone.markVar]: 1 } : {} }]);

  // Universal moves (burst, Vow). A character's own move with the same id is laid over the universal one, so it
  // can give just the art, or its own boxes and frame data.
  const universal = Object.entries(content.moves).filter(([id]) => !moveIds.has(id)).map(([id, m]) => ({ ...m, id }));
  // Rite moves (the R button): `rite: { gauge: { charges, rechargeFrames, unlimitedWhile } | null, moves: [ids] }`.
  // The ids name moves in the list above whose input uses R. They count as specials unless they say otherwise, and
  // each use spends a charge when there is a gauge.
  const riteSrc = t.rite ?? file.rite ?? null;
  const riteIds = new Set(riteSrc?.moves || []);
  for (const id of riteIds) {
    const m = t.moves.find((x) => x.id === id);
    if (!m) throw new Error(`${ch.id}: rite names unknown move ${id}`);
    if (!String(m.input || '').includes('R')) throw new Error(`${ch.id}: Rite move ${id} must use the R button (its input is "${m.input}")`);
  }
  const rg = riteSrc?.gauge ?? null;
  if (rg && rg.unlimitedWhile && !mechanic.vars[rg.unlimitedWhile]) throw new Error(`${ch.id}: rite gauge names unknown var ${rg.unlimitedWhile}`);
  const rite = riteSrc ? { moves: [...riteIds],
    gauge: rg ? { charges: rg.charges ?? 1, rechargeFrames: rg.rechargeFrames ?? 60, unlimitedWhile: rg.unlimitedWhile ?? null } : null } : null;
  const own = t.moves.map((m) => (content.moves[m.id] ? { ...content.moves[m.id], ...m } : m))
    .map((m) => (riteIds.has(m.id) && !m.kind ? { ...m, kind: 'special' } : m));

  // Moves.
  for (const m of [...own, ...exMoves, ...universal]) {
    if (common[m.id]) continue; // a sprite for a system state, handled above
    const parsed = parseInput(m.input);
    const kind = inferKind(m, parsed);
    const stance = inferStance(m, parsed);
    const move = compileMoveData(m, { kind, meter: system.meter, chord: !!parsed && parsed.buttons.length > 1 });
    checkVars(ch.id, m.id, mechanic, [move.cost, move.requires, move.onHit, move.onBlock, move.onWhiff, move.hitRequires, move.stagger?.when]);
    for (const name of [...(move.oneAtATime || []), move.needsOut].filter(Boolean)) if (!projectiles[name]) throw new Error(`${ch.id}: move ${m.id} names unknown projectile ${name}`);
    if (m.sprite) sheets[m.id] = m.sprite;
    const cancels = [...(m.cancels || []), ...gatlingCancels(m, t.gatlings?.[m.id] ?? t.gatlings?.[m.exOf], kind, move)];
    states[m.id] = compileState(m.id, { ...m, stance, next: m.next ?? (stance === 'air' ? 'fall' : stance === 'crouch' ? 'crouch' : 'idle') }, stats, {
      move, kind, sheet: m.sprite, sheetName: m.id, hitboxes: m.hitboxes, throwboxes: m.throwboxes, hurtboxes: m.hurtboxes, counterHit: m.counterHit, cancels,
    });
    if (parsed) {
      commands.push({
        move: m.id,
        base: m.exOf ?? null, // an EX version: the normal move it is laid over (it goes wherever that move can)
        kind,
        air: parsed.air,
        motion: parsed.motion,
        dir: parsed.dir,
        anyDir: !!m.anyDir, // a plain button that works whatever direction is held (stance follow-ups)
        rite: riteIds.has(m.id) && !!rite.gauge, // spends a charge of the Rite gauge
        oneAtATime: move.oneAtATime,
        needsOut: move.needsOut,
        perJump: move.perJump,
        buttons: parsed.buttons,
        negativeEdge: !!m.negativeEdge,
        neutral: m.neutral !== false, // false: only reachable from a cancel window that names it (chains, follow-ups)
        chase: m.chase ?? null, // cancelled into from a move that HIT, this state starts instead (a warp skips its tell)
        cost: move.cost,
        requires: move.requires,
        perCombo: move.perCombo,
        throw: !!(m.throwboxes && m.throwboxes.length && move.active > 0), // a throw only comes out with the opponent in range
      });
    }
  }

  // Validate references so mistakes show up at load, not mid-match.
  for (const st of Object.values(states)) {
    for (const shots of st.onEnter) {
      for (const s of shots) {
        if (s.type === 'addVar' || s.type === 'setVar') checkVars(ch.id, st.name, mechanic, [{ vars: s.value }]);
        if (s.type === 'meter') s.value = Math.round(s.value * (system.meter?.unit ?? 1)); // written in Devotion points
        if (s.type === 'gauge' && !mechanic.gauge) throw new Error(`${ch.id}: ${st.name} changes the gauge, but the mechanic has none`);
        if (s.type === 'spawn' && !projectiles[s.value?.name ?? s.value]) throw new Error(`${ch.id}: ${st.name} spawns unknown projectile ${s.value?.name ?? s.value}`);
        if (s.type === 'relic' && !relic?.actions[s.value]) throw new Error(`${ch.id}: ${st.name} names relic action ${s.value}, which the relic doesn't have`);
        if (s.type === 'endProjectile' && !projectiles[s.value]) throw new Error(`${ch.id}: ${st.name} ends unknown projectile ${s.value}`);
        if (s.type === 'detonate' && !projectiles[s.value.name]?.burst) throw new Error(`${ch.id}: ${st.name} detonates ${s.value.name}, which is not a burst projectile`);
        if (s.type === 'warp' && s.value.behindIf && !mechanic.vars[s.value.behindIf]) throw new Error(`${ch.id}: ${st.name} warps by unknown var ${s.value.behindIf}`);
      }
    }
    for (const to of [st.next, st.timeout ? st.timeoutTo : null, st.onBack, st.move?.onHitState, st.move?.onBlockState, ...st.nextIf.map((b) => b.to)]) {
      if (to && !states[to]) throw new Error(`${ch.id}: state ${st.name} goes to unknown state ${to}`);
    }
    for (const b of st.nextIf) checkVars(ch.id, st.name, mechanic, [b.when]);
  }
  for (const p of Object.values(projectiles)) if (p.move.varHit && !mechanic.vars[p.move.varHit.var]) throw new Error(`${ch.id}: projectile ${p.name} reads var "${p.move.varHit.var}", which the mechanic doesn't declare`);
  for (const st of Object.values(states)) if (st.move?.varHit && !mechanic.vars[st.move.varHit.var]) throw new Error(`${ch.id}: move ${st.name} reads var "${st.move.varHit.var}", which the mechanic doesn't declare`);
  if (relic?.catch.state && !states[relic.catch.state]) throw new Error(`${ch.id}: the relic's catch state ${relic.catch.state} does not exist`);
  for (const c of commands) if (c.chase && !states[c.chase]) throw new Error(`${ch.id}: move ${c.move} chases into unknown state ${c.chase}`);
  for (const p of Object.values(projectiles)) if (p.ownerOnHit && !states[p.ownerOnHit]) throw new Error(`${ch.id}: projectile ${p.name} sends its owner to unknown state ${p.ownerOnHit}`);
  for (const st of Object.values(states)) {
    for (const c of st.cancels) {
      for (const into of c.into) {
        if (!into.startsWith('#') && !states[into]) throw new Error(`${ch.id}: ${st.name} cancels into unknown move ${into}`);
      }
    }
  }

  // Priority: supers, then specials (longer motions first; chords like EX before single buttons), then
  // exact-direction normals, then the rest.
  commands.sort((a, b) =>
    KIND_RANK[b.kind] - KIND_RANK[a.kind] ||
    (b.motion?.length ?? 0) - (a.motion?.length ?? 0) ||
    b.buttons.length - a.buttons.length ||
    dirRank(a.dir) - dirRank(b.dir));

  // EX upgrades: a chord command (236LS) can take over its one-button version (236L) during the chord
  // window, because a player's two buttons rarely land on the very same frame.
  const upgrades = {};
  for (const c of commands) {
    if (c.buttons.length < 2) continue;
    for (const d of commands) {
      if (d === c || d.buttons.length !== 1 || d.motion !== c.motion || d.air !== c.air) continue;
      // Same direction; or a two-button move that takes any direction (Vow) over a plain normal.
      if (d.dir !== c.dir && !(c.anyDir && d.kind === 'normal' && d.neutral && !d.anyDir)) continue;
      if (c.buttons.includes(d.buttons)) (upgrades[d.move] ||= []).push(c);
    }
  }

  // S next to an attack button. `sOnly`: moves started by S alone with no motion (the launchers); `attackOnly`:
  // moves started by one attack button. fighter.js uses them so "attack + S" never reads as the S move.
  const sOnly = new Set(commands.filter((c) => c.buttons === 'S' && !c.motion && c.neutral).map((c) => c.move));
  const attackOnly = new Set(commands.filter((c) => c.buttons.length === 1 && 'LMH'.includes(c.buttons)).map((c) => c.move));

  const meterMax = stats.units.meterBars * (system.meter?.barSize ?? 10000);
  const meterStart = stats.units.meterStart * (system.meter?.unit ?? 1);
  const devotion = compileArchetype(system.meter, t.meter ?? file.meter, ch.id);
  return { id: ch.id, name: ch.name ?? ch.id, version: t.version, upgradedFrom: t.upgradedFrom ?? null, stats: stats.units, states, commands,
    sheets, mechanic, meterMax, meterStart, devotion, rite, upgrades, sOnly, attackOnly, projectiles, relic, palettes: compilePalettes(ch.id, t.palettes),
    effects: t.effects ?? file.effects ?? {},
    art: t.art ?? file.art ?? {} }; // drawing only: carried-over drawings, the guard pose, the lantern's moon phase // drawing only: named sheet effects for `fx` cues
}

// Placeholder colours for characters that don't list any (index 0 body, 1 limbs, 2 dark detail).
const DEFAULT_PALETTES = {
  base: ['#d9534f', '#ff8a7a', '#7a2622'],
  colors: [
    { name: 'Red', colors: ['#d9534f', '#ff8a7a', '#7a2622'] },
    { name: 'Blue', colors: ['#4f8fd9', '#8ac2ff', '#223f7a'] },
    { name: 'Green', colors: ['#4fae6a', '#8de0a2', '#1f5a33'] },
    { name: 'Gold', colors: ['#c9a23a', '#f1d27a', '#5f4a12'] },
  ],
};

/**
 * Palettes (presentation data: the game never reads them). Sprites are drawn in the `base` colours only (an
 * indexed palette); each entry in `colors` replaces base colour i with its colour i. Every set must have exactly
 * as many colours as `base`, all "#rrggbb".
 */
function compilePalettes(id, src) {
  const p = src ?? DEFAULT_PALETTES;
  const hex = /^#[0-9a-fA-F]{6}$/;
  if (!Array.isArray(p.base) || !p.base.length || !p.base.every((c) => hex.test(c))) throw new Error(`${id}: palettes.base must be a list of "#rrggbb" colours`);
  if (!Array.isArray(p.colors) || !p.colors.length) throw new Error(`${id}: palettes.colors needs at least one colour set`);
  for (const [i, set] of p.colors.entries()) {
    if (!Array.isArray(set.colors) || set.colors.length !== p.base.length || !set.colors.every((c) => hex.test(c))) {
      throw new Error(`${id}: palette ${i + 1} (${set.name ?? 'unnamed'}) must have ${p.base.length} "#rrggbb" colours, like base`);
    }
  }
  return { base: p.base.map((c) => c.toLowerCase()), colors: p.colors.map((s, i) => ({ name: s.name ?? `Colour ${i + 1}`, colors: s.colors.map((c) => c.toLowerCase()) })) };
}

/**
 * Turn a move's gatling list and cancel flags into cancel windows. The window opens on the first active frame and
 * lasts to the end of the move (cancelTo overrides); it only matters after contact, because each needs a hit or block.
 *   gatling: ["5M", "2M"] (on hit or block) or { into: [...], on: ["hit"] }
 *   specialCancel: normals default to true (on hit or block); "hit" = on hit only; false = never
 *   superCancel: defaults to specialCancel
 *   jumpCancel: "hit" | "block" | true (both) | false (default)
 *   a hard launch (launch: "hard", or launcher: true) adds a super-jump cancel on hit
 *   a soft launch adds a jump cancel on hit, unless the move sets jumpCancel itself
 */
function gatlingCancels(m, gatling, kind, move) {
  const from = m.cancelFrom ?? move.startup - 1;
  const to = m.cancelTo ?? move.startup - 1 + move.active + move.recovery - 1;
  const on = (flag, dflt) => (flag === undefined ? dflt : flag === true ? ['hit', 'block'] : flag === false ? [] : [flag].flat());
  const out = [];
  if (gatling) {
    const g = Array.isArray(gatling) ? { into: gatling } : gatling;
    if (g.into.length) out.push({ from, to, into: g.into, on: g.on || ['hit', 'block'] });
  }
  const isNormal = kind === 'normal';
  const sp = on(m.specialCancel, isNormal ? ['hit', 'block'] : []);
  if (sp.length) out.push({ from, to, into: ['#special'], on: sp });
  const su = on(m.superCancel, kind === 'super' ? [] : sp.length ? sp : ['hit', 'block']);
  if (su.length && kind !== 'super') out.push({ from, to, into: ['#super'], on: su });
  const jc = on(m.jumpCancel, move.launchType === 'soft' ? ['hit'] : []);
  if (jc.length) out.push({ from, to, into: ['#jump'], on: jc });
  if (move.launchType === 'hard') out.push({ from, to, into: ['#superjump'], on: ['hit'] });
  return out;
}

/** Every var a move mentions must be declared in the mechanic, so typos fail at load. */
function checkVars(charId, moveId, mechanic, list) {
  for (const r of list) {
    for (const k of Object.keys(r?.vars || {})) {
      if (!mechanic.vars[k]) throw new Error(`${charId}: move ${moveId} uses var "${k}", which the mechanic doesn't declare`);
    }
  }
}

/** Exact single directions beat the broad 5 (any non-down) and 2 (any down). */
const dirRank = (d) => (d === null ? 0 : d === '5' || d === '2' ? 2 : 1);

/** The frame table entry for a fighter's current state and frame. */
export function frameOf(def, stateName, frame) {
  const st = def.states[stateName];
  return st.frames[frame < st.frames.length ? frame : st.frames.length - 1];
}
