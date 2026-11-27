// Khai'ro's 214 Low Blade (Nov 26): a low wave along the floor. The owner gave the art only, so the numbers are first
// guesses; this pins how the move is put together, and that the bracelet's effects are on the editor's FX page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame, step } from '../src/core/game.js';
import { px } from '../src/core/fixed.js';
import { fxEntries } from '../src/editor/fx-model.js';
import { loadWorld, loadChar, loadJSON, script } from './helpers.js';

const PATH = 'data/characters/khairo/khairo.toska.json';
const FILE = loadJSON(PATH);
const KH = loadChar(PATH);
const MALIK = loadChar('data/characters/malik/malik.toska.json');
const MANIFEST = loadJSON('data/characters/khairo/sheets/manifest.json');

function run(buttons, gap, block = false) {
  const W = loadWorld(KH, MALIK);
  W.battle.maxGapUnits = 0;
  const g = createGame(W), a = g.players[0], d = g.players[1];
  a.x = -px(300); d.x = a.x + px(gap);
  const seen = { spawn: 0, most: 0, far: 0, hit: false, states: [] };
  let f = 0;
  for (const r of script(buttons)) {
    step(g, [r, 0], W);
    if (a.state.startsWith('lowBlade')) f = a.frame + 1;
    if (seen.states.at(-1) !== a.state) seen.states.push(a.state);
    seen.most = Math.max(seen.most, g.projectiles.length);
    const pr = g.projectiles[0];
    if (pr) { if (!seen.spawn) seen.spawn = f; seen.far = Math.max(seen.far, (pr.x - a.x) / px(1)); }
    if (d.combo) seen.hit = true;
  }
  return { ...seen, a, d };
}

test('214 L, M, H: the wave leaves on frame 13 and runs along the floor, further for each strength', () => {
  const far = [];
  for (const b of ['L', 'M', 'H']) {
    const r = run(`2 1 4+${b} 5*90`, 1000);
    assert.ok(r.states.includes('lowBlade' + b), b);
    assert.equal(r.spawn, 13, `${b}: out on frame 13`);
    assert.equal(r.hit, false, `${b}: an opponent out of its range is not touched`);
    far.push(r.far);
    const P = KH.projectiles['lowBlade' + b];
    assert.equal(P.speedY, 0, 'it stays on the floor');
    assert.equal(P.move.guard, 'low');
  }
  assert.ok(far[0] < far[1] && far[1] < far[2], `L ${far[0]} < M ${far[1]} < H ${far[2]}`);
});

test('It hits a standing opponent in its path, and there is only ever one wave out', () => {
  assert.equal(run('2 1 4+M 5*50', 200).hit, true);
  const twice = run('2 1 4+L 5*34 2 1 4+H 5*60', 1000);
  assert.equal(twice.most, 1);
  assert.deepEqual(twice.states.filter((s) => s.startsWith('lowBlade')), ['lowBladeL'], 'the second one does not come out while the first is travelling');
});

test('Its sheets are the cut ones, and every drawing of the wave is used once', () => {
  for (const b of ['L', 'M', 'H']) {
    const m = FILE.moves.find((x) => x.id === 'lowBlade' + b), p = FILE.projectiles['lowBlade' + b];
    assert.deepEqual(m.sprite, MANIFEST.lowblade.sprite);
    assert.equal(p.sprite.image, 'sheets/lb-wave.png');
    assert.equal(p.anim.release.length + p.anim.loop.length + p.anim.impact.length, p.sprite.count);
  }
  assert.ok(fs.existsSync('data/characters/khairo/sheets/lowblade.png') && fs.existsSync('data/characters/khairo/sheets/lb-wave.png'));
});

test('The editor\'s FX page lists his effects: the seven bracelet layers (shared by every strength) and the three waves', () => {
  const labels = fxEntries(FILE).map((e) => e.label);
  for (const n of ['braceletRing', 'braceletFlash', 'braceletLock', 'braceletMarker', 'braceletSlam', 'braceletDust', 'braceletStreak', 'lowBladeL', 'lowBladeM', 'lowBladeH']) assert.ok(labels.includes(n), n);
  // Every layer of every bracelet names an effect that exists and has a sheet on disk.
  for (const b of ['L', 'M', 'H', 'EX']) for (const [layer, L] of Object.entries(FILE.projectiles['bracelet' + b].lobArt)) {
    if (!L?.fx) continue;
    const E = FILE.effects[L.fx];
    assert.ok(E?.sprite, `bracelet${b} ${layer}: ${L.fx}`);
    assert.ok(fs.existsSync('data/characters/khairo/' + E.sprite.image), E.sprite.image);
  }
});
