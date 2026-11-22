// Settings: match rules, CPU level, the performance readout, and the controls panel.
import { SETTING_OPTIONS, SETTING_LABELS, settingText, saveSettings } from '../settings.js';
import { openControlsPanel } from '../controls-panel.js';
import { drawMenu, title, hint } from './common.js';

export function createSettingsScreen(app) {
  const { ctx, W, H } = app;
  const keys = Object.keys(SETTING_OPTIONS);
  const rows = () => [
    ...keys.map((k) => ({ label: SETTING_LABELS[k], value: settingText(k, app.settings[k]) })),
    { label: 'CONTROLS' },
    { label: 'BACK' },
  ];
  let sel = 0;
  const change = (dir) => {
    const k = keys[sel];
    if (!k) return;
    const opts = SETTING_OPTIONS[k];
    app.settings[k] = opts[(opts.indexOf(app.settings[k]) + dir + opts.length) % opts.length];
    saveSettings(app.settings);
  };
  return {
    help: '',
    step(menu) {
      if (app.panel) return;
      const n = rows().length;
      for (const m of menu) {
        if (m.up) sel = (sel + n - 1) % n;
        if (m.down) sel = (sel + 1) % n;
        if (m.left) change(-1);
        if (m.right) change(1);
        if (m.back) { app.go('title', { index: 3 }); return; }
        if (m.confirm) {
          if (sel === keys.length) app.panel = openControlsPanel(app.ui, app.devices, () => { app.panel = null; app.menu.sync(); }); // Esc closing it isn't "back"
          else if (sel === keys.length + 1) { app.go('title', { index: 3 }); return; }
          else change(1);
        }
      }
    },
    draw() {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#1d1430');
      g.addColorStop(1, '#0b0810');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      title(ctx, 'SETTINGS', W / 2, 90, 40);
      drawMenu(ctx, rows(), sel, W / 2, 170, { width: 520, gap: 50 });
      hint(ctx, W, H, 'Up/down: choose · Left/right: change · L (J) or Enter: select · M (K) or Esc: back · saved automatically');
    },
  };
}
