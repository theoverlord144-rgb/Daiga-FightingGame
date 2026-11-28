// The box editor's second page, HIT SETTINGS: a move's damage, stun, pushback and launch as numbers you click, with
// the real game playing the move against a dummy over and over above them, so a change is seen at once. The launch
// can also be set by dragging the arrow on the dummy. What a setting is and where it is written is worked out by
// src/editor/move-model.js; the looping fight is src/editor/preview.js. The box editor (box-editor.js) owns the
// file, undo and saving, and hands them in as `env`.
import { px } from '../../core/fixed.js';
import { SYSTEM, BATTLE, COMBO } from '../boot.js';
import { FIELDS, settingsTarget, applies, readSetting, writeSetting, resetSetting, nudgeSetting, showSetting, fieldOf } from '../../editor/move-model.js';
import { createPreview, reachOf, hitOwner, flightOf, firstTouch, flightWarning, leftOut, DUMMIES } from '../../editor/preview.js';
import { INK, DIM, GOLD } from './common.js';

const RULES = { combo: COMBO, battle: BATTLE };
const GROUPS = [['timing', 'TIMING'], ['hit', 'ON HIT'], ['block', 'ON BLOCK'], ['launch', 'LAUNCH AND AIR'], ['flight', 'FLIGHT']];
const K = 0.8; // the fight is drawn at this size inside the stage
const ARROW = 7; // screen px of arrow per px-a-frame of launch speed
const COL_W = 190;
const ROW_H = 17;
const TOP = 388;

export function createTuner(env) {
  const { ctx, app, renderer, STAGE, W, H, text, button, say, mouse } = env;
  const OX = STAGE.x + (STAGE.w - W * K) / 2;
  const OY = STAGE.y + STAGE.h - H * K;
  let pv = null;
  let pvKey = '';
  let dummy = DUMMIES[0];
  let paused = false;
  let boxes = true;
  let picked = null; // the selected setting's key
  let scroll = 0; // rows the settings columns are scrolled down by (mouse wheel over them)
  let scrollMax = 0;
  const FIT = Math.floor((H - 26 - (TOP + 6)) / ROW_H); // rows of settings that fit above the help line
  let typing = ''; // digits being typed for the selected setting
  let trail = [];
  let drag = null;
  let cells = [];
  let handle = null; // the launch arrow's tip, on screen: { x, y, bx, by, which }
  const distances = {}; // per list entry, once the user has changed it

  /** The settings shown: the move's own, or its projectile's when the move only releases one. */
  const owner = () => hitOwner(env.def(), env.entry());
  const target = () => settingsTarget(env.raw(), SYSTEM, owner());
  const distance = () => distances[`${env.charId()}:${env.entry()}`] ?? reachOf(env.def(), env.entry());
  const shown = (t) => FIELDS.filter((f) => applies(f, t));

  /** A fresh looping fight whenever the move, the file, the dummy or the distance changed. */
  function sync() {
    const key = `${env.charId()}|${env.entry()}|${env.version()}|${dummy}|${distance()}`;
    if (key === pvKey) return;
    pvKey = key;
    trail = [];
    try {
      pv = createPreview({ def: env.def(), dummyDef: env.def(), makeWorld: (a, b) => app.makeWorld(a, b, null), entry: env.entry(), dummy, distance: distance() });
    } catch (err) {
      pv = null;
      say(err.message, '#ff6b6b');
    }
    const t = target();
    if (picked && !shown(t).some((f) => f.key === picked)) picked = null;
    typing = '';
  }

  function edit(fn) {
    typing = '';
    return env.change(fn);
  }
  const nudge = (key, dir, big) => edit(() => nudgeSetting(env.raw(), target(), key, dir, big, RULES));
  function reset(key) {
    if (!key) { say('Click a setting first.'); return; }
    edit(() => resetSetting(env.raw(), target(), key));
  }
  function setDistance(d) {
    distances[`${env.charId()}:${env.entry()}`] = Math.max(40, Math.min(760, Math.round(d)));
  }

  /** Which launch the arrow edits: how a hit knocks a dummy that is already in the air, or how it launches one off the ground. */
  function arrowKind(t) {
    if (!t.write) return null;
    if (dummy === 'in the air') return 'airHit';
    return readSetting(env.raw(), t, 'launch.type', RULES).value === 'none' ? null : 'launch';
  }

  function measured() {
    // This run once it has touched; until then, what the run before it measured.
    const s = pv && (pv.stats.result !== 'whiff' ? pv.stats : pv.last);
    if (!pv?.state) return ['Nothing to play: this entry has no move of its own.'];
    if (!s) return ['Playing…'];
    if (s.result === 'whiff') return [`It does not touch the dummy from ${distance()} px away.`, 'Move the dummy with − / + DISTANCE (or the mouse wheel).'];
    const who = s.recoiled ? ` · the attacker ends ${Math.abs(s.recoiled)} px ${s.recoiled > 0 ? 'back' : 'forward'}` : '';
    const adv = s.advantage === null ? '' : `${s.advantage >= 0 ? '+' : ''}${s.advantage}`;
    if (s.result === 'block') return [`Blocked on frame ${s.frame} · ${s.damage} chip · the dummy slides ${s.pushed} px${who}`, adv ? `The attacker is free ${Math.abs(s.advantage)} frames ${s.advantage >= 0 ? 'before' : 'after'} the dummy (${adv} on block).` : ''];
    if (s.result !== 'hit') return [`The dummy's ${s.result} took it on frame ${s.frame}.`];
    const flew = s.peak > 0;
    const first = `Hits on frame ${s.frame} · ${s.damage} damage · ${flew ? `the dummy goes ${s.peak} px high and comes down ${Math.abs(s.landed ?? s.pushed)} px ${(s.landed ?? s.pushed) >= 0 ? 'away' : 'closer'}` : `the dummy slides ${s.pushed} px`}${who}`;
    const second = !adv ? '' : flew ? `The dummy is back on their feet ${Math.abs(s.advantage)} frames ${s.advantage >= 0 ? 'after' : 'before'} the attacker is free.`
      : `The attacker is free ${Math.abs(s.advantage)} frames ${s.advantage >= 0 ? 'before' : 'after'} the dummy (${adv} on hit).`;
    return [first, second];
  }

  // ---------- Drawing ----------

  function drawFight() {
    ctx.save();
    ctx.beginPath();
    ctx.rect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    ctx.clip();
    ctx.fillStyle = '#0d0b12';
    ctx.fillRect(STAGE.x, STAGE.y, STAGE.w, STAGE.h);
    handle = null;
    if (pv) {
      ctx.save();
      ctx.translate(OX, OY);
      ctx.scale(K, K);
      renderer.draw(pv.game, pv.world, { stage: app.stage, boxes, labels: false, hud: false, zoom: false });
      // Where the dummy has been this time round.
      ctx.fillStyle = '#ffd36b';
      trail.forEach(([x, y], i) => {
        if (i % 2) return;
        const [sx, sy] = renderer.toScreen(x, y + px(90));
        ctx.globalAlpha = 0.55;
        ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
      });
      ctx.globalAlpha = 1;
      const base = renderer.toScreen(px(distance() / 2), px(dummy === 'in the air' ? 200 : 95));
      ctx.restore();
      drawArrow(OX + base[0] * K, OY + base[1] * K);
    }
    ctx.restore();
  }

  function drawArrow(bx, by) {
    const t = target();
    const which = arrowKind(t);
    if (!which) return;
    const vx = readSetting(env.raw(), t, `${which}.x`, RULES).value;
    const vy = readSetting(env.raw(), t, `${which}.y`, RULES).value;
    const tx = bx + vx * ARROW, ty = by - vy * ARROW;
    handle = { x: tx, y: ty, bx, by, which };
    const hot = drag || Math.hypot(mouse.x - tx, mouse.y - ty) < 11;
    ctx.strokeStyle = hot ? '#ffffff' : GOLD;
    ctx.fillStyle = hot ? '#ffffff' : GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    const a = Math.atan2(ty - by, tx - bx);
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a) * 9, ty + Math.sin(a) * 9);
    ctx.lineTo(tx + Math.cos(a + 2.4) * 8, ty + Math.sin(a + 2.4) * 8);
    ctx.lineTo(tx + Math.cos(a - 2.4) * 8, ty + Math.sin(a - 2.4) * 8);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bx, by, 3, 0, Math.PI * 2);
    ctx.fill();
    text(`${which === 'launch' ? 'launch' : 'air hit'}: forward ${vx}, up ${vy}  (drag the arrow)`, Math.min(tx + 14, STAGE.x + STAGE.w - 230), Math.max(STAGE.y + 110, ty - 8), { color: hot ? '#ffffff' : GOLD, size: 11, weight: 700 });
  }

  /**
   * The projectile timeline: the move's frames as a bar, and under it each projectile it releases from the frame it
   * appears: how long it lasts, when its hitbox is out (gold), and the frame it reached the dummy (white mark).
   */
  function drawFlight(top) {
    let f = null;
    try { f = pv?.state ? flightOf(env.def(), env.entry()) : null; } catch { f = null; }
    if (!f) return;
    const s = pv.stats.touches.length ? pv.stats : pv.last ?? pv.stats;
    const rows = f.spawns.slice(0, 3);
    const span = Math.max(f.frames, ...rows.map((sp) => sp.at + sp.lifetime));
    const X = STAGE.x + 118, k = Math.min(5, 340 / span), BAR = 8, GAP = 15;
    const warn = flightWarning(f, s);
    const height = 30 + (rows.length + 1) * GAP + rows.length * 13 + (warn ? 14 : 0);
    ctx.fillStyle = '#0d0b12cc';
    ctx.fillRect(STAGE.x + 4, top, 118 + 340 + 14, height);
    const at = (frame) => X + frame * k;
    const label = (str, y, color = DIM) => text(str.length > 17 ? str.slice(0, 16) + '…' : str, STAGE.x + 10, y + BAR, { color, size: 10, weight: 600 });
    let y = top + 6;
    // every 10 frames
    for (let n = 0; n <= span; n += span > 120 ? 30 : 10) {
      ctx.fillStyle = '#ffffff14';
      ctx.fillRect(at(n), y, 1, (rows.length + 1) * GAP - 4);
      text(String(n), at(n) - 3, y + (rows.length + 1) * GAP + 6, { color: '#8a819b', size: 9 });
    }
    // the move
    label(f.state, y, INK);
    ctx.fillStyle = '#6b6480';
    ctx.fillRect(at(0), y, f.frames * k, BAR);
    if (f.ownHit) {
      ctx.fillStyle = '#4a4560';
      ctx.fillRect(at(f.ownHit[1] + 1), y, (f.frames - f.ownHit[1] - 1) * k, BAR);
      ctx.fillStyle = '#ff5b5b';
      ctx.fillRect(at(f.ownHit[0]), y, Math.max(2, (f.ownHit[1] - f.ownHit[0] + 1) * k), BAR);
    }
    const mark = (frame, yy) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(at(frame) + k / 2 - 1, yy - 3, 2, BAR + 6); };
    const own = firstTouch(s, f.state);
    if (own !== null) mark(own, y);
    // each projectile
    rows.forEach((sp) => {
      y += GAP;
      label(sp.name, y);
      ctx.fillStyle = '#3a3350';
      ctx.fillRect(at(sp.at), y, sp.lifetime * k, BAR);
      ctx.fillStyle = GOLD;
      for (const [from, to] of sp.live) ctx.fillRect(at(sp.at + from), y + 1, Math.max(2, (to - from + 1) * k), BAR - 2);
      const hit = firstTouch(s, sp.name);
      if (hit !== null) mark(hit, y);
    });
    // where the loop is now
    const now = pv.stats.now;
    if (now >= 0 && now < span) { ctx.fillStyle = '#7fd4ff'; ctx.fillRect(at(now) + k / 2, top + 4, 1, (rows.length + 1) * GAP - 2); }
    y += GAP + 24;
    rows.forEach((sp) => {
      const live = sp.live.length ? `can hit on frames ${sp.live.map(([a, b]) => `${sp.at + a + 1}–${sp.at + b + 1}`).join(', ')}` : 'has no hitbox';
      const hit = firstTouch(s, sp.name);
      const where = sp.under ? 'under the opponent' : `${sp.start} px in front${sp.speed ? `, ${sp.speed} px a frame` : ''}`;
      text(`${sp.name}: appears on frame ${sp.at + 1}, ${where} · ${live}${hit !== null ? ` · reached the dummy on frame ${hit + 1}` : ''}`, STAGE.x + 10, y, { color: INK, size: 10 });
      y += 13;
    });
    if (warn) text(warn, STAGE.x + 10, y + 1, { color: '#ffb86b', size: 10, weight: 700 });
  }

  function drawStrip(c) {
    const title = c.name.startsWith('proj:') ? c.name.slice(5) : c.name;
    text(title, STAGE.x + 6, 20, { size: 15, weight: 800 });
    const m = c.st.move;
    const about = c.st.projectile ? 'projectile' : m ? `startup ${m.startup} · active ${m.active} · recovery ${m.recovery} · ${c.st.stance}` : c.st.stance;
    text(about, STAGE.x + 6 + ctx.measureText(title).width + 22, 20, { color: DIM, size: 11 });
    let x = STAGE.x + 6;
    const y = STAGE.y + 5;
    x = button(`DUMMY: ${dummy.toUpperCase()}`, x, y, { on: () => { dummy = DUMMIES[(DUMMIES.indexOf(dummy) + 1) % DUMMIES.length]; } });
    x = button('−', x, y, { on: () => setDistance(distance() - (mouse.shift ? 50 : 10)) });
    x = button(`DISTANCE ${distance()}`, x - 6, y, { why: 'How far apart they start, in px. Use − and +, or the mouse wheel over the fight.' });
    x = button('+', x - 6, y, { on: () => setDistance(distance() + (mouse.shift ? 50 : 10)) });
    x += 8;
    x = button(paused ? 'PLAY' : 'PAUSE', x, y, { on: () => { paused = !paused; }, lit: paused });
    x = button(boxes ? 'BOXES: ON' : 'BOXES: OFF', x, y, { on: () => { boxes = !boxes; } });
    x += 8;
    x = button('BACK TO DEFAULT', x, y, picked ? { on: () => reset(picked) } : { why: 'Click a setting first: this takes it out of the file again, so it goes back to its default.' });
    x = button('UNDO', x, y, env.undoCount() ? { on: env.undoOnce } : { why: 'Nothing to undo.' });
    const d = env.dirty();
    x = button(env.saving() ? 'SAVING…' : 'SAVE', x, y, d && !env.saving() ? { on: env.save, lit: true } : { why: 'Nothing to save.' });
    text(d ? 'unsaved' : 'saved', x + 2, y + 14, { color: d ? '#ffb86b' : '#5a516b', size: 11 });
    // What the last run measured.
    const lines = measured().filter(Boolean);
    lines.forEach((line, i) => {
      ctx.font = '600 11px system-ui, sans-serif';
      const w = ctx.measureText(line).width + 12;
      ctx.fillStyle = '#0d0b12cc';
      ctx.fillRect(STAGE.x + 4, STAGE.y + 31 + i * 16, w, 16);
      text(line, STAGE.x + 10, STAGE.y + 43 + i * 16, { color: i ? DIM : INK, size: 11, weight: 600 });
    });
    drawFlight(STAGE.y + 35 + lines.length * 16);
  }

  function drawPanel() {
    cells = [];
    const t = target();
    const raw = env.raw();
    if (t.kind === 'none') {
      text(t.why, 190, TOP + 30, { color: '#ffb86b', size: 12, weight: 600 });
      text('Pick a move or a projectile from the list on the left.', 190, TOP + 50, { color: DIM, size: 11 });
      return;
    }
    const skipped = leftOut(env.def(), env.entry());
    if (skipped.length) env.hint(`This preview shows this move's own hit alone: the ${skipped.join(', ')} it leaves is taken out before it bursts. Tune the burst on "${skipped[0]}" in the list.`, true);
    if (owner() !== env.entry()) env.hint(`This move hits with its projectile, so these are the settings of "${owner().slice(5)}" (the same ones as its own entry in the list).`, true);
    let col = 0;
    scrollMax = Math.max(0, ...GROUPS.map(([group]) => shown(t).filter((f) => f.group === group).length - FIT));
    scroll = Math.max(0, Math.min(scrollMax, scroll));
    for (const [group, heading] of GROUPS) {
      const list = shown(t).filter((f) => f.group === group);
      if (!list.length) continue;
      const x = 190 + col * COL_W;
      text(heading, x, TOP, { color: GOLD, size: 10, weight: 800 });
      const after = x + ctx.measureText(heading).width + 8; // just past the heading (text() left its font set)
      // A column longer than the screen scrolls with the mouse wheel; the arrows say there is more.
      if (list.length > FIT) text(`${scroll > 0 ? '▲' : ' '} ${scroll + FIT < list.length ? `▼ ${list.length - FIT - scroll} more (wheel)` : ''}`, after, TOP, { color: DIM, size: 9 });
      list.forEach((f, n) => {
        const i = n - scroll;
        if (i < 0 || i >= FIT) return;
        const y = TOP + 6 + i * ROW_H;
        const v = readSetting(raw, t, f.key, RULES);
        const on = picked === f.key;
        const cell = { x: x - 4, y, w: COL_W - 10, h: ROW_H, key: f.key };
        cells.push(cell);
        const hover = mouse.x >= cell.x && mouse.x < cell.x + cell.w && mouse.y >= cell.y && mouse.y < cell.y + cell.h;
        if (on) { ctx.fillStyle = '#ffd36b22'; ctx.fillRect(cell.x, y, cell.w, ROW_H - 1); }
        else if (hover) { ctx.fillStyle = '#ffffff0c'; ctx.fillRect(cell.x, y, cell.w, ROW_H - 1); }
        if (hover && f.help) env.hint(f.help);
        const color = v.off ? '#5a516b' : v.own ? INK : DIM;
        text(f.label, x, y + 12, { color: on ? GOLD : color, size: 11, weight: v.own ? 700 : 400 });
        const str = on && typing ? `${typing}_` : showSetting(f.key, v.value);
        text(str, x + 136, y + 12, { color: on ? '#ffffff' : color, size: 11, weight: v.own ? 700 : 400, align: 'right' });
        if (v.own) { ctx.fillStyle = GOLD; ctx.fillRect(x - 4, y + 3, 2, ROW_H - 7); }
        if (t.write) {
          button('−', x + 141, y + 1, { on: () => { picked = f.key; nudge(f.key, -1, mouse.shift); }, small: true });
          button('+', x + 160, y + 1, { on: () => { picked = f.key; nudge(f.key, 1, mouse.shift); }, small: true });
        }
      });
      col++;
    }
    if (!t.write) env.hint(t.why);
    else if (col < 4) ['Bold with a gold mark:', 'set for this move in the file.', 'Grey: the default.', '', 'Shift-click − / + for', 'bigger steps.'].forEach((line, i) => text(line, 190 + col * COL_W, TOP + 18 + i * 14, { color: '#5a516b', size: 10 }));
  }

  // ---------- The screen's hooks ----------

  return {
    help: 'Click a setting, then ← → to change it (Shift: bigger) or type a number + Enter · Backspace: default · drag the arrow to aim the launch · D dummy · Space pause · T next page',
    step() {
      sync();
      if (!pv || paused || !pv.state) return;
      const loops = pv.loops;
      pv.step();
      renderer.notice(pv.game, pv.world);
      if (pv.loops !== loops) trail = [];
      else if (pv.stats.result !== 'whiff') trail.push([pv.game.players[1].x, pv.game.players[1].y]);
    },
    draw(c) {
      sync();
      drawFight();
      ctx.fillStyle = '#150f20';
      ctx.fillRect(STAGE.x - 8, STAGE.y + STAGE.h + 2, W, H);
      drawStrip(c);
      drawPanel();
    },
    onDown(p) {
      if (handle && Math.hypot(p.x - handle.x, p.y - handle.y) < 11) {
        drag = { which: handle.which, before: env.snapshot() };
        picked = `${handle.which}.y`;
        return;
      }
      const cell = cells.find((q) => p.x >= q.x && p.x < q.x + q.w && p.y >= q.y && p.y < q.y + q.h);
      picked = cell ? cell.key : null;
      typing = '';
    },
    onMove(p) {
      if (!drag || !handle) return;
      const x = Math.round((p.x - handle.bx) / ARROW);
      const y = Math.round((handle.by - p.y) / ARROW);
      env.apply(() => {
        const t = target();
        writeSetting(env.raw(), t, `${drag.which}.x`, x, RULES);
        writeSetting(env.raw(), t, `${drag.which}.y`, y, RULES);
      });
    },
    onUp() {
      if (drag) env.commit(drag.before);
      drag = null;
    },
    onWheel(e) {
      setDistance(distance() + (e.deltaY < 0 ? -10 : 10));
    },
    /** The wheel over the settings: scroll the columns. */
    onScroll(e) {
      scroll = Math.max(0, Math.min(scrollMax, scroll + Math.sign(e.deltaY)));
    },
    /** Esc with a number half typed only clears it. */
    cancel() {
      if (!typing) return false;
      typing = '';
      return true;
    },
    /** Returns true when the key was used here. */
    onKey(e) {
      const t = target();
      const list = shown(t);
      const field = picked ? fieldOf(picked) : null;
      if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) paused = !paused; return true; }
      if (e.code === 'KeyD' && !e.repeat) { dummy = DUMMIES[(DUMMIES.indexOf(dummy) + 1) % DUMMIES.length]; return true; }
      if (e.code === 'KeyB' && !e.repeat) { boxes = !boxes; return true; }
      if (!field || !t.write) return false;
      if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
        const i = list.findIndex((f) => f.key === picked);
        const to = (i + (e.code === 'ArrowUp' ? -1 : 1) + list.length) % list.length;
        picked = list[to].key;
        scroll = Math.max(to - FIT + 1, Math.min(to, scroll)); // keep the picked row on screen
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
        if (typing && typing !== '-') { const n = Number(typing); edit(() => writeSetting(env.raw(), target(), picked, n, RULES)); }
        else if (field.type) nudge(picked, 1, false);
        typing = '';
        return true;
      }
      if (!field.type && /^[0-9-]$/.test(e.key) && typing.length < 6 && (e.key !== '-' || !typing)) { typing += e.key; return true; }
      return false;
    },
  };
}
