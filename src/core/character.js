// Characters: import a Toska file (any supported version), then compile it into the runtime definition the
// simulation reads. The definition is static data; it never lives in the game state (only names point into it).
// Format reference: docs/toska-format.md.

import { px } from './fixed.js';

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

const BUTTON_LETTERS = 'LMHS';

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

const KIND_RANK = { super: 3, special: 2, normal: 1 };

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
const FRAME_STATS = new Set(['health', 'prejump', 'landing', 'throwBreak', 'airTech', 'airTechInvuln', 'dashFrames', 'dashCancel', 'dashRecovery',
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

const LASTING = ['sprite', 'hit', 'hitProps', 'hurt', 'push', 'throw', 'throwHurt', 'invuln', 'armor', 'counter', 'gravity'];
const ONE_SHOT = ['vel', 'addVel', 'velScale', 'sound', 'fx', 'jump', 'superFlash', 'meter', 'gauge', 'addVar', 'setVar'];

const STANCE_BOX = { stand: ['standHurt', 'standPush'], crouch: ['crouchHurt', 'crouchPush'], air: ['airHurt', 'airPush'] };

/** Resource changes: { meter, gauge, vars: { name: n } } -> the same with defaults filled in. */
function resources(r) {
  if (!r) return null;
  return { meter: r.meter | 0, gauge: r.gauge | 0, vars: { ...(r.vars || {}) } };
}

/** Frame data of a move, converted to units (distances) and frames. ctx = { kind, meter (system meter.json) }. */
function compileMoveData(m, ctx = {}) {
  const kind = ctx.kind ?? 'normal';
  const M = ctx.meter;
  const ex = m.ex ?? (kind === 'special' && ctx.chord === true);
  const gain = M ? { ...(M.gain[kind] ?? M.gain.normal), ...(m.meter || {}) } : { hit: 0, block: 0, whiff: 0 };
  const cost = resources(m.cost) ?? { meter: 0, gauge: 0, vars: {} };
  if (m.meterCost !== undefined) cost.meter = m.meterCost;
  else if (!m.cost?.meter && M) cost.meter = kind === 'super' ? M.superCost : ex ? M.exCost : 0;
  return {
    kind,
    ex: !!ex,
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
    guard: m.guard ?? 'mid',
    reach: px(m.reach ?? 0),
    chip: m.chip ?? 0,
    blockHitstop: m.blockHitstop ?? m.hitstop ?? 0,
    airBlockable: m.airBlockable ?? true,
    knockdown: !!m.knockdown,
    launch: m.launch ? { x: px(m.launch.x ?? 0), y: px(m.launch.y ?? 0) } : null,
    airHit: m.airHit ? { x: px(m.airHit.x ?? 0), y: px(m.airHit.y ?? 0) } : null,
    throwSwap: !!m.throwSwap,
    throwDistance: px(m.throwDistance ?? 70),
    // Combo (Phase 5). null = use the default in data/system/combo.json.
    starterProration: m.starterProration ?? null,
    comboProration: m.comboProration ?? null,
    untech: m.untech ?? null,
    launcher: !!m.launcher,
    wallBounce: m.wallBounce ? { x: px(m.wallBounce.x ?? 0), y: px(m.wallBounce.y ?? 0) } : null,
    groundBounce: m.groundBounce ? { y: px(m.groundBounce.y ?? 0) } : null,
    bounceLimit: m.bounceLimit ?? null,
    // Meter and the character mechanic (Phase 8).
    meterGain: { hit: gain.hit | 0, block: gain.block | 0, whiff: gain.whiff | 0 },
    cost, // paid when the move starts: { meter, gauge, vars }
    requires: m.requires ? { meter: m.requires.meter | 0, gauge: m.requires.gauge | 0, vars: { ...(m.requires.vars || {}) } } : null,
    onHit: resources(m.onHit),
    onBlock: resources(m.onBlock),
    onWhiff: resources(m.onWhiff),
  };
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
    vars[k] = { start: v.start ?? 0, min: v.min ?? 0, max: v.max ?? 99, perFrame: v.perFrame ?? 0, label: v.label ?? k, show: v.show ?? true };
  }
  const modifiers = (src.modifiers || []).map((x) => ({ when: x.when || {}, damagePct: x.damagePct ?? 10000 }));
  return { name: src.name ?? null, gauge, vars, modifiers };
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
  if (src.stun) duration = 1;
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
    if (extra.hitboxes && m.active > 0) {
      events.push({ at: first, hit: boxes(extra.hitboxes) });
      events.push({ at: first + m.active, hit: [] });
    }
    if (extra.throwboxes && m.active > 0) {
      events.push({ at: first, throw: boxes(extra.throwboxes) });
      events.push({ at: first + m.active, throw: [] });
    }
    const ch = extra.counterHit ?? 'all';
    events.push({ at: 0, counter: ch !== 'none' });
    if (ch === 'startup+active') events.push({ at: first + m.active, counter: false });
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

  const cur = { sprite: null, hit: [], hitProps: null, hurt: [], push: [], throw: [], throwHurt: [], invuln: { strike: false, throw: false }, armor: 0, counter: false, gravity: stance === 'air' };
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
      counter: !!cur.counter,
      gravity: !!cur.gravity,
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
    techable: !!src.techable,
    next: src.next ?? (stance === 'air' ? 'fall' : 'idle'),
    landTo: src.landTo ?? 'land',
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
  const moveIds = new Set(t.moves.map((m) => m.id));
  if (moveIds.size !== t.moves.length) throw new Error(`${ch.id}: duplicate move ids`);

  // System states, with character overrides (v2 "states") and v1-style sprite moves sharing a system name.
  const common = system.common.states;
  for (const [name, base] of Object.entries(common)) {
    const over = t.states?.[name] || {};
    const spriteMove = t.moves.find((m) => m.id === name);
    const src = { ...base, ...over, timeline: [...(base.timeline || []), ...(over.timeline || []), ...(spriteMove?.timeline || [])] };
    if (spriteMove?.sprite) sheets[name] = spriteMove.sprite;
    states[name] = compileState(name, src, stats, { sheet: spriteMove?.sprite, sheetName: name });
  }
  for (const [name, src] of Object.entries(t.states || {})) {
    if (!states[name]) states[name] = compileState(name, src, stats, {});
  }

  // Universal moves (burst), unless the character defines its own with the same id.
  const universal = Object.entries(system.burst?.moves || {}).filter(([id]) => !moveIds.has(id))
    .map(([id, m]) => ({ ...m, id, kind: 'burst', input: undefined }));

  // Moves.
  for (const m of [...t.moves, ...universal]) {
    if (common[m.id]) continue; // a sprite for a system state, handled above
    const parsed = parseInput(m.input);
    const kind = inferKind(m, parsed);
    const stance = inferStance(m, parsed);
    const move = compileMoveData(m, { kind, meter: system.meter, chord: !!parsed && parsed.buttons.length > 1 });
    checkVars(ch.id, m.id, mechanic, [move.cost, move.requires, move.onHit, move.onBlock, move.onWhiff]);
    if (m.sprite) sheets[m.id] = m.sprite;
    const cancels = [...(m.cancels || []), ...gatlingCancels(m, t.gatlings?.[m.id], kind, move)];
    states[m.id] = compileState(m.id, { ...m, stance, next: m.next ?? (stance === 'air' ? 'fall' : stance === 'crouch' ? 'crouch' : 'idle') }, stats, {
      move, kind, sheet: m.sprite, sheetName: m.id, hitboxes: m.hitboxes, throwboxes: m.throwboxes, hurtboxes: m.hurtboxes, counterHit: m.counterHit, cancels,
    });
    if (parsed) {
      commands.push({
        move: m.id,
        kind,
        air: parsed.air,
        motion: parsed.motion,
        dir: parsed.dir,
        buttons: parsed.buttons,
        negativeEdge: !!m.negativeEdge,
        neutral: m.neutral !== false, // false: only reachable from a cancel window that names it (chains, follow-ups)
        cost: move.cost,
        requires: move.requires,
      });
    }
  }

  // Validate references so mistakes show up at load, not mid-match.
  for (const st of Object.values(states)) {
    for (const shots of st.onEnter) {
      for (const s of shots) {
        if (s.type === 'addVar' || s.type === 'setVar') checkVars(ch.id, st.name, mechanic, [{ vars: s.value }]);
        if (s.type === 'gauge' && !mechanic.gauge) throw new Error(`${ch.id}: ${st.name} changes the gauge, but the mechanic has none`);
      }
    }
    if (!states[st.next]) throw new Error(`${ch.id}: state ${st.name} goes to unknown state ${st.next}`);
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

  // EX upgrades: a chord command (236LM) can take over its one-button version (236L or 236M) during the chord
  // window, because a player's two buttons rarely land on the very same frame.
  const upgrades = {};
  for (const c of commands) {
    if (c.buttons.length < 2) continue;
    for (const d of commands) {
      if (d === c || d.buttons.length !== 1 || d.motion !== c.motion || d.dir !== c.dir || d.air !== c.air) continue;
      if (c.buttons.includes(d.buttons)) (upgrades[d.move] ||= []).push(c);
    }
  }

  const meterMax = stats.units.meterBars * (system.meter?.barSize ?? 10000);
  return { id: ch.id, name: ch.name ?? ch.id, version: t.version, upgradedFrom: t.upgradedFrom ?? null, stats: stats.units, states, commands,
    sheets, mechanic, meterMax, upgrades };
}

/**
 * Turn a move's gatling list and cancel flags into cancel windows. The window opens on the first active frame and
 * lasts to the end of the move (cancelTo overrides); it only matters after contact, because each needs a hit or block.
 *   gatling: ["5M", "2M"] (on hit or block) or { into: [...], on: ["hit"] }
 *   specialCancel: normals default to true (on hit or block); "hit" = on hit only; false = never
 *   superCancel: defaults to specialCancel
 *   jumpCancel: "hit" | "block" | true (both) | false (default)
 *   launcher: true adds a super-jump cancel on hit
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
  const jc = on(m.jumpCancel, []);
  if (jc.length) out.push({ from, to, into: ['#jump'], on: jc });
  if (m.launcher) out.push({ from, to, into: ['#superjump'], on: ['hit'] });
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
