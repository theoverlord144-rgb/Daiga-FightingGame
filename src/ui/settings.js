// Game settings (the Settings screen), saved in the browser. They feed the match rules and the CPU.
import { setEffectsOpacity } from '../render/fx-opacity.js'; // FXOPACITY

const KEY = 'toska.settings.v1';

export const SETTING_OPTIONS = {
  roundsToWin: [1, 2, 3, 5],
  timerSeconds: [30, 60, 99, 0], // 0 = no timer
  cpuLevel: ['easy', 'normal', 'hard'],
  showPerformance: [false, true],
  effectsOpacity: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], // FXOPACITY
};

export const SETTING_LABELS = {
  roundsToWin: 'Rounds to win',
  timerSeconds: 'Round timer',
  cpuLevel: 'CPU level',
  showPerformance: 'Show performance',
  effectsOpacity: 'Effects opacity', // FXOPACITY
};

export function defaultSettings() {
  return { roundsToWin: 2, timerSeconds: 99, cpuLevel: 'normal', showPerformance: false };
}

export function settingText(key, v) {
  if (key === 'effectsOpacity') return `${Math.round(v * 100)}%`; // FXOPACITY
  if (key === 'timerSeconds') return v === 0 ? 'No timer' : `${v} seconds`;
  if (key === 'showPerformance') return v ? 'On' : 'Off';
  if (key === 'cpuLevel') return v[0].toUpperCase() + v.slice(1);
  return String(v);
}

export function loadSettings() {
  const s = defaultSettings();
  s.effectsOpacity = 1; // FXOPACITY
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) for (const k of Object.keys(s)) if (SETTING_OPTIONS[k].includes(saved[k])) s[k] = saved[k];
  } catch { /* storage blocked or bad data: defaults */ }
  setEffectsOpacity(s.effectsOpacity ?? 1); // FXOPACITY
  return s;
}

export function saveSettings(s) {
  setEffectsOpacity(s.effectsOpacity ?? 1); // FXOPACITY
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked: lasts this visit */ }
}
