// The box editor: pick a character, a move and a frame, and move, resize, add or delete its hitboxes and hurtboxes
// with the mouse. It edits a copy of the character's file; SAVE writes the changes into the real file through the
// dev server (vite.config.js) and puts the new version into the running game, so Training shows it right away.
// What each box "comes from" (the move, a frame of it, or the stance shared by many states) is worked out by
// src/editor/box-model.js. Projectiles are in the list too ("proj:<name>"): one hitbox each, shown on the
// projectile's own drawing at the spot it is released from. Pages: BOXES (here), HIT SETTINGS (move-tuner.js),
// CANCELS (cancel-grid.js) and FX (fx-page.js: an effect sheet's size, rotation, opacity and colour).
// Drawing timing (BOXES page): the strip above the frame bar shows each drawing with the frames it stays on screen;
// drag a line between two drawings, or press - / = on the drawing on screen, to trade frames between neighbours.
// The state's length never changes (src/editor/timing-model.js), so frame data and boxes stay where they are.
import { compileCharacter } from '../../core/character.js';
import { UNIT } from '../../core/fixed.js';
import { createFightRenderer } from '../../render/fight-renderer.js';
import { SYSTEM, CHAR_SOURCES } from '../boot.js';
import { sourcesAt, boxesOf, setBoxes, editable, overrideMove, overrideFromFrame, addHitboxField, removeSource, diffOps, stateInfo, projectileNames, projectileSource } from '../../editor/box-model.js';
import { FONT, INK, DIM, GOLD } from './common.js';
import { createTuner } from './move-tuner.js';
import { createCancelGrid } from './cancel-grid.js';
import { createFxPage } from './fx-page.js';
import { drawingRuns, timingPlan, moveChange, snapApplies } from '../../editor/timing-model.js';

// Snap timing per character (data/snap/<id>.json): the game re-times some moves with it (drawing only).
const SNAP = Object.fromEntries(Object.entries(import.meta.glob('../../../data/snap/*.json', { eager: true, import: 'default' }))
  .map(([path, v]) => [path.match(/snap\/([^/]+)\.json$/)[1], v]));

const LIST_W = 176; // the state list, on the left
const STAGE = { x: 184, y: 30, w: 768, h: 314 }; // where the fighter is drawn
const PAGE_STAGE = { ...STAGE, h: 338 }; // the other pages (HIT SETTINGS, FX) keep the full height
const GY = 326; // the floor line, on screen
const BAR = { x: 190, y: 362, w: 756, h: 18 }; // the frame bar
const STRIP = { x: BAR.x, y: 346, w: BAR.w, h: 14 }; // the drawings and their lengths, just above the bar
const ROW = 15;
const LIST_TOP = 56;
const COLORS = { hurt: '#36d27a', hit: '#ff3b3b', push: '#ffffff', throw: '#e0d050' };
const NAMES = { hurt: 'Hurtbox', hit: 'Hitbox' };
const clone = (v) => JSON.parse(JSON.stringify(v));
const PROJ = 'proj:'; // list entries for projectiles
const isProj = (name) => name.startsWith(PROJ);
const sum = (list) => list.reduce((a, b) => a + b, 0);

export function createBoxEditorScreen(app, { char, state, frame: startFrame = 0, page = 'boxes' } = {}) {
  const { ctx, W, H } = app;
  const canvas = ctx.canvas;
  const renderer = createFightRenderer(ctx, W, H); // its own, so the fight's effects and camera stay out of it
  const ids = app.cast.map((c) => c.id).filter((id) => CHAR_SOURCES[id]);

  let charId, raw, saved, def, names, sel, frame, listScroll;
  let playing = false;
  let slow = false; // PLAY at half speed
  let picked = null; // the selected box: { kind: 'hurt' | 'hit', i }
  let drag = null;
  let undo = [];
  let zoomMul = 1;
  let msg = null; // { text, color, until }
  let saving = false;
  let leaveArmed = 0;
  let buttons = [];
  let tick = 0;
  const PAGES = ['boxes', 'hit', 'cancel', 'fx']; // the boxes, the hit settings (move-tuner.js), the cancels (cancel-grid.js), the effects (fx-page.js)
  let mode = PAGES.includes(page) ? page : 'boxes';
  let version = 0; // goes up every time the character is rebuilt from the file being edited
  let hintText = ''; // what the thing under the mouse does (shown on the bottom line)
  const mouse = { x: 0, y: 0, shift: false };

  const say = (text, color = INK, frames = 240) => { msg = { text, color, until: tick + frames }; };
  const dirty = () => JSON.stringify(raw) !== JSON.stringify(saved);

  function load(id, wantState) {
    charId = id;
    saved = clone(CHAR_SOURCES[id].file);
    raw = clone(saved);
    def = compileCharacter(raw, SYSTEM);
    version++;
    // Moves first (in the file's order), then the character's own states, then the system's.
    const rank = { move: 0, ex: 0, own: 1, system: 2, universal: 3 };
    names = Object.keys(def.states).map((n, i) => ({ n, i, r: rank[stateInfo(raw, SYSTEM, n).type] }))
      .sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.n);
    // Projectiles go right after the moves.
    const firstOther = names.findIndex((n) => rank[stateInfo(raw, SYSTEM, n).type] !== 0);
    names.splice(firstOther < 0 ? names.length : firstOther, 0, ...projectileNames(raw).map((id) => PROJ + id));
    sel = Math.max(0, names.indexOf(wantState ?? '5L'));
    frame = 0;
    listScroll = 0;
    picked = null;
    undo = [];
    zoomMul = 1;
  }
  /**
   * The state behind a list entry. A projectile gets a stand-in: one frame per frame of its animation (release,
   * flight loop, impact), every one carrying its single hitbox.
   */
  function stOf(name) {
    if (!isProj(name)) return def.states[name];
    const d = def.projectiles[name.slice(PROJ.length)];
    const parts = [d.anim?.release ?? [], d.anim?.loop ?? [1], d.anim?.impact ?? []];
    const frames = [];
    let index = 0;
    parts.forEach((holds, part) => {
      for (const hold of holds) {
        for (let k = 0; k < hold; k++) frames.push({ hurt: [], hit: part < 2 ? d.hitbox : [], push: [], throw: [], sprite: { index, sheet: 'projectile' } });
        index++;
      }
    });
    return { frames, stance: 'air', move: null, loop: false, projectile: d };
  }
  /** Where a list entry's boxes are measured from, relative to the fighter's feet (a projectile: where it is released). */
  function offsetOf(name) {
    return isProj(name) ? raw.projectiles[name.slice(PROJ.length)].spawn ?? [0, 0] : [0, 0];
  }

  load(ids.includes(char) ? char : ids[0], state);
  frame = Math.max(0, Math.min(stOf(names[sel]).frames.length - 1, startFrame | 0));

  /** Everything about the frame on screen. */
  function now() {
    const name = names[sel];
    const st = stOf(name);
    const f = Math.min(frame, st.frames.length - 1);
    if (isProj(name)) {
      const src = { hurt: { kind: 'none', value: [] }, hit: st.frames[f].hit.length ? projectileSource(raw, name.slice(PROJ.length)) : { kind: 'none', value: [] } };
      return { name, st, f, fr: st.frames[f], src, info: { type: 'projectile', moveIndex: -1 }, boxes: { hurt: [], hit: boxesOf(raw, SYSTEM, src.hit) } };
    }
    const src = sourcesAt(raw, SYSTEM, name, st.stance, f);
    return { name, st, f, fr: st.frames[f], src, info: stateInfo(raw, SYSTEM, name),
      boxes: { hurt: boxesOf(raw, SYSTEM, src.hurt), hit: boxesOf(raw, SYSTEM, src.hit) } };
  }

  /** The zoom and where the fighter's feet go, so the whole state fits (every frame, every box). */
  function view() {
    const st = stOf(names[sel]);
    const [offX, offY] = offsetOf(names[sel]);
    let x0 = -70, x1 = 70, y1 = 170;
    for (const fr of st.frames) {
      for (const b of [...fr.hurt, ...fr.hit, ...fr.push, ...fr.throw]) {
        x0 = Math.min(x0, b[0] / UNIT + offX);
        x1 = Math.max(x1, (b[0] + b[2]) / UNIT + offX);
        y1 = Math.max(y1, (b[1] + b[3]) / UNIT + offY);
      }
    }
    const fit = Math.min((STAGE.w - 40) / (x1 - x0 + 40), (GY - STAGE.y - 14) / (y1 + 20), 3);
    const z = Math.max(0.5, Math.floor(fit * 4) / 4) * zoomMul;
    return { z, ox: STAGE.x + STAGE.w / 2 - (z * (x0 + x1)) / 2 };
  }
  const rectOf = (b, v) => {
    const [offX, offY] = offsetOf(names[sel]);
    return [v.ox + v.z * (b[0] + offX), GY - v.z * (b[1] + offY + b[3]), v.z * b[2], v.z * b[3]];
  };

  function recompile() {
    def = compileCharacter(raw, SYSTEM);
    version++;
    frame = Math.min(frame, stOf(names[sel]).frames.length - 1);
  }

  /** One undoable change. fn edits `raw`; if the result isn't a valid character, it is taken back. */
  function change(fn) {
    const before = JSON.stringify(raw);
    try {
      fn();
      recompile();
    } catch (err) {
      raw = JSON.parse(before);
      recompile();
      say(err.message, '#ff6b6b');
      return false;
    }
    if (JSON.stringify(raw) !== before) { undo.push(before); if (undo.length > 200) undo.shift(); }
    return true;
  }

  function undoOnce() {
    if (!undo.length) { say('Nothing to undo'); return; }
    raw = JSON.parse(undo.pop());
    recompile();
    picked = null;
  }

  function setState(i) {
    sel = (i + names.length) % names.length;
    frame = 0;
    picked = null;
    zoomMul = 1;
    // Keep the selection in view.
    const rows = Math.floor((H - 24 - LIST_TOP) / ROW);
    if (sel < listScroll) listScroll = sel;
    if (sel >= listScroll + rows) listScroll = sel - rows + 1;
  }
  function setFrame(f) {
    const n = stOf(names[sel]).frames.length;
    frame = ((f % n) + n) % n;
    const c = now();
    if (picked && !c.boxes[picked.kind][picked.i]) picked = null;
  }

  /** Can a hitbox be added on this frame, and how? */
  function hitPlan(c) {
    if (c.info.type === 'projectile') return { ok: false, why: 'A projectile has exactly one hitbox: drag or resize the one it has.' };
    if (c.info.type === 'universal') return { ok: false, why: 'This move is shared by every character (data/system).' };
    if (c.src.hit.kind === 'path') {
      if (c.src.hit.where === 'event' && !c.boxes.hit.length) return { ok: false, why: 'The hit ends on this frame.' };
      return { ok: true };
    }
    const m = c.st.move;
    if (c.info.type === 'move' && m && m.active > 0 && !raw.moves[c.info.moveIndex].hitboxes && !raw.moves[c.info.moveIndex].remote) {
      if (c.f >= m.startup - 1 && c.f < m.startup - 1 + m.active) return { ok: true, create: true };
    }
    if (m && m.active > 0) return { ok: false, why: `No hitbox is out on this frame. This move hits on frames ${m.startup - 1} to ${m.startup + m.active - 2}.` };
    return { ok: false, why: 'This state has no active frames, so it has no hitbox.' };
  }

  function addBox(kind) {
    const c = now();
    if (kind === 'hurt') {
      if (c.info.type === 'projectile') { say('A projectile has no hurtbox.', '#ffb86b'); return; }
      if (!editable(c.src.hurt)) { say('The hurtbox on this frame is set by the system for every character.', '#ffb86b'); return; }
      change(() => setBoxes(raw, c.src.hurt, [...c.boxes.hurt, [-20, 70, 40, 40]]));
      picked = { kind, i: c.boxes.hurt.length };
      return;
    }
    const plan = hitPlan(c);
    if (!plan.ok) { say(plan.why, '#ffb86b'); return; }
    if (plan.create) change(() => addHitboxField(raw, SYSTEM, c.name, [[20, 80, 60, 30]]));
    else change(() => setBoxes(raw, c.src.hit, [...c.boxes.hit, [20, 80, 60, 30]]));
    picked = { kind, i: plan.create ? 0 : c.boxes.hit.length };
  }

  function deleteBox() {
    if (!picked) { say('Click a box first'); return; }
    const c = now();
    if (c.info.type === 'projectile') { say('A projectile needs its hitbox: it can be moved and resized, not deleted.', '#ffb86b'); return; }
    const list = c.boxes[picked.kind].filter((_, i) => i !== picked.i);
    change(() => setBoxes(raw, c.src[picked.kind], list));
    picked = null;
  }

  function nudge(dx, dy, resize, step) {
    if (!picked) return;
    const c = now();
    const list = c.boxes[picked.kind];
    const b = list[picked.i];
    if (!b) return;
    if (resize) { b[2] = Math.max(2, b[2] + dx * step); b[3] = Math.max(2, b[3] + dy * step); }
    else { b[0] += dx * step; b[1] += dy * step; }
    change(() => setBoxes(raw, c.src[picked.kind], list));
  }

  // ---------- Drawing timing ----------

  /** The drawings of the entry on screen: { runs, at (the one on screen), plan (can they be retimed here?) }. */
  function timingOf(c) {
    const runs = drawingRuns(c.st);
    const at = Math.max(0, runs.findIndex((r) => c.f >= r.start && c.f < r.start + r.len));
    const plan = c.info.type === 'projectile' ? { ok: false, why: 'A projectile\'s drawings are timed by its own animation, not here.' }
      : runs.length < 2 ? { ok: false, why: 'This has only one drawing: there is nothing to retime.' }
        : timingPlan(raw, SYSTEM, c.name);
    return { runs, at, plan };
  }

  /** The drawing on screen one frame longer (dir 1) or shorter (-1): the next drawing gives or takes it (the last one: the drawing before). */
  function holdStep(dir) {
    const c = now();
    const t = timingOf(c);
    if (!t.plan.ok) { say(t.plan.why, '#ffb86b'); return; }
    const last = t.at === t.runs.length - 1;
    const b = last ? t.at : t.at + 1;
    const d = last ? -dir : dir;
    playing = false;
    if (change(() => moveChange(raw, SYSTEM, c.name, b, d))) {
      // Stay on the same drawing (its first frame moves when the change before it moves).
      const runs = drawingRuns(stOf(names[sel]));
      const r = runs[t.at];
      if (r && (frame < r.start || frame >= r.start + r.len)) setFrame(r.start);
    }
  }

  /** The line between two drawings under the mouse on the strip (its number b, from 1), or 0. */
  function lineAt(p) {
    if (!inside(p, { ...STRIP, x: STRIP.x - 6, w: STRIP.w + 12 })) return 0;
    const runs = drawingRuns(stOf(names[sel]));
    const cw = BAR.w / stOf(names[sel]).frames.length;
    let best = 0, dist = 6;
    for (let b = 1; b < runs.length; b++) {
      const dx = Math.abs(p.x - (BAR.x + runs[b].start * cw));
      if (dx <= dist) { best = b; dist = dx; }
    }
    return best;
  }

  /** Dragging line b: the change between the two drawings goes to the frame under the mouse. */
  function dragLine(p) {
    const st = stOf(names[sel]);
    const runs = drawingRuns(st);
    const b = drag.line;
    const cw = BAR.w / st.frames.length;
    const lo = runs[b - 1].start + 1, hi = runs[b].start + runs[b].len - 1;
    const target = Math.max(lo, Math.min(hi, Math.round((p.x - BAR.x) / cw)));
    const d = target - runs[b].start;
    if (!d) return;
    try {
      moveChange(raw, SYSTEM, names[sel], b, d);
      recompile();
      setFrame(target);
    } catch (err) {
      raw = JSON.parse(drag.before);
      recompile();
      drag = null;
      say(err.message, '#ff6b6b');
    }
  }

  async function save() {
    if (saving) return;
    const ops = diffOps(saved, raw);
    if (!ops.length) { say('Nothing to save'); return; }
    saving = true;
    try {
      const res = await fetch('/__toska/save-character', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: CHAR_SOURCES[charId].path, base: saved, ops }) });
      const out = await res.json().catch(() => ({ error: 'Saving needs the dev server (npm run dev).' }));
      if (!res.ok || !out.ok) throw new Error(out.error || 'The save failed');
      saved = clone(raw);
      // The running game gets the new version too.
      CHAR_SOURCES[charId].file = clone(raw);
      app.chars[charId] = def;
      const entry = app.cast.find((x) => x.id === charId);
      if (entry) entry.def = def;
      say(`Saved to ${CHAR_SOURCES[charId].path}`, '#5fd38a');
    } catch (err) {
      say(`Not saved: ${err.message}`, '#ff6b6b', 600);
    }
    saving = false;
  }

  function nextCharacter() {
    if (ids.length < 2) return;
    if (dirty()) { say('Save or undo your changes before switching character.', '#ffb86b'); return; }
    load(ids[(ids.indexOf(charId) + 1) % ids.length]);
  }

  // ---------- Mouse ----------

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
  }
  const inside = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

  /** The box under the mouse, and which part: an edge or corner (resize) or the middle (move). */
  function boxAt(p) {
    const c = now();
    const v = view();
    for (const kind of ['hit', 'hurt']) {
      if (!editable(c.src[kind])) continue;
      const list = c.boxes[kind];
      // The selected box first, then the rest from the top.
      const order = list.map((_, i) => i).reverse().sort((a, b) => (picked?.kind === kind && picked.i === b) - (picked?.kind === kind && picked.i === a));
      for (const i of order) {
        const [x, y, w, h] = rectOf(list[i], v);
        const T = 5;
        if (p.x < x - T || p.x > x + w + T || p.y < y - T || p.y > y + h + T) continue;
        const part = { l: Math.abs(p.x - x) <= T, r: Math.abs(p.x - (x + w)) <= T, t: Math.abs(p.y - y) <= T, b: Math.abs(p.y - (y + h)) <= T };
        if (w < 3 * T) part.l = part.l && !part.r;
        if (h < 3 * T) part.t = part.t && !part.b;
        return { kind, i, part, move: !(part.l || part.r || part.t || part.b) };
      }
    }
    return null;
  }

  function onDown(e) {
    if (e.button !== 0) return;
    const p = pos(e);
    mouse.shift = e.shiftKey;
    if (p.x < LIST_W) {
      if (p.y < LIST_TOP - 14) { nextCharacter(); return; }
      if (mode === 'fx') { fxPage.onListDown(p); return; }
      const i = listScroll + Math.floor((p.y - (LIST_TOP - 11)) / ROW);
      if (i >= 0 && i < names.length) setState(i);
      return;
    }
    const btn = buttons.find((b) => inside(p, b));
    if (btn) { if (btn.on) btn.on(); else if (btn.why) say(btn.why, '#ffb86b'); return; }
    if (mode === 'hit') { tuner.onDown(p); return; }
    if (mode === 'cancel') { grid.onDown(p); return; }
    if (mode === 'fx') { fxPage.onDown(p); return; }
    const line = lineAt(p);
    if (line) {
      const plan = timingOf(now()).plan;
      if (!plan.ok) { say(plan.why, '#ffb86b'); return; }
      playing = false;
      drag = { line, before: JSON.stringify(raw) };
      return;
    }
    if (inside(p, STRIP) || inside(p, { ...BAR, y: BAR.y - 2, h: BAR.h + 6 })) { drag = { bar: true }; scrub(p); return; }
    if (!inside(p, STAGE)) return;
    const hit = boxAt(p);
    if (!hit) { picked = null; return; }
    picked = { kind: hit.kind, i: hit.i };
    playing = false;
    drag = { ...hit, from: p, start: clone(now().boxes[hit.kind][hit.i]), before: JSON.stringify(raw) };
  }

  function scrub(p) {
    const n = stOf(names[sel]).frames.length;
    setFrame(Math.max(0, Math.min(n - 1, Math.floor(((p.x - BAR.x) / BAR.w) * n))));
    playing = false;
  }

  function onMove(e) {
    const p = pos(e);
    mouse.x = p.x;
    mouse.y = p.y;
    mouse.shift = e.shiftKey;
    if (mode === 'hit') { canvas.style.cursor = ''; tuner.onMove(p); return; }
    if (mode === 'cancel' || mode === 'fx') { canvas.style.cursor = ''; return; }
    if (!drag && lineAt(p)) { canvas.style.cursor = timingOf(now()).plan.ok ? 'ew-resize' : 'not-allowed'; return; }
    if (drag?.line) { dragLine(p); return; }
    if (!drag) {
      const hit = inside(p, STAGE) ? boxAt(p) : null;
      const part = hit?.part;
      canvas.style.cursor = !hit ? '' : hit.move ? 'move'
        : (part.l && part.t) || (part.r && part.b) ? 'nwse-resize' : (part.r && part.t) || (part.l && part.b) ? 'nesw-resize'
          : part.l || part.r ? 'ew-resize' : 'ns-resize';
      return;
    }
    if (drag.bar) { scrub(p); return; }
    const v = view();
    const dx = Math.round((p.x - drag.from.x) / v.z);
    const dy = -Math.round((p.y - drag.from.y) / v.z); // up is positive in the game
    const b = [...drag.start];
    if (drag.move) { b[0] += dx; b[1] += dy; }
    if (drag.part.l) { const d = Math.min(dx, b[2] - 2); b[0] += d; b[2] -= d; }
    if (drag.part.r) b[2] = Math.max(2, b[2] + dx);
    if (drag.part.t) b[3] = Math.max(2, b[3] + dy);
    if (drag.part.b) { const d = Math.min(dy, b[3] - 2); b[1] += d; b[3] -= d; }
    const c = now();
    const list = c.boxes[drag.kind];
    list[drag.i] = b;
    try {
      setBoxes(raw, c.src[drag.kind], list);
      recompile();
    } catch (err) {
      raw = JSON.parse(drag.before);
      recompile();
      drag = null;
      say(err.message, '#ff6b6b');
    }
  }

  function onUp() {
    tuner.onUp();
    if (drag && !drag.bar && JSON.stringify(raw) !== drag.before) { undo.push(drag.before); if (undo.length > 200) undo.shift(); }
    drag = null;
  }

  function onWheel(e) {
    const p = pos(e);
    if (p.x < LIST_W && mode === 'fx') {
      fxPage.onListWheel(e);
    } else if (p.x < LIST_W) {
      const rows = Math.floor((H - 24 - LIST_TOP) / ROW);
      listScroll = Math.max(0, Math.min(Math.max(0, names.length - rows), listScroll + Math.sign(e.deltaY) * 3));
    } else if (inside(p, PAGE_STAGE) && mode === 'fx') {
      fxPage.onWheel(e);
    } else if (inside(p, PAGE_STAGE) && mode === 'hit') {
      tuner.onWheel(e);
    } else if (inside(p, STAGE)) {
      zoomMul = Math.max(0.5, Math.min(3, zoomMul * (e.deltaY < 0 ? 1.25 : 0.8)));
    } else if (mode === 'hit' && p.y > PAGE_STAGE.y + PAGE_STAGE.h) {
      tuner.onScroll(e);
    } else return;
    e.preventDefault();
  }

  canvas.addEventListener('mousedown', onDown);
  addEventListener('mousemove', onMove);
  addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // ---------- Drawing ----------

  function text(s, x, y, { color = INK, size = 12, weight = 400, align = 'left' } = {}) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  /** A button, drawn now and remembered for clicks. on: what it does; why: what to say if it can't be used. */
  function button(label, x, y, { on = null, why = '', lit = false, small = false } = {}) {
    if (small) {
      const b = { x, y, w: 16, h: 14, on, why };
      buttons.push(b);
      ctx.fillStyle = inside(mouse, b) && on ? '#3d3154' : '#2a2238';
      ctx.fillRect(x, y, 16, 14);
      text(label, x + 8, y + 11, { color: INK, size: 11, weight: 700, align: 'center' });
      return x + 19;
    }
    ctx.font = `600 11px ${FONT}`;
    const w = Math.ceil(ctx.measureText(label).width) + 16;
    const b = { x, y, w, h: 20, on, why };
    buttons.push(b);
    const hover = inside(mouse, b) && !!on;
    ctx.fillStyle = !on ? '#1c1626' : lit ? '#5a4514' : hover ? '#3d3154' : '#2a2238';
    ctx.fillRect(x, y, w, 20);
    ctx.strokeStyle = !on ? '#2c2538' : lit ? GOLD : '#4a3f61';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 19);
    text(label, x + 8, y + 14, { color: !on ? '#5a516b' : lit ? GOLD : INK, size: 11, weight: 600 });
    return x + w + 6;
  }

  function describe(key, c) {
    const s = c.src[key];
    if (c.info.type === 'projectile') {
      if (key === 'hurt') return 'a projectile has no hurtbox';
      return s.kind === 'path' ? "this projectile's hitbox, for its whole flight (measured from its leading edge)" : 'none: the projectile has already hit (impact drawings)';
    }
    const thing = c.info.type === 'move' ? 'move' : 'state';
    if (s.kind === 'stat') {
      const own = raw.character.stats?.[s.stat] ? "this character's" : 'the system default';
      return `the shared ${c.st.stance === 'air' ? 'in-the-air' : c.st.stance === 'crouch' ? 'crouching' : 'standing'} hurtbox (${own}): changing it changes every state that uses it`;
    }
    if (s.kind === 'path' && s.where === 'field') {
      return key === 'hurt' ? "this move's own hurtboxes (the whole move)"
        : `this move's hitboxes (frames ${c.st.move.startup - 1} to ${c.st.move.startup + c.st.move.active - 2})`;
    }
    if (s.kind === 'path') return `this ${thing}, from frame ${s.at} on`;
    if (s.kind === 'system') return 'set by the system for every character (not editable here)';
    if (key === 'hit') return s.why === 'remote' ? 'no box: this hit lands wherever the opponent is' : 'none on this frame';
    return 'none on this frame';
  }

  function drawList() {
    ctx.fillStyle = '#120d1b';
    ctx.fillRect(0, 0, LIST_W, H);
    text('BOX EDITOR', 12, 22, { color: GOLD, size: 15, weight: 800 });
    text(`${def.name}${ids.length > 1 ? '  ▸' : ''}`, 12, 39, { color: DIM, size: 11 });
    const rows = Math.floor((H - 24 - LIST_TOP) / ROW);
    for (let k = 0; k < rows && listScroll + k < names.length; k++) {
      const i = listScroll + k;
      const y = LIST_TOP + k * ROW;
      const proj = isProj(names[i]);
      const type = proj ? 'projectile' : stateInfo(raw, SYSTEM, names[i]).type;
      if (i === sel) {
        ctx.fillStyle = '#ffd36b22';
        ctx.fillRect(0, y - 11, LIST_W, ROW);
        ctx.fillStyle = GOLD;
        ctx.fillRect(0, y - 11, 3, ROW);
      }
      text(proj ? names[i].slice(PROJ.length) : names[i], 12, y, { color: i === sel ? GOLD : type === 'move' || proj ? INK : DIM, size: 11, weight: i === sel ? 700 : 400 });
      if (type !== 'move') text(proj ? 'projectile' : type === 'own' ? 'state' : type === 'system' ? 'system' : 'shared', LIST_W - 8, y, { color: proj ? '#8a6fc0' : '#5a516b', size: 9, align: 'right' });
    }
    if (names.length > rows) {
      const th = Math.max(20, ((H - LIST_TOP) * rows) / names.length);
      ctx.fillStyle = '#3a3050';
      ctx.fillRect(LIST_W - 3, LIST_TOP - 11 + ((H - LIST_TOP - th) * listScroll) / (names.length - rows), 3, th);
    }
  }

  function drawStage(c, v) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1726');
    g.addColorStop(1, '#0d0b12');
    ctx.fillStyle = g;
    ctx.fillRect(LIST_W, 0, W - LIST_W, H);
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    // The floor, a mark every 50 px, and the line through the fighter's feet (x = 0).
    ctx.fillStyle = '#231e2e';
    ctx.fillRect(STAGE.x, GY, STAGE.w, STAGE.y + STAGE.h - GY);
    ctx.strokeStyle = '#3a3347';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(STAGE.x, GY + 0.5);
    ctx.lineTo(STAGE.x + STAGE.w, GY + 0.5);
    ctx.stroke();
    for (let x = -600; x <= 600; x += 50) {
      const sx = Math.round(v.ox + v.z * x);
      if (sx < STAGE.x || sx > STAGE.x + STAGE.w) continue;
      ctx.fillStyle = x === 0 ? '#6a5f80' : '#2f2839';
      ctx.fillRect(sx, GY + 1, 1, x % 100 === 0 ? 7 : 4);
      if (x % 100 === 0) text(String(x), sx, GY + 16, { color: '#5a516b', size: 9, align: 'center' });
    }
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(Math.round(v.ox), STAGE.y, 1, GY - STAGE.y);

    if (c.info.type === 'projectile') {
      // The projectile's own drawing, where it is released; a small cross marks that point.
      const [offX, offY] = offsetOf(c.name);
      const px0 = v.ox + v.z * offX, py0 = GY - v.z * offY;
      if (c.st.projectile.sprite) renderer.poseSheet(def, c.st.projectile.sprite, c.fr.sprite.index, px0, py0, v.z);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(px0) - 5, Math.round(py0), 11, 1);
      ctx.fillRect(Math.round(px0), Math.round(py0) - 5, 1, 11);
    } else renderer.pose(def, c.name, c.f, v.ox, GY, v.z, 0);

    // Boxes: the ones you can't edit here are faint; hurt green, hit red.
    const faint = [[c.fr.push, COLORS.push, 0.05, [3, 3]], [c.fr.throw, COLORS.throw, 0.15, [3, 3]]];
    for (const [list, color, fill, dash] of faint) {
      for (const b of list) {
        const [x, y, w, h] = rectOf(b.map((n) => n / UNIT), v);
        ctx.globalAlpha = fill;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.setLineDash(dash);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.setLineDash([]);
      }
    }
    for (const kind of ['hurt', 'hit']) {
      const can = editable(c.src[kind]);
      c.boxes[kind].forEach((b, i) => {
        const [x, y, w, h] = rectOf(b, v);
        const on = picked?.kind === kind && picked.i === i;
        ctx.globalAlpha = on ? 0.4 : kind === 'hit' ? 0.3 : 0.18;
        ctx.fillStyle = COLORS[kind];
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = can ? 1 : 0.5;
        ctx.strokeStyle = on ? '#ffffff' : COLORS[kind];
        ctx.lineWidth = on ? 2 : 1;
        if (!can) ctx.setLineDash([4, 3]);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (on) {
          ctx.fillStyle = '#ffffff';
          for (const [hx, hy] of [[x, y], [x + w / 2, y], [x + w, y], [x, y + h / 2], [x + w, y + h / 2], [x, y + h], [x + w / 2, y + h], [x + w, y + h]]) ctx.fillRect(hx - 3, hy - 3, 6, 6);
        }
      });
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    const title = isProj(c.name) ? c.name.slice(PROJ.length) : c.name;
    text(title, STAGE.x + 6, 20, { size: 15, weight: 800 });
    const m = c.st.move;
    const pd = c.st.projectile;
    const about = pd ? `projectile · speed ${pd.speed / UNIT} · lasts ${pd.lifetime} frames · released at forward ${offsetOf(c.name)[0]}, up ${offsetOf(c.name)[1]}`
      : m ? `startup ${m.startup} · active ${m.active} · recovery ${m.recovery} · ${c.st.stance}` : `${c.st.stance}${c.st.loop ? ' · loops' : ''}`;
    text(about, STAGE.x + 6 + ctx.measureText(title).width + 22, 20, { color: DIM, size: 11 });
    text(`zoom ${v.z.toFixed(2)}×`, W - 210, 20, { color: '#5a516b', size: 10, align: 'right' });
    const legend = [['hurtbox', COLORS.hurt], ['hitbox', COLORS.hit], ['push / throw (not editable)', '#8f86a3']];
    let lx = W - 10;
    for (const [label, color] of legend.reverse()) {
      text(label, lx, STAGE.y + 12, { color, size: 10, align: 'right' });
      lx -= ctx.measureText(label).width + 14;
    }
  }

  function drawBar(c) {
    const n = c.st.frames.length;
    const cw = BAR.w / n;
    const m = c.st.move;
    for (let f = 0; f < n; f++) {
      const fr = c.st.frames[f];
      let color = '#3a3347';
      if (m) color = f < m.startup - 1 ? '#3fae6a' : fr.hit.length || fr.throw.length ? '#e0483f' : '#3b7fd9';
      else if (c.st.projectile) color = fr.hit.length ? '#e0483f' : '#3b7fd9';
      else if (!fr.hurt.length) color = '#6a5f80';
      ctx.fillStyle = color;
      ctx.globalAlpha = f === c.f ? 1 : 0.55;
      ctx.fillRect(BAR.x + f * cw + 0.5, BAR.y, Math.max(1, cw - 1), BAR.h);
      // A notch where the drawing changes.
      if (f > 0 && fr.sprite && c.st.frames[f - 1].sprite && (fr.sprite.index !== c.st.frames[f - 1].sprite.index || fr.sprite.sheet !== c.st.frames[f - 1].sprite.sheet)) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = '#0d0b12';
        ctx.fillRect(BAR.x + f * cw, BAR.y, 1, 5);
      }
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(BAR.x + c.f * cw, BAR.y - 1, Math.max(3, cw), BAR.h + 2);
    drawStrip(c, cw);
  }

  /** Each drawing as a block with the frames it stays on screen; gold lines between them can be dragged. */
  function drawStrip(c, cw) {
    const t = timingOf(c);
    t.runs.forEach((r, i) => {
      const x = BAR.x + r.start * cw, w = r.len * cw;
      const on = i === t.at;
      ctx.fillStyle = on ? '#5a4514' : i % 2 ? '#2a2238' : '#221b2e';
      ctx.fillRect(x + 0.5, STRIP.y, Math.max(1, w - 1), STRIP.h);
      if (w >= 9) text(String(r.len), x + w / 2, STRIP.y + 11, { color: on ? GOLD : INK, size: w >= 16 ? 10 : 8, weight: on ? 700 : 400, align: 'center' });
    });
    if (!t.plan.ok) return;
    const hover = drag?.line ?? lineAt(mouse);
    for (let b = 1; b < t.runs.length; b++) {
      const x = Math.round(BAR.x + t.runs[b].start * cw);
      ctx.fillStyle = b === hover ? '#ffffff' : GOLD;
      ctx.fillRect(x - 1, STRIP.y - 2, b === hover ? 3 : 2, STRIP.h + 4);
    }
  }

  function drawPanel(c) {
    let y = 388;
    // Where this frame's boxes come from, and the ways to give it its own.
    const hs = c.src.hurt;
    text('Hurtbox:', 190, y + 14, { color: COLORS.hurt, size: 11, weight: 700 });
    text(describe('hurt', c), 246, y + 14, { color: DIM, size: 11 });
    y += 22;
    let x = 246;
    const can = c.info.type !== 'universal' && c.info.type !== 'projectile' && hs.kind !== 'system';
    if (hs.kind === 'stat' && c.info.type === 'move') {
      x = button('OWN HURTBOX FOR THIS MOVE', x, y, { on: () => change(() => overrideMove(raw, SYSTEM, c.name, c.boxes.hurt)) });
    }
    if (can && !(hs.kind === 'path' && hs.where === 'event' && hs.at === c.f)) {
      const label = c.f === 0 && c.info.type !== 'move' ? 'OWN HURTBOX FOR THIS STATE' : `NEW HURTBOX FROM FRAME ${c.f} ON`;
      x = button(label, x, y, { on: () => change(() => overrideFromFrame(raw, SYSTEM, c.name, c.f, c.boxes.hurt)) });
    }
    if (hs.kind === 'path') x = button('REMOVE THIS OVERRIDE', x, y, { on: () => { change(() => removeSource(raw, hs)); picked = null; } });
    if (hs.kind === 'stat' && raw.character.stats?.[hs.stat]) x = button('BACK TO THE SYSTEM DEFAULT', x, y, { on: () => { change(() => removeSource(raw, hs)); picked = null; } });
    y += 26;
    text('Hitbox:', 190, y + 14, { color: COLORS.hit, size: 11, weight: 700 });
    text(describe('hit', c), 246, y + 14, { color: DIM, size: 11 });

    // Actions.
    y = 454;
    x = 190;
    const plan = hitPlan(c);
    x = button('+ HURTBOX', x, y, editable(hs) ? { on: () => addBox('hurt') } : { why: c.info.type === 'projectile' ? 'A projectile has no hurtbox.' : 'The hurtbox on this frame is set by the system for every character.' });
    x = button('+ HITBOX', x, y, plan.ok ? { on: () => addBox('hit') } : { why: plan.why });
    x = button('DELETE BOX', x, y, c.info.type === 'projectile' ? { why: 'A projectile needs its hitbox: it can be moved and resized, not deleted.' } : picked ? { on: deleteBox } : { why: 'Click a box first.' });
    x += 10;
    x = button('◀ FRAME', x, y, { on: () => { playing = false; setFrame(frame - 1); } });
    x = button(playing ? 'PAUSE' : 'PLAY', x, y, { on: () => { playing = !playing; }, lit: playing });
    x = button('FRAME ▶', x, y, { on: () => { playing = false; setFrame(frame + 1); } });
    x = button('½×', x, y, { on: () => { slow = !slow; }, lit: slow });
    x += 10;
    x = button('UNDO', x, y, undo.length ? { on: undoOnce } : { why: 'Nothing to undo.' });
    const d = dirty();
    x = button(saving ? 'SAVING…' : 'SAVE', x, y, d && !saving ? { on: save, lit: true } : { why: 'Nothing to save.' });
    text(d ? 'unsaved changes' : 'saved', x + 4, y + 14, { color: d ? '#ffb86b' : '#5a516b', size: 11 });

    // The drawing on screen and how long it holds.
    const t = timingOf(c);
    const r = t.runs[t.at];
    const ty = 480;
    text('Drawing:', 190, ty + 14, { color: GOLD, size: 11, weight: 700 });
    x = button('−1 FRAME', 246, ty, t.plan.ok ? { on: () => holdStep(-1) } : { why: t.plan.why });
    x = button('+1 FRAME', x, ty, t.plan.ok ? { on: () => holdStep(1) } : { why: t.plan.why });
    const snap = SNAP[charId];
    const snapNote = !t.plan.ok ? t.plan.why
      : snapApplies(snap, def, c.name) ? 'In the fight, snap timing (a polish switch) plays this move re-timed until you change its timing here.'
        : snap?.moves?.[c.name] ? 'Your own timing: snap timing no longer re-times this move in the fight.' : '';
    text(`${r.index >= 0 ? `drawing ${r.index + 1}` : 'no drawing'} · ${r.len} frame${r.len === 1 ? '' : 's'} (frames ${r.start}–${r.start + r.len - 1}) · ${t.runs.length} drawings, ${c.st.frames.length} frames in all`, x + 6, ty + 14, { color: INK, size: 11 });

    // The frame, and the selected box in numbers.
    text(`Frame ${c.f} of 0–${c.st.frames.length - 1}`, W - 10, 402, { size: 12, weight: 700, align: 'right' });
    if (picked && c.boxes[picked.kind][picked.i]) {
      const [bx, by, bw, bh] = c.boxes[picked.kind][picked.i];
      text(`${NAMES[picked.kind]} ${picked.i + 1} of ${c.boxes[picked.kind].length}`, W - 10, 424, { color: COLORS[picked.kind], size: 11, weight: 700, align: 'right' });
      text(`forward ${bx} · up ${by} · wide ${bw} · tall ${bh}`, W - 10, 440, { color: INK, size: 11, align: 'right' });
    } else text('click a box to select it', W - 10, 424, { color: '#5a516b', size: 11, align: 'right' });
    // The bottom line: a message, else what to know about this state's drawing timing.
    if (msg && tick < msg.until) text(msg.text, 190, 513, { color: msg.color, size: 12, weight: 600 });
    else if (snapNote) text(snapNote, 190, 513, { color: '#8a7f9e', size: 11 });
  }

  /** The page tabs, top right, on both pages. */
  function drawTabs() {
    let x = W - 312;
    x = button('BOXES', x, 4, { on: () => { mode = 'boxes'; }, lit: mode === 'boxes' });
    x = button('HIT SETTINGS', x, 4, { on: () => { mode = 'hit'; playing = false; picked = null; }, lit: mode === 'hit' });
    x = button('CANCELS', x, 4, { on: () => { mode = 'cancel'; playing = false; picked = null; }, lit: mode === 'cancel' });
    button('FX', x, 4, { on: () => { mode = 'fx'; playing = false; picked = null; }, lit: mode === 'fx' });
  }

  const tuner = createTuner({
    ctx, app, renderer, STAGE: PAGE_STAGE, W, H, text, button, say, mouse,
    raw: () => raw, def: () => def, charId: () => charId, entry: () => names[sel], version: () => version,
    change, undoOnce, undoCount: () => undo.length, dirty, saving: () => saving, save,
    hint: (s, weak = false) => { if (!weak || !hintText) hintText = s; },
    /** For a drag: many small changes that undo as one (snapshot before, apply as it moves, commit at the end). */
    snapshot: () => JSON.stringify(raw),
    apply(fn) {
      const before = JSON.stringify(raw);
      try { fn(); recompile(); } catch (err) { raw = JSON.parse(before); recompile(); say(err.message, '#ff6b6b'); }
    },
    commit(before) { if (JSON.stringify(raw) !== before) { undo.push(before); if (undo.length > 200) undo.shift(); } },
  });

  const grid = createCancelGrid({
    ctx, W, H, text, button, say, mouse,
    raw: () => raw, def: () => def, charId: () => charId, entry: () => names[sel], version: () => version,
    change, undoOnce, undoCount: () => undo.length, dirty, saving: () => saving, save,
    hint: (s) => { hintText = s; },
    select: (id) => { const i = names.indexOf(id); if (i >= 0) setState(i); },
  });

  const fxPage = createFxPage({
    ctx, renderer, STAGE: PAGE_STAGE, W, H, LIST_W, text, button, say, mouse,
    raw: () => raw, def: () => def, charId: () => charId, manyCharacters: () => ids.length > 1,
    change, undoOnce, undoCount: () => undo.length, dirty, saving: () => saving, save,
    hint: (s, weak = false) => { if (!weak || !hintText) hintText = s; },
  });

  return {
    get help() {
      return mode === 'hit' ? tuner.help : mode === 'cancel' ? grid.help : mode === 'fx' ? fxPage.help : this.boxHelp;
    },
    boxHelp: 'T page · drag a box · arrows nudge (Shift size, Ctrl ×10) · , . frame · [ ] move · gold line or - = : drawing timing · Space play · S slow · Ctrl+Z / Ctrl+S · Esc',
    /** Ctrl+S (main.js sends it to the current screen under this name). */
    saveReplay: save,
    close() {
      canvas.removeEventListener('mousedown', onDown);
      removeEventListener('mousemove', onMove);
      removeEventListener('mouseup', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.style.cursor = '';
    },
    step(menu) {
      tick++;
      if (mode === 'hit') tuner.step();
      else if (mode === 'fx') fxPage.step();
      else if (playing && !drag && (!slow || tick % 2 === 0)) setFrame(frame + 1);
      if (menu[0].escape) {
        if (mode === 'hit' && tuner.cancel()) return;
        if (mode === 'fx' && fxPage.cancel()) return;
        if (dirty() && tick > leaveArmed) {
          leaveArmed = tick + 180;
          say('Unsaved changes. Ctrl+S to save, or Esc again to leave without saving.', '#ffb86b', 180);
          return;
        }
        app.go('title', { index: 4 });
      }
    },
    onKey(e) {
      const ctrl = e.ctrlKey || e.metaKey;
      const step = ctrl ? 10 : 1;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
      if (arrows[e.code]) {
        e.preventDefault();
        const [dx, dy] = arrows[e.code];
        if (mode === 'cancel') { if (dy) grid.move(-dy); return; }
        if (mode === 'fx') { if (!fxPage.onKey(e) && dy) fxPage.move(-dy); return; }
        if (picked) nudge(dx, dy, e.shiftKey, step);
        else if (dx) { playing = false; setFrame(frame + dx); } else setState(sel - dy);
        return;
      }
      if (e.code === 'KeyZ' && ctrl) { e.preventDefault(); undoOnce(); return; }
      if (ctrl) return;
      if (e.code === 'KeyT' && !e.repeat) { mode = PAGES[(PAGES.indexOf(mode) + 1) % PAGES.length]; playing = false; picked = null; return; }
      if (mode === 'cancel') {
        if (e.code === 'BracketLeft' || e.code === 'PageUp') { e.preventDefault(); grid.move(-1); }
        else if (e.code === 'BracketRight' || e.code === 'PageDown') { e.preventDefault(); grid.move(1); }
        else if (e.code === 'KeyC' && !e.repeat) nextCharacter();
        return;
      }
      if (mode === 'fx') {
        if (fxPage.onKey(e)) return;
        if (e.code === 'BracketLeft' || e.code === 'PageUp') { e.preventDefault(); fxPage.move(-1); }
        else if (e.code === 'BracketRight' || e.code === 'PageDown') { e.preventDefault(); fxPage.move(1); }
        else if (e.code === 'KeyC' && !e.repeat) nextCharacter();
        return;
      }
      if (mode === 'hit') {
        if (tuner.onKey(e)) return;
        if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); setState(sel + (e.code === 'ArrowUp' ? -1 : 1)); }
        else if (e.code === 'BracketLeft' || e.code === 'PageUp') { e.preventDefault(); setState(sel - 1); }
        else if (e.code === 'BracketRight' || e.code === 'PageDown') { e.preventDefault(); setState(sel + 1); }
        else if (e.code === 'KeyC' && !e.repeat) nextCharacter();
        return;
      }
      if (e.code === 'Comma') { playing = false; setFrame(frame - 1); }
      else if (e.code === 'Period') { playing = false; setFrame(frame + 1); }
      else if (e.code === 'BracketLeft' || e.code === 'PageUp') { e.preventDefault(); setState(sel - 1); }
      else if (e.code === 'BracketRight' || e.code === 'PageDown') { e.preventDefault(); setState(sel + 1); }
      else if (e.code === 'Minus' || e.code === 'NumpadSubtract') holdStep(-1);
      else if (e.code === 'Equal' || e.code === 'NumpadAdd') holdStep(1);
      else if (e.repeat) return;
      else if (e.code === 'Space') { e.preventDefault(); playing = !playing; }
      else if (e.code === 'KeyS') slow = !slow;
      else if (e.code === 'Delete' || e.code === 'KeyX') deleteBox();
      else if (e.code === 'KeyH') addBox('hit');
      else if (e.code === 'KeyU') addBox('hurt');
      else if (e.code === 'KeyC') nextCharacter();
      else if (e.code === 'Tab') {
        e.preventDefault();
        const c = now();
        const all = ['hurt', 'hit'].flatMap((kind) => (editable(c.src[kind]) ? c.boxes[kind].map((_, i) => ({ kind, i })) : []));
        if (!all.length) return;
        const at = all.findIndex((b) => b.kind === picked?.kind && b.i === picked?.i);
        picked = all[(at + 1) % all.length];
      }
    },
    draw() {
      buttons = [];
      const c = now();
      hintText = '';
      if (mode === 'hit') {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#1b1726');
        g.addColorStop(1, '#0d0b12');
        ctx.fillStyle = g;
        ctx.fillRect(LIST_W, 0, W - LIST_W, H);
        tuner.draw(c);
        // Messages, and what the setting under the mouse does, on a strip along the bottom of the fight.
        const line = msg && tick < msg.until ? msg : hintText ? { text: hintText, color: INK } : null;
        if (line) {
          ctx.fillStyle = '#0d0b12dd';
          ctx.fillRect(PAGE_STAGE.x, PAGE_STAGE.y + PAGE_STAGE.h - 20, PAGE_STAGE.w, 20);
          text(line.text, PAGE_STAGE.x + 8, PAGE_STAGE.y + PAGE_STAGE.h - 6, { color: line.color, size: 12, weight: 600 });
        }
      } else if (mode === 'fx') {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, '#1b1726');
        g.addColorStop(1, '#0d0b12');
        ctx.fillStyle = g;
        ctx.fillRect(LIST_W, 0, W - LIST_W, H);
        fxPage.draw();
        const line = msg && tick < msg.until ? msg : hintText ? { text: hintText, color: INK } : null;
        if (line) {
          ctx.fillStyle = '#0d0b12dd';
          ctx.fillRect(PAGE_STAGE.x, PAGE_STAGE.y + PAGE_STAGE.h - 20, PAGE_STAGE.w, 20);
          text(line.text, PAGE_STAGE.x + 8, PAGE_STAGE.y + PAGE_STAGE.h - 6, { color: line.color, size: 12, weight: 600 });
        }
      } else if (mode === 'cancel') {
        ctx.fillStyle = '#1b1726';
        ctx.fillRect(LIST_W, 0, W - LIST_W, H);
        grid.draw();
        const line = msg && tick < msg.until ? msg : hintText ? { text: hintText, color: INK } : null;
        if (line) text(line.text, 190, 56, { color: line.color, size: 12, weight: 600 });
      } else {
        const v = view();
        drawStage(c, v);
        ctx.fillStyle = '#150f20';
        ctx.fillRect(LIST_W, STAGE.y + STAGE.h + 2, W - LIST_W, H - STAGE.y - STAGE.h - 2);
        drawBar(c);
        drawPanel(c);
      }
      drawTabs();
      if (mode === 'fx') fxPage.drawList(); else drawList();
    },
  };
}
