// Shared browser setup: the canvas, scaling to the window, the data bundle.
import inputRules from '../../data/system/input.json';
import battle from '../../data/system/battle.json';
import combo from '../../data/system/combo.json';
import defaults from '../../data/system/fighter-defaults.json';
import common from '../../data/system/common-states.json';
import systems from '../../data/system/systems.json';
import burst from '../../data/system/burst.json';
import match from '../../data/system/match.json';
import camera from '../../data/system/camera.json';
import { compileCharacter } from '../core/character.js';
import { createWorld } from '../core/game.js';
import { compileDevotion } from '../core/devotion.js';

/** The Devotion rules in game units (data/system/systems.json "devotion"). */
const meter = compileDevotion(systems.devotion);

const STAGE_FILES = import.meta.glob('../../data/stages/*.json', { eager: true, import: 'default' });
const CHAR_FILES = import.meta.glob('../../data/characters/*/*.toska.json', { eager: true, import: 'default' });

export const W = 960;
export const H = 540;

export function setupCanvas() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    // Drawn at the real screen resolution (data/system/camera.json "render"): every drawing call still works in the
    // game's own 960x540 px; the canvas just holds k real pixels for each of them, so nothing is stretched afterwards.
    const k = camera.render.native ? Math.max(1, Math.min(camera.render.maxScale, s * (globalThis.devicePixelRatio || 1))) : 1;
    canvas.width = Math.round(W * k);
    canvas.height = Math.round(H * k);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    canvas.style.width = `${Math.floor(W * s)}px`;
    canvas.style.height = `${Math.floor(H * s)}px`;
    canvas.style.marginTop = `${Math.floor((innerHeight - H * s) / 2)}px`;
  };
  addEventListener('resize', fit);
  fit();
  return { canvas, ctx, ui: document.getElementById('ui') };
}

export const SYSTEM = { defaults, common, meter, burst, systems };
export const INPUT_RULES = inputRules;
export const BATTLE = battle;
export const COMBO = combo;
export const MATCH = match;
/** Every stage under data/stages, by id. */
export const STAGES = Object.fromEntries(Object.values(STAGE_FILES).map((s) => [s.id, s]));

/** Every character file as written (the raw Toska JSON) and where it lives, by id: the box editor edits these. */
export const CHAR_SOURCES = Object.fromEntries(Object.entries(CHAR_FILES).map(([key, file]) => [file.character.id, { file, path: key.slice(key.indexOf('data/')) }]));

/** Every character file found under data/characters, compiled, by id. */
export function loadCharacters() {
  const out = {};
  for (const file of Object.values(CHAR_FILES)) {
    const def = compileCharacter(file, SYSTEM);
    out[def.id] = def;
  }
  return out;
}

/** match: the match rules (rounds, timer), or null for free play (training). */
export function makeWorld(a, b, matchRules = null) {
  return createWorld({ input: inputRules, battle, combo, meter, burst, match: matchRules, systems, chars: [a, b] });
}
