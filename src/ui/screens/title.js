// Title screen: the stage drifting behind the logo, and the main menu.
import { createStageRenderer } from '../../render/stage-renderer.js';
import { drawMenu, title, hint, FONT, DIM, GOLD } from './common.js';

const ITEMS = [
  { label: 'VERSUS', go: ['select', { mode: 'versus' }] },
  { label: 'VERSUS CPU', go: ['select', { mode: 'cpu' }] },
  { label: 'TRAINING', go: ['select', { mode: 'training' }] },
  { label: 'SETTINGS', go: ['settings', {}] },
];
// The box editor writes character files through the dev server, so it is only offered there (npm run dev).
if (import.meta.env.DEV) ITEMS.push({ label: 'BOX EDITOR', go: ['editor', {}] });

export function createTitleScreen(app, { index = 0 } = {}) {
  const { ctx, W, H } = app;
  const bg = createStageRenderer(app.stage, W, H, H - 70, app.battle.stage.halfWidth);
  let sel = index;
  let t = 0;
  return {
    help: '',
    step(menu) {
      t++;
      for (const m of menu) {
        if (m.up) sel = (sel + ITEMS.length - 1) % ITEMS.length;
        if (m.down) sel = (sel + 1) % ITEMS.length;
        if (m.confirm || (m.start && !m.escape)) { app.go(...ITEMS[sel].go); return; }
      }
    },
    draw() {
      const cam = { x: Math.sin(t / 400) * 300, y: 0 };
      bg.draw(ctx, cam);
      ctx.fillStyle = 'rgba(8, 5, 12, 0.45)';
      ctx.fillRect(0, 0, W, H);
      title(ctx, 'TOSKA', W / 2, 150, 96, GOLD);
      ctx.font = `600 16px ${FONT}`;
      ctx.fillStyle = DIM;
      ctx.textAlign = 'center';
      ctx.fillText('a fighting game', W / 2, 182);
      drawMenu(ctx, ITEMS, sel, W / 2, 262);
      hint(ctx, W, H, 'Move: W/S or arrows · Choose: J (L button) or Enter · Back: K (M button) or Esc · F1 controls');
    },
  };
}
