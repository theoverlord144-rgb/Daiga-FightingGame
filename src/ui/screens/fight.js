// A versus match (two players, or Player 1 against the CPU): versus splash, rounds, pause menu, results.
import { createGame, step } from '../../core/game.js';
import { createCpu } from '../cpu.js';
import { createReplayRecorder } from '../../net/replay.js';
import { downloadReplay } from '../replay-file.js';
import { drawMenu, drawPortrait, shade, title, hint, FONT, INK, DIM, GOLD } from './common.js';

const PAUSE = ['RESUME', 'CHARACTER SELECT', 'MAIN MENU'];
const RESULTS = ['REMATCH', 'CHARACTER SELECT', 'MAIN MENU'];

export function createFightScreen(app, { mode = 'versus', picks, stage = app.stage }) {
  const { ctx, W, H } = app;
  const rules = app.matchRules();
  const defs = picks.map((p) => app.chars[p.id]);
  const world = app.makeWorld(defs[0], defs[1], rules);
  const renderer = app.renderer;
  const palettes = picks.map((p) => p.pal);
  let game;
  let cpu;
  let rec;
  let splash = 110; // the versus screen before the fight
  let paused = false;
  let sel = 0;
  let endWait = 0;

  function start() {
    game = createGame(world);
    cpu = mode === 'cpu' ? createCpu(world, 1, { level: app.settings.cpuLevel, seed: (Date.now() & 0xffff) + 1 }) : null;
    rec = createReplayRecorder({ chars: picks.map((p) => p.id), match: rules, palettes });
    paused = false;
    endWait = 0;
    sel = 0;
  }
  start();

  const choose = (item) => {
    if (item === 'RESUME') paused = false;
    else if (item === 'REMATCH') { start(); splash = 0; }
    else if (item === 'CHARACTER SELECT') app.go('select', { mode, last: picks, stageId: stage.id });
    else if (item === 'MAIN MENU') app.go('title', { index: mode === 'cpu' ? 1 : 0 });
  };

  return {
    help: '',
    get game() { return game; }, // for the debugging hook (window.toska)
    saveReplay: () => downloadReplay(rec.finish(game), 'toska-match'),
    step(menu) {
      if (splash > 0) {
        splash--;
        if (menu.some((m) => m.confirm || m.start)) splash = 0;
        return;
      }
      const over = game.match.phase === 'end';
      if (over && ++endWait < 90) { advance(); return; }
      if (paused || (over && endWait >= 90)) {
        const items = over ? RESULTS : PAUSE;
        for (const m of menu) {
          if (m.up) sel = (sel + items.length - 1) % items.length;
          if (m.down) sel = (sel + 1) % items.length;
          if (m.confirm) { choose(items[sel]); return; }
          if (!over && (m.back || m.start)) { paused = false; return; }
        }
        if (over) advance(); // the winner keeps breathing behind the results
        return;
      }
      if (menu.some((m) => m.start)) { paused = true; sel = 0; return; }
      advance();
    },
    draw() {
      if (splash > 0) return drawSplash();
      renderer.draw(game, world, { ...app.opts, labels: false, stage, palettes });
      app.drawHistories(game);
      if (cpu && game.match.phase === 'intro') {
        ctx.font = `700 13px ${FONT}`;
        ctx.fillStyle = DIM;
        ctx.textAlign = 'right';
        ctx.fillText(`CPU: ${app.settings.cpuLevel}`, W - 16, 96);
      }
      const over = game.match.phase === 'end' && endWait >= 90;
      if (paused || over) {
        shade(ctx, W, H, over ? 0.35 : 0.6);
        if (paused) title(ctx, 'PAUSED', W / 2, 200, 44);
        drawMenu(ctx, over ? RESULTS : PAUSE, sel, W / 2, over ? 330 : 270);
        hint(ctx, W, H, 'Up/down and L (J) or Enter · Ctrl+S saves a replay of this match');
      }
    },
  };

  function advance() {
    const raws = [app.devices.read(0), cpu ? cpu.input(game) : app.devices.read(1)];
    step(game, raws, world);
    renderer.notice(game, world);
    rec.record(raws, game);
  }

  function drawSplash() {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#3a1520');
    g.addColorStop(0.5, '#120b16');
    g.addColorStop(1, '#14203a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const slide = Math.min(1, (110 - splash) / 18);
    defs.forEach((def, i) => {
      const x = i === 0 ? 240 - (1 - slide) * 300 : W - 240 + (1 - slide) * 300;
      drawPortrait(ctx, def, palettes[i], x, 400, 1.8, i === 0 ? 1 : -1);
      ctx.textAlign = 'center';
      ctx.font = `900 34px ${FONT}`;
      ctx.fillStyle = INK;
      ctx.fillText(def.name.replace(' (engine test)', '').toUpperCase(), x, 460);
      ctx.font = `600 14px ${FONT}`;
      ctx.fillStyle = DIM;
      ctx.fillText(i === 1 && cpu ? `CPU (${app.settings.cpuLevel})` : `PLAYER ${i + 1}`, x, 484);
    });
    title(ctx, 'VS', W / 2, 290, 90, GOLD);
    ctx.font = `600 14px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.textAlign = 'center';
    ctx.fillText(`${stage.name} · first to ${rules.roundsToWin} · ${rules.timerSeconds ? `${rules.timerSeconds}s rounds` : 'no timer'}`, W / 2, 340);
  }
}
