// The game around the engine: one current screen at a time (title, select, versus, training, settings).
// Every screen gets the menu input each step and draws itself; `app.go(name, params)` switches screens.
import { createTitleScreen } from './screens/title.js';
import { createSelectScreen } from './screens/select.js';
import { createStageSelectScreen } from './screens/stage-select.js';
import { createSidesScreen } from './screens/sides.js';
import { createFightScreen } from './screens/fight.js';
import { createTrainingScreen } from './screens/training-screen.js';
import { createSettingsScreen } from './screens/settings-screen.js';
import { createBoxEditorScreen } from './screens/box-editor.js';
import { createMenuInput } from './menu-input.js';
import { loadSettings } from './settings.js';

const SCREENS = {
  title: createTitleScreen,
  sides: createSidesScreen,
  select: createSelectScreen,
  stage: createStageSelectScreen,
  versus: createFightScreen,
  training: createTrainingScreen,
  settings: createSettingsScreen,
  editor: createBoxEditorScreen,
};

/**
 * shared: { ctx, ui, W, H, devices, chars, stage (the default), stages (every stage, for stage select), battle, matchBase, makeWorld(a, b, match), renderer, opts, time,
 * drawHistories(game) }.
 */
export function createApp(shared, start = ['title', {}]) {
  const app = {
    ...shared,
    settings: loadSettings(),
    panel: null,
    screen: null,
    screenName: '',
    menu: createMenuInput(shared.devices),
    // The cast for character select: the game's characters first, engine test characters last.
    cast: Object.values(shared.chars)
      .map((def) => ({ id: def.id, def, test: def.name.includes('engine test') }))
      .sort((a, b) => a.test - b.test || a.def.name.localeCompare(b.def.name)),
    /** Match rules from data/system/match.json with the player's settings on top. */
    matchRules() {
      return { ...shared.matchBase, roundsToWin: app.settings.roundsToWin, timerSeconds: app.settings.timerSeconds };
    },
    go(name, params = {}) {
      if (app.panel) { app.panel.close(); app.panel = null; }
      app.screen?.close?.(); // a screen that listens to the mouse lets go of it here
      app.screen = SCREENS[name](app, params);
      app.screenName = name;
      app.time.paused = false;
      app.menu.sync();
    },
    step() {
      const menu = app.menu.read();
      app.screen.step(menu);
    },
    draw() {
      app.screen.draw();
    },
    onKey(e) {
      app.screen.onKey?.(e);
    },
  };
  app.go(...start);
  return app;
}
