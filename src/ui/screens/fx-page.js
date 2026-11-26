// The box editor's fourth page, FX: every effect sheet the character owns (one-shot effects, projectiles, a burst's
// fire and smoke) with its size, rotation, opacity and colour as numbers you click, and the effect looping above
// them where it appears on the fighter. Where each setting is written is worked out by src/editor/fx-model.js. The
// box editor (box-editor.js) owns the file, undo and saving, and hands them in as `env`. Drawing only: nothing here
// changes how the game plays.
import FX from '../../../data/system/effects.json';
import { fxEntries, spriteOf, FX_FIELDS, fxField, SWATCHES, readFx, writeFx, resetFx, nudgeFx, showFx, fxPlayback, fxFrameAt } from '../../editor/fx-model.js';
import { INK, DIM, GOLD } from './common.js';

const CLASSES = FX.opacity?.classes ?? {};
const ROW_H = 14;
const TOP = 386;
const LIST_ROW = 15;
const LIST_TOP = 56;
const KIND = { effect: 'effect', projectile: 'projectile', burst: 'burst', layer: 'layer' };
const BACKDROPS = [['DARK', '#0d0b12', '#231e2e'], ['GREY', '#5b6472', '#48505c'], ['LIGHT', '#d9d2c4', '#b9b1a2']];

export function createFxPage(env) {
  const { ctx, renderer, STAGE, W, H, LIST_W, text, button, say, mouse } = env;
  const GY = STAGE.y + STAGE.h - 40;
  const picks = {}; // per character: the selected effect's id
  let picked = null; // the selected setting's key
  let typing = '';
  let paused = false;
  let fighter = true;
  let backdrop = 0;
  let zoom = 1.5;
  let t = 0;
  let listScroll = 0;
  let cells = [];
  let swatches = [];

  const entries = () => fxEntries(env.raw());
  function current() {
    const list = entries();
    if (!list.length) return null;
    return list.find((e) => e.id === picks[env.charId()]) ?? list[0];
  }
  function select(i) {
    const list = entries();
    if (!list.length) return;
    const n = ((i % list.length) + list.length) % list.length;
    picks[env.charId()] = list[n].id;
    typing = '';
    t = 0;
    const rows = Math.floor((H - 24 - LIST_TOP) / LIST_ROW);
    if (n < listScroll) listScroll = n;
    if (n >= listScroll + rows) listScroll = n - rows + 1;
  }
  const index = () => { const c = current(); return c ? entries().findIndex((e) => e.id === c.id) : -1; };

  function edit(fn) {
    typing = '';
    return env.change(fn);
  }
  const nudge = (key, dir, big) => { const c = current(); if (c) edit(() => nudgeFx(env.raw(), c, key, dir, big, CLASSES)); };
  function reset(key) {
    const c = current();
    if (!key || !c) { say('Click a setting first.'); return; }
    edit(() => resetFx(env.raw(), c, key));
  }

  // ---------- Drawing ----------

  function drawList() {
    const list = entries();
    const sel = index();
    ctx.fillStyle = '#120d1b';
    ctx.fillRect(0, 0, LIST_W, H);
    text('BOX EDITOR', 12, 22, { color: GOLD, size: 15, weight: 800 });
    text(`${env.def().name}${env.manyCharacters() ? '  ▸' : ''}`, 12, 39, { color: DIM, size: 11 });
    const rows = Math.floor((H - 24 - LIST_TOP) / LIST_ROW);
    listScroll = Math.max(0, Math.min(Math.max(0, list.length - rows), listScroll));
    for (let k = 0; k < rows && listScroll + k < list.length; k++) {
      const i = listScroll + k;
      const y = LIST_TOP + k * LIST_ROW;
      if (i === sel) {
        ctx.fillStyle = '#ffd36b22';
        ctx.fillRect(0, y - 11, LIST_W, LIST_ROW);
        ctx.fillStyle = GOLD;
        ctx.fillRect(0, y - 11, 3, LIST_ROW);
      }
      const e = list[i];
      const label = e.label.length > 19 ? `${e.label.slice(0, 18)}…` : e.label;
      text(label, 12, y, { color: i === sel ? GOLD : INK, size: 11, weight: i === sel ? 700 : 400 });
      text(KIND[e.kind], LIST_W - 8, y, { color: e.kind === 'effect' ? '#5a516b' : '#8a6fc0', size: 9, align: 'right' });
    }
    if (!list.length) text('No effect sheets.', 12, LIST_TOP, { color: DIM, size: 11 });
  }

  function drawPreview(c) {
    const [, sky, floor] = BACKDROPS[backdrop];
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    ctx.fillStyle = sky;
    ctx.fillRect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.fillStyle = floor;
    ctx.fillRect(STAGE.x, GY, STAGE.w, STAGE.y + STAGE.h - GY);
    if (c) {
      const raw = env.raw(), def = env.def();
      const play = fxPlayback(raw, c);
      const ox = STAGE.x + STAGE.w / 2 - zoom * (play.at[0] / 2);
      if (fighter && def.states.idle) renderer.pose(def, 'idle', 0, ox, GY, zoom, 0);
      const now = fxFrameAt(play, t);
      if (now) {
        const sprite = spriteOf(raw, c);
        const op = readFx(raw, c, 'opacity', CLASSES).value;
        const x = ox + zoom * play.at[0], y = GY - zoom * play.at[1];
        ctx.save();
        // The sheet's own opacity (a burst's sheet) is applied by the renderer; every other kind is applied here.
        ctx.globalAlpha = c.kind === 'burst' ? 1 : op;
        renderer.poseSheet(def, now[1] === 1 ? sprite : { ...sprite, scale: (sprite.scale ?? 1) * now[1] }, now[0], x, y, zoom);
        ctx.restore();
        // A small cross where the effect is placed.
        ctx.fillStyle = backdrop === 2 ? '#00000066' : '#ffffff66';
        ctx.fillRect(Math.round(x) - 5, Math.round(y), 11, 1);
        ctx.fillRect(Math.round(x), Math.round(y) - 5, 1, 11);
      }
    }
    ctx.restore();
  }

  function drawStrip(c) {
    text(c ? c.label : 'FX', STAGE.x + 6, 20, { size: 15, weight: 800 });
    if (c) {
      const s = spriteOf(env.raw(), c);
      const about = `${KIND[c.kind]} · ${s.image} · ${s.count ?? (s.columns ?? 1) * (s.rows ?? 1)} drawings${s.additive ? ' · drawn as light' : ''}`;
      text(about, STAGE.x + 6 + ctx.measureText(c.label).width + 22, 20, { color: DIM, size: 11 });
    }
    let x = STAGE.x + 6;
    const y = STAGE.y + 5;
    x = button(paused ? 'PLAY' : 'PAUSE', x, y, { on: () => { paused = !paused; }, lit: paused });
    x = button(`BACKDROP: ${BACKDROPS[backdrop][0]}`, x, y, { on: () => { backdrop = (backdrop + 1) % BACKDROPS.length; } });
    x = button(fighter ? 'FIGHTER: ON' : 'FIGHTER: OFF', x, y, { on: () => { fighter = !fighter; } });
    x = button(`ZOOM ${zoom.toFixed(2)}×`, x, y, { why: 'Use the mouse wheel over the preview to zoom.' });
    x += 8;
    x = button('BACK TO DEFAULT', x, y, picked ? { on: () => reset(picked) } : { why: 'Click a setting first: this takes it out of the file again, so it goes back to its default.' });
    x = button('UNDO', x, y, env.undoCount() ? { on: env.undoOnce } : { why: 'Nothing to undo.' });
    const d = env.dirty();
    x = button(env.saving() ? 'SAVING…' : 'SAVE', x, y, d && !env.saving() ? { on: env.save, lit: true } : { why: 'Nothing to save.' });
    text(d ? 'unsaved' : 'saved', x + 2, y + 14, { color: d ? '#ffb86b' : '#5a516b', size: 11 });
  }

  function drawPanel(c) {
    cells = [];
    swatches = [];
    if (!c) { text('This character has no effect sheets.', 190, TOP + 30, { color: '#ffb86b', size: 12, weight: 600 }); return; }
    const raw = env.raw();
    const x = 190;
    text('THIS EFFECT, EVERYWHERE IT PLAYS', x, TOP, { color: GOLD, size: 10, weight: 800 });
    FX_FIELDS.forEach((f, i) => {
      const y = TOP + 6 + i * ROW_H;
      const v = readFx(raw, c, f.key, CLASSES);
      const on = picked === f.key;
      const cell = { x: x - 4, y, w: 250, h: ROW_H, key: f.key };
      cells.push(cell);
      const hover = mouse.x >= cell.x && mouse.x < cell.x + cell.w && mouse.y >= cell.y && mouse.y < cell.y + cell.h;
      if (on) { ctx.fillStyle = '#ffd36b22'; ctx.fillRect(cell.x, y, cell.w, ROW_H - 1); }
      else if (hover) { ctx.fillStyle = '#ffffff0c'; ctx.fillRect(cell.x, y, cell.w, ROW_H - 1); }
      if (hover && f.help) env.hint(f.help);
      const color = v.own ? INK : DIM;
      text(f.label, x + (f.colour !== undefined ? 12 : 0), y + 12, { color: on ? GOLD : color, size: 11, weight: v.own ? 700 : 400 });
      const str = on && typing ? `${typing}_` : showFx(f.key, v.value);
      text(str, x + 196, y + 12, { color: on ? '#ffffff' : color, size: 11, weight: v.own ? 700 : 400, align: 'right' });
      if (v.own) { ctx.fillStyle = GOLD; ctx.fillRect(x - 4, y + 3, 2, ROW_H - 7); }
      button('−', x + 203, y + 1, { on: () => { picked = f.key; nudge(f.key, -1, mouse.shift); }, small: true });
      button('+', x + 222, y + 1, { on: () => { picked = f.key; nudge(f.key, 1, mouse.shift); }, small: true });
    });
    // The colour swatches.
    const sx = 470, sy = TOP + 6;
    text('COLOUR', sx, TOP, { color: GOLD, size: 10, weight: 800 });
    const cur = readFx(raw, c, 'tint', CLASSES).value;
    SWATCHES.forEach((colour, i) => {
      const r = { x: sx + i * 30, y: sy + 4, w: 26, h: 26, colour };
      swatches.push(r);
      ctx.fillStyle = colour ?? '#1c1626';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (colour === null) text('NONE', r.x + 13, r.y + 17, { color: DIM, size: 8, weight: 700, align: 'center' });
      const on = (cur ?? null) === colour;
      ctx.strokeStyle = on ? '#ffffff' : '#4a3f61';
      ctx.lineWidth = on ? 2 : 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    });
    if (cur && !SWATCHES.includes(cur)) {
      ctx.fillStyle = cur;
      ctx.fillRect(sx, sy + 40, 26, 14);
      text(`your own mix: ${cur}`, sx + 32, sy + 51, { color: INK, size: 11 });
    }
    ['Click a swatch, or mix your own with Red / Green / Blue. Colour multiplies the drawing:', 'light effects take it cleanly, painted ones get darker; nothing gets brighter than painted.',
      'Bold with a gold mark: written in the file. Grey: the default. Shift-click − / + for bigger steps.']
      .forEach((line, i) => text(line, sx, sy + 74 + i * 13, { color: '#5a516b', size: 10 }));
  }

  // ---------- The screen's hooks ----------

  return {
    help: 'Click a setting, then ← → to change it (Shift: bigger) or type a number + Enter · Backspace: default · ↑ ↓ or [ ] pick an effect · Space pause · B backdrop · T next page',
    step() { if (!paused) t++; },
    drawList,
    draw() {
      const c = current();
      drawPreview(c);
      ctx.fillStyle = '#150f20';
      ctx.fillRect(STAGE.x - 8, STAGE.y + STAGE.h + 2, W, H);
      drawStrip(c);
      drawPanel(c);
    },
    /** A click in the list on the left. */
    onListDown(p) {
      const i = listScroll + Math.floor((p.y - (LIST_TOP - 11)) / LIST_ROW);
      if (i >= 0 && i < entries().length) select(i);
    },
    onListWheel(e) { listScroll = Math.max(0, listScroll + Math.sign(e.deltaY) * 3); },
    onDown(p) {
      const sw = swatches.find((q) => p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h);
      if (sw) { const c = current(); picked = 'tint'; edit(() => writeFx(env.raw(), c, 'tint', sw.colour)); return; }
      const cell = cells.find((q) => p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h);
      picked = cell ? cell.key : null;
      typing = '';
    },
    onWheel(e) { zoom = Math.max(0.5, Math.min(4, zoom * (e.deltaY < 0 ? 1.25 : 0.8))); },
    cancel() {
      if (!typing) return false;
      typing = '';
      return true;
    },
    move(d) { select(index() + d); },
    /** Returns true when the key was used here. */
    onKey(e) {
      const c = current();
      const field = picked ? fxField(picked) : null;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) paused = !paused; return true; }
      if (e.code === 'KeyB' && !e.repeat) { backdrop = (backdrop + 1) % BACKDROPS.length; return true; }
      if (!field || !c) return false;
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const i = FX_FIELDS.findIndex((f) => f.key === picked);
        picked = FX_FIELDS[(i + (e.code === 'ArrowUp' ? -1 : 1) + FX_FIELDS.length) % FX_FIELDS.length].key;
        typing = '';
        return true;
      }
      if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); nudge(picked, e.code === 'ArrowLeft' ? -1 : 1, e.shiftKey); return true; }
      if (e.code === 'Backspace' || e.code === 'Delete') {
        e.preventDefault();
        if (typing) typing = typing.slice(0, -1); else reset(picked);
        return true;
      }
      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        if (typing && typing !== '-' && typing !== '.') { const n = Number(typing); if (Number.isFinite(n)) edit(() => writeFx(env.raw(), c, picked, n)); }
        else if (field.type) nudge(picked, 1, false);
        typing = '';
        return true;
      }
      if (!field.type && /^[0-9.-]$/.test(e.key) && typing.length < 7 && (e.key !== '-' || !typing) && (e.key !== '.' || !typing.includes('.'))) { typing += e.key; return true; }
      return false;
    },
  };
}
