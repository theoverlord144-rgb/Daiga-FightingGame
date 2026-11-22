// The box editor's model: no drawing, no browser. Given a character's file (the raw Toska JSON) it answers
// "where does this frame's hurtbox / hitbox come from?" and edits that place. It mirrors how compileState builds a
// state's frame table (src/core/character.js); tests/box-editor.test.js checks the two agree on every frame.

const STANCE_HURT = { stand: 'standHurt', crouch: 'crouchHurt', air: 'airHurt' };
const KEYS = ['hurt', 'hit'];

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const moveId = (m) => m.id ?? m.input ?? m.name;

/** What kind of state `name` is in this file: a move, a system state, one of the character's own, or universal. */
export function stateInfo(raw, system, name) {
  const moveIndex = raw.moves.findIndex((m) => moveId(m) === name);
  if (system.common.states[name]) return { type: 'system', moveIndex };
  if (moveIndex >= 0) return { type: 'move', moveIndex };
  if (raw.states?.[name]) return { type: 'own', moveIndex: -1 };
  return { type: 'universal', moveIndex: -1 }; // e.g. the burst: lives in data/system, the same for everyone
}

/** A frame count that may be a stat reference ("@prejump"). */
function frames(v, raw, system) {
  if (typeof v !== 'string') return Math.round(v ?? 0);
  const stats = { ...system.defaults.stats, ...(raw.character.stats || {}) };
  const n = Math.round(stats[v.replace(/^-?@/, '')] ?? 0);
  return v.startsWith('-') ? -n : n;
}

/**
 * Where the hurtboxes and hitboxes of `name` at `frame` come from. `stance` and `duration` are the compiled
 * state's. Returns { hurt: src, hit: src }, each one of:
 *   { kind: 'stat', stat }                       the stance's shared hurtbox (character.stats, else the default)
 *   { kind: 'path', path, where, at }            a place in this file: where = 'field' (hitboxes / hurtboxes of the
 *                                                move) or 'event' (a timeline event starting at frame `at`)
 *   { kind: 'system', value }                    set by data/system for every character (not editable here)
 *   { kind: 'none', value }                      nothing on this frame (no hitbox out)
 */
export function sourcesAt(raw, system, name, stance, frame) {
  const info = stateInfo(raw, system, name);
  const sets = [];
  const add = (at, key, src, revertAt) => sets.push({ at, key, src, revertAt, order: sets.length });
  const timeline = (list, path) => {
    (list || []).forEach((e, n) => {
      for (const key of KEYS) {
        if (e[key] === undefined) continue;
        const ranged = e.from !== undefined;
        const at = frames(ranged ? e.from : e.at ?? 0, raw, system);
        const last = !ranged ? undefined : e.for !== undefined ? at + frames(e.for, raw, system) - 1 : frames(e.to ?? e.from, raw, system);
        const src = path ? { kind: 'path', path: [...path, n, key], where: 'event', at } : { kind: 'system', value: clone(e[key]) };
        add(at, key, src, ranged ? last + 1 : undefined);
      }
    });
  };

  add(0, 'hurt', { kind: 'stat', stat: STANCE_HURT[stance] ?? STANCE_HURT.stand });
  if (info.type === 'move' || info.type === 'universal') {
    const m = info.type === 'move' ? raw.moves[info.moveIndex] : system.burst.moves[name];
    const base = info.type === 'move' ? ['moves', info.moveIndex] : null;
    const here = (key) => (base ? { kind: 'path', path: [...base, key], where: 'field', at: 0 } : { kind: 'system', value: clone(m[key]) });
    const first = (m.startup ?? 1) - 1;
    const active = m.active ?? 0;
    if (m.hurtboxes) add(0, 'hurt', here('hurtboxes'));
    if (active > 0 && (m.hitboxes || m.remote)) {
      add(first, 'hit', m.hitboxes ? { ...here('hitboxes'), at: first } : { kind: 'none', value: [[0, 0, 0, 0]], why: 'remote' });
      add(first + active, 'hit', { kind: 'none', value: [] });
    }
    timeline(m.timeline, base ? [...base, 'timeline'] : null);
  } else if (info.type === 'system') {
    timeline(system.common.states[name].timeline, null);
    timeline(raw.states?.[name]?.timeline, ['states', name, 'timeline']);
    if (info.moveIndex >= 0) timeline(raw.moves[info.moveIndex].timeline, ['moves', info.moveIndex, 'timeline']);
  } else {
    timeline(raw.states[name].timeline, ['states', name, 'timeline']);
  }

  sets.sort((a, b) => a.at - b.at || a.order - b.order);
  const cur = { hurt: { kind: 'none', value: [] }, hit: { kind: 'none', value: [] } };
  const reverts = [];
  let si = 0;
  for (let f = 0; f <= frame; f++) {
    for (const r of reverts) if (r.at === f) cur[r.key] = r.src;
    while (si < sets.length && sets[si].at <= f) {
      const s = sets[si++];
      if (s.revertAt !== undefined) reverts.push({ at: s.revertAt, key: s.key, src: cur[s.key] });
      cur[s.key] = s.src;
    }
  }
  return cur;
}

const getPath = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);

/** The boxes a source holds, in pixels: [[x, y, w, h], ...] (a copy). */
export function boxesOf(raw, system, src) {
  if (src.kind === 'stat') return clone(raw.character.stats?.[src.stat] ?? system.defaults.stats[src.stat] ?? []);
  if (src.kind === 'path') return clone(getPath(raw, src.path) ?? []);
  return clone(src.value ?? []);
}

/** Can the boxes of this source be changed in this file? */
export const editable = (src) => src.kind === 'stat' || src.kind === 'path';

/** Write boxes back to where they come from (changes `raw`). */
export function setBoxes(raw, src, list) {
  const value = list.map((b) => b.map((n) => Math.round(n)));
  if (src.kind === 'stat') {
    raw.character.stats ||= {};
    raw.character.stats[src.stat] = value;
  } else if (src.kind === 'path') {
    getPath(raw, src.path.slice(0, -1))[src.path.at(-1)] = value;
  } else throw new Error('These boxes are not set in this file');
}

/** Give a move its own hurtboxes for its whole length (changes `raw`). Moves only. */
export function overrideMove(raw, system, name, list) {
  const info = stateInfo(raw, system, name);
  if (info.type !== 'move') throw new Error('Only a move can have its own hurtboxes');
  raw.moves[info.moveIndex].hurtboxes = clone(list);
}

/** Give a move hitboxes for its active frames (changes `raw`). Moves only. */
export function addHitboxField(raw, system, name, list) {
  const info = stateInfo(raw, system, name);
  if (info.type !== 'move') throw new Error('Only a move can have hitboxes');
  raw.moves[info.moveIndex].hitboxes = clone(list);
}

/** New hurtboxes from `frame` on: a timeline event on the move, or on the character's entry for the state. */
export function overrideFromFrame(raw, system, name, frame, list) {
  const info = stateInfo(raw, system, name);
  if (info.type === 'universal') throw new Error('This state is shared by every character');
  let owner;
  if (info.type === 'move') owner = raw.moves[info.moveIndex];
  else {
    raw.states ||= {};
    owner = raw.states[name] ||= {};
  }
  owner.timeline ||= [];
  owner.timeline.push({ at: frame, hurt: clone(list) });
}

/**
 * Remove an override (changes `raw`): the move's own field, or the timeline event's boxes (and the event, the
 * timeline and the state entry if that leaves them empty). For the shared stance box: back to the system default.
 */
export function removeSource(raw, src) {
  if (src.kind === 'stat') {
    if (raw.character.stats) delete raw.character.stats[src.stat];
    return;
  }
  if (src.kind !== 'path') throw new Error('Nothing to remove here');
  const parent = getPath(raw, src.path.slice(0, -1));
  delete parent[src.path.at(-1)];
  if (src.where !== 'event') return;
  if (Object.keys(parent).some((k) => !['at', 'from', 'to', 'for'].includes(k))) return; // the event does other things too
  const tlPath = src.path.slice(0, -2);
  const tl = getPath(raw, tlPath);
  tl.splice(src.path.at(-2), 1);
  if (tl.length) return;
  const owner = getPath(raw, tlPath.slice(0, -1));
  delete owner.timeline;
  if (tlPath[0] === 'states' && !Object.keys(owner).length) delete raw.states[tlPath[1]];
}

// ---------- Saving: the difference between two versions of a file, as a list of small changes ----------

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The changes that turn `a` into `b`: [{ op: 'set' | 'add' | 'remove', path, value }]. Kept as small as possible
 * so saving touches only the numbers that changed and the rest of the hand-formatted file stays as it was.
 */
export function diffOps(a, b, path = [], out = []) {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (b.length < a.length) { out.push({ op: 'set', path, value: b }); return out; }
    for (let i = 0; i < a.length; i++) diffOps(a[i], b[i], [...path, i], out);
    for (let i = a.length; i < b.length; i++) out.push({ op: 'add', path: [...path, i], value: b[i] });
  } else if (isObj(a) && isObj(b)) {
    for (const k of Object.keys(a)) {
      if (!(k in b)) out.push({ op: 'remove', path: [...path, k] });
      else diffOps(a[k], b[k], [...path, k], out);
    }
    for (const k of Object.keys(b)) if (!(k in a)) out.push({ op: 'add', path: [...path, k], value: b[k] });
  } else if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ op: 'set', path, value: b });
  return out;
}

/** Apply diffOps changes to an object (changes it). */
export function applyOps(obj, ops) {
  for (const { op, path, value } of ops) {
    const parent = getPath(obj, path.slice(0, -1));
    const key = path.at(-1);
    if (op === 'remove') { if (Array.isArray(parent)) parent.splice(key, 1); else delete parent[key]; }
    else if (op === 'add' && Array.isArray(parent)) parent.splice(key, 0, clone(value));
    else parent[key] = clone(value);
  }
  return obj;
}
