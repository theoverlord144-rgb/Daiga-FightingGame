// Character select. Each side moves a cursor over the cast, picks a colour, and confirms.
// Versus: each player picks their own. Versus CPU and Training: Player 1 picks both (their own, then the opponent).
import { drawPortrait, title, hint, FONT, INK, DIM, GOLD } from './common.js';

const SIDE_COLORS = ['#ff6b5a', '#5aa8ff'];
const MODE_NAMES = { versus: 'VERSUS', cpu: 'VERSUS CPU', training: 'TRAINING' };

export function createSelectScreen(app, { mode = 'versus', last = null } = {}) {
  const { ctx, W, H } = app;
  const cast = app.cast; // [{ id, def, test }]
  const sides = [0, 1].map((i) => {
    const prev = last?.[i];
    const cursor = prev ? Math.max(0, cast.findIndex((c) => c.id === prev.id)) : 0;
    return { cursor, pal: prev ? prev.pal : i, done: false };
  });
  let wait = -1; // frames after both picked, before moving on
  const oneController = mode !== 'versus';

  function controllerFor(side, menu) {
    if (!oneController) return menu[side];
    // Player 1 picks side 0 first, then side 1 (Player 2's controller can still pick its own side).
    if (side === 0) return sides[0].done ? null : menu[0];
    return sides[0].done ? mergeMenus(menu[0], menu[1]) : menu[1];
  }

  function confirm(i) {
    const s = sides[i];
    const other = sides[1 - i];
    const def = cast[s.cursor].def;
    // Same fighter, same colours: move this one to the next colour so the two can be told apart.
    if (other.done && cast[other.cursor].id === cast[s.cursor].id && other.pal === s.pal) s.pal = (s.pal + 1) % def.palettes.colors.length;
    s.done = true;
  }

  return {
    help: '',
    step(menu) {
      if (wait >= 0) {
        if (++wait >= 30) {
          const picks = sides.map((s) => ({ id: cast[s.cursor].id, pal: s.pal }));
          if (mode === 'training') app.go('training', { picks });
          else app.go('versus', { mode, picks });
        }
        return;
      }
      // Back: undo the last pick, or leave.
      for (const i of [1, 0]) {
        const m = oneController ? menu[0] : menu[i];
        if (!m.back) continue;
        if (oneController) {
          if (sides[1].done) sides[1].done = false;
          else if (sides[0].done) sides[0].done = false;
          else { app.go('title', { index: { versus: 0, cpu: 1, training: 2 }[mode] }); return; }
          menu[0].back = false;
        } else if (sides[i].done) sides[i].done = false;
        else { app.go('title', { index: 0 }); return; }
      }
      for (const i of [0, 1]) {
        const s = sides[i];
        const m = controllerFor(i, menu);
        if (!m || s.done) continue;
        const pals = cast[s.cursor].def.palettes.colors.length;
        if (m.left) s.cursor = (s.cursor + cast.length - 1) % cast.length;
        if (m.right) s.cursor = (s.cursor + 1) % cast.length;
        if (m.left || m.right) s.pal %= cast[s.cursor].def.palettes.colors.length;
        if (m.up) s.pal = (s.pal + pals - 1) % pals;
        if (m.down) s.pal = (s.pal + 1) % pals;
        if (m.confirm || m.buttons.H || m.buttons.S || (m.start && !m.escape)) { confirm(i); if (oneController) break; }
      }
      if (sides[0].done && sides[1].done) wait = 0;
    },
    draw() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1d1430');
      g.addColorStop(1, '#0b0810');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      title(ctx, 'CHOOSE YOUR FIGHTER', W / 2, 58, 34);
      ctx.font = `700 13px ${FONT}`;
      ctx.fillStyle = DIM;
      ctx.textAlign = 'center';
      ctx.fillText(MODE_NAMES[mode], W / 2, 82);
      // The cast row.
      const tw = 110;
      const x0 = W / 2 - (cast.length * tw) / 2;
      cast.forEach((c, k) => {
        const x = x0 + k * tw;
        ctx.fillStyle = '#211a2e';
        ctx.fillRect(x + 6, 380, tw - 12, 110);
        drawPortrait(ctx, c.def, 0, x + tw / 2, 470, 0.55);
        ctx.font = `700 12px ${FONT}`;
        ctx.fillStyle = INK;
        ctx.textAlign = 'center';
        ctx.fillText(c.def.name.replace(' (engine test)', ''), x + tw / 2, 485);
        if (c.test) {
          ctx.fillStyle = DIM;
          ctx.font = `600 10px ${FONT}`;
          ctx.fillText('engine test', x + tw / 2, 504);
        }
        sides.forEach((s, i) => {
          if (s.cursor !== k) return;
          ctx.strokeStyle = SIDE_COLORS[i];
          ctx.lineWidth = s.done ? 5 : 3;
          const inset = i === 0 ? 4 : 9;
          ctx.strokeRect(x + inset, 378 + inset - 4, tw - inset * 2, 114 - inset * 2 + 8);
          ctx.fillStyle = SIDE_COLORS[i];
          ctx.font = `800 12px ${FONT}`;
          ctx.textAlign = i === 0 ? 'left' : 'right';
          ctx.fillText(`P${i + 1}`, i === 0 ? x + 10 : x + tw - 10, 376);
        });
      });
      // The two picks, big.
      sides.forEach((s, i) => {
        const def = cast[s.cursor].def;
        const x = i === 0 ? 210 : W - 210;
        drawPortrait(ctx, def, s.pal, x, 345, 1.2, i === 0 ? 1 : -1);
        ctx.textAlign = 'center';
        ctx.font = `900 28px ${FONT}`;
        ctx.fillStyle = s.done ? GOLD : INK;
        ctx.fillText(def.name.replace(' (engine test)', '').toUpperCase(), x, 120);
        ctx.font = `600 14px ${FONT}`;
        ctx.fillStyle = DIM;
        const who = oneController && i === 1 ? (mode === 'cpu' ? 'CPU' : 'DUMMY') : `PLAYER ${i + 1}`;
        ctx.fillText(`${who} · colour: ${def.palettes.colors[s.pal].name}`, x, 142);
        if (s.done) {
          ctx.font = `800 16px ${FONT}`;
          ctx.fillStyle = SIDE_COLORS[i];
          ctx.fillText('READY', x, 365);
        }
      });
      const whose = oneController ? (sides[0].done ? (mode === 'cpu' ? 'Now pick the CPU\'s fighter' : 'Now pick the training dummy') : 'Pick your fighter') : '';
      if (whose) {
        ctx.font = `700 16px ${FONT}`;
        ctx.fillStyle = GOLD;
        ctx.textAlign = 'center';
        ctx.fillText(whose, W / 2, 200);
      }
      hint(ctx, W, H, 'Left/right: fighter · Up/down: colour · L (J) or Enter: confirm · M (K) or Esc: back');
    },
  };
}

function mergeMenus(a, b) {
  const out = { ...a, buttons: { ...a.buttons } };
  for (const k of ['up', 'down', 'left', 'right', 'confirm', 'back', 'start']) out[k] = a[k] || b[k];
  for (const k of Object.keys(b.buttons)) out.buttons[k] = a.buttons[k] || b.buttons[k];
  return out;
}
