// Draws a fight: stage floor, fighters (sprites when they exist, a placeholder figure until then), and the
// optional box view. Reads the game state and the character definitions; never changes anything.

import { UNIT } from '../core/fixed.js';
import { frameOf } from '../core/character.js';
import { relDirAt } from '../core/input.js';
import { createHud } from './hud.js';
import { createStageRenderer } from './stage-renderer.js';
import { paletteSheet, placeholderColors } from './palette.js';
import FX from '../../data/system/effects.json';
import { POLISH } from './polish.js';
import { FXO } from './fx-opacity.js'; // FXOPACITY
import CAMERA from '../../data/system/camera.json';

// Game-ready sheets only (data/characters/<id>/sheets/): raw art dropped elsewhere in a character's folder is not
// shipped with the game.
// Beside them, the cleaned copies (sheets-clean/, written by scripts/sprite-clean.mjs): drawn instead of the original
// when the "clean sprites" polish switch is on. Each folder's manifest.json holds the cleaned sheets' sprite blocks.
const SPRITE_URLS = {
  ...import.meta.glob('../../data/characters/*/sheets/*.{png,webp}', { eager: true, query: '?url', import: 'default' }),
  ...import.meta.glob('../../data/characters/*/sheets-clean/*.png', { eager: true, query: '?url', import: 'default' }),
};
const byChar = (files, re) => Object.fromEntries(Object.entries(files).map(([k, v]) => [re.exec(k)[1], v]));
const CLEAN = byChar(import.meta.glob('../../data/characters/*/sheets-clean/manifest.json', { eager: true, import: 'default' }), /characters\/([^/]+)\/sheets-clean/);
// Roles and snap timing per move (data/snap/<id>.json, written by scripts/snap-timing.mjs). Drawing only.
const SNAP = byChar(import.meta.glob('../../data/snap/*.json', { eager: true, import: 'default' }), /snap\/([^/]+)\.json$/);
// Universal effects (hit sparks, block flash): data/effects/, described by data/system/effects.json.
const FX_URLS = import.meta.glob('../../data/effects/*.{png,webp}', { eager: true, query: '?url', import: 'default' });
const images = new Map();
// Start loading every sheet up front, so an effect or a move shows the first time it's used (not the second).
if (typeof Image !== 'undefined') {
  for (const [key, url] of [...Object.entries(SPRITE_URLS), ...Object.entries(FX_URLS)]) {
    const img = new Image();
    img.src = url;
    images.set(key, img);
  }
}

function spriteImage(charId, path) {
  // charId null: a universal effect sheet.
  const urls = charId === null ? FX_URLS : SPRITE_URLS;
  const key = Object.keys(urls).find((k) => k.endsWith(charId === null ? `/effects/${path}` : `/characters/${charId}/${path}`));
  if (!key) return null;
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.src = urls[key];
    images.set(key, img);
  }
  return img.complete && img.naturalWidth ? img : null;
}

const SPARK = {
  hit: { color: '#ffd36b', size: 26, life: 14, text: '' },
  counter: { color: '#ff5a3c', size: 34, life: 22, text: 'COUNTER' },
  block: { color: '#8ac2ff', size: 20, life: 12, text: '' },
  clash: { color: '#ffffff', size: 30, life: 16, text: 'CLASH' },
  armor: { color: '#c9a2ff', size: 26, life: 14, text: 'ARMOR' },
  throw: { color: '#e0d050', size: 22, life: 14, text: 'THROW' },
  tech: { color: '#e0d050', size: 26, life: 18, text: 'TECH' },
  wallbounce: { color: '#ff9a3c', size: 40, life: 18, text: 'WALL BOUNCE' },
  groundbounce: { color: '#ff9a3c', size: 40, life: 18, text: 'GROUND BOUNCE' },
  burst: { color: '#7fe0ff', size: 70, life: 26, text: 'ABSOLVE' },
  superflash: { color: '#ffffff', size: 80, life: 22, text: '' },
};

export function createFightRenderer(ctx, W, H) {
  const GROUND = Math.round(H * CAMERA.groundLine);
  // x, y: where the view looks, in px. z: how much the fight is enlarged (data/system/camera.json), about the ground line.
  const cam = { x: 0, y: 0, z: 0 };
  const effects = []; // visual only: spawned from the game's cues, never fed back into the game
  let lastFrame = -1;
  let front = 1; // which fighter is drawn in front (presentation only; P2 until someone attacks)
  const comboShow = [null, null]; // per victim: { combo, hold } - keeps the finished combo on screen a moment
  const hud = createHud(ctx, W, (name) => spriteImage(null, name));
  let stageR = null; // { id, r }: the stage renderer, made when a stage is first drawn

  // Where a game position is drawn BEFORE the zoom (everything in the fight is drawn inside the zoom).
  const toScreen = (x, y) => [W / 2 + (x / UNIT - cam.x), GROUND - y / UNIT + cam.y];
  /** Where a game position ends up on the screen, zoom included (for anything drawn outside the fight itself). */
  const onScreen = (x, y) => { const [sx, sy] = toScreen(x, y), z = cam.z || 1; return [W / 2 + (sx - W / 2) * z, GROUND + (sy - GROUND) * z]; };

  /** A character-space box [x, y, w, h] (units) to a screen rect, flipped by facing. */
  function boxRect(p, b) {
    const [bx, by, bw, bh] = b;
    const left = p.facing > 0 ? p.x + bx : p.x - bx - bw;
    const [sx, sy] = toScreen(left, p.y + by + bh);
    return [sx, sy, bw / UNIT, bh / UNIT];
  }

  function drawStage(world, opts) {
    if (opts.stage) {
      if (!stageR || stageR.id !== opts.stage.id) {
        stageR = { id: opts.stage.id, r: createStageRenderer(opts.stage, W, H, GROUND, world.battle.stage.halfWidth) };
      }
      stageR.r.draw(ctx, cam, Math.max(0, collected));
      if (opts.marks) drawMarks(world);
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1726');
    g.addColorStop(1, '#0d0b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const gy = GROUND + cam.y;
    ctx.fillStyle = '#231e2e';
    ctx.fillRect(0, gy, W, H - gy);
    ctx.strokeStyle = '#3a3347';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(W, gy);
    ctx.stroke();
    drawMarks(world);
  }

  /** Floor marks every 100 px and the walls, so movement reads clearly (training). */
  function drawMarks(world) {
    const gy = GROUND + cam.y;
    // Floor marks every 100 px, so movement reads clearly.
    ctx.fillStyle = '#2f2839';
    const half = world.battle.stage.halfWidth;
    for (let x = -half; x <= half; x += 100) {
      const [sx] = toScreen(x * UNIT, 0);
      ctx.fillRect(sx - 1, gy + 2, 2, 10);
    }
    // Walls.
    ctx.fillStyle = '#3a3347';
    for (const s of [-1, 1]) {
      const [sx] = toScreen(s * half * UNIT, 0);
      ctx.fillRect(sx - (s < 0 ? 6 : 0), 0, 6, gy);
    }
  }

  /**
   * Marks the opponent carries (a mechanic var with a `mark` colour, e.g. Avner's brand): a ring of light at the
   * waist and a glow, pulsing, fading out over the last second.
   */
  function drawOpponentMarks(p, opp, oppDef, frame) {
    for (const [k, v] of Object.entries(oppDef.mechanic?.vars || {})) {
      const n = opp.vars[k];
      if (!v.mark || !(n > 0)) continue;
      const m = typeof v.mark === 'string' ? { color: v.mark } : v.mark;
      const [x, y] = toScreen(p.x, p.y + (m.at ?? 90) * UNIT);
      const fade = Math.min(1, n / 60);
      if (m.sprite) {
        ctx.save();
        ctx.globalAlpha = fade;
        fxOp = opOf(m, oppDef, `mark:${k}`, 'mark'); // FXOPACITY
        drawSheetFrame(oppDef, m.sprite, Math.floor(frame / (m.hold ?? 5)) % m.sprite.count, x, y, 1);
        ctx.restore();
        continue;
      }
      const pulse = 0.75 + 0.25 * Math.sin(frame * 0.25);
      ctx.save();
      ctx.globalAlpha = fade * pulse;
      const glow = ctx.createRadialGradient(x, y, 4, x, y, 70);
      glow.addColorStop(0, `${m.color}aa`);
      glow.addColorStop(1, `${m.color}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(x - 70, y - 70, 140, 140);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, y, 40, 11, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * A sheet coloured by a sprite's `tint` ("#rrggbb": an EX effect in gold): the whole sheet multiplied by the colour,
   * made once and kept. Without a real canvas (the picture tools) the sheet is drawn as it is.
   */
  const tints = new Map();
  function tinted(img, colour) {
    if (!img || !colour || !canTint) return img;
    const key = `${img.src}|${colour}`;
    let c = tints.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.naturalWidth = c.width; c.naturalHeight = c.height;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = colour;
      g.fillRect(0, 0, c.width, c.height);
      g.globalCompositeOperation = 'destination-in'; // keep the sheet's own shape
      g.drawImage(img, 0, 0);
      tints.set(key, c);
    }
    return c;
  }

  /** One frame of a sheet (effects, marks, chain pieces: no palette), centred on its origin at screen x, y. */
  function drawSheetFrame(def, sheet, index, x, y, facing, angle = 0) {
    const op = fxOp; fxOp = null; // FXOPACITY
    const img = tinted(spriteImage(def ? def.id : null, sheet.image), sheet.tint);
    if (!img) return false;
    const cols = sheet.columns ?? 1;
    const fw = sheet.frameW ?? img.naturalWidth / cols;
    const fh = sheet.frameH ?? img.naturalHeight / (sheet.rows ?? 1);
    const k = sheet.scale ?? 1;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.scale(facing * k, k);
    if (op !== null) ctx.globalAlpha *= opFor(op, sheet, x, y, facing, k, fw, fh); // FXOPACITY
    if (sheet.additive) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, (index % cols) * fw, Math.floor(index / cols) * fh, fw, fh, -(sheet.originX ?? fw / 2), -(sheet.originY ?? fh / 2), fw, fh);
    ctx.restore();
    return true;
  }

  /**
   * A move's chain (drawing only): from the hand to the tip of its hitbox while the hitbox is out, then reeling back
   * in over `retract` frames. Once the move has hit, it runs to the opponent instead, and stays attached while
   * they're being pulled in.
   */
  function drawChain(p, def, opp) {
    const st = def.states[p.state];
    const ch = st?.move?.chain;
    if (!ch) return;
    let last = -1, first = -1, tip = null;
    st.frames.forEach((f, i) => {
      if (!f.hit.length) return;
      if (first < 0) first = i;
      last = i;
      for (const b of f.hit) tip = !tip || b[0] + b[2] > tip[0] ? [b[0] + b[2], b[1] + b[3] / 2] : tip;
    });
    if (first < 0 || p.frame < first) return;
    const hit = p.contact === 1; // CONTACT.HIT
    const pulling = hit && opp.slideLeft > 0;
    const after = p.frame - last;
    const retract = ch.retract ?? 6;
    if (after > retract && !pulling) return;
    // The hand moves between drawings: `hands` maps a sprite frame index to its hand point; `hand` is the fallback.
    const hand = ch.hands?.[st.frames[Math.min(p.frame, st.frames.length - 1)]?.sprite?.index] ?? ch.hand;
    const [hx, hy] = toScreen(p.x + p.facing * (hand?.[0] ?? 40) * UNIT, p.y + (hand?.[1] ?? 100) * UNIT);
    let [ex, ey] = hit ? toScreen(opp.x, opp.y + 9000) : toScreen(p.x + p.facing * tip[0], p.y + tip[1]);
    if (!hit && after > 0) {
      const t = Math.max(0, 1 - after / retract);
      ex = hx + (ex - hx) * t;
      ey = hy + (ey - hy) * t;
    }
    const dx = ex - hx, dy = ey - hy;
    const len = Math.hypot(dx, dy);
    if (len < 4) return;
    const ang = Math.atan2(dy, dx);
    const seg = ch.segment;
    const step = (seg.frameW ?? 100) * (seg.scale ?? 1); // one tile's length on screen
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.rect(0, -40, Math.max(0, len - (ch.headLength ?? 20)), 80); // the chain stops where the head starts
    ctx.clip();
    for (let d = step / 2; d - step / 2 < len; d += step) drawSheetFrame(def, seg, 0, d, 0, 1);
    ctx.restore();
    if (ch.head) {
      const hk = (ch.head.frameW ?? 100) * (ch.head.scale ?? 1) / 2;
      // The head points along the chain, its far end at the tip (mirrored when the chain runs leftward).
      const back = dx < 0;
      drawSheetFrame(def, ch.head, 0, ex - Math.cos(ang) * hk, ey - Math.sin(ang) * hk, 1, back ? ang + Math.PI : ang);
    }
  }

  function drawPlaceholder(p, def, fr, col) {
    // On the floor (knockdown, KO): no hurtbox, and the figure lies down, head away from the opponent's side.
    if (p.y === 0 && (p.state === 'knockdown' || p.state === 'knockdownSoft' || p.state === 'slide' || (!fr.hurt.length && p.state === 'koDown'))) {
      const [fx, fy] = toScreen(p.x, 0);
      const len = 150;
      const back = -p.facing; // falls backwards
      ctx.fillStyle = col.body;
      ctx.fillRect(back > 0 ? fx - len * 0.35 : fx - len * 0.65 + 34, fy - 34, len - 34, 34);
      ctx.beginPath();
      ctx.arc(fx + back * len * 0.5, fy - 17, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col.dark;
      ctx.fillRect(fx + back * len * 0.5 - 3, fy - 25, 6, 6);
      return;
    }
    const hurt = fr.hurt[0] || [-3000, 0, 6000, 16000];
    const [sx, sy, sw, sh] = boxRect(p, hurt);
    const headR = Math.min(16, sw * 0.3);
    const cx = sx + sw / 2;
    // Body and head.
    ctx.fillStyle = col.body;
    ctx.fillRect(sx + sw * 0.18, sy + headR * 2, sw * 0.64, sh - headR * 2);
    ctx.beginPath();
    ctx.arc(cx, sy + headR, headR, 0, Math.PI * 2);
    ctx.fill();
    // Facing marker (eye side).
    ctx.fillStyle = col.dark;
    ctx.fillRect(cx + p.facing * headR * 0.4 - 3, sy + headR - 3, 6, 6);
    // Attacking limb: from the shoulder (or hip) to the hitbox.
    for (const hb of fr.hit) {
      const [hx, hy, hw, hh] = boxRect(p, hb);
      const tx = hx + hw / 2;
      const ty = hy + hh / 2;
      const fromY = ty > sy + sh * 0.6 ? sy + sh * 0.7 : sy + headR * 2.6;
      ctx.strokeStyle = col.limb;
      ctx.lineWidth = 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx, fromY);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = col.limb;
      ctx.fillRect(hx, hy, hw, hh);
    }
    // Startup: a small wind-up dot so moves read before they hit.
    const st = def.states[p.state];
    if (st.move && !fr.hit.length && p.frame < st.move.startup - 1) {
      ctx.fillStyle = col.limb;
      ctx.beginPath();
      ctx.arc(cx - p.facing * sw * 0.45, sy + headR * 3, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---------- Look-only polish (data/system/polish.json, switches in polish.js). None of it is ever read by the
  // game: it is worked out from the state the renderer is shown, once per game frame, and only changes the picture.
  const mkFx = () => ({ land: 99, takeoff: 99, push: 99, pushDir: 0, over: 99, overPx: 0, overStretch: 1, overDir: [1, 0], flash: 0, flashHeavy: false, lean: 0, wasAir: false, state: null, idx: -1, role: null, sn: null, ribbon: null, still: 0 });
  const pfx = [mkFx(), mkFx()]; // per fighter: ages (game frames) of the squash, push and overshoot; the role being shown
  let impactLeft = 0; // game frames of impact frame left
  let stretch = [1, 1]; // the squash / stretch of the fighter being drawn (from the feet)
  /** 1 for `hold` frames, then easing to 0 over `ease` frames. */
  const env = (t, hold, ease) => (t < hold ? 1 : t < hold + ease ? 1 - (t - hold + 1) / (ease + 1) : 0);
  const scratch = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const sctx = scratch?.getContext?.('2d');
  const canTint = !!(sctx && sctx.clearRect); // flat-colour copies of a drawing need a real canvas
  let shadowImg = null;
  if (canTint) {
    shadowImg = document.createElement('canvas');
    shadowImg.width = shadowImg.height = 64;
    const g = shadowImg.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#000000ff'); gr.addColorStop(0.55, '#000000b0'); gr.addColorStop(1, '#00000000');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  /** A move's snap entry, only while the character file still has the holds it was made from. */
  function snapOf(def, state, fr) {
    const sn = SNAP[def.id]?.moves?.[state];
    const sp = fr.sprite;
    if (!sn || !sp || sp.block) return null;
    const holds = def.sheets[sp.sheet]?.holds;
    return holds && holds.length === sn.snap.length && sn.roles.length === holds.length && holds.every((h, i) => h === sn.holds[i]) && sn.snap.reduce((a, b) => a + b, 0) === holds.reduce((a, b) => a + b, 0) ? sn : null;
  }
  /** The drawing under the timing in use (snap or original holds) and its role: { fr, sn, idx, role, next, last }. */
  function timed(p, def, fr) {
    const sn = snapOf(def, p.state, fr);
    if (!sn) return { fr, sn: null, idx: fr.sprite?.index ?? -1, role: null };
    const holds = POLISH.snap.on ? sn.snap : sn.holds;
    let i = 0, t = Math.min(p.frame, holds.reduce((a, b) => a + b, 0) - 1);
    while (t >= holds[i]) t -= holds[i++];
    return { fr: i !== fr.sprite.index ? { ...fr, sprite: { ...fr.sprite, index: i } } : fr, sn, idx: i, role: sn.roles[i], next: sn.roles[i + 1], last: t === holds[i] - 1 };
  }
  /** A hit cue: the victim's flash and push, and the impact frame on big hits. */
  function polishHit(c, game, world) {
    if (c.throw) return;
    const src = world.chars[c.p];
    const mv = src?.states[c.move]?.move ?? src?.projectiles[c.move]?.move;
    const heavy = (mv?.damage ?? 0) >= (FX.hit.find((h) => h.name === 'medium')?.below ?? 800);
    const v = pfx[1 - c.p], a = game.players[c.p], d = game.players[1 - c.p];
    v.flash = POLISH.hitFlash.frames; v.flashHeavy = heavy;
    if (heavy) { v.push = 0; v.pushDir = Math.sign(d.x - a.x) || a.facing; }
    const I = POLISH.impactFrame;
    const big = SNAP[src?.id]?.moves?.[c.move]?.impact ?? ((I.heavies && heavy) || (I.launchers && mv?.launchType === 'hard') || (I.supers && mv?.kind === 'super') || (I.vowFull && c.move === 'vow_strike_full'));
    if (big || (I.counterHits && c.type !== 'hit')) impactLeft = I.frames;
  }
  /** Once per game frame per fighter: landings and takeoffs, the end of an impact drawing (overshoot), the lean. */
  function polishTrack(p, def) {
    const T = pfx[p.id];
    T.land++; T.takeoff++; T.push++; T.over++;
    const air = p.y > 0;
    if (T.wasAir && !air && !p.stun && p.state !== 'knockdown' && p.state !== 'knockdownSoft') T.land = 0;
    if (!T.wasAir && air && p.vy > 0 && !p.stun) T.takeoff = 0;
    T.wasAir = air;
    const base = frameOf(def, p.state, p.frame);
    const now = timed(p, def, base);
    if (T.role === 'impact' && T.sn && (T.state !== p.state ? !def.states[p.state]?.move : now.idx !== T.idx)) {
      const O = POLISH.overshoot, size = O[T.sn.strength] ?? O.medium;
      T.over = 0; T.overPx = T.sn.overshoot?.px ?? size.px; T.overStretch = size.stretch; T.overDir = T.sn.overshoot?.dir ?? [1, 0];
    }
    T.lean = now.role === 'anticipation' && now.next === 'smear' && now.last ? 1 : 0;
    T.state = p.state; T.idx = now.idx; T.role = now.role; T.sn = now.sn;
    // Ribbons (off by default): chains of points hanging from the anchors marked on the drawing being shown, each
    // point sprung toward one segment's length from the one before it, with drag and gravity.
    const R = POLISH.ribbons, sp = now.fr.sprite, image = sp && (sp.block ?? def.sheets[sp.sheet])?.image;
    const A = R.on && image ? SNAP[def.id]?.ribbons?.anchors?.[image]?.[sp.index] : null;
    if (!A) { T.ribbon = null; return; }
    if (POLISH.hitFreeze.on && p.hitstop > 0 && !p.stun && T.ribbon) return; // the attacker's cloth holds still too
    if (!T.ribbon || T.ribbon.length !== A.length) T.ribbon = A.map(() => null);
    A.forEach(([fx, fy], n) => {
      const ax = p.x / UNIT + p.facing * fx, ay = p.y / UNIT + fy;
      const pts = T.ribbon[n] ?? (T.ribbon[n] = Array.from({ length: R.segments }, (_, i) => ({ x: ax - p.facing * (i + 1) * R.length * 0.3, y: ay - (i + 1) * R.length, vx: 0, vy: 0 })));
      pts.ax = ax; pts.ay = ay;
      let px = ax, py = ay;
      for (const q of pts) {
        const dx = q.x - px, dy = q.y - py, d = Math.hypot(dx, dy) || 1;
        q.vx = (q.vx + (px + (dx / d) * R.length - q.x) * R.stiffness) * R.drag;
        q.vy = (q.vy + (py + (dy / d) * R.length - q.y) * R.stiffness - R.gravity) * R.drag;
        q.x += q.vx; q.y = Math.max(2, q.y + q.vy);
        px = q.x; py = q.y;
      }
    });
  }
  function drawRibbons(def, T) {
    if (!POLISH.ribbons.on || !T.ribbon) return;
    const R = POLISH.ribbons;
    ctx.save();
    ctx.strokeStyle = SNAP[def.id]?.ribbons?.color ?? '#e8dcc6';
    ctx.lineCap = 'round';
    for (const pts of T.ribbon) {
      if (!pts) continue;
      let [x0, y0] = toScreen(pts.ax * UNIT, pts.ay * UNIT);
      pts.forEach((q, i) => {
        const [x1, y1] = toScreen(q.x * UNIT, q.y * UNIT);
        ctx.lineWidth = Math.max(1, R.width * (1 - (0.7 * i) / pts.length));
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        x0 = x1; y0 = y1;
      });
    }
    ctx.restore();
  }
  /** Where the fighter's drawing is nudged this frame, in screen px; also sets `stretch`. The core's position never moves. */
  function polishOffset(p, T) {
    let dx = 0, dy = 0, sx = 1, sy = 1;
    const S = POLISH.squash;
    if (S.on) {
      let a = env(T.land, S.land.frames, S.land.ease);
      sy *= 1 + (S.land.tall - 1) * a; sx *= 1 + (S.land.wide - 1) * a;
      a = env(T.takeoff, S.takeoff.frames, S.takeoff.ease);
      sy *= 1 + (S.takeoff.tall - 1) * a; sx *= 1 + (S.takeoff.wide - 1) * a;
      a = env(T.push, S.heavyHit.frames, S.heavyHit.ease);
      dx += T.pushDir * S.heavyHit.px * a; sx *= 1 + (S.heavyHit.wide - 1) * a;
    }
    const O = POLISH.overshoot, a = O.on ? env(T.over, O.hold, O.ease) : 0;
    if (a > 0) {
      dx += p.facing * T.overDir[0] * T.overPx * a; dy -= T.overDir[1] * T.overPx * a;
      if (Math.abs(T.overDir[0]) >= Math.abs(T.overDir[1])) sx *= 1 + (T.overStretch - 1) * a; else sy *= 1 + (T.overStretch - 1) * a;
    }
    if (POLISH.anticipationLean.on && T.lean) dx -= p.facing * POLISH.anticipationLean.px;
    const K = POLISH.hitstopShake;
    if (K.on && p.hitstop > 0 && p.stun > 0 && !p.state.startsWith('block')) dx += (collected % 2 ? 1 : -1) * (T.flashHeavy ? K.heavyPx : K.px);
    stretch = [sx, sy];
    return [dx, dy];
  }
  /** The sheet a frame is drawn from: the cleaned copy when the switch is on and it is there, else the original. */
  function sheetOf(def, fr) {
    const s = fr.sprite;
    if (!s) return null;
    let sheet = s.block ?? def.sheets[s.sheet]; // block: a sheet given outright (the art rules below)
    if (!sheet) return null;
    let raw = null;
    const c = POLISH.cleanSprites.on && CLEAN[def.id]?.[sheet.image];
    if (c && !c.skipFrames?.includes(s.index)) { raw = spriteImage(def.id, c.image); if (raw) sheet = c; }
    raw = raw ?? spriteImage(def.id, sheet.image);
    return raw ? { sheet, raw, index: s.index } : null;
  }
  /** The thin rim of light on the side facing the stage's light: the drawing minus itself moved away from the light. */
  const rims = new Map();
  function drawRim(p, def, fr, light) {
    const r = canTint && sheetOf(def, fr);
    if (!r) return;
    const { sheet, raw } = r;
    const fw = sheet.frameW ?? raw.naturalWidth / sheet.columns, fh = sheet.frameH ?? raw.naturalHeight / sheet.rows;
    const k = sheet.scale ?? 1;
    const side = (light.side === 'left' ? -1 : 1) * p.facing; // in the drawing's own space
    const key = `${def.id}|${sheet.image}|${r.index}|${side}`;
    let c = rims.get(key);
    if (!c) {
      const sx = (r.index % sheet.columns) * fw, sy = Math.floor(r.index / sheet.columns) * fh, w = POLISH.rimLight.px / k;
      c = document.createElement('canvas');
      c.width = fw; c.height = fh;
      const x = c.getContext('2d');
      x.drawImage(raw, sx, sy, fw, fh, 0, 0, fw, fh);
      x.globalCompositeOperation = 'destination-out';
      x.drawImage(raw, sx, sy, fw, fh, -side * w, w * 0.6, fw, fh);
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = light.color;
      x.fillRect(0, 0, fw, fh);
      if (rims.size >= 96) rims.delete(rims.keys().next().value);
      rims.set(key, c);
    }
    const [px, py] = toScreen(p.x, p.y);
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(p.facing * k * stretch[0], k * stretch[1]);
    ctx.globalAlpha *= POLISH.rimLight.alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(c, 0, 0, fw, fh, -(sheet.originX ?? fw / 2), -(sheet.originY ?? fh), fw, fh);
    ctx.restore();
  }

  /** tint: a colour = the drawing as one flat shape of that colour (impact frame, hit flash). */
  function drawSprite(p, def, fr, pal, tint = null) {
    const s = fr.sprite;
    const found = sheetOf(def, fr);
    if (!found) return false;
    const { sheet, raw } = found;
    const img = paletteSheet(raw, def.palettes, pal);
    const fw = sheet.frameW ?? img.naturalWidth / sheet.columns;
    const fh = sheet.frameH ?? img.naturalHeight / sheet.rows;
    const ox = sheet.originX ?? fw / 2;
    const oy = sheet.originY ?? fh;
    const k = sheet.scale ?? 1; // sheets stored larger than game size (sharper on big screens) are drawn at this scale
    const col = s.index % sheet.columns;
    const row = Math.floor(s.index / sheet.columns);
    const [sx, sy] = toScreen(p.x, p.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(p.facing * k * stretch[0], k * stretch[1]);
    if (tint && canTint) {
      scratch.width = fw; scratch.height = fh;
      sctx.drawImage(img, col * fw, row * fh, fw, fh, 0, 0, fw, fh);
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = tint;
      sctx.fillRect(0, 0, fw, fh);
      sctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(scratch, 0, 0, fw, fh, -ox, -oy, fw, fh);
    } else ctx.drawImage(img, col * fw, row * fh, fw, fh, -ox, -oy, fw, fh); // img: the sheet in this palette
    ctx.restore();
    return true;
  }

  /**
   * A character's own drawing rules (`art` in its file; drawing only):
   *  - exit: leaving one state for another, a few drawings play first (the end of a landing, a dash stop, standing
   *    up after setting the lantern down);
   *  - byVy: air drawings picked by vertical speed;
   *  - guard: the guard drawing while holding back from an attack that is coming.
   */
  const exitArt = [null, null]; // drawing only: { rule, t } the exit drawings a fighter is showing
  function ruleFrame(p, def, fr, game, world) {
    const art = def.art;
    if (!art) return fr;
    const ex = exitArt[p.id];
    if (ex) return { ...fr, sprite: { block: ex.rule.sprite, index: ex.rule.frames[heldFrame(ex.rule.holds, ex.t, false)[0]] } };
    // art.throws: { <throw move>: { throwHold: { sprite, holds }, throwFinish: { sprite, holds } } }: the shared throw
    // states drawn with that throw's own drawings (which throw it was is kept on the fighter being thrown).
    const own = art.throws && game && (p.state === 'throwHold' || p.state === 'throwFinish') ? art.throws[game.players[1 - p.id].throwMove]?.[p.state] : null;
    if (own) {
      const t = lastMove[p.id]?.state === p.state ? lastMove[p.id].since : 0;
      return { ...fr, sprite: { block: own.sprite, index: heldFrame(own.holds, t, false)[0] } };
    }
    const st = def.states[p.state];
    if (art.guard && st.free && game && world) {
      const o = game.players[1 - p.id];
      const dir = relDirAt(p.input, 0, p.facing);
      const coming = !!world.chars[o.id].states[o.state].move?.active || game.projectiles.some((pr) => pr.owner === o.id && !world.chars[o.id].projectiles[pr.kind].noHit);
      const g = art.guard[st.stance];
      if (g && coming && (dir === 4 || dir === 1 || dir === 7) && Math.abs(o.x - p.x) <= art.guard.range * UNIT) return { ...fr, sprite: { block: g.sprite, index: g.index } };
    }
    if (art.byVy && fr.sprite && art.byVy.states.includes(p.state)) {
      const vy = p.vy / UNIT;
      const row = art.byVy.pick.find((r) => r.above === undefined || vy > r.above);
      return { ...fr, sprite: { ...fr.sprite, index: row.index } };
    }
    return fr;
  }

  /** Avner's lantern: its moon shows his Devotion (one drawing per full bar), and an effect can be pinned to it. */
  function lanternAt(p, def, shown) {
    const L = def.art?.lantern;
    const s = shown.sprite;
    const sheet = s && (s.block ?? def.sheets[s.sheet]);
    const at = L && sheet && L.at[sheet.image]?.[s.index];
    return at ? toScreen(p.x + p.facing * at[0] * UNIT, p.y + at[1] * UNIT) : null;
  }
  function drawLantern(p, def, shown) {
    const at = lanternAt(p, def, shown);
    if (!at) return;
    const L = def.art.lantern;
    const bars = Math.min(L.sprite.count - 1, Math.floor((p.meter * (def.stats?.meterBars ?? 4)) / Math.max(1, def.meterMax)));
    drawSheetFrame(def, L.sprite, bars, at[0], at[1], p.facing);
    // A move's pinned effect (the lantern flaring as the moon is called): from one drawing of the move on.
    const st = def.states[p.state];
    const pin = st.move?.pinFx, e = pin && def.effects[pin.effect];
    if (!e) return;
    const from = st.frames.findIndex((f) => f.sprite && f.sprite.index >= pin.fromSprite);
    const t = p.frame - from;
    const total = e.holds.reduce((a, b) => a + b, 0);
    if (from < 0 || t < 0 || t >= total) return;
    drawSheetFrame(def, e.sprite, heldFrame(e.holds, t, false)[0], at[0], at[1], p.facing);
  }

  /** Effects a state carries in step with its own drawings (a stance's aura behind, its light trail in front). */
  function drawLayers(p, def, fr, behind) {
    const layers = def.states[p.state]?.layers;
    if (!layers || !fr.sprite) return;
    for (const l of layers) {
      if (!!l.behind !== behind) continue;
      const e = def.effects[l.effect];
      if (!e) continue;
      const at = e.at ?? [0, 0];
      const [x, y] = toScreen(p.x + p.facing * at[0] * UNIT, p.y + at[1] * UNIT);
      // One pass of the effect per pass of the state, whatever the number of drawings on either side.
      const st = def.states[p.state];
      const at2 = Math.min(st.duration - 1, p.frame);
      fxOp = opOf(e, def, l.effect, 'trail'); // FXOPACITY
      drawSheetFrame(def, e.sprite, Math.floor((at2 * e.sprite.count) / st.duration) % e.sprite.count, x, y, p.facing);
    }
  }

  /**
   * Auras (a mechanic var with `aura`, e.g. an install): named effects looping on the fighter while the var is above
   * 0, each drawing held the effect's `hold` frames, fading out over the last second. An effect may `bob` up and
   * down ({ px, period }) and be see-through (`alpha`).
   */
  const auraAt = {}; // drawing only: where a swapping aura is drawn now, on its way to its place
  function drawAuras(p, def, frame, behind) {
    for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
      const n = p.vars?.[k];
      if (!v.aura || !(n > 0)) continue;
      for (const l of v.aura) {
        if (!!l.behind !== behind) continue;
        // swap: { <state>: effect }: in that state the aura is another effect (the guardian's attack), played in
        // step with the state by its `holds`. It glides between the two places so nothing jumps.
        const swap = def.effects[l.swap?.[p.state]];
        const e = swap ?? def.effects[l.effect];
        if (!e) continue;
        const at = e.at ?? [0, 0];
        const bob = e.bob ? Math.sin((frame * Math.PI * 2) / e.bob.period) * e.bob.px : 0;
        const key = `${p.id}:${l.effect}`;
        const was = l.swap ? auraAt[key] ?? at : at;
        const now = l.swap ? [was[0] + (at[0] - was[0]) * 0.4, was[1] + (at[1] - was[1]) * 0.4] : at;
        if (l.swap) auraAt[key] = now;
        const [x, y] = toScreen(p.x + p.facing * now[0] * UNIT, p.y + (now[1] + bob) * UNIT);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, n / 60) * (e.alpha ?? 1);
        fxOp = opOf(e, def, swap ? l.swap[p.state] : l.effect, 'aura'); // FXOPACITY
        drawSheetFrame(def, e.sprite, swap ? heldFrame(e.holds, p.frame, false)[0] : Math.floor(frame / (e.hold ?? 4)) % e.sprite.count, x, y, p.facing);
        ctx.restore();
      }
    }
  }

  /** The frame to draw: a mechanic var with `art` swaps a state's drawings for another state's while it is above 0. */
  function artFrame(p, def, fr) {
    // An absorbed hit shows the vow_absorb drawing for a moment, if the character has one.
    if (p.state === 'vow_hold' && absorbUntil[p.id] > collected && def.sheets.vow_absorb) {
      const st = def.states.vow_absorb;
      return { ...fr, sprite: st.frames[Math.min(st.frames.length - 1, Math.max(0, collected - absorbUntil[p.id] + absorbLen[p.id]))].sprite };
    }
    for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
      const alt = v.art?.[p.state];
      const st = alt && p.vars?.[k] > 0 && def.states[alt];
      if (st) return { ...fr, sprite: st.frames[p.frame % st.frames.length].sprite };
    }
    return fr;
  }

  /** A sheet frame for an animation given as hold lengths, at age t: [index into the holds, finished?]. */
  function heldFrame(holds, t, loop) {
    const total = holds.reduce((a, b) => a + b, 0);
    if (t >= total) { if (!loop) return [holds.length - 1, true]; t %= total; }
    let i = 0;
    while (t >= holds[i]) t -= holds[i++];
    return [i, false];
  }

  /** A named effect from an `fx` cue: where it was played, or on its fighter if it follows them. */
  function drawNamed(e, game) {
    let x = e.x, y = e.y;
    if (e.sheet.follow && e.owner !== undefined) { const o = game.players[e.owner]; x = o.x + e.facing * e.off[0] * UNIT; y = o.y + e.off[1] * UNIT; }
    const [sx, sy] = toScreen(x, y);
    fxOp = opNamed(e); // FXOPACITY
    drawSheetFrame(e.def, e.sheet.sprite, e.sheet.holds ? heldFrame(e.sheet.holds, e.age, false)[0] : Math.min(e.sheet.sprite.count - 1, Math.floor(e.age / (e.sheet.hold ?? 3))), sx, sy, e.facing ?? 1);
  }

  /** Live projectiles (game state) and the ones that just ended (their impact frames, where they vanished). */
  function drawProjectiles(game, world) {
    for (const pr of game.projectiles) {
      const def = world.chars[pr.owner];
      const d = def.projectiles[pr.kind];
      if (!d?.sprite) continue;
      const rel = d.anim?.release ?? [], loop = d.anim?.loop ?? [1];
      const relLen = rel.reduce((a, b) => a + b, 0);
      const index = Math.min(d.sprite.count - 1, pr.age < relLen ? heldFrame(rel, pr.age, false)[0] : rel.length + heldFrame(loop, pr.age - relLen, true)[0]);
      const [x, y] = toScreen(...rootOf(pr, d));
      ctx.save();
      if (d.sprite.additive) ctx.globalCompositeOperation = 'lighter';
      fxOp = opOf(d, def, pr.kind, d.zone ? 'zone' : 'projectile'); // FXOPACITY
      drawSheetFrame(def, d.sprite, index, x, y, pr.facing, tiltOf(d, pr.facing));
      ctx.restore();
    }
  }

  function drawBoxes(p, fr) {
    const sets = [
      [fr.push, '#ffffff', 0.08],
      [fr.hurt, '#36d27a', 0.18],
      [fr.throwHurt, '#e0d050', 0.0],
      [fr.throw, '#e0d050', 0.25],
      [fr.hit, '#ff3b3b', 0.3],
    ];
    for (const [list, color, fill] of sets) {
      for (const b of list) {
        const [x, y, w, h] = boxRect(p, b);
        ctx.globalAlpha = fill;
        ctx.fillStyle = color;
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
      }
    }
    ctx.globalAlpha = 1;
    const [ox, oy] = toScreen(p.x, p.y);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox - 3, oy - 1, 7, 2);
    ctx.fillRect(ox - 1, oy - 3, 2, 7);
  }

  // Cues live for one game frame: pick them up once per frame. Screens call notice() after every step, because a
  // slow display runs several steps between two draws and the cues of the earlier ones would be lost (effects and
  // sparks that never appear); draw() picks up the frame it sees if nobody did.
  let collected = -1;
  // Impact feel (drawing only): the screen jolt and the brightened fighter. data/system/effects.json "impact".
  const shake = { amp: 0, left: 0 };
  const hitFlash = [0, 0];
  const jolt = (amp) => { if (amp > 0 && amp >= (shake.left > 0 ? shake.amp : 0)) { shake.amp = amp; shake.left = FX.impact.shake.frames; } };
  // FXOPACITY BEGIN (drawing only; data/system/effects.json "opacity": every effect is drawn a little see-through)
  const OP = FX.opacity ?? { classes: {} };
  let fxOp = null; // the opacity of the next effect drawing (drawSheetFrame takes it once); null = not an effect
  let fxPlain = false; // opts.effectsOpacity: false draws every effect as it was before (for comparison pictures)
  let bodies = []; // each fighter's body on the screen in this drawing [x, y, w, h], to notice an effect covering it
  const fxNames = new WeakMap(); // character → (an effect or projectile entry → its name in the character's file)
  function nameOf(def, entry) {
    if (!def || !entry) return undefined;
    if (!fxNames.has(def)) {
      const m = new Map();
      for (const [k, v] of Object.entries(def.effects ?? {})) m.set(v, k);
      for (const [k, v] of Object.entries(def.projectiles ?? {})) m.set(v, k);
      fxNames.set(def, m);
    }
    return fxNames.get(def).get(entry);
  }
  /** An effect's opacity: its own "opacity", else the character's art.opacity entry for its name, else its class. */
  const opOf = (entry, def, name, cls) => (OP.on === false ? 1 : entry?.opacity ?? def?.art?.opacity?.[name] ?? OP.classes?.[cls] ?? 1);
  /** A hit spark: its first drawing (the flash) is drawn at flashFirst, the rest at its opacity. */
  const opSpark = (entry, index) => (OP.on === false ? 1 : index === 0 && OP.flashFirst ? OP.flashFirst : entry?.opacity ?? OP.classes?.hitSpark ?? 1);
  /** A named effect of a character; one with no name there is a move's own hit effect, which counts as a hit spark. */
  const opNamed = (e) => { const n = nameOf(e.def, e.sheet); return n ? opOf(e.sheet, e.def, n, 'burst') : opSpark(e.sheet, e.sheet.holds ? heldFrame(e.sheet.holds, e.age, false)[0] : Math.floor(e.age / (e.sheet.hold ?? 3))); };
  function bodyRect(p, world) {
    const fr = frameOf(world.chars[p.id], p.state, p.frame);
    const boxes = fr.hurt?.length ? fr.hurt : fr.push ? [fr.push] : [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const b of boxes) { const [x, y, w, h] = boxRect(p, b); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + w); y1 = Math.max(y1, y + h); }
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }
  /** What one effect drawing is multiplied by: its opacity, less while it covers too much of a fighter, times the player's setting. */
  function opFor(op, sheet, x, y, facing, k, fw, fh) {
    if (fxPlain) return 1;
    let a = op;
    const w = fw * k * (OP.coverInset ?? 1), h = fh * k * (OP.coverInset ?? 1);
    if (OP.on !== false && a < 1 && OP.coverDrop && w > 0 && w < W * 0.9) {
      const cx = x + facing * (fw / 2 - (sheet.originX ?? fw / 2)) * k, cy = y + (fh / 2 - (sheet.originY ?? fh / 2)) * k;
      for (const b of bodies) {
        if (!b) continue;
        const ox = Math.min(cx + w / 2, b[0] + b[2]) - Math.max(cx - w / 2, b[0]), oy = Math.min(cy + h / 2, b[1] + b[3]) - Math.max(cy - h / 2, b[1]);
        if (ox > 0 && oy > 0 && ox * oy > (OP.coverShare ?? 0.5) * b[2] * b[3]) { a = Math.max(0, a - OP.coverDrop); break; }
      }
    }
    return a * FXO.global;
  }
  // FXOPACITY END
  // BLOCKFX BEGIN (drawing only; data/system/effects.json "blockFx": the guard and the spark of a blocked hit)
  const BLK = FX.blockFx;
  const guards = [null, null]; // one per defender
  const blockSparks = []; // { id: the defender, kind, x, y, facing, t }
  const btnOf = new WeakMap(); // character → { move: its buttons }
  const sumOf = (a) => a.reduce((p, q) => p + q, 0);
  /** light / medium / heavy, from the move that was blocked. */
  function blockStrength(c, world) {
    const src = world.chars[c.p], st = src?.states[c.move], by = BLK.strengthOf ?? {};
    if (!st) return (src?.projectiles[c.move]?.move?.damage ?? 0) < (by.lightProjectileBelow ?? 0) ? 'light' : by.projectile ?? 'heavy';
    if (st.move?.kind !== 'normal') return 'heavy';
    if (!btnOf.has(src)) { const m = {}; for (const cmd of src.commands) m[cmd.move] ??= cmd.buttons; btnOf.set(src, m); }
    return by.buttons?.[btnOf.get(src)[c.move]] ?? 'heavy';
  }
  /** A block (or a Repel) on defender d at x, y. A guard that is still up is not started over: it pops again at full size, then its loop goes on. */
  function guardHit(d, how, x, y, repel) {
    const front = Math.max((BLK.minFront ?? 0) * UNIT, (x - d.x) * d.facing); // in front of the defender, never inside the body
    let g = guards[d.id];
    if (!g) g = guards[d.id] = { dx: front, y, size: how.size, turn: 0, again: false };
    else g.again = true;
    g.phase = 'in'; g.t = 0;
    g.facing = d.facing; g.toDx = front; g.toY = y; g.toSize = how.size;
    g.flash = !!how.flash; g.repel = repel;
    if (repel) g.size = how.size;
    for (const kind of [].concat(how.spark ?? [])) if (BLK.sparks?.[kind]) blockSparks.push({ id: d.id, kind, x, y, facing: d.facing, t: 0 }); // one name or a list
  }
  function blockCue(c, game, world) {
    if (!BLK || BLK.on === false) return false;
    guardHit(game.players[1 - c.p], BLK.strengths[blockStrength(c, world)], c.x, c.y, false);
    return true;
  }
  function blockRepel(c, game) {
    if (!BLK || BLK.on === false || !BLK.repel) return;
    const d = game.players[c.p], g = guards[d.id];
    guardHit(d, BLK.repel, g ? d.x + d.facing * g.dx : d.x, g ? g.y : d.y + FX.motion.bodyY * UNIT, true);
  }
  /** One game frame. With holdInHitstop, the first drawing holds while the defender is frozen in hitstop; the rest plays after it. */
  function blockAge(game, world) {
    for (let i = blockSparks.length - 1; i >= 0; i--) if (++blockSparks[i].t >= sumOf(BLK.sparks[blockSparks[i].kind].holds)) blockSparks.splice(i, 1); // sparks play through hitstop
    for (const d of game.players) {
      const g = guards[d.id];
      if (!g) continue;
      if (d.hitstop > 0 && BLK.holdInHitstop !== false && g.phase === 'in' && g.t === 0) continue;
      const stunned = (d.state.startsWith('block') || world.chars[d.id].states[d.state]?.blocking) && d.stun > 0;
      g.t++;
      g.dx += (g.toDx - g.dx) * 0.5; g.y += (g.toY - g.y) * 0.5; g.size += (g.toSize - g.size) * 0.5;
      if (g.phase === 'in' && g.t >= sumOf(BLK.in)) { g.phase = stunned && BLK.loop.length ? 'loop' : 'out'; g.t = 0; } // an empty loop list: no held drawings, it plays straight through
      else if (g.phase === 'loop') { g.turn += BLK.spin ?? 0; if (!stunned) { g.phase = 'out'; g.t = 0; } }
      else if (g.phase === 'out' && g.t * (g.repel ? BLK.repel.outSpeed ?? 1 : 1) >= sumOf(BLK.out)) guards[d.id] = null;
    }
  }
  /** Drawn right after the defender, so it is in front of them and behind an attacker who is drawn after. */
  function blockDraw(p) {
    guardDraw(p);
    for (const sp of blockSparks) {
      if (sp.id !== p.id) continue;
      const K = BLK.sparks[sp.kind], [sx, sy] = toScreen(sp.x, sp.y);
      fxOp = K.opacity;
      drawSheetFrame(null, { ...K.sprite, additive: K.additive !== false }, heldFrame(K.holds, sp.t, false)[0], sx, sy, sp.facing);
    }
  }
  function guardDraw(p) {
    const g = guards[p.id];
    if (!g) return;
    const f = g.facing, n = BLK.in.length;
    let frame, pop = 1, drift = 0;
    if (g.phase === 'in') { frame = heldFrame(BLK.in, g.t, false)[0]; if (!g.again) pop = BLK.pop?.[frame] ?? 1; }
    else if (g.phase === 'loop') frame = n + heldFrame(BLK.loop, g.t, true)[0];
    else {
      const t = Math.floor(g.t * (g.repel ? BLK.repel.outSpeed ?? 1 : 1)), total = sumOf(BLK.out);
      frame = n + BLK.loop.length + heldFrame(BLK.out, Math.min(t, total - 1), false)[0];
      if (g.repel) drift = (BLK.repel.drift ?? 0) * Math.min(1, t / total); // a Repel moves toward the attacker as it breaks apart
    }
    const at = toScreen(p.x + f * g.dx, g.y);
    const x = at[0] + f * drift, y = at[1];
    const k = (BLK.charHeight * BLK.height * g.size * pop) / BLK.sprite.bodyH;
    const angle = (f * g.turn * Math.PI) / 180; // the whole guard turns while it loops, on top of the drawn swirl
    fxOp = BLK.opacity; // flat, ordinary drawing, a little see-through
    drawSheetFrame(null, { ...BLK.sprite, scale: k }, frame, x, y, f, angle);
    if (g.flash && g.phase === 'in' && g.t < BLK.flash.frames) { fxOp = BLK.flash.opacity; drawSheetFrame(null, { ...BLK.white, scale: k }, frame, x, y, f, angle); }
  }
  // BLOCKFX END
  // SHOCKWAVE BEGIN (drawing only; data/system/effects.json "shockwave"; remove the three marked blocks to take it out)
  // Rings that bend the picture behind them. Each ring: where it is (game units), who froze with it, its age in game
  // frames (negative = not started yet) and its numbers, already multiplied by its set's scale.
  const SW = FX.shockwave;
  const rings = [];
  let pulse = null; // the brief whole-screen brightening of the biggest set
  let warp = null, wctx = null; // a copy of the finished fight picture, to bend
  function shockStart(name, x, y, frozenWith) {
    const set = SW?.sets?.[name];
    if (!set || SW.on === false) return;
    const k = set.scale ?? 1;
    for (const r of set.rings) {
      if (rings.length >= (SW.max ?? 8)) rings.shift();
      rings.push({ x, y, who: frozenWith, age: (r.startAt ?? 0) - (r.delay ?? 0), life: r.life, radius: r.radius * SW.charHeight * k, thick: [r.thick[0] * k, r.thick[1] * k], strength: r.strength * k });
    }
    if (set.pulse) pulse = { age: 0, life: set.pulse.frames, alpha: set.pulse.alpha };
  }
  /** Which set a cue plays, or none: the rules in "when", then the move's own entry in the character's art.shockwave. */
  function shockCue(c, game, world) {
    if (!SW || SW.on === false) return;
    const W1 = SW.when ?? {};
    if (c.type === 'groundbounce' && struck[c.p]?.rule.ring) return; // GROUNDFX: that effect fires its own ring
    if (c.type === 'wallbounce' || c.type === 'groundbounce') { if (W1[c.type]) shockStart(W1[c.type], c.x, c.y + (c.type === 'wallbounce' ? FX.motion.bodyY * UNIT : 0), c.p); return; }
    if (c.type !== 'hit' && c.type !== 'counter' && c.type !== 'witness') return;
    const src = world.chars[c.p], st = src?.states[c.move];
    const mv = st?.move ?? src?.projectiles[c.move]?.move;
    const own = src?.art?.shockwave?.[c.move] ?? null;
    let name = null;
    if (game.players[1 - c.p].health <= 0) name = W1.ko;
    else if (mv?.kind === 'super' && st) {
      // A super's last hit: no later frame of the move hits again.
      const f = game.players[c.p].frame, id = st.frames[Math.min(f, st.frames.length - 1)]?.hitId;
      if (!st.frames.some((fr, i) => i > f && fr.hit.length && fr.hitId !== id)) name = W1.superLast;
    }
    if (!name && own && c.type !== 'hit') name = W1.counter;
    if (!name && !c.fellOut) name = (mv?.crumple ? W1.crumple : mv?.launchType === 'hard' ? W1.launcher : mv?.hitReaction === 'hardKD' ? W1.slam : null) ?? null;
    if (!name) name = own;
    if (name) shockStart(name, c.x, c.y, 1 - c.p);
  }
  /** One game frame: rings stand still while the fighter they hit is frozen in hitstop, then play out. */
  function shockAge(game) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (!(game.players[r.who]?.hitstop > 0)) r.age++;
      if (r.age > r.life) rings.splice(i, 1);
    }
    if (pulse && ++pulse.age > pulse.life) pulse = null;
  }
  /** After the fight is drawn, before the HUD: bend the picture inside each ring, pushing it outward from the centre. */
  function shockDraw() {
    if (!rings.length && !pulse) return;
    const cv = ctx.canvas, real = cv && typeof cv.width === 'number' && cv.width > 1 && typeof ctx.clip === 'function' && typeof ctx.setTransform === 'function';
    const z = cam.z || 1;
    const k = real ? cv.width / W : 1; // real pixels for each of the game's own
    const bands = SW.bands ?? 10;
    let fill = false; // whether there is a copy of the picture to bend
    if (real && SW.warp !== false && rings.some((r) => r.age >= 0)) {
      if (!warp && typeof document !== 'undefined') { warp = document.createElement('canvas'); wctx = warp.getContext?.('2d') ?? null; }
      if (wctx) {
        if (warp.width !== cv.width || warp.height !== cv.height) { warp.width = cv.width; warp.height = cv.height; }
        // Only the part of the picture the rings cover is copied.
        let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
        for (const r of rings) {
          if (r.age < 0) continue;
          const [lx, ly] = onScreen(r.x, r.y), reach = (r.radius + r.thick[1]) * z;
          x0 = Math.min(x0, lx - reach); y0 = Math.min(y0, ly - reach); x1 = Math.max(x1, lx + reach); y1 = Math.max(y1, ly + reach);
        }
        x0 = Math.max(0, Math.floor(x0 * k)); y0 = Math.max(0, Math.floor(y0 * k)); x1 = Math.min(cv.width, Math.ceil(x1 * k)); y1 = Math.min(cv.height, Math.ceil(y1 * k));
        if (x1 > x0 && y1 > y0) {
          wctx.globalCompositeOperation = 'copy';
          wctx.drawImage(cv, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
          fill = true;
        }
      }
    }
    for (const r of rings) {
      if (r.age < 0) continue;
      const t = Math.min(1, r.age / r.life), out = 1 - (1 - t) ** 3; // grows fast, then settles
      const [lx, ly] = onScreen(r.x, r.y);
      const mid = r.radius * out * z, thick = (r.thick[0] + (r.thick[1] - r.thick[0]) * t) * z, strength = r.strength * (1 - t) * z;
      const r0 = Math.max(0, mid - thick / 2), r1 = mid + thick / 2;
      if (fill && strength > 0.05) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        const cx = lx * k, cy = ly * k;
        for (let b = 0; b < bands; b++) {
          const a0 = (r0 + ((r1 - r0) * b) / bands) * k, a1 = (r0 + ((r1 - r0) * (b + 1)) / bands) * k, am = (a0 + a1) / 2;
          const d = strength * k * Math.sin((Math.PI * (b + 0.5)) / bands) ** 2; // a smooth bump: 0 at both edges
          if (d < 0.25 || am - d < 1) continue;
          const s = am / (am - d); // the picture inside this band is drawn this much larger about the centre
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, a1, 0, Math.PI * 2);
          ctx.arc(cx, cy, a0, 0, Math.PI * 2, true);
          ctx.clip();
          ctx.drawImage(warp, cx - a1 / s, cy - a1 / s, (2 * a1) / s, (2 * a1) / s, cx - a1, cy - a1, 2 * a1, 2 * a1);
          ctx.restore();
        }
        ctx.restore();
      }
      // The edge catches the light (and where the picture cannot be bent, this ring alone is the effect).
      const edge = (fill ? SW.edge ?? 0.1 : SW.fallbackEdge ?? 0.5) * (1 - t);
      if (edge > 0.004 && mid > 0.5) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = edge;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, thick * (SW.edgeWidth ?? 0.3));
        ctx.beginPath();
        ctx.arc(lx, ly, mid, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
    if (pulse) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pulse.alpha * (1 - pulse.age / pulse.life);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }
  // SHOCKWAVE END
  // The universal systems' effect slots (data/system/effects.json "slots").
  const SLOTS = FX.slots || { sheets: {}, absorbPoseFrames: 8, exTint: 0.45 };
  // GROUNDFX BEGIN (drawing only). art.groundFx: { <move>: { play: <effect>, ring: { frame, set } } } in a character's
  // file: when a fighter last hit by that move next touches the ground (a ground bounce or a knockdown), the effect
  // plays at that spot on the ground line; ring = a shockwave set fired when the effect reaches that drawing (1 = first).
  const struck = [null, null]; // per fighter hit: { rule, by, up } (up: seen off the ground since the hit)
  const ringsDue = []; // { left, set, x, y, who }
  /** An effect whose entry has ring: { frame, set } fires that shockwave set when it reaches that drawing (1 = the first). */
  const ringOf = (named, x, y, who) => { const g = named.ring; if (g) ringsDue.push({ left: (named.holds ?? []).slice(0, Math.max(0, (g.frame ?? 1) - 1)).reduce((a, b) => a + b, 0), set: g.set, x, y, who }); };
  function groundFxHit(c, world) {
    const rule = world.chars[c.p]?.art?.groundFx?.[c.move];
    struck[1 - c.p] = rule ? { rule, by: c.p, up: false } : null; // any other hit takes over
  }
  function groundFxLand(id, x, game, world) {
    const s = struck[id];
    struck[id] = null;
    const def = world.chars[s.by], named = def?.effects?.[s.rule.play];
    if (!named) return;
    effects.push({ sheet: named, def, x, y: 0, facing: game.players[s.by].facing, age: 0, life: lifeOf(named) });
    ringOf({ holds: named.holds, ring: s.rule.ring }, x, 0, id);
  }
  function groundFxAge(game, world) {
    for (let i = ringsDue.length - 1; i >= 0; i--) {
      const r = ringsDue[i];
      if (r.left-- > 0) continue;
      shockStart(r.set, r.x, r.y, r.who);
      ringsDue.splice(i, 1);
    }
    for (const p of game.players) {
      const s = struck[p.id];
      if (!s) continue;
      if (p.y > 0) s.up = true;
      else if (s.up) groundFxLand(p.id, p.x, game, world); // came down without a bounce: a knockdown
      else if (!p.combo) struck[p.id] = null; // the combo ended on the ground
    }
  }
  // GROUNDFX END
  const lastMove = [null, null]; // drawing only: last seen state and x, to notice a dash starting or a landing
  const absorbUntil = [-1, -1]; // drawing only: the game frame until which a fighter shows the vow_absorb drawing
  const absorbLen = [0, 0]; // and how many frames that drawing plays for
  /** How far above the feet an effect sits: 'feet', 'body' or 'head'. */
  const heightOf = (at) => (at === 'body' ? FX.motion.bodyY : at === 'head' ? SLOTS.headY ?? 200 : 0) * UNIT;
  /** Play the effects a rule (or a list of rules) names. p = the fighter the cue is about, c = the cue. */
  function slotPlay(rules, p, game, c) {
    for (const rule of Array.isArray(rules) ? rules : rules ? [rules] : []) {
      const s = SLOTS.sheets[rule.play];
      if (!s) continue;
      const o = game.players[1 - p.id];
      const who = rule.on === 'other' ? o : p;
      let x = who.x + who.facing * (rule.forward ?? 0) * UNIT, y = who.y + heightOf(rule.at);
      if (rule.on === 'point' && c) { x = c.x; y = c.y; }
      if (rule.on === 'between') x = (p.x + o.x) / 2;
      effects.push({ motion: s, screen: rule.on === 'screen', x, y, facing: who.facing, age: 0, life: s.sprite.count * s.hold });
    }
  }
  function slotCue(c, game, world) {
    const p = game.players[c.p];
    if (!p) return;
    const rules = SLOTS.cues || {};
    if (c.type === 'absorb') {
      // The cue is the attacker's; the fighter holding Vow is the other one. Their absorb drawing starts over.
      const d = game.players[1 - c.p];
      const own = world.chars[d.id];
      absorbLen[d.id] = own.sheets.vow_absorb ? own.states.vow_absorb.frames.length : SLOTS.absorbPoseFrames;
      absorbUntil[d.id] = game.frame + absorbLen[d.id];
    }
    if ((c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && String(c.move).startsWith('vow_strike')) slotPlay(rules.vowhit, p, game, c);
    if (c.type === 'draw' && c.whiffed) return; // a Draw that caught nothing pulls nothing
    if (c.type === 'repel' && BLK && BLK.on !== false && BLK.repel?.replacesWave) return; // BLOCKFX
    slotPlay(rules[c.type], p, game, c);
  }
  /** The effect looping on a fighter for as long as they are in a state (the Vow guard, the crumple stars...). */
  function drawWhile(p, behind) {
    const rule = SLOTS.while?.[p.state];
    const s = rule && SLOTS.sheets[rule.play];
    if (!s || !!rule.behind !== behind) return;
    const t = (lastMove[p.id]?.state === p.state ? lastMove[p.id].since : 0) - (rule.after ?? 0);
    if (t < 0) return;
    const n = s.sprite.count, step = Math.floor(t / s.hold), from = Math.min(n - 1, rule.loopFrom ?? 0);
    const index = step < n ? step : rule.once ? n - 1 : from + ((step - from) % (n - from));
    const [x, y] = toScreen(p.x, p.y + (rule.y !== undefined ? rule.y * UNIT : heightOf(rule.at)));
    ctx.save();
    if (s.additive) ctx.globalCompositeOperation = 'lighter';
    fxOp = opOf(s, null, null, 'aura'); // FXOPACITY
    drawSheetFrame(null, s.sprite, index, x, y, p.facing);
    ctx.restore();
  }
  /**
   * Where a projectile drawn 'on the ground' stands (a hand rising out of the floor): the floor point its path
   * starts from, or, for one coming down, the point it is heading for. Worked out from the game state alone.
   */
  function groundX(pr, d) {
    if (d.speedY < 0 && pr.y > 0) return pr.x + pr.facing * d.speed * Math.ceil(pr.y / -d.speedY);
    return pr.x - pr.facing * d.speed * pr.age;
  }
  /** Where a projectile's sheet is drawn: on the floor ('ground'), where its path began ('rooted': the hand it grows from), or on it. */
  const rootOf = (pr, d) => d.sprite.ground ? [groundX(pr, d), 0] : d.sprite.rooted ? [pr.x - pr.facing * d.speed * pr.age, pr.y - d.speedY * pr.age] : [pr.x, pr.y];
  /** A sheet drawn upright can be tilted forward by 'angle' degrees. */
  const tiltOf = (d, facing) => (facing * (d.sprite.angle ?? 0) * Math.PI) / 180;
  const groundSeen = {}; // drawing only: where each ground-drawn or rooted projectile last stood, for its ending frames
  const lastVars = [{}, {}]; // drawing only: last seen mechanic vars, to notice a mark running out
  // Movement effects (dash dust, air dash burst and trail, landing dust): data/system/effects.json "motion".
  function motionFx(rule, p, dx) {
    const M = FX.motion;
    const facing = rule.back ? -p.facing : p.facing;
    const y = p.y + (rule.at === 'body' ? M.bodyY * UNIT : 0);
    let name = rule.play;
    if (rule.byDrift) { const d = Math.abs(dx) > M.driftMax * UNIT ? 0 : Math.sign(dx) * p.facing; name = rule.byDrift[d > 0 ? 0 : d < 0 ? 2 : 1]; }
    const s = M.sheets[name];
    if (s) effects.push({ motion: s, x: p.x, y: rule.at === 'body' ? y : 0, facing, age: 0, life: s.sprite.count * s.hold });
    const t = M.sheets[rule.trail];
    if (t) effects.push({ motion: t, follow: p.id, state: p.state, dy: y - p.y, x: p.x, y, facing, age: 0, life: 1 });
  }
  /** How long a sheet effect lasts: its `holds` (frames per drawing), or one `hold` for every drawing. */
  const lifeOf = (e) => (e.holds ? e.holds.reduce((a, b) => a + b, 0) : e.sprite.count * (e.hold ?? 3));
  function collect(game, world) {
    if (game.frame === collected) return;
    collected = game.frame;
    hud.notice(game);
    if (shake.left > 0) shake.left--;
    for (const i of [0, 1]) if (hitFlash[i] > 0) hitFlash[i]--;
    if (impactLeft > 0) impactLeft--;
    for (const T of pfx) if (T.flash > 0) T.flash--;
    blockAge(game, world); // BLOCKFX
    shockAge(game); // SHOCKWAVE
    for (const c of game.cues) {
      shockCue(c, game, world); // SHOCKWAVE
      if (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') groundFxHit(c, world); // GROUNDFX
      if (c.type === 'groundbounce' && struck[c.p]) groundFxLand(c.p, c.x, game, world); // GROUNDFX
      if (FX.impact) {
        if (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') {
          const src = world.chars[c.p];
          const base = (src?.states[c.move]?.move ?? src?.projectiles[c.move]?.move)?.damage ?? 0;
          const size = FX.hit.find((h) => h.below === undefined || base < h.below) ?? FX.hit[FX.hit.length - 1];
          jolt(FX.impact.shake[size.name] ?? 0);
          hitFlash[1 - c.p] = FX.impact.flash.frames;
        } else jolt(FX.impact.shake[c.type] ?? 0);
      }
      if (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') polishHit(c, game, world);
      slotCue(c, game, world);
      if (c.type === 'repel') blockRepel(c, game); // BLOCKFX
      const named = c.type === 'fx' && world.chars[c.p]?.effects?.[c.name];
      if (named) {
        const at = named.at ?? [0, 0];
        // `follow: true` keeps it on the fighter as they move; `behind: true` draws it behind their body.
        effects.push({ sheet: named, def: world.chars[c.p], x: c.x + c.facing * at[0] * UNIT, y: c.y + at[1] * UNIT, facing: c.facing, age: 0, life: lifeOf(named), owner: named.follow || named.behind ? c.p : undefined, off: at });
        ringOf(named, c.x + c.facing * at[0] * UNIT, c.y + at[1] * UNIT, undefined); // GROUNDFX: a move's effect can bring a ring
      }
      if (c.type === 'projectileEnd') {
        // The projectile's impact frames play where it hit or vanished.
        const d = world.chars[c.p]?.projectiles[c.name];
        const endFx = world.chars[c.p]?.effects?.[d?.endFx?.[c.why]]; // a named effect for this way of ending (a burst on the ground)
        if (endFx) effects.push({ sheet: endFx, def: world.chars[c.p], x: c.x, y: c.y, facing: c.facing, age: 0, life: lifeOf(endFx) });
        if (d?.sprite && d.anim?.impact) {
          const first = (d.anim.release?.length ?? 0) + (d.anim.loop?.length ?? 0);
          const [ex, ey] = groundSeen[`${c.p}:${c.name}`] ?? [c.x, c.y];
          effects.push({ proj: d, def: world.chars[c.p], first, x: ex, y: ey, facing: c.facing, age: 0, life: d.anim.impact.reduce((a, b) => a + b, 0) - 1 });
        }
      }
      if (!SPARK[c.type] && c.type !== 'witness') continue; // (a Witness counter has art only, no code-drawn spark)
      if (c.type === 'block' && blockCue(c, game, world)) continue; // BLOCKFX
      // A move (or projectile) with its own hit effect (art) shows that instead of the generic spark.
      const src = world.chars[c.p];
      // (hitFx as a name, "slash", picks one of the universal strips instead: see below.)
      const ownFx = (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && (src?.states[c.move]?.move ?? src?.projectiles[c.move]?.move)?.hitFx;
      const fx = ownFx && typeof ownFx === 'object' ? ownFx : null;
      if (fx) effects.push({ sheet: fx, def: world.chars[c.p], x: c.x, y: c.y, age: 0, life: lifeOf(fx) });
      // The universal effects: a Witness counter, a counter hit and a projectile's hit have their own strips, a move
      // can name one (a slash), and every other hit is sized by the move's base damage. A block is the block flash,
      // which curves toward the attacker.
      const isHit = c.type === 'hit' || c.type === 'counter' || c.type === 'witness';
      let uni = false;
      const ownFlash = isHit && String(c.move).startsWith('vow_strike') && !!SLOTS.sheets[SLOTS.cues?.vowhit?.play];
      if ((isHit && !fx && !ownFlash) || c.type === 'block') {
        let row, spark = null;
        let facing = game.players[c.p].facing;
        if (isHit) {
          const base = (src?.states[c.move]?.move ?? src?.projectiles[c.move]?.move)?.damage ?? 0;
          let i = FX.hit.findIndex((h) => h.below === undefined || base < h.below);
          if (i < 0) i = FX.hit.length - 1;
          const byKind = FX.sparkFor?.[c.type] ?? (typeof ownFx === 'string' ? ownFx : null) ?? (src?.projectiles[c.move] && !src.states[c.move] ? FX.sparkFor?.projectile : null);
          spark = FX.sparks?.[byKind] ?? FX.sparks?.[FX.hit[i].name] ?? null;
          if (c.type === 'counter' || c.type === 'witness') i = Math.min(FX.hit.length - 1, i + 1);
          row = FX.hit[i].row;
        } else {
          row = FX.block.row;
          facing = game.players[1 - c.p].facing;
        }
        if (spark) effects.push({ spark, x: c.x, y: c.y, facing, age: 0, life: spark.holds.reduce((a, b) => a + b, 0) });
        else effects.push({ uni: row * FX.sheet.columns, x: c.x, y: c.y, facing, age: 0, life: FX.frames * FX.hold });
        uni = true;
      }
      // The drawn-in-code spark stays for what has no art (clash, armor, throw, tech, bounces, burst), and as the
      // COUNTER label over the art.
      if (!uni && !fx && !ownFlash && SPARK[c.type]) effects.push({ ...SPARK[c.type], x: c.x, y: c.y, age: 0 });
      else if (c.type === 'counter') effects.push({ ...SPARK.counter, labelOnly: true, x: c.x, y: c.y, age: 0 });
    }
    // A mark that runs out (the Brand fading by itself) plays its fizzle on the opponent.
    for (const p of game.players) {
      const def = world.chars[p.id];
      const o = game.players[1 - p.id];
      for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
        const was = lastVars[p.id][k] ?? 0;
        lastVars[p.id][k] = p.vars[k];
        if (v.mark?.fizzle && was === 1 && p.vars[k] === 0) {
          const f = v.mark.fizzle;
          effects.push({ sheet: f, def, x: o.x, y: o.y + (v.mark.at ?? 90) * UNIT, age: 0, life: f.sprite.count * (f.hold ?? 3) });
        }
      }
    }
    groundFxAge(game, world); // GROUNDFX
    for (const p of game.players) {
      const was = lastMove[p.id];
      if (was && was.state !== p.state && p.state.endsWith('_ex')) slotPlay(SLOTS.cues?.ex, p, game);
      const ex = exitArt[p.id];
      if (ex && (!ex.rule.into.includes(p.state) || ++ex.t >= ex.total)) exitArt[p.id] = null;
      if (was && was.state !== p.state) {
        const rule = world.chars[p.id].art?.exit?.find((r) => r.from === was.state && r.into.includes(p.state) && was.since >= (r.after ?? 0));
        exitArt[p.id] = rule ? { rule, t: 0, total: rule.holds.reduce((a, b) => a + b, 0) } : null;
        const dx = p.x - was.x;
        if (FX.impact && (p.state === 'knockdown' || p.state === 'knockdownSoft' || p.state === 'slide')) jolt(FX.impact.shake.knockdown);
        if (FX.motion.leave[was.state]) motionFx(FX.motion.leave[was.state], p, dx);
        if (FX.motion.enter[p.state]) motionFx(FX.motion.enter[p.state], p, dx);
      }
      lastMove[p.id] = { state: p.state, x: p.x, since: was && was.state === p.state ? was.since + 1 : 0 }; // since: frames in this state
      polishTrack(p, world.chars[p.id]);
      // art.motion: { <state>: { play, at, from, every, until } }: dust under a move that runs or slides, every
      // `every` frames from frame `from` to frame `until` of the state.
      const dust = world.chars[p.id].art?.motion?.[p.state];
      if (dust) {
        const t = lastMove[p.id].since - (dust.from ?? 0);
        if (t >= 0 && lastMove[p.id].since <= (dust.until ?? dust.from ?? 0) && t % (dust.every ?? 1000) === 0) motionFx(dust, p, 0);
      }
    }
    for (const pr of game.projectiles) {
      const d = world.chars[pr.owner].projectiles[pr.kind];
      if (d?.sprite?.ground || d?.sprite?.rooted) groundSeen[`${pr.owner}:${pr.kind}`] = rootOf(pr, d);
    }
    // A trail rides its fighter and lasts as long as the state that started it.
    for (const e of effects) {
      if (e.follow === undefined) continue;
      const p = game.players[e.follow];
      if (p.state === e.state) { e.x = p.x; e.y = p.y + e.dy; e.life = e.age + 1; }
    }
    for (const e of effects) e.age++;
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].age > effects[i].life) effects.splice(i, 1);
  }

  return {
    cam,
    toScreen: onScreen,
    notice: collect,
    /**
     * One fighter alone, on one frame of one state, feet at screen x, y, enlarged by zoom, facing right (the box
     * editor). Draws the sprite (or the placeholder figure), its layers and its chain; no stage, no boxes.
     */
    pose(def, state, frame, x, y, zoom = 1, pal = 0) {
      const keep = [cam.x, cam.y];
      cam.x = 0;
      cam.y = 0;
      const p = { id: 0, x: 0, y: 0, facing: 1, state, frame, contact: 0, vars: {} };
      const fr = frameOf(def, state, frame);
      ctx.save();
      ctx.translate(x - (zoom * W) / 2, y - zoom * GROUND);
      ctx.scale(zoom, zoom);
      drawLayers(p, def, fr, true);
      if (!drawSprite(p, def, fr, pal)) drawPlaceholder(p, def, fr, placeholderColors(def.palettes, pal));
      drawLayers(p, def, fr, false);
      drawChain(p, def, { x: 0, y: 0, slideLeft: 0 });
      ctx.restore();
      [cam.x, cam.y] = keep;
    },
    /** One frame of one of a character's sheets (a projectile, an effect) with its origin at screen x, y. For the box editor. */
    poseSheet(def, sheet, index, x, y, zoom = 1) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(zoom, zoom);
      if (sheet.additive) ctx.globalCompositeOperation = 'lighter';
      const drawn = drawSheetFrame(def, sheet, index, 0, 0, 1);
      ctx.restore();
      return drawn;
    },
    /** opts: { boxes: bool, labels: bool } */
    /** Play a shockwave set at a place in the game (for picture and timing tools; the game itself uses the hit cues). */
    shock(name, x, y) { shockStart(name, x, y, -1); }, // SHOCKWAVE
    draw(game, world, opts = {}) {
      if (game.frame !== lastFrame) {
        collect(game, world);
        lastFrame = game.frame;
        for (const p of game.players) {
          if (p.combo) comboShow[p.id] = { c: p.combo, hold: 70, live: true };
          else if (comboShow[p.id]) {
            const s = comboShow[p.id];
            if (s.live && p.lastCombo) { s.c = p.lastCombo; s.live = false; }
            if (--s.hold <= 0) comboShow[p.id] = null;
          }
        }
      }
      // The zoom: close in while the fighters are near each other, widening steadily as they move apart, and never
      // so close that either is nearer the edge than the side margin (eased: presentation only).
      const Z = CAMERA.zoom;
      const gap = Math.abs(game.players[0].x - game.players[1].x) / UNIT;
      const t = Math.max(0, Math.min(1, (gap - Z.nearGap) / Math.max(1, Z.farGap - Z.nearGap)));
      const wide = W / Z.near + (W / Z.far - W / Z.near) * t; // px of stage in view
      // A fighter high in the air widens the view first (so the one on the ground stays in the picture); only what
      // the widest view still cannot hold lifts the camera.
      const top = Math.max(game.players[0].y, game.players[1].y) / UNIT + CAMERA.jump.headroom;
      const tall = CAMERA.jump.zoomOut ? (GROUND - CAMERA.jump.topMargin) / top : Z.near;
      const wantZ = opts.zoom === false ? 1 : Math.max(Math.min(Z.far, Z.near), Math.min(Z.near, W / wide, W / (gap + 2 * Z.sideMargin), tall));
      cam.z = cam.z ? cam.z + (wantZ - cam.z) * Z.ease : wantZ;
      if (Math.abs(wantZ - cam.z) < 0.0005) cam.z = wantZ;
      // Camera follows the midpoint, held inside the stage.
      const mid = (game.players[0].x + game.players[1].x) / 2 / UNIT;
      const half = world.battle.stage.halfWidth;
      const lim = Math.max(0, half - W / cam.z / 2 + CAMERA.wallMargin);
      cam.x = Math.max(-lim, Math.min(lim, mid));
      // Rise with the highest fighter so jumps and super jumps stay on screen, then settle back.
      const wantY = Math.max(0, top - (GROUND - CAMERA.jump.topMargin) / cam.z);
      cam.y += (wantY - cam.y) * CAMERA.jump.ease;
      // The screen jolt: the world shifts for this drawing only (the HUD stays still), mostly up and down.
      const jk = shake.left > 0 ? (shake.amp * shake.left) / FX.impact.shake.frames * (shake.left % 2 ? 1 : -1) : 0;
      const joltX = -jk * 0.4, joltY = jk;
      cam.x += joltX;
      cam.y += joltY;
      // Everything in the fight is enlarged about the ground line under the middle of the screen; the HUD is not.
      ctx.save();
      ctx.translate(W / 2, GROUND);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-W / 2, -GROUND);
      drawStage(world, opts);
      const impact = impactLeft > 0 && POLISH.impactFrame.on && canTint;
      if (impact) {
        // The impact frame: the stage inverted and drained of colour (or blacked out); the fighters are flat shapes.
        ctx.save();
        if (POLISH.impactFrame.style === 'whiteOnBlack') { ctx.fillStyle = '#000000d8'; ctx.fillRect(0, 0, W, H); } else {
          ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
          ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
      }
      // Super flash: the stage goes dark while the game is frozen; the super's user stays lit.
      const flashing = game.flash > 0;
      if (flashing) {
        ctx.fillStyle = '#05030acc';
        ctx.fillRect(0, 0, W, H);
        const sp = game.players[game.flashBy];
        if (sp) {
          const [fx, fy] = toScreen(sp.x, sp.y + 9000);
          const glow = ctx.createRadialGradient(fx, fy, 10, fx, fy, 160);
          glow.addColorStop(0, '#ffe9a855');
          glow.addColorStop(1, '#ffe9a800');
          ctx.fillStyle = glow;
          ctx.fillRect(fx - 160, fy - 160, 320, 320);
        }
        // Speed lines over the whole screen (their empty middle is where the fighters stand).
        const lines = SLOTS.sheets[SLOTS.flash?.lines];
        if (lines) {
          ctx.save();
          ctx.globalAlpha = lines.alpha ?? 1;
          const k = (W * 1.24) / lines.sprite.frameW, at = Math.floor(game.flash / lines.hold);
          fxOp = opOf(lines, null, null, 'burst'); // FXOPACITY
          drawSheetFrame(null, { ...lines.sprite, scale: k, additive: lines.additive }, at % lines.sprite.count, W / 2, H / 2, 1);
          fxOp = opOf(lines, null, null, 'burst'); // FXOPACITY
          drawSheetFrame(null, { ...lines.sprite, scale: k * 0.58, additive: lines.additive }, (at + 2) % lines.sprite.count, W / 2, H / 2, 1);
          ctx.restore();
        }
      }
      // Whole-screen effects (the super's slash) go behind the fighters: centred, stretched to the screen's width.
      for (const e of effects) {
        if (!e.screen) continue;
        const m = e.motion;
        ctx.save();
        if (m.additive) ctx.globalCompositeOperation = 'lighter';
        fxOp = opOf(m, null, null, 'burst'); // FXOPACITY
        drawSheetFrame(null, { ...m.sprite, scale: (W * 1.04) / m.sprite.frameW }, Math.min(m.sprite.count - 1, Math.floor((e.age - 1) / m.hold)), W / 2, toScreen(e.x, e.y)[1], e.facing);
        ctx.restore();
      }
      // Draw the attacker last so the whole move (wind-up, hit, follow-through) sits in front of the other fighter:
      // 2 = hitbox out, 1 = anywhere in an attack, 0 = anything else. A tie keeps whoever was in front, so nothing flickers.
      const rank = (p) => {
        const st = world.chars[p.id].states[p.state];
        if (!st?.move) return 0;
        return frameOf(world.chars[p.id], p.state, p.frame).hit.length ? 2 : 1;
      };
      const r0 = rank(game.players[0]), r1 = rank(game.players[1]);
      if (r0 !== r1) front = r0 > r1 ? 0 : 1;
      const order = [game.players[1 - front], game.players[front]];
      bodies = game.players.map((q) => bodyRect(q, world)); fxPlain = opts.effectsOpacity === false; // FXOPACITY
      for (const p of order) {
        const def = world.chars[p.id];
        const fr = frameOf(def, p.state, p.frame);
        // Shadow.
        const [shx] = toScreen(p.x, 0);
        if (POLISH.shadow.on && shadowImg) {
          // A soft oval that shrinks and fades as the fighter leaves the ground.
          const S = POLISH.shadow, near = 0.5 + 0.5 * Math.max(0, 1 - p.y / UNIT / S.fadeHeight);
          ctx.globalAlpha = S.alpha * (2 * near - 1) ** 0.7 * 0.75 + S.alpha * 0.25;
          ctx.drawImage(shadowImg, shx - S.width * near, GROUND + cam.y + 3 - S.height * near, S.width * 2 * near, S.height * 2 * near);
          ctx.globalAlpha = 1;
        } else {
          ctx.fillStyle = '#00000066';
          ctx.beginPath();
          ctx.ellipse(shx, GROUND + cam.y + 3, 34, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (flashing && p.id !== game.flashBy) ctx.globalAlpha = 0.45;
        const pal = opts.palettes ? opts.palettes[p.id] : p.id; // palette index (presentation only)
        const T = pfx[p.id];
        // Hit-freeze: while the attacker is frozen on a hit, nothing of his moves (the guardian's bob, an aura's loop).
        if (!(POLISH.hitFreeze.on && p.hitstop > 0 && !p.stun)) T.still = game.frame;
        drawAuras(p, def, T.still, true);
        drawWhile(p, true);
        drawLayers(p, def, fr, true);
        for (const e of effects) if (e.sheet?.behind && e.owner === p.id) drawNamed(e, game);
        const shown = ruleFrame(p, def, artFrame(p, def, timed(p, def, fr).fr), game, world);
        const [nx, ny] = polishOffset(p, T);
        ctx.save();
        ctx.translate(nx, ny);
        if (!drawSprite(p, def, shown, pal, impact ? (POLISH.impactFrame.style === 'whiteOnBlack' ? '#ffffff' : '#000000') : null)) drawPlaceholder(p, def, fr, placeholderColors(def.palettes, pal));
        else if (!impact && p.state.endsWith('_ex') && def.sheets[p.state]?.image === def.sheets[p.state.slice(0, -3)]?.image) {
          // An EX move with no art of its own: the normal animation, brightened.
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = SLOTS.exTint;
          drawSprite(p, def, shown, pal);
          ctx.restore();
        }
        if (!impact && POLISH.rimLight.on && opts.stage?.light) drawRim(p, def, shown, opts.stage.light);
        if (impact) { /* flat shapes only */ } else if (POLISH.hitFlash.on && canTint) {
          if (T.flash > 0) {
            // Just hit: the fighter pushed toward white, harder on heavy hits.
            ctx.save();
            ctx.globalAlpha *= T.flashHeavy ? POLISH.hitFlash.heavyAlpha : POLISH.hitFlash.alpha;
            drawSprite(p, def, shown, pal, '#ffffff');
            ctx.restore();
          }
        } else if (hitFlash[p.id] > 0 && FX.impact.flash.alpha > 0) {
          // Just hit: the fighter drawn again as light for a moment.
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = FX.impact.flash.alpha;
          drawSprite(p, def, shown, pal);
          ctx.restore();
        }
        drawRibbons(def, T);
        drawLantern(p, def, shown);
        drawLayers(p, def, fr, false);
        stretch = [1, 1];
        ctx.restore();
        drawAuras(p, def, T.still, false);
        drawWhile(p, false);
        blockDraw(p); // BLOCKFX
        drawChain(p, def, game.players[1 - p.id]);
        ctx.globalAlpha = 1;
        drawOpponentMarks(p, game.players[1 - p.id], world.chars[1 - p.id], game.frame);
        if (opts.boxes) drawBoxes(p, fr);
        if (opts.labels) {
          const [lx, ly] = toScreen(p.x, p.y + 18500 + p.id * 1600);
          ctx.fillStyle = '#e8e2d4';
          ctx.font = '12px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${p.state} ${p.frame}${p.hitstop ? ` (stop ${p.hitstop})` : ''}${p.stun ? ` stun ${p.stun}` : ''}`, lx, ly);
        }
      }
      drawProjectiles(game, world);
      if (opts.boxes) {
        for (const pr of game.projectiles) {
          const [bx, by, bw, bh] = boxRect(pr, world.chars[pr.owner].projectiles[pr.kind].hitbox[0]);
          ctx.strokeStyle = '#ff3b3b';
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        }
      }
      // Sparks.
      for (const e of effects) {
        const [sx, sy] = toScreen(e.x, e.y);
        if (e.screen) continue; // drawn behind the fighters, above
        if (e.proj) {
          ctx.save();
          if (e.proj.sprite.additive) ctx.globalCompositeOperation = 'lighter';
          fxOp = opOf(e.proj, e.def, nameOf(e.def, e.proj), 'projectile'); // FXOPACITY
          drawSheetFrame(e.def, e.proj.sprite, e.first + heldFrame(e.proj.anim.impact, e.age - 1, false)[0], sx, sy, e.facing, tiltOf(e.proj, e.facing));
          ctx.restore();
          continue;
        }
        if (e.motion) {
          const m = e.motion, n = m.sprite.count;
          const step = Math.floor((e.age - 1) / m.hold);
          const fr = e.follow !== undefined ? step % n : Math.min(n - 1, step);
          ctx.save();
          if (m.additive) ctx.globalCompositeOperation = 'lighter';
          if (m.alpha) ctx.globalAlpha = m.alpha;
          // Dust thins out over its last drawing.
          if (m.fade && fr === n - 1) ctx.globalAlpha = Math.max(0.15, 1 - ((e.age - 1) - (n - 1) * m.hold) / m.hold);
          fxOp = opOf(m, null, null, 'dust'); // FXOPACITY
          drawSheetFrame(null, m.sprite, fr, sx, sy, e.facing);
          ctx.restore();
          continue;
        }
        if (e.spark) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          fxOp = opSpark(e.spark, heldFrame(e.spark.holds, Math.max(0, e.age - 1), false)[0]); // FXOPACITY
          drawSheetFrame(null, e.spark.sprite, heldFrame(e.spark.holds, Math.max(0, e.age - 1), false)[0], sx, sy, e.facing);
          ctx.restore();
          continue;
        }
        if (e.uni !== undefined) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          fxOp = opOf(null, null, null, 'hitSpark'); // FXOPACITY
          drawSheetFrame(null, FX.sheet, e.uni + Math.min(FX.frames - 1, Math.floor((e.age - 1) / FX.hold)), sx, sy, e.facing);
          ctx.restore();
          continue;
        }
        if (e.sheet) {
          if (!(e.sheet.behind && e.owner !== undefined)) drawNamed(e, game); // the ones behind a fighter were drawn with them
          continue;
        }
        const t = e.age / e.life;
        const r = e.size * (0.5 + t);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = e.color;
        ctx.globalAlpha *= opFor(opOf(null, null, null, 'hitSpark'), {}, 0, 0, 1, 0, 0, 0); // FXOPACITY
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath();
        for (let k = 0; k < 8 && !e.labelOnly; k++) {
          const ang = (k / 8) * Math.PI * 2 + e.age * 0.05;
          ctx.moveTo(sx + Math.cos(ang) * r * 0.35, sy + Math.sin(ang) * r * 0.35);
          ctx.lineTo(sx + Math.cos(ang) * r, sy + Math.sin(ang) * r);
        }
        ctx.stroke();
        if (e.text) {
          ctx.fillStyle = e.color;
          ctx.font = '700 16px system-ui';
          ctx.textAlign = 'center';
          ctx.fillText(e.text, sx, sy - e.size - 6 - e.age);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore(); // the zoom ends here
      cam.x -= joltX;
      cam.y -= joltY;
      if (opts.shockwave !== false) shockDraw(); // SHOCKWAVE
      // Combo counter, on the attacker's side: hits, damage, current scaling.
      for (const v of [0, 1]) {
        const s = comboShow[v];
        if (!s || s.c.hits < 1) continue;
        const left = v === 1; // P2 is the victim: P1 attacking, show on the left
        const x = left ? 130 : W - 130;
        ctx.textAlign = left ? 'left' : 'right';
        ctx.globalAlpha = s.live ? 1 : Math.min(1, s.hold / 30);
        ctx.fillStyle = s.live ? '#ffd36b' : '#a99fb8';
        ctx.font = '800 34px system-ui';
        ctx.fillText(`${s.c.hits} HIT${s.c.hits > 1 ? 'S' : ''}`, x, 96);
        ctx.font = '600 15px system-ui';
        ctx.fillStyle = '#e8e2d4';
        ctx.fillText(`${s.c.damage} damage  ·  scaling ${Math.round(s.c.scale / 100)}%  ·  ${s.c.time}f`, x, 118);
        ctx.globalAlpha = 1;
      }
      if (opts.hud !== false) hud.draw(game, world, H);
    },
  };
}
