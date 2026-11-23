// Universal systems, section 1 (docs/specs/universal-systems.md): five buttons and the input table.
// One test per row of the table that exists so far, with the overlaps. Rows for Vow, Absolve, Repel / Draw and the
// Rite moves get their tests where those systems are built.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step } from '../src/core/game.js';
import { compileCharacter, parseInput } from '../src/core/character.js';
import { RAW, BTN, BUTTONS, createInputState, pushInput, pressedAt, buttonsOf, frameAt } from '../src/core/input.js';
import { px } from '../src/core/fixed.js';
import { loadWorld, loadChar, loadJSON, script, SYSTEM } from './helpers.js';

const P = loadChar('data/characters/proto/proto.toska.json');
const W = loadWorld(P, P);
const M = SYSTEM.meter;
const CW = W.input.chordWindow;

function setup(gap = 300, meter = 0) {
  const g = createGame(W);
  g.players[0].x = -px(gap / 2);
  g.players[1].x = px(gap / 2);
  g.players[0].meter = meter;
  return g;
}
/** Every state Player 1 passes through, in order, without repeats. */
const seen = (g, s) => {
  const out = [];
  for (const r of script(s)) { step(g, [r, 0], W); if (out.at(-1) !== g.players[0].state) out.push(g.players[0].state); }
  return out;
};
/** A press of `first`, then `second` `gap` frames later (0 = together), after `lead`. */
const pair = (lead, dir, first, second, gap, tail = '5*30') =>
  gap === 0 ? `${lead} ${dir}+${first}${second} ${tail}` : `${lead} ${dir}+${first} ${gap > 1 ? `${dir}*${gap - 1} ` : ''}${dir}+${second} ${tail}`;

test('five buttons: L, M, H, S and R each have their own bit, and all five reach the input buffer', () => {
  assert.deepEqual(BUTTONS, ['L', 'M', 'H', 'S', 'R']);
  const bits = BUTTONS.map((b) => RAW[b]);
  assert.equal(new Set(bits).size, 5);
  for (const b of bits) assert.equal(b & 15, 0, 'no button shares a bit with a direction');
  const inp = createInputState(W.input.bufferFrames);
  pushInput(inp, 0, W.input);
  pushInput(inp, RAW.L | RAW.M | RAW.H | RAW.S | RAW.R, W.input);
  assert.equal(buttonsOf(frameAt(inp, 0)), 31);
  for (const b of BUTTONS) assert.ok(pressedAt(inp, BTN[b], 0), b);
  pushInput(inp, RAW.R, W.input);
  assert.equal(buttonsOf(frameAt(inp, 0)), BTN.R, 'R held alone');
  assert.ok(!pressedAt(inp, BTN.R, 0), 'held, not pressed again');
});

test('R in a command: R, 2R, 6R and j.R are read like any other button', () => {
  assert.deepEqual(parseInput('5R'), { air: false, motion: null, dir: '5', buttons: 'R' });
  assert.deepEqual(parseInput('2R'), { air: false, motion: null, dir: '2', buttons: 'R' });
  assert.deepEqual(parseInput('6R'), { air: false, motion: null, dir: '6', buttons: 'R' });
  assert.deepEqual(parseInput('j.R'), { air: true, motion: null, dir: '5', buttons: 'R' });
  const mv = (id, input) => ({ id, input, startup: 3, active: 2, recovery: 6, damage: 100, hitstun: 12, hitboxes: [[0, 40, 60, 40]] });
  const c = compileCharacter({ engine: 'Toska', version: 2, character: { id: 'r', stats: {} },
    moves: [mv('rite5', '5R'), mv('rite2', '2R'), mv('rite6', '6R'), mv('riteJ', 'j.R'), mv('5S', '5S'), mv('5L', '5L')] }, SYSTEM);
  const w = loadWorld(c, c);
  const first = (s) => {
    const g = createGame(w);
    let got = null;
    for (const r of script(s)) { step(g, [r, 0], w); if (!got && c.states[g.players[0].state].move) got = g.players[0].state; }
    return got;
  };
  assert.equal(first('5 5+R 5*5'), 'rite5');
  assert.equal(first('2*3 2+R 5*5'), 'rite2');
  assert.equal(first('6 6+R 5*5'), 'rite6');
  assert.equal(first('8*8 5*6 5+R 5*5'), 'riteJ');
  assert.equal(first('5 5+S 5*5'), '5S', 'S is not R');
});

test('motion + attack button: the normal special of that strength', () => {
  for (const b of ['L', 'M', 'H']) {
    const g = setup(900, 30000);
    assert.ok(seen(g, `2 3 6+${b} 5*60`).includes(`236${b}`), b);
    assert.equal(g.players[0].meter, 30000 + M.gain.special.whiff, 'a normal special costs nothing');
  }
});

test('motion + attack button + S: the EX version of that strength, for one bar', () => {
  for (const b of ['L', 'M', 'H']) {
    const g = setup(300, 30000);
    const s = seen(g, `2 3 6+${b}S 5`);
    assert.ok(s.includes(`236${b}_ex`), `${b}: ${s.join(' ')}`);
    assert.ok(!s.includes('5S') && !s.includes('236S'), 'never the S move');
    assert.equal(g.players[0].meter, 30000 - M.barSize);
  }
});

test('EX without a full bar: the normal version of that strength, and nothing is spent', () => {
  for (const b of ['L', 'M', 'H']) {
    for (const meter of [0, M.barSize - 1]) {
      const g = setup(300, meter);
      const s = seen(g, `2 3 6+${b}S 5`);
      assert.ok(s.includes(`236${b}`) && !s.includes(`236${b}_ex`), `${b} with ${meter}: ${s.join(' ')}`);
      assert.equal(g.players[0].meter, meter);
      // The S of the pair is used up: it never starts the S move afterwards.
      assert.ok(!seen(g, '5*60').some((x) => x === '5S' || x === '236S'));
    }
  }
});

test('EX: the two buttons may land up to chordWindow frames apart, in either order', () => {
  for (const b of ['L', 'M', 'H']) {
    for (let gap = 0; gap <= CW; gap++) {
      for (const [first, second] of [[b, 'S'], ['S', b]]) {
        const g = setup(300, 20000);
        const s = seen(g, pair('2 3', '6', first, second, gap, '5*50'));
        assert.ok(s.includes(`236${b}_ex`), `${first} then ${second}, ${gap} apart: ${s.join(' ')}`);
        assert.equal(g.players[0].meter, 20000 - M.barSize + M.gain.special.whiff, 'paid once, and only the EX builds whiff meter');
      }
    }
  }
});

test('EX: the overrides are laid over the normal move, and everything else is the normal move\'s', () => {
  const raw = loadJSON('data/characters/proto/proto.toska.json');
  const base = raw.moves.find((m) => m.id === '236M');
  const n = P.states['236M'].move;
  const e = P.states['236M_ex'].move;
  assert.equal(e.ex, true);
  assert.equal(n.ex, false);
  assert.equal(e.damage, base.ex.damage);
  assert.equal(e.startup, base.ex.startup);
  assert.notEqual(e.damage, n.damage);
  for (const k of ['active', 'recovery', 'hitstun', 'blockstun', 'hitstop', 'guard', 'reach', 'pushbackHit']) assert.equal(e[k], n[k], k);
  assert.equal(e.cost.meter, M.exCost);
  assert.equal(n.cost.meter, 0);
  assert.deepEqual(P.states['236M_ex'].frames[e.startup - 1].hit, P.states['236M'].frames[n.startup - 1].hit, 'the same hitbox');
  // Rush (L): its EX replaces the timeline whole, adds invincibility and a second hit.
  const l = P.states['236L_ex'];
  assert.ok(l.frames[0].invStrike && !P.states['236L'].frames[0].invStrike);
  assert.equal(new Set(l.frames.map((f) => f.hitId).filter(Boolean)).size, 2, 'two hits');
  // It goes wherever the normal move goes: a normal cancels into it.
  const g = setup(60, 10000);
  const s = seen(g, '5+M 5*7 2 3 6+LS 5*20');
  assert.deepEqual(s.filter((x) => ['5M', '236L', '236L_ex'].includes(x)), ['5M', '236L_ex']);
});

test('EX in the data: only a motion + L / M / H special can carry one, and its input must be free', () => {
  const file = (moves) => ({ engine: 'Toska', version: 2, character: { id: 'bad', stats: {} }, moves });
  const mv = (id, input, more = {}) => ({ id, input, startup: 5, active: 2, recovery: 9, ...more });
  assert.throws(() => compileCharacter(file([mv('a', '5L', { ex: { damage: 1 } })]), SYSTEM), /EX version/);
  assert.throws(() => compileCharacter(file([mv('a', '236S', { ex: { damage: 1 } })]), SYSTEM), /EX version/);
  assert.throws(() => compileCharacter(file([mv('a', '236L', { ex: { damage: 1 } }), mv('b', '236LS')]), SYSTEM), /already uses 236LS/);
  const ok = compileCharacter(file([mv('a', 'j.236H', { ex: { damage: 1 } })]), SYSTEM);
  assert.ok(ok.states.a_ex && ok.commands.find((c) => c.move === 'a_ex').air, 'air specials too');
});

test('S alone: the launcher', () => {
  const g = setup();
  assert.equal(seen(g, '5 5+S 5*5')[1], '5S');
});

test('L / M / H + S with no motion: just the attack button\'s normal, S ignored, in either order', () => {
  for (const [dir, lead, pre] of [['5', '5', ''], ['2', '2*3', ''], ['5', '8*8 5*6', 'j.']]) {
    for (const b of ['L', 'M', 'H']) {
      for (let gap = 0; gap <= CW; gap++) {
        for (const [first, second] of [[b, 'S'], ['S', b]]) {
          const g = setup(300, 30000);
          const s = seen(g, pair(lead, dir, first, second, gap, `${dir}*${CW + 2} 5*40`));
          const moves = s.filter((x) => P.states[x].move);
          const want = pre ? `j.${b}` : `${dir}${b}`;
          // With S first the launcher shows for the frames before the attack button lands, then gives way.
          const allowed = first === 'S' && gap > 0 ? [[`${pre ? 'j.' : dir}S`, want], [want]] : [[want]];
          assert.ok(allowed.some((a) => a.join() === moves.join()), `${first} then ${second}, ${gap} apart, ${dir}: ${moves.join(' ')}`);
          assert.equal(moves.at(-1), want);
          assert.equal(g.players[0].meter, 30000 + M.gain.normal.whiff, 'no meter spent, one whiff');
        }
      }
    }
  }
});

test('attack + S on hit: the S of the pair cannot become the launcher a moment later', () => {
  // 5M and S together, in range: 5M hits and could chain into 5S, but that S was part of the pair.
  const g = setup(60);
  const s = seen(g, '5 5+MS 5*30');
  assert.ok(s.includes('5M') && !s.includes('5S'), s.join(' '));
  // A new press of S during the hit does chain.
  const g2 = setup(60);
  const s2 = seen(g2, '5 5+MS 5*5 5+S 5*30');
  assert.ok(s2.indexOf('5S') > s2.indexOf('5M'), s2.join(' '));
});

test('further apart than the window they are two presses: the launcher stays', () => {
  const g = setup();
  const s = seen(g, pair('5', '5', 'S', 'L', CW + 1));
  assert.equal(s.filter((x) => P.states[x].move).join(), '5S', 'L came too late to replace it (and 5S has no chain into 5L)');
});

test('after a chain into the launcher, a late attack button cannot swap it for a normal the chain does not allow', () => {
  // 5H chains into 5S but not into 5L. S then L one frame apart during 5H's hit: still the launcher.
  const g = setup(60);
  const s = seen(g, '5 5+H 5*9 5+S 5+L 5*30');
  const moves = s.filter((x) => P.states[x].move);
  assert.deepEqual(moves, ['5H', '5S'], moves.join(' '));
});

test('overlaps: two attack buttons with a motion are a special, and M + S with a motion is the EX, never anything else', () => {
  let g = setup(300, 30000);
  let moves = seen(g, '2 3 6+MH 5*40').filter((x) => P.states[x].move);
  assert.equal(moves.length, 1);
  assert.ok(['236M', '236H'].includes(moves[0]), moves.join(' '));
  assert.equal(g.players[0].meter, 30000 + M.gain.special.whiff, 'not an EX: nothing spent');
  g = setup(300, 30000);
  moves = seen(g, '2 3 6+MHS 5*40').filter((x) => P.states[x].move);
  assert.equal(moves.length, 1);
  assert.ok(['236M_ex', '236H_ex'].includes(moves[0]), moves.join(' '));
  // A motion with S alone is still that character's own S special (the test character's Charged Rush), not an EX.
  g = setup(300, 30000);
  g.players[0].vars.charge = 1;
  moves = seen(g, '2 3 6+S 5*40').filter((x) => P.states[x].move);
  assert.deepEqual(moves, ['236S']);
  assert.equal(g.players[0].meter, 30000 + M.gain.special.whiff);
});

test('the cast: every command still compiles with five buttons, and no real move is an EX by accident', () => {
  for (const id of ['avner', 'malik']) {
    const c = loadChar(`data/characters/${id}/${id}.toska.json`);
    for (const cmd of c.commands) {
      const mv = c.states[cmd.move].move;
      if (mv.kind === 'special') assert.equal(mv.ex, false, `${id} ${cmd.move}`);
    }
    assert.ok(c.sOnly.has('5S') && c.sOnly.has('j.S'), `${id}: S alone is the launcher`);
  }
});
