// Shared browser setup: the canvas, scaling to the window, the data bundle.
import inputRules from '../../data/system/input.json';
import battle from '../../data/system/battle.json';
import combo from '../../data/system/combo.json';
import defaults from '../../data/system/fighter-defaults.json';
import common from '../../data/system/common-states.json';
import { compileCharacter } from '../core/character.js';
import { createWorld } from '../core/game.js';

const CHAR_FILES = import.meta.glob('../../data/characters/*/*.toska.json', { eager: true, import: 'default' });

export const W = 960;
export const H = 540;

export function setupCanvas() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const fit = () => {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${Math.floor(W * s)}px`;
    canvas.style.height = `${Math.floor(H * s)}px`;
    canvas.style.marginTop = `${Math.floor((innerHeight - H * s) / 2)}px`;
  };
  addEventListener('resize', fit);
  fit();
  return { canvas, ctx, ui: document.getElementById('ui') };
}

export const SYSTEM = { defaults, common };
export const INPUT_RULES = inputRules;
export const BATTLE = battle;

/** Every character file found under data/characters, compiled, by id. */
export function loadCharacters() {
  const out = {};
  for (const file of Object.values(CHAR_FILES)) {
    const def = compileCharacter(file, SYSTEM);
    out[def.id] = def;
  }
  return out;
}

export function makeWorld(a, b) {
  return createWorld({ input: inputRules, battle, combo, chars: [a, b] });
}
