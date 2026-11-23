// The box editor's CANCELS page: every move down the side, what it can be cancelled into across the top.
// Click a square to add or remove a route. The rules are in src/editor/cancel-model.js; the box editor owns the
// file, undo and save, and passes them in.
import { COMBO } from '../boot.js';
import { cancelMoves, cancelTargets, readCancels, reachedFrom, chainMakesSense, toggleChain, setChainOn, setGroup, setWindow, WHEN, WHEN_NAMES } from '../../editor/cancel-model.js';

const INK = '#e8e3f0';
const DIM = '#8d84a1';
const GOLD = '#f0c040';
const PAINT = { both: GOLD, hit: '#ff6b5a', block: '#5aa2ff' };
const GROUPS = [['special', 'SPECIAL', 'any special move'], ['super', 'SUPER', 'any super'], ['jump', 'JUMP', 'a jump']];
const X0 = 268; // the grid's left edge (move names sit to its left)
const Y0 = 88; // the grid's top edge (column names sit above it)
const GROUP_W = 50;
const NEXT_ON = { both: 'hit', hit: 'block', block: 'both' };

export function createCancelGrid(env) {
  const { ctx, W, H, text, button } = env;
  let cache = null; // { version, moves, targets, rows: Map(id → readCancels) }
  let cells = []; // this frame's clickable squares: { x, y, w, h, on, hint }

  function data() {
    if (cache?.version === env.version()) return cache;
    const raw = env.raw();
    const def = env.def();
    const moves = cancelMoves(raw, def);
    cache = { version: env.version(), moves, targets: cancelTargets(raw, def), rows: new Map(moves.map((m) => [m.id, readCancels(raw, def, m.id)])) };
    return cache;
  }
  /** The move the page is about: the list's selection if it is a move, else the first. */
  function current(d) {
    return d.moves.find((m) => m.id === env.entry()) ?? null;
  }
  const inside = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

  function square(x, y, w, h, when, own = true) {
    ctx.fillStyle = when === 'no' ? '#201a2c' : PAINT[when];
    ctx.globalAlpha = when === 'no' ? 1 : own ? 1 : 0.6;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.globalAlpha = 1;
  }

  function draw() {
    const d = data();
    cells = [];
    const raw = env.raw();
    const def = env.def();
    const sel = current(d);
    const rowH = Math.min(15, Math.floor((H - 122 - Y0) / d.moves.length));
    const colW = Math.min(36, Math.floor((W - 12 - X0 - GROUPS.length * GROUP_W - 10) / d.targets.length));
    const gx = X0 + d.targets.length * colW + 10; // where the group columns start
    const mouse = env.mouse;
    const hover = { row: -1, col: -1 };
    if (mouse.y >= Y0 && mouse.y < Y0 + d.moves.length * rowH && mouse.x >= 184) {
      hover.row = Math.floor((mouse.y - Y0) / rowH);
      if (mouse.x >= X0 && mouse.x < X0 + d.targets.length * colW) hover.col = Math.floor((mouse.x - X0) / colW);
      else if (mouse.x >= gx && mouse.x < gx + GROUPS.length * GROUP_W) hover.col = d.targets.length + Math.floor((mouse.x - gx) / GROUP_W);
    }

    text(`CANCELS · ${env.charId().toUpperCase()}`, 190, 20, { size: 13, weight: 700 });
    const uses = COMBO.chainUses;
    const limit = !uses ? 'No limit on repeating a normal in a string.'
      : `In one string each normal comes out ${uses.default === 1 ? 'once' : `${uses.default} times`}${uses.L && uses.L !== uses.default ? `, lights ${uses.L === 2 ? 'twice' : `${uses.L} times`}` : ''}.`;
    text(`Down the side: the move being done. Across the top: what it may be cancelled into. ${limit}`, 190, 38, { color: DIM, size: 11 });

    // Column names, tilted so long ones fit.
    d.targets.forEach((t, i) => {
      ctx.save();
      ctx.translate(X0 + i * colW + colW / 2 + 3, Y0 - 5);
      ctx.rotate(-0.7);
      text(t.id, 0, 0, { color: hover.col === i ? INK : sel && d.rows.get(sel.id).chains.includes(t.id) ? GOLD : DIM, size: 10, weight: 600 });
      ctx.restore();
    });
    GROUPS.forEach(([, label], i) => text(label, gx + i * GROUP_W + GROUP_W / 2, Y0 - 6, { color: hover.col === d.targets.length + i ? INK : DIM, size: 10, weight: 700, align: 'center' }));

    d.moves.forEach((m, r) => {
      const y = Y0 + r * rowH;
      const c = d.rows.get(m.id);
      const isSel = sel?.id === m.id;
      if (isSel || hover.row === r) {
        ctx.fillStyle = isSel ? '#2f2640' : '#221b2f';
        ctx.fillRect(184, y, W - 184 - 6, rowH);
      }
      text(m.id, X0 - 8, y + rowH - 3, { color: isSel ? GOLD : hover.row === r ? INK : DIM, size: 11, weight: isSel ? 700 : 500, align: 'right' });
      cells.push({ x: 184, y, w: X0 - 184, h: rowH, on: () => env.select(m.id), hint: `${m.name}: click to work on this move.` });

      d.targets.forEach((t, i) => {
        const x = X0 + i * colW;
        const has = c.chains.includes(t.id);
        const sense = chainMakesSense(m, t);
        if (!sense && !has) {
          ctx.fillStyle = '#17121f';
          ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);
          cells.push({ x, y, w: colW, h: rowH, why: m.stance === 'air' ? 'An air move cannot chain into a ground move.' : 'A ground move cannot chain into an air move.', hint: '' });
          return;
        }
        square(x, y, colW, rowH, has ? c.chainOn : 'no');
        cells.push({
          x, y, w: colW, h: rowH,
          on: () => env.change(() => toggleChain(raw, def, m.id, t.id)),
          hint: has ? `${m.id} chains into ${t.id} ${WHEN_NAMES[c.chainOn]}. Click to remove it.` : `Click: let ${m.id} chain into ${t.id}.`,
        });
      });
      GROUPS.forEach(([which, , words], i) => {
        const x = gx + i * GROUP_W;
        const g = c[which];
        square(x, y, GROUP_W, rowH, g.value, g.own);
        if (g.fixed) { cells.push({ x, y, w: GROUP_W, h: rowH, why: 'A super cannot be cancelled into another super.', hint: '' }); return; }
        const next = WHEN[(WHEN.indexOf(g.value) + 1) % WHEN.length];
        cells.push({
          x, y, w: GROUP_W, h: rowH,
          on: () => env.change(() => setGroup(raw, def, m.id, which, next)),
          hint: `${m.id} into ${words}: ${WHEN_NAMES[g.value]}${g.own ? '' : ' (the default)'}. Click: ${WHEN_NAMES[next]}.`,
        });
      });
    });
    // The crosshair's column.
    if (hover.col >= 0 && hover.row >= 0) {
      const x = hover.col < d.targets.length ? X0 + hover.col * colW : gx + (hover.col - d.targets.length) * GROUP_W;
      ctx.strokeStyle = '#ffffff55';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, Y0 + 0.5, (hover.col < d.targets.length ? colW : GROUP_W) - 1, d.moves.length * rowH - 1);
    }
    const hot = cells.find((b) => inside(mouse, b));
    if (hot?.hint) env.hint(hot.hint);

    // The key.
    let kx = 190;
    const ky = Y0 + d.moves.length * rowH + 6;
    for (const [when, label] of [['both', 'on hit or block'], ['hit', 'on hit only'], ['block', 'on block only']]) {
      ctx.fillStyle = PAINT[when];
      ctx.fillRect(kx, ky, 10, 10);
      text(label, kx + 15, ky + 9, { color: DIM, size: 10 });
      kx += 30 + ctx.measureText(label).width;
    }
    text('paler = the default, nothing written in the file', kx + 6, ky + 9, { color: '#5a516b', size: 10 });

    // The move being worked on.
    const py = H - 96;
    ctx.fillStyle = '#150f20';
    ctx.fillRect(184, py - 4, W - 184, 70);
    if (!sel) {
      text('Pick a move in the grid. (The entry chosen in the list on the left is not a move a player can do.)', 190, py + 14, { color: DIM, size: 12 });
    } else {
      const c = d.rows.get(sel.id);
      const from = reachedFrom(raw, sel.id);
      text(`${sel.id} · ${sel.name}`, 190, py + 12, { color: GOLD, size: 12, weight: 700 });
      const notes = [];
      if (c.superJump) notes.push('hard launcher: also a super jump on hit');
      if (c.extra) notes.push(`${c.extra} hand-written window${c.extra > 1 ? 's' : ''} in the file, not shown here`);
      text(`Reached from: ${from.length ? from.join(', ') : 'nothing chains into it'}${notes.length ? ' · ' + notes.join(' · ') : ''}`, 190, py + 28, { color: DIM, size: 11 });
      let x = 190;
      const y = py + 36;
      x = button(`CHAINS WORK ${WHEN_NAMES[c.chainOn].toUpperCase()}`, x, y, c.chains.length
        ? { on: () => env.change(() => setChainOn(raw, sel.id, NEXT_ON[c.chainOn])) }
        : { why: 'This move chains into nothing yet. Click a square in its row first.' });
      x += 8;
      text('Window opens on frame', x, y + 14, { color: c.ownFrom ? INK : DIM, size: 11 });
      x += ctx.measureText('Window opens on frame').width + 6;
      x = button('−', x, y + 3, { small: true, on: () => env.change(() => setWindow(raw, def, sel.id, 'from', c.from - 1)) });
      text(String(c.from), x + 8, y + 14, { color: c.ownFrom ? GOLD : INK, size: 12, weight: 700, align: 'center' });
      x = button('+', x + 20, y + 3, { small: true, on: () => env.change(() => setWindow(raw, def, sel.id, 'from', c.from + 1)) });
      text('closes after frame', x + 6, y + 14, { color: c.ownTo ? INK : DIM, size: 11 });
      x += ctx.measureText('closes after frame').width + 12;
      x = button('−', x, y + 3, { small: true, on: () => env.change(() => setWindow(raw, def, sel.id, 'to', c.to - 1)) });
      text(String(c.to), x + 8, y + 14, { color: c.ownTo ? GOLD : INK, size: 12, weight: 700, align: 'center' });
      x = button('+', x + 20, y + 3, { small: true, on: () => env.change(() => setWindow(raw, def, sel.id, 'to', c.to + 1)) });
      text(`of 0–${c.last}`, x + 2, y + 14, { color: DIM, size: 11 });
      x += ctx.measureText(`of 0–${c.last}`).width + 12;
      if (c.ownFrom || c.ownTo) x = button('DEFAULT WINDOW', x, y, { on: () => env.change(() => { setWindow(raw, def, sel.id, 'from', null); setWindow(raw, def, sel.id, 'to', null); }) });
    }
    let x = W - 150;
    x = button('UNDO', x, py + 36, env.undoCount() ? { on: env.undoOnce } : { why: 'Nothing to undo.' });
    const dirty = env.dirty();
    button(env.saving() ? 'SAVING…' : 'SAVE', x, py + 36, dirty && !env.saving() ? { on: env.save, lit: true } : { why: 'Nothing to save.' });
    text(dirty ? 'unsaved changes' : 'saved', W - 10, py + 12, { color: dirty ? '#ffb86b' : '#5a516b', size: 11, align: 'right' });
  }

  return {
    help: 'T: next page · Click a square: add or remove a route · click a move name to work on it · ↑ ↓ move · Ctrl+Z undo · Ctrl+S save · Esc back',
    draw,
    onDown(p) {
      const b = cells.find((c) => inside(p, c));
      if (!b) return;
      if (b.on) b.on();
      else if (b.why) env.say(b.why, '#ffb86b');
    },
    /** Step the selection through the moves (dir = -1 or 1). */
    move(dir) {
      const d = data();
      const at = d.moves.findIndex((m) => m.id === env.entry());
      const next = d.moves[Math.max(0, Math.min(d.moves.length - 1, at < 0 ? 0 : at + dir))];
      if (next) env.select(next.id);
    },
  };
}
