// Draw-code smoke check (node scripts/draw-smoke.mjs, from the project folder): loads the real renderer and HUD
// through Vite with no browser, on a canvas that accepts anything, and plays three fights full of the universal
// systems (Vow, Absolve, Repel, Draw, Rite moves) through notice() and draw(). It proves the drawing code does not
// crash on any of it; it does not show what the screen looks like.
import { createServer } from 'vite';
const any = () => new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'width' || k === 'height' ? 64 : k === 'data' ? new Uint8ClampedArray(64 * 64 * 4) : any()), apply: () => any(), set: () => true, construct: () => any() });
globalThis.Image = class { set src(v) { this._src = v; this.complete = true; this.naturalWidth = 64; this.width = 64; this.height = 64; } get src() { return this._src; } };
globalThis.document = { createElement: () => ({ width: 64, height: 64, getContext: () => any() }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const boot = await server.ssrLoadModule('/src/ui/boot.js');
  const { createFightRenderer } = await server.ssrLoadModule('/src/render/fight-renderer.js');
  const { createGame, step, createWorld } = await server.ssrLoadModule('/src/core/game.js');
  const { RAW } = await server.ssrLoadModule('/src/core/input.js');
  const chars = boot.loadCharacters();
  const ids = Object.keys(chars);
  let frames = 0;
  for (const [a, b] of [['malik', 'avner'], ['avner', 'malik'], ['proto', 'proto'], ['toyle', 'avner']]) {
    const world = boot.makeWorld(chars[a], chars[b], boot.MATCH);
    const renderer = createFightRenderer(any(), boot.W, boot.H);
    const game = createGame(world);
    for (const p of game.players) p.meter = 40000;
    if (game.match) { game.match.phase = 'fight'; }
    game.players[0].x = -6000; game.players[1].x = 6000;
    const MH = RAW.M | RAW.H, RS = RAW.R | RAW.S, LM = RAW.L | RAW.M;
    let seed = 7;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 8;
    const seen = new Set();
    const hold = [0, 0], cur = [0, 0];
    for (let f = 0; f < 3000; f++) {
      const raw = [0, 1].map((k) => {
        const p = game.players[k], o = game.players[1 - k];
        const toward = o.x > p.x ? RAW.RIGHT : RAW.LEFT, away = toward === RAW.RIGHT ? RAW.LEFT : RAW.RIGHT;
        if (p.state.startsWith('block')) return (rnd() % 2 ? away : toward) | LM;
        if (p.state.startsWith('hit')) return rnd() % 3 ? 0 : RS;
        if (hold[k]-- > 0) return cur[k];
        const r = rnd() % 100;
        hold[k] = 1 + (rnd() % 10);
        cur[k] = r < 12 ? MH : r < 24 ? RAW.R : r < 30 ? RAW.DOWN | RAW.R : r < 36 ? toward | RAW.R : r < 44 ? away : r < 50 ? RAW.UP | toward
          : r < 85 ? toward | [RAW.L, RAW.M, RAW.H, RAW.S, RAW.L | RAW.S][rnd() % 5] : toward;
        return cur[k];
      });
      step(game, raw, world);
      for (const c of game.cues) seen.add(c.type);
      for (const p of game.players) seen.add('state:' + p.state);
      renderer.notice(game, world);
      renderer.draw(game, world, { marks: true, boxes: f % 2 === 0, palettes: [0, 1] });
      frames++;
      if (f % 400 === 399) for (const p of game.players) { p.health = world.chars[p.id].stats.health; p.meter = 40000; p.burst = world.burst.gaugeMax; }
    }
    const want = ['absorb', 'vowrelease', 'burst', 'repel', 'draw', 'witness', 'counter', 'state:vow_hold', 'state:crumple', 'state:absolve'];
    console.log(a, 'vs', b, 'drew', 3000, 'frames; missing:', want.filter((w) => !seen.has(w)).join(' ') || 'none', '| rite states:', [...seen].filter((x) => /state:(rite_|vigil$)/.test(x)).join(' '));
  }
  console.log('SMOKE OK', frames, ids.join(' '));
} catch (e) { console.log('LOAD ERROR', e.stack.split('\n').slice(0, 6).join('\n')); }
await server.close();
