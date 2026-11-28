// The box editor's drawing timing: no drawing, no browser. How long each drawing of a state stays on screen, and
// moving the change from one drawing to the next a frame or more earlier or later. The state's length never
// changes, so startup, active, recovery, hitboxes and cancel windows stay exactly where they are: only the rhythm of
// the drawings does. Every change is checked by compiling the character again (compileCharacter): if the drawings
// that come out are not exactly the old ones with that one change moved, the change is refused and nothing is kept.
import { compileCharacter } from '../core/character.js';
import { stateInfo } from './box-model.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
const getPath = (obj, path) => path.reduce((o, k) => (o == null ? undefined : o[k]), obj);
const moveId = (m) => m.id ?? m.input ?? m.name;
const sameSprite = (a, b) => (a?.sheet ?? null) === (b?.sheet ?? null) && (a?.index ?? -1) === (b?.index ?? -1);

/** The drawings of a compiled state in order: [{ start, len, sheet, index }] (a run of frames showing one drawing). */
export function drawingRuns(st) {
  const runs = [];
  st.frames.forEach((fr, f) => {
    const last = runs[runs.length - 1];
    if (last && sameSprite(last.sprite, fr.sprite)) last.len++;
    else runs.push({ start: f, len: 1, sprite: fr.sprite, sheet: fr.sprite?.sheet ?? null, index: fr.sprite?.index ?? -1 });
  });
  return runs.map(({ sprite, ...r }) => r); // eslint-disable-line no-unused-vars
}

/**
 * Where a state's drawing timing is written in this file. Returns { ok, why, sprite, timelines }:
 *   sprite:    path to the sprite block whose `holds` set the drawings (null if it is not this file's to change)
 *   timelines: paths to the timelines whose `sprite` events may set them, in the order the game reads them
 */
export function timingPlan(raw, system, name) {
  const info = stateInfo(raw, system, name);
  const mi = raw.moves.findIndex((m) => moveId(m) === name);
  const has = (path) => getPath(raw, path) !== undefined;
  // why: the reason when nothing is this entry's to change, and the reason given when a change is set elsewhere.
  const plan = (sprite, timelines, why) => {
    const s = sprite && has(sprite) ? sprite : null;
    const t = timelines.filter(has);
    return s || t.length ? { ok: true, why, sprite: s, timelines: t } : { ok: false, why, sprite: null, timelines: [] };
  };
  if (info.type === 'move') return plan(['moves', mi, 'sprite'], [['moves', mi, 'timeline']], 'This move has no drawings yet.');
  if (info.type === 'ex') {
    const ex = raw.moves[info.moveIndex].ex;
    // Only what the EX version writes for itself: the rest is the normal version's, changed there.
    return plan(ex.sprite ? ['moves', info.moveIndex, 'ex', 'sprite'] : null, 'timeline' in ex ? [['moves', info.moveIndex, 'ex', 'timeline']] : [],
      'The EX version uses the normal version\'s drawings: change their timing there.');
  }
  if (info.type === 'own') return plan(['states', name, 'sprite'], [['states', name, 'timeline']], 'This state has no drawings yet.');
  // A system state or a universal move: only the drawings this character gives it (an entry in its moves).
  const why = 'This one is shared by every character and has no drawings of its own in this file (it shows another move\'s, or none).';
  if (mi < 0 || !raw.moves[mi].sprite) return { ok: false, why, sprite: null, timelines: [] };
  return plan(['moves', mi, 'sprite'], info.type === 'system' ? [['states', name, 'timeline'], ['moves', mi, 'timeline']] : [['moves', mi, 'timeline']], why);
}

/** The runs after moving change number b (the start of run b) by d frames, or null if a drawing would vanish. */
function expected(runs, b, d) {
  const out = runs.map((r) => ({ ...r }));
  if (out[b - 1].len + d < 1 || out[b].len - d < 1) return null;
  out[b - 1].len += d;
  out[b].start += d;
  out[b].len -= d;
  return out;
}
const sameRuns = (a, b) => a.length === b.length && a.every((r, i) => r.start === b[i].start && r.len === b[i].len && r.sheet === b[i].sheet && r.index === b[i].index);

/** The ways the change at frame `at` could be written, each a function that edits `raw` (most likely first). */
function candidates(raw, plan, runs, b, d) {
  const at = runs[b].start;
  const out = [];
  // A timeline sprite event starting there (the game reads the timelines after the holds, later lists winning).
  for (const path of [...plan.timelines].reverse()) {
    const list = getPath(raw, path);
    for (let n = list.length - 1; n >= 0; n--) {
      const e = list[n];
      if (e.sprite === undefined || e.from !== undefined || (e.at ?? 0) !== at) continue;
      out.push((r) => {
        const tl = getPath(r, path);
        const ev = tl[n];
        const others = Object.keys(ev).filter((k) => k !== 'at' && k !== 'sprite');
        if (!others.length) { ev.at = at + d; return; }
        // The event does other things on that frame too: only the drawing moves, as an event of its own.
        const sprite = ev.sprite;
        delete ev.sprite;
        tl.push({ at: at + d, sprite });
      });
    }
  }
  if (plan.sprite) {
    const sp = getPath(raw, plan.sprite);
    const count = sp.count ?? 0;
    if (Array.isArray(sp.holds) && sp.holds.length) {
      // The drawing whose hold starts on that frame: it and the one before trade frames.
      const holds = Array.from({ length: count }, (_, i) => Math.max(1, sp.holds[i] ?? sp.holds[sp.holds.length - 1]));
      let t = 0;
      for (let i = 0; i < holds.length; i++) {
        if (i > 0 && t === at) {
          out.push((r) => {
            const next = [...holds];
            next[i - 1] += d;
            next[i] -= d;
            if (next[i - 1] < 1 || next[i] < 1) throw new Error('Every drawing needs at least one frame.');
            // Keep the list as long as it was written when nothing past it changed.
            getPath(r, plan.sprite).holds = next.length > sp.holds.length && next.slice(sp.holds.length).every((h) => h === sp.holds[sp.holds.length - 1]) ? next.slice(0, sp.holds.length) : next;
          });
        }
        t += holds[i];
      }
    } else if (count > 1) {
      // No holds yet (the drawings are spread evenly): write the ones on screen now, with this change made.
      const shown = expected(runs, b, d);
      if (shown && shown.length === count && shown.every((r, i) => r.index === i)) out.push((r) => { getPath(r, plan.sprite).holds = shown.map((x) => x.len); });
    }
  }
  return out;
}

/**
 * Move the change from drawing b-1 to drawing b by d frames (d > 0: drawing b-1 stays longer and b starts later).
 * Changes `raw`; throws with a plain reason if it cannot be done.
 */
export function moveChange(raw, system, name, b, d) {
  if (!d) return;
  const plan = timingPlan(raw, system, name);
  if (!plan.ok) throw new Error(plan.why);
  const st = compileCharacter(raw, system).states[name];
  if (!st) throw new Error(`No state called ${name}`);
  const runs = drawingRuns(st);
  if (b < 1 || b >= runs.length) throw new Error('That is not a change between two drawings.');
  const want = expected(runs, b, d);
  if (!want) throw new Error('Every drawing needs at least one frame.');
  for (const edit of candidates(raw, plan, runs, b, d)) {
    const trial = clone(raw);
    try { edit(trial); } catch { continue; }
    let got;
    try { got = drawingRuns(compileCharacter(trial, system).states[name]); } catch { continue; }
    if (!sameRuns(got, want)) continue;
    for (const k of Object.keys(raw)) delete raw[k];
    Object.assign(raw, trial);
    return;
  }
  // An EX version with its own timeline but the normal version's drawings: those are changed on the normal version.
  if (!plan.sprite && name.endsWith('_ex')) throw new Error(plan.why);
  throw new Error('This drawing change is not set in a place the editor can move (a range, or the shared system file).');
}

/** Does the game re-time this state with snap timing (data/snap) right now? Mirrors snapOf in fight-renderer.js. */
export function snapApplies(snap, def, name) {
  const sn = snap?.moves?.[name];
  const holds = def.sheets?.[name]?.holds;
  if (!sn || !holds) return false;
  const sum = (l) => l.reduce((a, c) => a + c, 0);
  return holds.length === sn.snap.length && sn.roles.length === holds.length && holds.every((h, i) => h === sn.holds[i]) && sum(sn.snap) === sum(holds);
}
