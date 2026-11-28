// Stage select (after character select, owner Nov 27): the highlighted stage plays behind the menu, drifting like the
// title screen. Left/right: stage · confirm: fight · back: character select, picks kept. Drawing only: the stage never
// changes the rules.
import { createStageRenderer } from '../../render/stage-renderer.js';
import { title, hint, FONT, INK, DIM, GOLD } from './common.js';

export function createStageSelectScreen(app, { mode = 'versus', picks, stageId = null }) {
  const { ctx, W, H } = app;
  const stages = app.stages;
  let cursor = Math.max(0, stages.findIndex((s) => s.id === (stageId ?? app.stage.id)));
  const made = {}; // a stage renderer per stage, made the first time it is shown
  const bgOf = (s) => (made[s.id] ??= createStageRenderer(s, W, H, H - 70, app.battle.stage.halfWidth));
  let t = 0;
  let wait = -1; // frames after confirming, before the fight
  // With one controller (Versus CPU, Training) only Player 1's choices count; in Versus either player may choose.
  const menus = (menu) => (mode === 'versus' ? menu : [menu[0]]);

  return {
    help: '',
    step(menu) {
      t++;
      if (wait >= 0) {
        if (++wait >= 20) {
          const stage = stages[cursor];
          if (mode === 'training') app.go('training', { picks, stage });
          else app.go('versus', { mode, picks, stage });
        }
        return;
      }
      for (const m of menus(menu)) {
        if (m.back) { app.go('select', { mode, last: picks }); return; }
        if (m.left) cursor = (cursor + stages.length - 1) % stages.length;
        if (m.right) cursor = (cursor + 1) % stages.length;
        if (m.confirm || m.buttons.H || m.buttons.S || (m.start && !m.escape)) { wait = 0; return; }
      }
    },
    draw() {
      const s = stages[cursor];
      bgOf(s).draw(ctx, { x: Math.sin(t / 300) * 260, y: 0 }, t);
      // A dark band behind the text, so it reads over any stage.
      const g = ctx.createLinearGradient(0, 0, 0, 200);
      g.addColorStop(0, 'rgba(8, 5, 12, 0.75)');
      g.addColorStop(1, 'rgba(8, 5, 12, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, 200);
      title(ctx, 'CHOOSE THE STAGE', W / 2, 58, 34);
      ctx.textAlign = 'center';
      ctx.font = `900 30px ${FONT}`;
      ctx.fillStyle = wait >= 0 ? GOLD : INK;
      ctx.fillText(s.name.toUpperCase(), W / 2, 118);
      if (stages.length > 1) {
        ctx.font = `800 26px ${FONT}`;
        ctx.fillStyle = GOLD;
        ctx.fillText('<', W / 2 - 230, 116);
        ctx.fillText('>', W / 2 + 230, 116);
      }
      ctx.font = `600 13px ${FONT}`;
      ctx.fillStyle = DIM;
      ctx.fillText(`${cursor + 1} / ${stages.length}`, W / 2, 142);
      hint(ctx, W, H, 'Left/right: stage · L (J) or Enter: fight · M (K) or Esc: back to character select');
    },
  };
}
