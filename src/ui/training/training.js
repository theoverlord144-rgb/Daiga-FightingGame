// Training mode controller. Sits between the controllers and the core:
//   - turns the settings into Player 2's controller input (the dummy), every frame,
//   - records and plays back the dummy,
//   - between frames, refills health and resets positions (training-only conveniences; the core's own rules are
//     untouched, and a real match never runs this file).
// Pure (no DOM), so the tests drive it directly. Randomness is a seeded LCG, so a training session is repeatable.

import { RAW } from '../../core/input.js';
import { createGame } from '../../core/game.js';
import { px } from '../../core/fixed.js';
import { STUN_STATES } from './frame-meter.js';

export const OPTIONS = {
  stance: ['stand', 'crouch', 'jump'],
  block: ['none', 'all', 'after first hit', 'random'],
  blockGuard: ['correct', 'stand only', 'crouch only'],
  tech: ['air tech', 'no tech'],
  refill: ['on', 'off'],
  meter: ['normal', 'always full'], // infinite meter: Devotion, the Rite gauge, the mechanic gauge
  absolve: ['normal', 'always available'],
  position: ['center', 'left corner', 'right corner'],
};

export function defaultSettings() {
  return { stance: 'stand', block: 'none', blockGuard: 'correct', tech: 'air tech', refill: 'on', meter: 'normal', absolve: 'normal', position: 'center' };
}

const DIRS = RAW.LEFT | RAW.RIGHT | RAW.UP | RAW.DOWN;
/** Screen raw input ⇄ facing-relative (bit 0 = back, bit 1 = forward), so a recording works from either side. */
export function toRelative(raw, facing) {
  if (facing > 0) return raw;
  return (raw & ~(RAW.LEFT | RAW.RIGHT)) | (raw & RAW.LEFT ? RAW.RIGHT : 0) | (raw & RAW.RIGHT ? RAW.LEFT : 0);
}
export const fromRelative = toRelative; // the same swap both ways

export function createTraining(world, settings = defaultSettings(), { seed = 12345 } = {}) {
  let rng = seed >>> 0;
  const rand = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng >>> 16; };

  const t = {
    settings,
    mode: 'dummy', // 'dummy' | 'record' | 'playback'
    recording: [], // facing-relative raw inputs
    playIndex: 0,
    blockLatch: false, // 'after first hit': blocking switched on
    calmFrames: 0,
    randomBlock: false,
    lastAttackStart: -1,
    freeFrames: 0,

    /** A fresh game at the chosen position. */
    newGame() {
      const g = createGame(world);
      const half = world.battle.halfWidthUnits;
      const gap = px(140);
      const at = { center: [-px(150), px(150)], 'left corner': [-half + px(40) + gap, -half + px(40)],
        'right corner': [half - px(40) - gap, half - px(40)] }[settings.position];
      g.players[0].x = at[0];
      g.players[1].x = at[1];
      g.players[0].facing = g.players[1].x >= g.players[0].x ? 1 : -1;
      g.players[1].facing = -g.players[0].facing;
      t.blockLatch = false;
      t.calmFrames = 0;
      return g;
    },

    startRecording() { t.mode = 'record'; t.recording = []; },
    stopRecording() { t.mode = 'dummy'; },
    startPlayback() { if (t.recording.length) { t.mode = 'playback'; t.playIndex = 0; } },
    stopPlayback() { t.mode = 'dummy'; },

    /** The controller inputs for this frame: [P1, P2]. dev = what the real controllers hold. */
    inputs(game, dev) {
      const d = game.players[1];
      if (t.mode === 'record') {
        // Player 1's controller drives the dummy; Player 1's fighter stands still.
        t.recording.push(toRelative(dev[0], d.facing));
        return [0, dev[0]];
      }
      if (t.mode === 'playback') {
        const raw = fromRelative(t.recording[t.playIndex], d.facing);
        t.playIndex = (t.playIndex + 1) % t.recording.length;
        return [dev[0], raw];
      }
      return [dev[0], dev[1] | t.dummyInput(game)];
    },

    /** What the dummy holds this frame, decided from last frame's state. */
    dummyInput(game) {
      const [a, d] = game.players;
      const ddef = world.chars[1];
      const s = settings;
      const away = a.x > d.x ? RAW.LEFT : a.x < d.x ? RAW.RIGHT : (d.facing > 0 ? RAW.LEFT : RAW.RIGHT);
      let raw = s.stance === 'crouch' ? RAW.DOWN : s.stance === 'jump' ? RAW.UP : 0;

      // Air tech: any button as soon as the engine allows it.
      if (s.tech === 'air tech' && d.state === 'tumble') return RAW.L;

      // Blocking.
      const ast = world.chars[0].states[a.state];
      const threat = !!ast.move && ast.move.guard !== 'unblockable';
      const inBlock = d.state.startsWith('block');
      if (threat && game.frame !== t.lastAttackStart && a.frame === 0) {
        t.lastAttackStart = game.frame;
        t.randomBlock = (rand() & 1) === 1;
      }
      let wantBlock = false;
      if (s.block === 'all') wantBlock = true;
      else if (s.block === 'random') wantBlock = t.randomBlock;
      else if (s.block === 'after first hit') {
        // Switches on when the dummy is hit, off again after a second of calm.
        if (STUN_STATES.has(d.state) && !inBlock) t.blockLatch = true;
        const calm = !threat && ddef.states[d.state].free;
        t.calmFrames = calm ? t.calmFrames + 1 : 0;
        if (t.calmFrames > 60) t.blockLatch = false;
        wantBlock = t.blockLatch && !(STUN_STATES.has(d.state) && !inBlock);
      }
      if (wantBlock && (threat || inBlock)) {
        let low;
        if (s.blockGuard === 'stand only') low = false;
        else if (s.blockGuard === 'crouch only') low = true;
        else low = threat ? ast.move.guard === 'low' || (ast.move.guard === 'mid' && s.stance === 'crouch') : (d.state === 'blockCrouch');
        raw = away | (low ? RAW.DOWN : 0);
      }
      return raw & (DIRS | RAW.L);
    },

    /** Between frames: refill health once both fighters have been free for a moment. */
    afterStep(game) {
      if (settings.meter === 'always full') {
        for (const p of game.players) {
          const def = world.chars[p.id];
          p.meter = def.meterMax;
          if (def.rite?.gauge) p.rite = def.rite.gauge.charges;
          if (def.mechanic.gauge) p.gauge = def.mechanic.gauge.max;
        }
      }
      if (settings.absolve === 'always available' && world.burst) {
        for (const p of game.players) p.burst = world.burst.gaugeMax;
      }
      if (settings.refill !== 'on') return;
      const free = game.players.every((p) => world.chars[p.id].states[p.state].free && !p.combo);
      t.freeFrames = free ? t.freeFrames + 1 : 0;
      if (t.freeFrames === 40) {
        for (const p of game.players) {
          p.health = world.chars[p.id].stats.health;
          if (world.burst && p.burst < world.burst.gaugeMax) p.burst = world.burst.gaugeMax; // burst back too
        }
      }
    },
  };
  return t;
}
