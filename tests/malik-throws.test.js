// Malik's throws (owner, Nov 23): forward (6H) and back (4H) up close, the same rules and numbers as Avner's.
// The drawings are placeholders (copies of his Standing Heavy and Back Heavy) until the throws are drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const FILE = 'data/characters/malik/malik.toska.json';
const M = loadChar(FILE);
const W = loadWorld(M, M);
function setup(gap) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  return g;
}
function run(g, s, p2 = '') {
  const a = script(s), b = script(p2), cues = [];
  for (let i = 0; i < a.length; i++) { step(g, [a[i], b[i] ?? 0], W); cues.push(...g.cues); }
  return cues;
}

test('Malik: 6H up close is the forward throw; it lands for its damage and he stays on his side', () => {
  const g = setup(60);
  const [p, d] = g.players;
  run(g, '6+H 5*3');
  assert.equal(p.state, 'throwHold');
  assert.equal(d.state, 'thrown');
  run(g, '5*60');
  assert.equal(d.health, M.stats.health - M.states['6H'].move.damage);
  assert.ok(p.x < d.x, 'the opponent is still in front of him');
});

test('Malik: 4H up close is the back throw and swaps sides; from farther away 4H is Back Heavy and 6H is Standing Heavy', () => {
  const g = setup(60);
  const [p, d] = g.players;
  run(g, '4+H 5*3');
  assert.equal(p.state, 'throwHold');
  run(g, '5*60');
  assert.ok(d.x < p.x, 'thrown behind him');
  assert.ok(d.health < M.stats.health);
  const far = setup(300);
  run(far, '4+H 5*2');
  assert.equal(far.players[0].state, 'backHeavy');
  const far2 = setup(300);
  run(far2, '6+H 5*2');
  assert.equal(far2.players[0].state, '5H');
});

test('Malik: the throw can be broken with H, and an opponent in the air is not thrown', () => {
  const g = setup(60);
  const cues = run(g, '6+H 5*20', '5*3 5+H 5*20');
  assert.ok(cues.some((c) => c.type === 'tech'), 'throw break');
  assert.equal(g.players[1].health, M.stats.health, 'no damage');
  const air = setup(60);
  run(air, '5*6 6+H 5*2', '8 5*20');
  assert.notEqual(air.players[0].state, 'throwHold');
});

test('Malik: both throws have their drawn art (grab, hold, finish)', () => {
  const raw = loadJSON(FILE);
  const image = (id) => raw.moves.find((m) => m.id === id).sprite.image;
  for (const id of ['6H', 'throwHold', 'throwFinish']) {
    assert.ok(!image(id).includes('placeholder'), `${id}: ${image(id)}`);
    assert.ok(existsSync(`data/characters/malik/${image(id)}`));
  }
  assert.ok(!image('4H').includes('placeholder'));
  assert.ok(existsSync(`data/characters/malik/${image('4H')}`));
  // The back throw's own hold and slam drawings (drawing only): they fill the same two states.
  const own = raw.art.throws['4H'];
  for (const st of ['throwHold', 'throwFinish']) assert.ok(existsSync(`data/characters/malik/${own[st].sprite.image}`), st);
  assert.equal(own.throwHold.holds.reduce((a, b) => a + b, 0), M.stats.throwHold);
  assert.equal(own.throwFinish.holds.reduce((a, b) => a + b, 0), M.states.throwFinish.duration);
  // The hold drawings fill the time the opponent has to break the throw; the push fills the finish.
  assert.equal(M.states.throwFinish.frames.at(-1).sprite.index, 3);
  assert.equal(M.states.throwFinish.frames.length, M.states.throwFinish.duration, 'the push drawings fill the finish');
});

test('throws are slow enough to read: the hold outlasts the break window, which stays as short as it was', () => {
  const { throwHold, throwBreak } = M.stats;
  assert.ok(throwHold > throwBreak, `hold ${throwHold}, break window ${throwBreak}`);
  assert.equal(throwBreak, loadJSON('data/system/fighter-defaults.json').stats.throwBreak, 'the window is the system one');
  // The throw lands when the hold ends and its hit drawing comes up (the move's throwHit).
  const wait = M.states['6H'].move.throwHit;
  const g = setup(60);
  run(g, '6+H 5*2');
  assert.equal(g.players[1].state, 'thrown');
  let landed = 0;
  for (let i = 1; i <= 40 && !landed; i++) { step(g, [0, 0], W); if (g.players[1].state !== 'thrown') landed = i; }
  assert.ok(landed >= throwHold + wait - 2 && landed <= throwHold + wait + 1, `landed after ${landed} frames`);
  // H inside the window breaks it; H after the window (still in the hold) does not.
  const early = setup(60);
  const cuesE = run(early, '6+H 5*30', `5*${throwBreak - 2} 5+H 5*30`);
  assert.ok(cuesE.some((c) => c.type === 'tech'), 'broken inside the window');
  const late = setup(60);
  const cuesL = run(late, '6+H 5*30', `5*${throwBreak + 4} 5+H 5*30`);
  assert.ok(!cuesL.some((c) => c.type === 'tech'), 'too late: the throw lands');
  assert.ok(late.players[1].health < M.stats.health);
});

test('a broken throw: both fighters play the throw-tech drawings for the whole tech, and recover together', () => {
  const g = setup(60);
  run(g, '6+H 5*5', '5*3 5+H 5*2');
  assert.equal(g.players[0].state, 'throwTech');
  assert.equal(g.players[1].state, 'throwTech');
  const tech = loadJSON('data/system/battle.json').throwTech.stun;
  for (const id of ['malik', 'avner']) {
    const raw = loadJSON(`data/characters/${id}/${id}.toska.json`);
    const art = raw.moves.find((m) => m.id === 'throwTech');
    assert.ok(art && existsSync(`data/characters/${id}/${art.sprite.image}`), `${id} has throw-tech art`);
    assert.equal(art.sprite.holds.reduce((a, b) => a + b, 0), tech, `${id}: the drawings fill the tech`);
  }
  let a = 0, d = 0;
  for (let i = 1; i <= 60 && !(a && d); i++) { step(g, [0, 0], W); if (!a && g.players[0].state === 'idle') a = i; if (!d && g.players[1].state === 'idle') d = i; }
  assert.ok(a && a === d, `both free on the same frame (${a}, ${d})`);
});

test('Avner: both throws have their drawn art, each with its own hold and finish drawings', () => {
  const raw = loadJSON('data/characters/avner/avner.toska.json');
  const A = loadChar('data/characters/avner/avner.toska.json');
  for (const id of ['6H', '4H']) {
    const grab = raw.moves.find((m) => m.id === id).sprite.image;
    assert.ok(!grab.includes('placeholder') && existsSync(`data/characters/avner/${grab}`), `${id}: ${grab}`);
    const own = raw.art.throws[id];
    for (const st of ['throwHold', 'throwFinish']) {
      assert.ok(existsSync(`data/characters/avner/${own[st].sprite.image}`), `${id} ${st}`);
      assert.ok(raw.art.lantern.at[own[st].sprite.image], 'the lantern is measured on it (the moon phase shows)');
    }
    assert.equal(own.throwHold.holds.reduce((a, b) => a + b, 0), A.stats.throwHold);
    assert.equal(own.throwFinish.holds.reduce((a, b) => a + b, 0), A.states.throwFinish.duration);
  }
  assert.equal(A.stats.throwHold, M.stats.throwHold, 'both characters throw at the same speed');
});

test('a throw connects on its hit drawing: the damage, knockdown and spark come while the finish plays, not when the hold ends', () => {
  for (const [input, id] of [['6+H', '6H'], ['4+H', '4H']]) {
    const move = M.states[id].move;
    assert.ok(move.throwHit > 0 && move.throwHit < M.states.throwFinish.duration, `${id}: hits during the finish`);
    const g = setup(60);
    run(g, `${input} 5*2`);
    assert.equal(g.players[1].state, 'thrown');
    const full = g.players[1].health;
    let finishAt = 0, hitAt = 0, spark = null, facingAtFinish = 0;
    for (let i = 1; i <= 80 && !hitAt; i++) {
      step(g, [0, 0], W);
      if (!finishAt && g.players[0].state === 'throwFinish') { finishAt = i; facingAtFinish = g.players[0].facing; assert.equal(g.players[1].health, full, 'no damage yet'); assert.equal(g.players[1].state, 'thrown', 'still held'); }
      const c = g.cues.find((q) => q.type === 'hit');
      if (c) { hitAt = i; spark = c; }
    }
    assert.ok(finishAt && hitAt, `${id}: finish ${finishAt}, hit ${hitAt}`);
    assert.equal(hitAt - finishAt, move.throwHit, `${id}: the hit comes throwHit frames into the finish`);
    assert.equal(g.players[0].state, 'throwFinish');
    assert.ok(g.players[1].health < full);
    // The spark is at the throw's own point, in front of the thrower and off the floor.
    const a = g.players[0];
    assert.equal(spark.x, a.x + a.facing * move.throwFx[0]);
    assert.equal(spark.y, move.throwFx[1]);
    assert.ok(spark.y > 0);
    // A back throw has already turned him round when the finish starts (its drawings are made for that).
    assert.equal(facingAtFinish, id === '4H' ? -1 : 1);
    assert.equal(Math.sign(g.players[1].x - a.x), a.facing, 'the thrown fighter is in front of him');
  }
});

test('a throw with no hit frame of its own lands the moment the hold ends, as before', () => {
  const T = loadChar('tests/fixtures/fighter.toska.json');
  const throwMove = T.states['6H'];
  assert.ok(throwMove);
  assert.equal(throwMove.move.throwHit, 0);
  assert.equal(throwMove.move.throwFx, null);
});

test('impact feel is drawing-only data: shake sizes, flash, and dust under the moves that run or slide', () => {
  const fx = loadJSON('data/system/effects.json');
  for (const size of fx.hit) assert.ok(size.name in fx.impact.shake, `a shake size for ${size.name} hits`);
  assert.ok(fx.impact.shake.frames > 0 && fx.impact.flash.frames >= 0);
  // (Avner's 2H stopped being a slide on Nov 25, owner's call, so it no longer has dust of its own.)
  for (const [id, states] of [['avner', []], ['malik', []]]) { // (Malik's Lariat was cut on Nov 27, owner: the Spirit Spear took 214)
    const raw = loadJSON(`data/characters/${id}/${id}.toska.json`);
    const def = loadChar(`data/characters/${id}/${id}.toska.json`);
    for (const st of states) {
      const rule = raw.art.motion[st];
      assert.ok(fx.motion.sheets[rule.play], `${id} ${st}: ${rule.play}`);
      assert.ok(def.states[st], st);
    }
    for (const st of Object.keys(raw.art.motion)) assert.ok(def.states[st], `${id}: ${st} is a real state`);
  }
});
