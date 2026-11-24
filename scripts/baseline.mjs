// The look-and-rules baseline (art polish, Part 0):  node scripts/baseline.mjs [out-folder] [--no-art]
//
// Captures how the game looks and plays NOW, so later polish can be compared against it. Reads only; the only thing
// it writes is the out folder (default docs/baseline/):
//   <character>/<state>.png   contact sheet: the state's drawings in play order, at game size, on the ground line
//   <character>/<state>.gif   the same drawings played at the state's current timing (needs ffmpeg)
//   frame-data.json           every state of Avner and Malik: length, startup / active / recovery as the data says
//                             and as the compiled frames measure, and the drawings with their holds
//   match-inputs.json         a recorded match (a seeded pair of button-mashers; the inputs are kept so the very same
//                             match can be replayed later), with the frames on which the harness refilled health
//   match-hashes.json         the hash of the whole game state after every frame of that match
//   match-states.jsonl.gz     the whole game state after every frame (one line a frame)
//
// Compare later with:  node scripts/baseline.mjs --check [folder]   (replays the inputs, compares every frame's state,
// and every state's frame data, against what is saved; prints the first difference).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';
import { decodePng, encodePng } from './png.mjs';

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const NO_ART = args.includes('--no-art');
const OUT = args.find((a) => !a.startsWith('--')) || 'docs/baseline';
const CAST = ['avner', 'malik'];
const MATCH_FRAMES = 3000;

globalThis.Image = class { set src(v) { this._src = v; this.complete = false; this.naturalWidth = 0; } get src() { return this._src; } };
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => null }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failed = false;
try {
  const boot = await server.ssrLoadModule('/src/ui/boot.js');
  const { createGame, step } = await server.ssrLoadModule('/src/core/game.js');
  const { RAW } = await server.ssrLoadModule('/src/core/input.js');
  const { hashState, serializeState } = await server.ssrLoadModule('/src/core/state.js');
  const chars = boot.loadCharacters();

  // ---------- frame data ----------
  /** A state's drawings in play order: [{ image, index, frames }] (consecutive frames on one drawing joined). */
  function runsOf(def, st) {
    const runs = [];
    for (const f of st.frames) {
      const s = f.sprite;
      const sheet = s && (s.block ?? def.sheets[s.sheet]);
      const key = sheet ? `${sheet.image}#${s.index}` : null;
      const last = runs[runs.length - 1];
      if (last && last.key === key) last.frames++;
      else runs.push({ key, sheet, index: s?.index ?? null, frames: 1 });
    }
    return runs;
  }
  function frameData() {
    const out = {};
    for (const id of CAST) {
      const def = chars[id];
      out[id] = {};
      for (const [name, st] of Object.entries(def.states)) {
        let first = -1, last = -1;
        st.frames.forEach((f, i) => { if (f.hit.length || f.throw.length) { if (first < 0) first = i; last = i; } });
        out[id][name] = {
          duration: st.duration,
          data: st.move ? { startup: st.move.startup ?? null, active: st.move.active ?? null, recovery: st.move.recovery ?? null } : null,
          measured: first < 0 ? null : { startup: first + 1, active: last - first + 1, recovery: st.frames.length - 1 - last },
          hitFrames: st.frames.map((f, i) => (f.hit.length ? i : -1)).filter((i) => i >= 0),
          boxes: hashOf(st.frames.map((f) => [f.hit, f.hurt, f.throw, f.push])),
          drawings: runsOf(def, st).map((r) => (r.key ? [r.sheet.image, r.index, r.frames] : [null, null, r.frames])),
        };
      }
    }
    return out;
  }
  function hashOf(v) { let h = 2166136261; for (const c of JSON.stringify(v)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16); }

  // ---------- the recorded match ----------
  function newMatch() {
    const world = boot.makeWorld(chars.avner, chars.malik, boot.MATCH);
    const game = createGame(world);
    for (const p of game.players) p.meter = 40000;
    if (game.match) game.match.phase = 'fight';
    game.players[0].x = -6000; game.players[1].x = 6000;
    return { world, game };
  }
  /** The harness's own edits (never part of the inputs): health, meter and Absolve back every 400 frames. */
  function refill(f, game, world) {
    if (f % 400 !== 399) return;
    for (const p of game.players) { p.health = world.chars[p.id].stats.health; p.meter = 40000; if (world.burst) p.burst = world.burst.gaugeMax; }
  }
  function recordInputs() {
    const { world, game } = newMatch();
    const MH = RAW.M | RAW.H, RS = RAW.R | RAW.S, LM = RAW.L | RAW.M;
    let seed = 20261123;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) >>> 8;
    const hold = [0, 0], cur = [0, 0];
    const inputs = [];
    for (let f = 0; f < MATCH_FRAMES; f++) {
      const raw = [0, 1].map((k) => {
        const p = game.players[k], o = game.players[1 - k];
        const toward = o.x > p.x ? RAW.RIGHT : RAW.LEFT, away = toward === RAW.RIGHT ? RAW.LEFT : RAW.RIGHT;
        if (p.state.startsWith('block')) return (rnd() % 2 ? away : toward) | LM;
        if (p.state.startsWith('hit')) return rnd() % 3 ? 0 : RS;
        if (hold[k]-- > 0) return cur[k];
        const r = rnd() % 100;
        hold[k] = 1 + (rnd() % 10);
        cur[k] = r < 10 ? MH : r < 20 ? RAW.R : r < 26 ? RAW.DOWN | RAW.R : r < 32 ? toward | RAW.R : r < 40 ? away : r < 48 ? RAW.UP | toward
          : r < 54 ? RAW.DOWN | [RAW.L, RAW.M, RAW.H][rnd() % 3] : r < 88 ? toward | [RAW.L, RAW.M, RAW.H, RAW.S, RAW.L | RAW.S][rnd() % 5] : toward;
        return cur[k];
      });
      inputs.push(raw);
      step(game, raw, world);
      refill(f, game, world);
    }
    return inputs;
  }
  /** Replays inputs; onFrame(f, game, world) after every step. */
  function replay(inputs, onFrame) {
    const { world, game } = newMatch();
    inputs.forEach((raw, f) => { step(game, raw, world); refill(f, game, world); onFrame(f, game, world); });
    return game;
  }

  if (CHECK) {
    const saved = JSON.parse(fs.readFileSync(path.join(OUT, 'match-hashes.json'), 'utf8'));
    const inputs = JSON.parse(fs.readFileSync(path.join(OUT, 'match-inputs.json'), 'utf8')).inputs;
    let bad = -1;
    replay(inputs, (f, game) => { if (bad < 0 && hashState(game) !== saved[f]) bad = f; });
    console.log(bad < 0 ? `match: identical on all ${inputs.length} frames` : `match: DIFFERENT from frame ${bad}`);
    const was = JSON.parse(fs.readFileSync(path.join(OUT, 'frame-data.json'), 'utf8')), now = frameData();
    const diffs = [];
    for (const id of CAST) for (const name of new Set([...Object.keys(was[id]), ...Object.keys(now[id])])) {
      const a = was[id][name], b = now[id][name];
      if (!a || !b) { diffs.push(`${id} ${name}: ${a ? 'gone' : 'new'}`); continue; }
      for (const k of ['duration', 'data', 'measured', 'hitFrames', 'boxes']) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diffs.push(`${id} ${name}: ${k} ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
    }
    console.log(diffs.length ? `frame data: ${diffs.length} differences\n  ${diffs.join('\n  ')}` : 'frame data: every state unchanged (length, startup, active, recovery, hit frames, boxes)');
    failed = bad >= 0 || diffs.length > 0;
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    const fd = frameData();
    fs.writeFileSync(path.join(OUT, 'frame-data.json'), `${JSON.stringify(fd, null, 1)}\n`);
    const inputs = recordInputs();
    const hashes = [], lines = [];
    const seen = new Set(), cues = new Set();
    replay(inputs, (f, game) => { hashes.push(hashState(game)); lines.push(serializeState(game)); for (const p of game.players) seen.add(`${p.id}:${p.state}`); for (const c of game.cues) cues.add(c.type); });
    // The recording must replay to itself, or it is no baseline.
    let same = true;
    replay(inputs, (f, game) => { if (hashState(game) !== hashes[f]) same = false; });
    if (!same) throw new Error('the recorded match does not replay to the same states');
    fs.writeFileSync(path.join(OUT, 'match-inputs.json'), JSON.stringify({ chars: ['avner', 'malik'], frames: inputs.length, note: 'health, meter and Absolve are refilled by the harness after every frame f with f % 400 == 399', inputs }));
    fs.writeFileSync(path.join(OUT, 'match-hashes.json'), JSON.stringify(hashes));
    fs.writeFileSync(path.join(OUT, 'match-states.jsonl.gz'), zlib.gzipSync(lines.join('\n')));
    console.log(`match: ${inputs.length} frames recorded; ${seen.size} fighter states and cues [${[...cues].sort().join(' ')}] seen`);
    console.log(`frame data: ${CAST.map((id) => `${id} ${Object.keys(fd[id]).length} states`).join(', ')}`);

    // ---------- contact sheets and GIFs ----------
    if (!NO_ART) {
      let ff = true;
      try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { ff = false; }
      const pngs = new Map();
      const sheetPx = (id, image) => { const k = `${id}/${image}`; if (!pngs.has(k)) { const f = `data/characters/${id}/${image}`; pngs.set(k, fs.existsSync(f) ? decodePng(fs.readFileSync(f)) : null); } return pngs.get(k); };
      for (const id of CAST) {
        const def = chars[id], dir = path.join(OUT, id);
        fs.mkdirSync(dir, { recursive: true });
        let made = 0;
        for (const [name, st] of Object.entries(def.states)) {
          const runs = runsOf(def, st).filter((r) => r.key && sheetPx(id, r.sheet.image));
          if (!runs.length) continue;
          // Every drawing at game size, origins lined up in one cell.
          const cells = runs.map((r) => {
            const img = sheetPx(id, r.sheet.image), sh = r.sheet;
            const fw = sh.frameW ?? img.width / sh.columns, fh = sh.frameH ?? img.height / sh.rows;
            const k = Math.max(1, Math.round(1 / (sh.scale ?? 1)));
            return { img, sx: (r.index % sh.columns) * fw, sy: Math.floor(r.index / sh.columns) * fh, fw, fh, k, ox: (sh.originX ?? fw / 2) / k, oy: (sh.originY ?? fh) / k, frames: r.frames };
          });
          const L = Math.ceil(Math.max(...cells.map((c) => c.ox))), U = Math.ceil(Math.max(...cells.map((c) => c.oy)));
          const R = Math.ceil(Math.max(...cells.map((c) => c.fw / c.k - c.ox))), D = Math.ceil(Math.max(...cells.map((c) => c.fh / c.k - c.oy)));
          const cw = (L + R + 1) & ~1, ch = (U + D + 1) & ~1; // even sizes (video tools want them)
          const draw = (c, out, OW, x0, y0, bg) => {
            for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
              const gx = (x - L + c.ox) * c.k, gy = (y - U + c.oy) * c.k; // the sheet pixels this game pixel covers
              let r = 0, g = 0, b = 0, a = 0;
              for (let j = 0; j < c.k; j++) for (let i = 0; i < c.k; i++) {
                const px = Math.floor(gx) + i, py = Math.floor(gy) + j;
                if (px < 0 || py < 0 || px >= c.fw || py >= c.fh) continue;
                const p = ((c.sy + py) * c.img.width + c.sx + px) * 4, al = c.img.data[p + 3] / 255;
                r += c.img.data[p] * al; g += c.img.data[p + 1] * al; b += c.img.data[p + 2] * al; a += al;
              }
              const n = c.k * c.k, cov = a / n, q = ((y0 + y) * OW + x0 + x) * 4, v = bg(x0 + x, y0 + y);
              out[q] = r / n + v * (1 - cov); out[q + 1] = g / n + v * (1 - cov); out[q + 2] = b / n + v * (1 - cov); out[q + 3] = 255;
              if (y === U) { out[q] = 255; out[q + 1] = 60; out[q + 2] = 60; }
            }
          };
          const pad = 4, OW = cells.length * (cw + pad) + pad, OH = ch + pad * 2;
          const sheet = new Uint8Array(OW * OH * 4);
          for (let i = 0; i < OW * OH; i++) { sheet[i * 4] = sheet[i * 4 + 1] = sheet[i * 4 + 2] = 60; sheet[i * 4 + 3] = 255; }
          cells.forEach((c, n) => draw(c, sheet, OW, pad + n * (cw + pad), pad, (x, y) => (((x >> 3) + (y >> 3)) & 1 ? 96 : 122)));
          const file = name.replace(/[^\w.-]/g, '_');
          fs.writeFileSync(path.join(dir, `${file}.png`), encodePng({ width: OW, height: OH, data: sheet }));
          if (ff) {
            const tmp = path.join(dir, `.tmp-${file}`);
            fs.mkdirSync(tmp, { recursive: true });
            let list = '';
            cells.forEach((c, n) => {
              const one = new Uint8Array(cw * ch * 4);
              draw(c, one, cw, 0, 0, () => 116);
              fs.writeFileSync(path.join(tmp, `${n}.png`), encodePng({ width: cw, height: ch, data: one }));
              list += `file '${n}.png'\nduration ${(c.frames / 60).toFixed(4)}\n`;
            });
            list += `file '${cells.length - 1}.png'\n`;
            fs.writeFileSync(path.join(tmp, 'list.txt'), list);
            try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-i', path.join(tmp, 'list.txt'), '-vf', 'split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none', '-loop', '0', path.join(dir, `${file}.gif`)]); } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
          }
          made++;
        }
        console.log(`${id}: ${made} states pictured${ff ? '' : ' (no GIFs: ffmpeg not found)'}`);
      }
    }
  }
} catch (e) { failed = true; console.log('ERROR', e.stack.split('\n').slice(0, 8).join('\n')); }
await server.close();
process.exit(failed ? 1 : 0);
