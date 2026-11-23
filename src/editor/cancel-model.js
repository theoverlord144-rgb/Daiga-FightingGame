// The cancel editor's model: no drawing, no browser. "What can this move be cancelled into, and when?" read from
// a character's file the way the game builds it (gatlingCancels in src/core/character.js), and edited in place.
// Two kinds of route: chains (the top-level `gatlings` list: this move into those moves) and groups (any special,
// any super, a jump: flags on the move). tests/cancel-editor.test.js checks this against the compiled character.

const moveId = (m) => m.id ?? m.input ?? m.name;
export const WHEN = ['no', 'hit', 'block', 'both'];
export const WHEN_NAMES = { no: 'never', hit: 'on hit', block: 'on block', both: 'on hit or block' };
const toWhen = (on) => (on.includes('hit') ? (on.includes('block') ? 'both' : 'hit') : on.includes('block') ? 'block' : 'no');
const fromFlag = (flag, dflt) => (flag === undefined ? dflt : flag === true ? 'both' : flag === false ? 'no' : toWhen([flag].flat()));
const toFlag = (when) => (when === 'both' ? true : when === 'no' ? false : when);

/**
 * The moves a player can do, in the file's order: [{ id, kind, stance, name }]. `def` is the compiled character.
 * Left out: entries that only give art to a universal move, and EX versions (they follow their normal version).
 */
export function cancelMoves(raw, def) {
  return raw.moves
    .map((m) => ({ id: moveId(m), m }))
    .filter(({ id, m }) => m.input && def.states[id]?.move)
    .map(({ id, m }) => ({ id, kind: def.states[id].kind, stance: def.states[id].stance, name: m.name ?? id }));
}

/** The moves to show as targets: every normal, and anything some move already chains into. */
export function cancelTargets(raw, def) {
  const all = cancelMoves(raw, def);
  const named = new Set(Object.values(raw.gatlings || {}).flatMap((g) => (Array.isArray(g) ? g : g.into || [])));
  return all.filter((x) => x.kind === 'normal' || named.has(x.id));
}

const entry = (raw, id) => raw.moves.find((m) => moveId(m) === id);
const chainOf = (raw, id) => {
  const g = raw.gatlings?.[id];
  return !g ? { into: [], on: 'both' } : Array.isArray(g) ? { into: g, on: 'both' } : { into: g.into || [], on: toWhen(g.on || ['hit', 'block']) };
};

/**
 * Everything about one move's cancels:
 *   chains: [ids] it chains into, chainOn: 'both' | 'hit' | 'block' (one answer for the whole list)
 *   special, super, jump: 'no' | 'hit' | 'block' | 'both', each with own: set in the file (else the default)
 *   from, to: the window (frame numbers), ownFrom / ownTo: set in the file (else first active frame .. the end)
 *   superJump: a hard launcher always adds a super jump on hit
 *   extra: how many hand-written cancel windows the move has besides (not editable here)
 */
export function readCancels(raw, def, id) {
  const m = entry(raw, id);
  const st = def.states[id];
  if (!m || !st?.move) throw new Error(`No move called ${id}`);
  const move = st.move;
  const chain = chainOf(raw, id);
  const special = fromFlag(m.specialCancel, st.kind === 'normal' ? 'both' : 'no');
  const superDefault = st.kind === 'super' ? 'no' : special !== 'no' ? special : 'both';
  return {
    chains: [...chain.into],
    chainOn: chain.on,
    special: { value: special, own: m.specialCancel !== undefined },
    super: { value: st.kind === 'super' ? 'no' : fromFlag(m.superCancel, superDefault), own: m.superCancel !== undefined, fixed: st.kind === 'super' },
    jump: { value: fromFlag(m.jumpCancel, move.launchType === 'soft' ? 'hit' : 'no'), own: m.jumpCancel !== undefined },
    from: m.cancelFrom ?? move.startup - 1,
    to: m.cancelTo ?? move.startup - 1 + move.active + move.recovery - 1,
    ownFrom: m.cancelFrom !== undefined,
    ownTo: m.cancelTo !== undefined,
    last: move.startup - 1 + move.active + move.recovery - 1,
    superJump: move.launchType === 'hard',
    extra: (m.cancels || []).length,
  };
}

/** The moves that chain into `id`. */
export const reachedFrom = (raw, id) => Object.keys(raw.gatlings || {}).filter((from) => chainOf(raw, from).into.includes(id));

/** Is a chain between these two worth offering? Not between a ground normal and an air normal. */
export function chainMakesSense(a, b) {
  if (a.kind === 'normal' && b.kind === 'normal') return (a.stance === 'air') === (b.stance === 'air');
  return true;
}

function writeChain(raw, id, into, on) {
  raw.gatlings ||= {};
  if (!into.length) { delete raw.gatlings[id]; return; }
  raw.gatlings[id] = on === 'both' ? into : { into, on: on === 'hit' ? ['hit'] : ['block'] };
}

/** Add or remove one chain: `from` into `to` (changes `raw`). New targets go in the order of the move list. */
export function toggleChain(raw, def, from, to) {
  if (!entry(raw, from) || !entry(raw, to)) throw new Error('No such move');
  const chain = chainOf(raw, from);
  const order = raw.moves.map(moveId);
  const into = chain.into.includes(to) ? chain.into.filter((x) => x !== to) : [...chain.into, to].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  writeChain(raw, from, into, chain.on);
}

/** When a move's chains work: 'both' (hit or block), 'hit' or 'block' (changes `raw`). */
export function setChainOn(raw, id, on) {
  if (!['both', 'hit', 'block'].includes(on)) throw new Error('Chains work on hit or block, on hit, or on block');
  writeChain(raw, id, chainOf(raw, id).into, on);
}

/** Set a group route: which = 'special' | 'super' | 'jump', when = one of WHEN. The default is left unwritten. */
export function setGroup(raw, def, id, which, when) {
  if (!WHEN.includes(when)) throw new Error(`Must be one of ${WHEN.join(', ')}`);
  const m = entry(raw, id);
  const key = { special: 'specialCancel', super: 'superCancel', jump: 'jumpCancel' }[which];
  if (!key) throw new Error(`No such route: ${which}`);
  const now = readCancels(raw, def, id);
  if (which === 'super' && now.super.fixed) throw new Error('A super cannot be cancelled into another super.');
  delete m[key];
  // What it is with nothing written; write the flag only if the answer differs.
  const st = def.states[id];
  const special = which === 'special' ? (st.kind === 'normal' ? 'both' : 'no') : fromFlag(m.specialCancel, st.kind === 'normal' ? 'both' : 'no');
  const dflt = which === 'special' ? special : which === 'super' ? (special !== 'no' ? special : 'both') : st.move.launchType === 'soft' ? 'hit' : 'no';
  if (when !== dflt) m[key] = toFlag(when);
}

/** The cancel window: which = 'from' | 'to', a frame number; null = back to the default (changes `raw`). */
export function setWindow(raw, def, id, which, frame) {
  const m = entry(raw, id);
  const key = which === 'from' ? 'cancelFrom' : 'cancelTo';
  if (frame === null) { delete m[key]; return; }
  const now = readCancels(raw, def, id);
  const n = Math.max(0, Math.min(now.last, Math.round(frame)));
  if (which === 'from' && n > now.to) throw new Error('The window cannot open after it closes.');
  if (which === 'to' && n < now.from) throw new Error('The window cannot close before it opens.');
  m[key] = n;
}
