// The box editor's second page, HIT SETTINGS: a move's damage, stun, pushback and launch as numbers you click, with
// the real game playing the move against a dummy over and over above them, so a change is seen at once. The launch
// can also be set by dragging the arrow on the dummy. What a setting is and where it is written is worked out by
// src/editor/move-model.js; the looping fight is src/editor/preview.js. The box editor (box-editor.js) owns the
// file, undo and saving, and hands them in as `env`.
import { px } from '../../core/fixed.js';
import { SYSTEM, BATTLE, COMBO } from '../boot.js';
import { FIELDS, settingsTarget, applies, readSetting, writeSetting, resetSetting, nudgeSetting, showSetting, fieldOf } from '../../editor/move-model.js';
import { createPreview, reachOf, hitOwner, DUMMIES } from '../../editor/preview.js';
import { INK, DIM, GOLD } from './common.js';

const RULES = { combo: COMBO, battle: BATTLE };
const GROUPS = [['hit', 'ON HIT'], ['block', 'ON BLOCK'], ['launch', 'LAUNCH AND AIR'], ['flight', 'FLIGHT']];
const K = 0.8; // the fight is drawn at this size inside the stage
const ARROW = 7; // screen px of arrow per px-a-frame of launch speed
const COL_W = 192;
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
      renderer.draw(pv.game, pv.world, { stage: app.stage, boxes, labels: false, hud: false });
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
    if (owner() !== env.entry()) env.hint(`This move hits with its projectile, so these are the settings of "${owner().slice(5)}" (the same ones as its own entry in the list).`, true);
    let col = 0;
    for (const [group, heading] of GROUPS) {
      const list = shown(t).filter((f) => f.group === group);
      if (!list.length) continue;
      const x = 190 + col * COL_W;
      text(heading, x, TOP, { color: GOLD, size: 10, weight: 800 });
      list.forEach((f, i) => {
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
    help: 'Click a setting, then ← → to change it (Shift: bigger) or type a number + Enter · Backspace: default · drag the arrow to aim the launch · D dummy · Space pause · T boxes page',
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
        picked = list[(i + (e.code === 'ArrowUp' ? -1 : 1) + list.length) % list.length].key;
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
