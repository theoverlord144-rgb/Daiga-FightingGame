// The move editor's model: no drawing, no browser. Given a character's file (the raw Toska JSON) it answers "what
// is this move's damage / pushback / launch, and where is that written?" and edits that place. It reads the file
// the way compileMoveData does (src/core/character.js); tests/move-editor.test.js checks the two agree.
import { universalContent } from '../core/systems.js';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const moveId = (m) => m.id ?? m.input ?? m.name;
export const PROJ = 'proj:'; // a list entry for a projectile: "proj:<name>"

/**
 * Every setting the editor offers. key: where it lives in the move ('launch.x' = inside `launch`).
 * type: 'int' (default), 'choice' or 'bool'. step / big: what one click and one Shift-click change.
 * only: 'projectile' = projectiles only, 'move' = not on projectiles.
 */
export const FIELDS = [
  { key: 'startup', group: 'timing', label: 'Startup', unit: 'f', min: 1, max: 120, fallback: 1, only: 'move', help: 'Frames until it can hit, counting the first hitting frame. The drawings and timed events move with it.' },
  { key: 'active', group: 'timing', label: 'Active', unit: 'f', min: 0, max: 120, only: 'move', help: 'Frames the hitbox is out.' },
  { key: 'recovery', group: 'timing', label: 'Recovery', unit: 'f', min: 0, max: 240, only: 'move', help: 'Frames after the hitbox is gone before the fighter can act.' },
  { key: 'damage', group: 'hit', label: 'Damage', min: 0, max: 20000, step: 10, big: 100 },
  { key: 'hitstop', group: 'hit', label: 'Freeze on hit', unit: 'f', min: 0, max: 60, help: 'Hitstop: both fighters freeze this many frames when it lands.' },
  { key: 'hitstun', group: 'hit', label: 'Hitstun', unit: 'f', min: 0, max: 240, help: 'How long a grounded opponent is stuck after the hit.' },
  { key: 'pushbackHit', group: 'hit', label: 'Push opponent', unit: 'px', min: 0, max: 800, step: 2, big: 10, help: 'How far the opponent slides back on hit (not when it launches).' },
  { key: 'recoil', group: 'hit', label: 'Push attacker', unit: 'px', min: 0, max: 800, step: 2, big: 10, only: 'move', help: 'How far the attacker slides back whenever it touches (hit or block).' },
  { key: 'knockdown', group: 'hit', label: 'Knocks down', type: 'bool', help: 'A grounded opponent is knocked off their feet (the hard knockdown). The older way to write Reaction: hardKD.' },
  { key: 'hitReaction', group: 'hit', label: 'Reaction', type: 'choice', unset: true, choices: ['normal', 'slide', 'spin', 'tumble', 'crumple', 'softKD', 'hardKD'], help: 'The state the opponent goes into. slide: skids along the ground, still airborne for combos. spin / tumble: air states with their own arc (they pop a grounded opponent up). crumple: slow fall forward. softKD: a knockdown they can get up from early. hardKD: they lie still, and an OTG move can pick them up. Numbers: data/system/combo.json hitStates.' },
  { key: 'airReaction', group: 'hit', label: 'Reaction in the air', type: 'choice', unset: true, choices: ['same', 'normal', 'slide', 'spin', 'tumble', 'crumple', 'softKD', 'hardKD'], help: 'The reaction when the opponent is already in the air. same = the one above.' },
  { key: 'counterReaction', group: 'hit', label: 'Reaction on counter', type: 'choice', unset: true, choices: ['same', 'normal', 'slide', 'spin', 'tumble', 'crumple', 'softKD', 'hardKD'], help: 'The reaction when the hit is a counter hit or a Witness counter. same = the usual one.' },
  { key: 'otg', group: 'hit', label: 'Hits the floor (OTG)', type: 'bool', help: 'Yes: it can hit an opponent lying in a hard knockdown: half damage, a small lift, once per combo.' },
  { key: 'hitsAirborne', group: 'hit', label: 'Hits airborne', type: 'bool', fallback: true, help: 'No: the hit passes through an opponent who is in the air (a wave along the ground). The hitbox still has to reach them: make it taller in the box editor.' },

  { key: 'blockstun', group: 'block', label: 'Blockstun', unit: 'f', min: 0, max: 240, help: 'How long the opponent is stuck after blocking it.' },
  { key: 'blockHitstop', group: 'block', label: 'Freeze on block', unit: 'f', min: 0, max: 60, inherit: 'hitstop', help: 'Hitstop when blocked. Left alone, it is the same as on hit.' },
  { key: 'pushbackBlock', group: 'block', label: 'Push opponent', unit: 'px', min: 0, max: 800, step: 2, big: 10, help: 'How far the opponent slides back when they block it.' },
  { key: 'selfPushback', group: 'block', label: 'Corner push', unit: 'px', min: 0, max: 800, step: 2, big: 10, only: 'move', help: 'When the opponent is in the corner the attacker slides back instead: this far (0 = the same as the opponent would have).' },
  { key: 'chip', group: 'block', label: 'Chip damage', min: 0, max: 20000, step: 5, big: 50, help: 'Damage dealt through a block.' },
  { key: 'guard', group: 'block', label: 'Blocked', type: 'choice', choices: ['mid', 'low', 'high', 'unblockable'], names: { mid: 'either way', low: 'crouching only', high: 'standing only', unblockable: 'cannot be' } },

  { key: 'launch.type', group: 'launch', label: 'Launch', type: 'choice', choices: ['none', 'soft', 'hard'], help: 'Soft: a short pop (jump cancel on hit). Hard: the big launcher, one per combo.' },
  { key: 'launch.x', group: 'launch', label: 'Launch forward', min: -40, max: 40, help: 'Speed away from the attacker, px a frame. Negative pulls toward the attacker.' },
  { key: 'launch.y', group: 'launch', label: 'Launch up', min: 0, max: 60, help: 'Speed upward, px a frame. More = higher.' },
  { key: 'airHit.x', group: 'launch', label: 'Air hit forward', min: -40, max: 40, help: 'How an opponent already in the air is knocked away: speed away from the attacker.' },
  { key: 'airHit.y', group: 'launch', label: 'Air hit up', min: -40, max: 60, help: 'How an opponent already in the air is knocked: speed upward (negative spikes them down).' },
  { key: 'untech', group: 'launch', label: 'No air tech for', unit: 'f', min: 0, max: 240, inherit: 'hitstun', help: 'Frames an airborne opponent cannot recover after this hit. Left alone: the same as hitstun.' },
  { key: 'juggleCost', group: 'launch', label: 'Juggle cost', min: 0, max: 20, system: true, help: 'What this hit adds to the combo\'s juggle total. Left alone: the system default.' },

  { key: 'speed', group: 'flight', label: 'Speed forward', min: -60, max: 60, only: 'projectile', help: 'px a frame.' },
  { key: 'speedY', group: 'flight', label: 'Speed up', min: -60, max: 60, only: 'projectile', help: 'px a frame; negative goes down.' },
  { key: 'lifetime', group: 'flight', label: 'Lasts', unit: 'f', min: 1, max: 600, fallback: 600, only: 'projectile', help: 'Frames before it vanishes on its own.' },
  { key: 'spawn.0', group: 'flight', label: 'Starts forward', unit: 'px', min: -400, max: 600, step: 2, big: 10, only: 'projectile' },
  { key: 'spawn.1', group: 'flight', label: 'Starts up', unit: 'px', min: -400, max: 600, step: 2, big: 10, only: 'projectile', help: 'Height above the fighter (or above the floor, for one that erupts from the ground).' },
  { key: 'place', group: 'flight', label: 'Appears', type: 'choice', choices: ['front', 'opponent'], names: { front: 'in front', opponent: 'at opponent' }, only: 'projectile', help: 'Where it comes out. In front of him: "Starts forward" px from the fighter. Under the opponent: wherever the opponent stands on that frame, at any distance. Written into every move that releases it.' },
];
export const fieldOf = (key) => FIELDS.find((f) => f.key === key);

/**
 * Where a list entry's settings live. Returns { kind, write, layers, why }:
 *   kind:   'move' | 'ex' | 'projectile' | 'none'
 *   write:  the object in `raw` an edit goes into (null = not editable here; `why` says why)
 *   layers: objects read in order for a value (the EX overrides, then the move; a character's entry, then the
 *           universal move it is laid over)
 */
export function settingsTarget(raw, system, name) {
  if (name.startsWith(PROJ)) {
    const p = raw.projectiles?.[name.slice(PROJ.length)];
    return p ? { kind: 'projectile', write: p, layers: [p], name: name.slice(PROJ.length) } : { kind: 'none', write: null, layers: [], why: 'No such projectile.' };
  }
  const uni = universalContent(system);
  if (uni.states[name]) return { kind: 'none', write: null, layers: [], why: 'This is a state, not an attack: it has no hit settings.' };
  const own = raw.moves.find((m) => moveId(m) === name);
  if (own) return { kind: 'move', write: own, layers: uni.moves[name] ? [own, uni.moves[name]] : [own] };
  if (name.endsWith('_ex')) {
    const base = raw.moves.find((m) => moveId(m) === name.slice(0, -3) && m.ex && typeof m.ex === 'object');
    if (base) return { kind: 'ex', write: base.ex, layers: [base.ex, base] };
  }
  if (uni.moves[name]) return { kind: 'none', write: null, layers: [uni.moves[name]], why: 'This move is shared by every character (data/system).' };
  return { kind: 'none', write: null, layers: [], why: 'This is a state, not an attack: it has no hit settings.' };
}

/** Does this setting apply to this kind of entry? */
export const applies = (field, target) => target.kind !== 'none' && (!field.only || (field.only === 'projectile') === (target.kind === 'projectile'));

const find = (layers, key) => layers.find((l) => l && key in l);

/** Every timeline event in the file (moves and their EX versions) that releases this projectile. */
function spawnEvents(raw, name) {
  const out = [];
  for (const m of raw.moves || []) for (const list of [m.timeline, m.ex && typeof m.ex === 'object' ? m.ex.timeline : null]) {
    for (const e of list || []) if (e.spawn !== undefined && (typeof e.spawn === 'string' ? e.spawn : e.spawn?.name) === name) out.push(e);
  }
  return out;
}
const underOpponent = (e) => typeof e.spawn === 'object' && e.spawn.under === 'opponent';

/** The launch as written, resolved the way the game does: { type: 'none' | 'soft' | 'hard', own: {x, y} | null }. */
function launchOf(layers) {
  const src = find(layers, 'launch')?.launch;
  if (!src) return { type: 'none', own: null };
  if (typeof src === 'string') return { type: src, own: null };
  const type = src.type ?? (find(layers, 'launcher')?.launcher ? 'hard' : 'soft');
  return { type, own: src.x !== undefined || src.y !== undefined ? { x: src.x ?? 0, y: src.y ?? 0 } : null };
}

/**
 * A setting's value now. rules = { combo, battle } (data/system/combo.json and battle.json: the defaults).
 * Returns { value, own, off }: own = written for this move in this file (not inherited, not a default);
 * off = the setting does nothing right now (launch speeds of a move that doesn't launch).
 */
export function readSetting(raw, target, key, rules) {
  const { layers, write } = target;
  const field = fieldOf(key);
  if (key.startsWith('launch.')) {
    const l = launchOf(layers);
    const mine = !!write && 'launch' in write;
    if (key === 'launch.type') return { value: l.type, own: mine };
    const sys = l.type === 'hard' ? rules.combo.hardLaunch : rules.combo.softLaunch;
    const axis = key.slice(7);
    return { value: l.own ? l.own[axis] : sys?.[axis] ?? 0, own: mine && !!l.own, off: l.type === 'none' };
  }
  if (key.startsWith('airHit.')) {
    const at = find(layers, 'airHit');
    const axis = key.slice(7);
    return { value: at?.airHit ? at.airHit[axis] ?? 0 : rules.battle.airHit[axis], own: !!at?.airHit && at === write };
  }
  if (key.startsWith('spawn.')) {
    const at = find(layers, 'spawn');
    return { value: at?.spawn?.[Number(key.slice(6))] ?? 0, own: !!at };
  }
  if (key === 'place') {
    // Where it appears is written in the moves that release it, not in the projectile.
    const evs = spawnEvents(raw, target.name);
    const under = evs.length > 0 && evs.every(underOpponent);
    return { value: under ? 'opponent' : 'front', own: under, off: !evs.length };
  }
  const at = find(layers, key);
  if (at && at[key] !== null && at[key] !== undefined) return { value: field.type === 'bool' ? !!at[key] : at[key], own: at === write };
  if (field.type === 'bool') return { value: !!field.fallback, own: false };
  if (field.type === 'choice') return { value: field.choices[0], own: false };
  if (field.inherit) return { value: readSetting(raw, target, field.inherit, rules).value, own: false };
  if (key === 'juggleCost') {
    const launches = launchOf(layers).type !== 'none';
    return { value: launches ? rules.combo.softLaunchCost ?? 3 : rules.combo.juggleCost ?? 1, own: false };
  }
  return { value: field.fallback ?? 0, own: false };
}

const clamp = (field, v) => Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, Math.round(v)));

const TIMING = ['startup', 'active', 'recovery'];
const sum = (list) => list.reduce((a, b) => a + b, 0);

/**
 * Change a move's startup, active or recovery, and keep everything that is timed to it in step: the drawings
 * (the one on screen at the end of that part is held longer or shorter), timeline events, cancel windows.
 * Frames are added or taken at the END of the part that changes, so everything after it moves by the same amount.
 */
export function retime(target, key, value) {
  const w = target.write;
  if (target.kind !== 'move') throw new Error(target.kind === 'ex' ? 'An EX version follows the timing of its normal version: change it there.' : 'Only a move has startup, active and recovery.');
  if (target.layers.length > 1 && !(key in w)) throw new Error('This move is shared by every character: its timing is set in data/system.');
  if (w.duration !== undefined) throw new Error('This move sets its own length (duration) in the file, so its timing is not editable here.');
  const field = fieldOf(key);
  const now = { startup: w.startup ?? 1, active: w.active ?? 0, recovery: w.recovery ?? 0 };
  const next = Math.max(field.min, Math.min(field.max, Math.round(value)));
  const d = next - now[key];
  if (!d) return;
  const total = now.startup - 1 + now.active + now.recovery;
  if (total + d < 1) throw new Error('A move needs at least one frame.');
  // Everything at or after this frame moves by d.
  const pivot = key === 'startup' ? now.startup - 1 : key === 'active' ? now.startup - 1 + now.active : total;
  const holds = w.sprite?.holds;
  if (Array.isArray(holds) && holds.length && sum(holds) === total) {
    const next = [...holds];
    // The drawing on screen on the last frame before the pivot.
    let at = 0;
    for (let t = 0; at < next.length - 1 && t + next[at] <= Math.max(0, pivot - 1); at++) t += next[at];
    if (d > 0) next[at] += d;
    else {
      // Shorten that drawing; if it runs out, the ones before it, then the ones after (each keeps one frame).
      let left = -d;
      for (const i of [...Array(at + 1).keys()].reverse().concat([...Array(next.length - at - 1).keys()].map((k) => k + at + 1))) {
        const take = Math.min(left, next[i] - 1);
        next[i] -= take;
        left -= take;
        if (!left) break;
      }
      if (left) throw new Error(`Too short for its ${next.length} drawings: each needs at least one frame.`);
    }
    w.sprite.holds = next;
  }
  const last = Math.max(0, total + d - 1);
  const move = (n) => (typeof n === 'number' && n >= pivot ? Math.max(0, Math.min(last, n + d)) : n);
  const shift = (list, keys) => {
    for (const e of list || []) {
      // A from / for range that spans the changed part grows or shrinks with it.
      if (typeof e.for === 'number' && typeof e.from === 'number' && e.from < pivot && e.from + e.for > pivot) e.for = Math.max(1, e.for + d);
      for (const k of keys) if (k in e) e[k] = move(e[k]);
    }
  };
  shift(w.timeline, ['at', 'from', 'to']);
  shift(w.cancels, ['from', 'to']);
  if (w.ex && typeof w.ex === 'object' && !TIMING.some((k) => k in w.ex)) { shift(w.ex.timeline, ['at', 'from', 'to']); shift(w.ex.cancels, ['from', 'to']); }
  for (const k of ['cancelFrom', 'cancelTo']) if (k in w) w[k] = move(w[k]);
  w[key] = next;
}

/** Write a setting (changes `raw` through target.write). */
export function writeSetting(raw, target, key, value, rules) {
  const w = target.write;
  if (!w) throw new Error(target.why || 'Not editable here');
  const field = fieldOf(key);
  if (!field || !applies(field, target)) throw new Error(`${key} is not a setting of this entry`);
  if (TIMING.includes(key)) return retime(target, key, value);
  if (key === 'launch.type') {
    if (!field.choices.includes(value)) throw new Error(`Launch must be one of ${field.choices.join(', ')}`);
    const l = launchOf(target.layers);
    if (value === 'none') {
      // An EX version, or a character's entry over a universal move, must say "no launch" out loud.
      const below = target.layers.slice(1).some((x) => x && x.launch);
      if (below) w.launch = null; else delete w.launch;
      delete w.launcher;
    } else {
      w.launch = l.own ? { type: value, x: l.own.x, y: l.own.y } : value; // plain "soft" / "hard" follows the system's speeds
      delete w.launcher; // the older way to say hard; the type is written out now
    }
    return;
  }
  if (key.startsWith('launch.')) {
    const l = launchOf(target.layers);
    if (l.type === 'none') throw new Error('This move does not launch. Set Launch to soft or hard first.');
    const now = { x: readSetting(raw, target, 'launch.x', rules).value, y: readSetting(raw, target, 'launch.y', rules).value };
    now[key.slice(7)] = clamp(field, value);
    w.launch = { type: l.type, x: now.x, y: now.y };
    delete w.launcher;
    return;
  }
  if (key.startsWith('airHit.')) {
    const now = { x: readSetting(raw, target, 'airHit.x', rules).value, y: readSetting(raw, target, 'airHit.y', rules).value };
    now[key.slice(7)] = clamp(field, value);
    w.airHit = now;
    return;
  }
  if (key.startsWith('spawn.')) {
    const now = clone(w.spawn ?? [0, 0]);
    now[Number(key.slice(6))] = clamp(field, value);
    w.spawn = now;
    return;
  }
  if (key === 'place') {
    if (!field.choices.includes(value)) throw new Error(`${field.label} must be one of ${field.choices.join(', ')}`);
    const evs = spawnEvents(raw, target.name);
    if (!evs.length) throw new Error('No move in this file releases this projectile.');
    for (const e of evs) {
      if (value === 'opponent') e.spawn = typeof e.spawn === 'string' ? { name: e.spawn, under: 'opponent' } : { ...e.spawn, under: 'opponent' };
      else if (typeof e.spawn === 'object') {
        const { under, ...rest } = e.spawn; // eslint-disable-line no-unused-vars
        e.spawn = Object.keys(rest).length === 1 ? rest.name : rest; // only the name left: the plain way to write it
      }
    }
    return;
  }
  if (field.type === 'bool') {
    const below = target.layers.slice(1).some((x) => x && x[key] !== undefined && x[key] !== null);
    if (!!value !== !!field.fallback || below) w[key] = !!value; else delete w[key]; // the usual value is not written
    return;
  }
  if (field.type === 'choice') {
    if (!field.choices.includes(value)) throw new Error(`${field.label} must be one of ${field.choices.join(', ')}`);
    if (field.unset && value === field.choices[0]) { delete w[key]; return; } // the usual value is not written
    w[key] = value;
    return;
  }
  w[key] = clamp(field, value);
}

/** Take a setting out of the file again, so it goes back to what it inherits or to the default (changes `raw`). */
export function resetSetting(raw, target, key) {
  const w = target.write;
  if (!w) throw new Error(target.why || 'Not editable here');
  if (TIMING.includes(key)) throw new Error('Startup, active and recovery have no default to go back to. Use UNDO.');
  if (key === 'launch.type') { delete w.launch; delete w.launcher; return; }
  if (key.startsWith('launch.')) {
    if (w.launch && typeof w.launch === 'object') w.launch = launchOf([w, ...target.layers.slice(1)]).type; // back to the system's speeds
    return;
  }
  if (key.startsWith('airHit.')) { delete w.airHit; return; }
  if (key.startsWith('spawn.')) { const now = clone(w.spawn ?? [0, 0]); now[Number(key.slice(6))] = 0; w.spawn = now; return; }
  if (key === 'place') { if (spawnEvents(raw, target.name).length) writeSetting(raw, target, key, 'front'); return; }
  delete w[key];
}

/** One step up or down: the next number, the next choice, or the other answer of a yes / no. */
export function nudgeSetting(raw, target, key, dir, big, rules) {
  const field = fieldOf(key);
  const cur = readSetting(raw, target, key, rules).value;
  if (field.type === 'bool') return writeSetting(raw, target, key, !cur, rules);
  if (field.type === 'choice') {
    const n = field.choices.length;
    return writeSetting(raw, target, key, field.choices[(field.choices.indexOf(cur) + dir + n) % n], rules);
  }
  return writeSetting(raw, target, key, cur + dir * (big ? field.big ?? 10 : field.step ?? 1), rules);
}

/** How a value reads on screen. */
export function showSetting(key, value) {
  const field = fieldOf(key);
  if (field.type === 'bool') return value ? 'yes' : 'no';
  if (field.type === 'choice') return field.names?.[value] ?? value;
  return `${value}${field.unit ? ` ${field.unit}` : ''}`;
}
