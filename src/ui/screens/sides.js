// Side select (before a versus match): every device (keyboard, each controller or arcade stick) starts in the middle
// and moves left to play as Player 1 or right to play as Player 2. One device per side; confirm when both are taken.
import { RAW } from '../../core/input.js';
import { title, hint, FONT, INK, DIM, GOLD } from './common.js';

const SIDE_COLORS = ['#ff6b5a', '#5aa8ff'];

export function createSidesScreen(app) {
  const { ctx, W, H, devices } = app;
  devices.setSeats(null);
  const place = {}; // source id -> -1 (Player 1), 0 (undecided), 1 (Player 2)
  const prev = {}; // source id -> what it held last step (a held button must be let go before it counts)
  let wait = -1;

  function list() {
    // The second key layout is offered too, so two people can share one keyboard.
    return [...devices.sources(), { id: 'kb1', label: 'KEYBOARD 2' }];
  }

  function taken(side) {
    return Object.keys(place).find((id) => place[id] === side);
  }

  return {
    help: '',
    step(menu) {
      if (wait >= 0) {
        if (++wait >= 20) app.go('select', { mode: 'versus' });
        return;
      }
      const srcs = list();
      for (const id of Object.keys(place)) if (!srcs.some((s) => s.id === id)) { delete place[id]; delete prev[id]; } // unplugged
      let confirm = menu[0].confirm && menu[0].start; // Enter
      let back = !!menu[0].escape;
      for (const s of srcs) {
        const raw = devices.readSource(s.id) | (devices.readSourceStart(s.id) ? RAW.S << 8 : 0);
        if (!(s.id in prev)) { prev[s.id] = raw; place[s.id] = 0; continue; }
        const edge = raw & ~prev[s.id];
        prev[s.id] = raw;
        const at = place[s.id];
        if (edge & RAW.LEFT && at > -1 && (at === 1 || !taken(-1))) place[s.id] = at - 1;
        if (edge & RAW.RIGHT && at < 1 && (at === -1 || !taken(1))) place[s.id] = at + 1;
        if (edge & (RAW.L | (RAW.S << 8)) && place[s.id] !== 0) confirm = true;
        if (edge & RAW.M) { if (place[s.id] !== 0) place[s.id] = 0; else back = true; }
      }
      if (back) { app.go('title', { index: 0 }); return; }
      const p1 = taken(-1);
      const p2 = taken(1);
      if (confirm && p1 && p2) {
        devices.setSeats([[p1], [p2]]);
        wait = 0;
      }
    },
    draw() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1d1430');
      g.addColorStop(1, '#0b0810');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      title(ctx, 'CHOOSE YOUR SIDE', W / 2, 70, 34);
      const cols = [W / 2 - 300, W / 2, W / 2 + 300];
      ['PLAYER 1', '', 'PLAYER 2'].forEach((name, k) => {
        if (!name) return;
        const c = SIDE_COLORS[k === 0 ? 0 : 1];
        ctx.strokeStyle = c;
        ctx.lineWidth = 3;
        ctx.strokeRect(cols[k] - 130, 120, 260, 300);
        ctx.fillStyle = c;
        ctx.font = `900 24px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(name, cols[k], 156);
      });
      const srcs = list();
      const rows = { '-1': 0, 0: 0, 1: 0 };
      for (const s of srcs) {
        const at = place[s.id] ?? 0;
        const x = cols[at + 1];
        const y = (at === 0 ? 170 : 250) + rows[at]++ * 58;
        ctx.fillStyle = at === 0 ? '#262131' : SIDE_COLORS[at === -1 ? 0 : 1];
        ctx.fillRect(x - 105, y - 26, 210, 44);
        ctx.fillStyle = at === 0 ? INK : '#12091a';
        ctx.font = `800 17px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(at === 0 ? `◀  ${s.label}  ▶` : s.label, x, y + 2);
      }
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = 'center';
      const ready = taken(-1) && taken(1);
      ctx.fillStyle = ready ? GOLD : DIM;
      ctx.fillText(wait >= 0 ? 'READY' : ready ? 'Press Light or Enter to continue' : 'Each player: press left or right on your own device', W / 2, 470);
      hint(ctx, W, H, 'Keyboard: A/D · Keyboard 2: arrows · Stick or pad: left/right · Light (L): confirm · Medium (M): step back');
    },
  };
}
