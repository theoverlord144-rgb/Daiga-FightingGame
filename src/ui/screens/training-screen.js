// Training mode as a screen: the dummy, the frame meter, record/playback, the F2 menu, time controls.
import { step } from '../../core/game.js';
import { createTraining } from '../training/training.js';
import { createFrameMeter } from '../training/frame-meter.js';
import { drawTrainingOverlay } from '../training/overlay.js';
import { createSystemsReadout } from '../training/systems-readout.js';
import { openTrainingPanel, loadTrainingSettings } from '../training/training-panel.js';
import { openPolishPanel } from '../training/polish-panel.js';
import { drawMenu, shade, title, hint } from './common.js';

const PAUSE = ['RESUME', 'CHARACTER SELECT', 'MAIN MENU'];

export function createTrainingScreen(app, { picks }) {
  const { ctx, W, H } = app;
  const world = app.makeWorld(app.chars[picks[0].id], app.chars[picks[1].id], null);
  const training = createTraining(world, loadTrainingSettings());
  const meter = createFrameMeter();
  const readout = createSystemsReadout();
  const palettes = picks.map((p) => p.pal);
  let game = training.newGame();
  let paused = false;
  let sel = 0;
  let polish = null; // the polish panel (P): look-only switches, never blocks the game

  return {
    pausable: true,
    get game() { return game; }, // for the debugging hook (window.toska)
    help: 'F1 controls · F2 training menu · F3 boxes · F4 labels · F5 inputs · F6 record · F7 playback · F8 meter · P polish · F9 pause · F10 frame · ` slow · R reset · Enter menu',
    step(menu) {
      if (paused) {
        for (const m of menu) {
          if (m.up) sel = (sel + PAUSE.length - 1) % PAUSE.length;
          if (m.down) sel = (sel + 1) % PAUSE.length;
          if (m.confirm) {
            const item = PAUSE[sel];
            if (item === 'RESUME') paused = false;
            else if (item === 'CHARACTER SELECT') app.go('select', { mode: 'training', last: picks });
            else app.go('title', { index: 2 });
            return;
          }
          if (m.back || (m.start && !m.escape)) { paused = false; return; }
        }
        return;
      }
      // Enter or pad Start opens the menu (Esc is the training panel's close key, so it doesn't).
      if (!app.panel && menu.some((m) => m.start && !m.escape)) { paused = true; sel = 0; return; }
      if (app.time.paused && !app.time.consumeStep()) return;
      const dev = app.panel ? [0, 0] : [app.devices.read(0), app.devices.read(1)];
      step(game, training.inputs(game, dev), world);
      app.renderer.notice(game, world);
      training.afterStep(game);
      meter.update(game, world);
      readout.update(game, world);
    },
    draw() {
      app.renderer.draw(game, world, { ...app.opts, stage: app.stage, palettes, marks: true });
      if (app.opts.meter) drawTrainingOverlay(ctx, W, H, meter, training, readout, game);
      app.drawHistories(game);
      if (paused) {
        shade(ctx, W, H);
        title(ctx, 'TRAINING', W / 2, 200, 44);
        drawMenu(ctx, PAUSE, sel, W / 2, 270);
        hint(ctx, W, H, 'Up/down and L (J) or Enter');
      }
    },
    onKey(e) {
      if (e.code === 'F2' || (e.code === 'Escape' && app.panel?.training)) {
        e.preventDefault();
        if (app.panel) { if (app.panel.training) app.panel.close(); return; }
        app.panel = openTrainingPanel(app.ui, training.settings, () => { app.panel = null; });
        app.panel.training = true;
        return;
      }
      if (app.panel || paused) return;
      if (e.code === 'KeyP' && !e.repeat) { if (polish) polish.close(); else polish = openPolishPanel(app.ui, () => { polish = null; }); }
      if (e.code === 'F4') { e.preventDefault(); app.opts.labels = !app.opts.labels; }
      if (e.code === 'F8') { e.preventDefault(); app.opts.meter = !app.opts.meter; }
      if (e.code === 'F6') {
        e.preventDefault();
        if (training.mode === 'record') training.stopRecording();
        else training.startRecording();
      }
      if (e.code === 'F7') {
        e.preventDefault();
        if (training.mode === 'playback') training.stopPlayback();
        else training.startPlayback();
      }
      if (e.code === 'KeyR' && !e.repeat) { game = training.newGame(); meter.reset(); }
    },
  };
}
