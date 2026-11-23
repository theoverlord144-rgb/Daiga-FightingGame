// Universal systems, section 11 (docs/specs/universal-systems.md): the training mode readouts and toggles.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { enterState } from '../src/core/fighter.js';
import { RAW } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { createSystemsReadout } from '../src/ui/training/systems-readout.js';
import { createTraining, defaultSettings, OPTIONS } from '../src/ui/training/training.js';
import { loadWorld, loadChar } from './helpers.js';

const W = loadWorld();
const MALIK = loadChar('data/characters/malik/malik.toska.json');

function setup() {
  const g = createGame(W);
  g.players[0].x = -px(40);
  g.players[1].x = px(40);
  return g;
}
/** Step with the readout watching, until `done(g)` or `max` frames. `raw(i)` gives [P1, P2] input for step i. */
function watch(g, r, raw, done, max = 80) {
  for (let i = 0; i < max; i++) {
    step(g, raw(i), W);
    r.update(g, W);
    if (done(g)) return i;
  }
  throw new Error('never happened');
}
const hitCue = (g) => g.cues.some((c) => ['hit', 'counter', 'witness'].includes(c.type));

test('readout: a combo shows hits, damage, scaling, juggle total, decay timer and Devotion per source', () => {
  const g = setup();
  const r = createSystemsReadout();
  assert.deepEqual(r.lines(0, g), [], 'nothing before the first hit');
  watch(g, r, (i) => [i === 0 ? RAW.L : 0, 0], hitCue);
  const k = r.combo[0];
  assert.equal(k.live, true);
  assert.equal(k.hits, 1);
  assert.equal(k.damage, g.players[1].combo.damage);
  assert.equal(k.scalePct, Math.round(g.players[1].combo.scale / 100));
  assert.ok(k.scalePct < 100, 'scaling has started');
  assert.equal(k.juggle, 0);
  assert.equal(k.juggleLimit, W.combo.juggleLimit);
  assert.equal(k.decayEnd, W.combo.techOutAt);
  assert.ok(k.by.hit > 0, 'Devotion from the hit');
  assert.equal(k.gave, Math.round(g.players[1].combo.gave / 100));
  const text = r.lines(0, g).join('\n');
  assert.match(text, /combo: 1 hits/);
  assert.match(text, /scaling \d+%/);
  assert.match(text, /juggle 0\/10/);
  assert.match(text, /decay timer \d+\/480/);
  assert.match(text, /Devotion: hits \d+/);
  assert.match(text, /starter: normal hit/);
  assert.deepEqual(r.lines(1, g), [], 'the other player has hit nothing');
  // When the combo ends the numbers stay up as the last combo.
  watch(g, r, () => [0, 0], (s) => !s.players[1].combo, 200);
  assert.equal(r.combo[0].live, false);
  assert.match(r.lines(0, g)[0], /^last combo: 1 hits/);
});

test('readout: the counter type of the hit that started the combo', () => {
  // Player 2 is in a Heavy: at its start (a counter hit), or in its recovery (a Witness counter). Player 1 jabs.
  const st = W.chars[1].states['5H'];
  const recovery = st.move.startup - 1 + st.move.active + 2;
  for (const [frame, want] of [[0, 'COUNTER'], [recovery, 'WITNESS']]) {
    const g = setup();
    const r = createSystemsReadout();
    enterState(g.players[1], W.chars[1], '5H');
    g.players[1].frame = frame;
    watch(g, r, (i) => [i === 0 ? RAW.L : 0, 0], hitCue, 40);
    assert.ok(g.players[1].combo, 'Player 1 landed the hit');
    assert.match(r.lines(0, g).join(' | '), new RegExp(`starter: ${want}`), `victim on frame ${frame}`);
  }
});

test('readout: Perfect Link timing, early and perfect', () => {
  const press = (when) => {
    const g = setup();
    const r = createSystemsReadout();
    watch(g, r, (i) => [i === 0 ? RAW.L : 0, 0], hitCue);
    const stop = g.players[0].hitstop;
    // Frame j of the hitstop gets the M press.
    const j = when === 'early' ? 1 : stop;
    for (let i = 1; i <= stop + 6; i++) { step(g, [i === j ? RAW.M : 0, 0], W); r.update(g, W); }
    return r;
  };
  let r = press('early');
  assert.equal(r.link[0].timing, 'early');
  assert.match(r.lines(0).join('\n'), /link: \d+f early/);
  r = press('perfect');
  assert.equal(r.link[0].timing, 'perfect');
  assert.match(r.lines(0).join('\n'), /link: PERFECT/);
  assert.ok(r.combo[0].by.link > 0, 'and the Devotion it gave is listed');
  assert.match(r.lines(0).join('\n'), /links \d+/);
});

test('readout: Debt is shown while a fighter owes any', () => {
  const g = setup();
  const r = createSystemsReadout();
  g.players[0].debt = 730;
  assert.ok(r.lines(0, g).includes('Debt 730'));
  g.players[0].debt = 0;
  assert.ok(!r.lines(0, g).some((l) => l.startsWith('Debt')));
});

test('training toggles: infinite meter fills Devotion and the Rite gauge; "Absolve available" is its own switch', () => {
  assert.deepEqual(OPTIONS.meter, ['normal', 'always full']);
  assert.deepEqual(OPTIONS.absolve, ['normal', 'always available']);
  assert.equal(defaultSettings().absolve, 'normal');
  const w = loadWorld(MALIK, MALIK);
  const drain = (g) => { for (const p of g.players) { p.meter = 0; p.rite = 0; p.burst = 0; } };
  // Infinite meter only.
  let t = createTraining(w, { ...defaultSettings(), meter: 'always full', refill: 'off' });
  let g = t.newGame();
  drain(g);
  t.afterStep(g);
  for (const p of g.players) {
    assert.equal(p.meter, MALIK.meterMax);
    assert.equal(p.rite, 3);
    assert.equal(p.burst, 0, 'Absolve stays spent');
  }
  // Absolve available only.
  t = createTraining(w, { ...defaultSettings(), absolve: 'always available', refill: 'off' });
  g = t.newGame();
  drain(g);
  t.afterStep(g);
  for (const p of g.players) {
    assert.equal(p.burst, w.burst.gaugeMax);
    assert.equal(p.meter, 0);
    assert.equal(p.rite, 0);
  }
  // Neither: nothing is touched.
  t = createTraining(w, { ...defaultSettings(), refill: 'off' });
  g = t.newGame();
  drain(g);
  t.afterStep(g);
  assert.deepEqual(g.players.map((p) => [p.meter, p.rite, p.burst]), [[0, 0, 0], [0, 0, 0]]);
});
