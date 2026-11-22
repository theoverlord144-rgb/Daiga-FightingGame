// Game settings (the Settings screen), saved in the browser. They feed the match rules and the CPU.

const KEY = 'toska.settings.v1';

export const SETTING_OPTIONS = {
  roundsToWin: [1, 2, 3, 5],
  timerSeconds: [30, 60, 99, 0], // 0 = no timer
  cpuLevel: ['easy', 'normal', 'hard'],
  showPerformance: [false, true],
};

export const SETTING_LABELS = {
  roundsToWin: 'Rounds to win',
  timerSeconds: 'Round timer',
  cpuLevel: 'CPU level',
  showPerformance: 'Show performance',
};

export function defaultSettings() {
  return { roundsToWin: 2, timerSeconds: 99, cpuLevel: 'normal', showPerformance: false };
}

export function settingText(key, v) {
  if (key === 'timerSeconds') return v === 0 ? 'No timer' : `${v} seconds`;
  if (key === 'showPerformance') return v ? 'On' : 'Off';
  if (key === 'cpuLevel') return v[0].toUpperCase() + v.slice(1);
  return String(v);
}

export function loadSettings() {
  const s = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) for (const k of Object.keys(s)) if (SETTING_OPTIONS[k].includes(saved[k])) s[k] = saved[k];
  } catch { /* storage blocked or bad data: defaults */ }
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: lasts this visit */ }
}
