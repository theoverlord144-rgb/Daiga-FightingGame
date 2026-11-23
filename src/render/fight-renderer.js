// Draws a fight: stage floor, fighters (sprites when they exist, a placeholder figure until then), and the
// optional box view. Reads the game state and the character definitions; never changes anything.

import { UNIT } from '../core/fixed.js';
import { frameOf } from '../core/character.js';
import { createHud } from './hud.js';
import { createStageRenderer } from './stage-renderer.js';
import { paletteSheet, placeholderColors } from './palette.js';
import FX from '../../data/system/effects.json';

// Game-ready sheets only (data/characters/<id>/sheets/): raw art dropped elsewhere in a character's folder is not
// shipped with the game.
const SPRITE_URLS = import.meta.glob('../../data/characters/*/sheets/*.{png,webp}', { eager: true, query: '?url', import: 'default' });
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
  const GROUND = H - 70;
  const cam = { x: 0, y: 0 };
  const effects = []; // visual only: spawned from the game's cues, never fed back into the game
  let lastFrame = -1;
  let front = 1; // which fighter is drawn in front (presentation only; P2 until someone attacks)
  const comboShow = [null, null]; // per victim: { combo, hold } - keeps the finished combo on screen a moment
  const hud = createHud(ctx, W, (name) => spriteImage(null, name));
  let stageR = null; // { id, r }: the stage renderer, made when a stage is first drawn

  const toScreen = (x, y) => [W / 2 + (x / UNIT - cam.x), GROUND - y / UNIT + cam.y];

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
      stageR.r.draw(ctx, cam);
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

  /** One frame of a sheet (effects, marks, chain pieces: no palette), centred on its origin at screen x, y. */
  function drawSheetFrame(def, sheet, index, x, y, facing, angle = 0) {
    const img = spriteImage(def ? def.id : null, sheet.image);
    if (!img) return false;
    const cols = sheet.columns ?? 1;
    const fw = sheet.frameW ?? img.naturalWidth / cols;
    const fh = sheet.frameH ?? img.naturalHeight / (sheet.rows ?? 1);
    const k = sheet.scale ?? 1;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.scale(facing * k, k);
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
    if (!fr.hurt.length && p.y === 0 && (p.state === 'knockdown' || p.state === 'koDown')) {
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

  function drawSprite(p, def, fr, pal) {
    const s = fr.sprite;
    if (!s) return false;
    const sheet = def.sheets[s.sheet];
    if (!sheet) return false;
    const raw = spriteImage(def.id, sheet.image);
    if (!raw) return false;
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
    ctx.scale(p.facing * k, k);
    ctx.drawImage(img, col * fw, row * fh, fw, fh, -ox, -oy, fw, fh); // img: the sheet in this palette
    ctx.restore();
    return true;
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
      drawSheetFrame(def, e.sprite, Math.floor((at2 * e.sprite.count) / st.duration) % e.sprite.count, x, y, p.facing);
    }
  }

  /**
   * Auras (a mechanic var with `aura`, e.g. an install): named effects looping on the fighter while the var is above
   * 0, each drawing held the effect's `hold` frames, fading out over the last second. An effect may `bob` up and
   * down ({ px, period }) and be see-through (`alpha`).
   */
  function drawAuras(p, def, frame, behind) {
    for (const [k, v] of Object.entries(def.mechanic?.vars || {})) {
      const n = p.vars?.[k];
      if (!v.aura || !(n > 0)) continue;
      for (const l of v.aura) {
        if (!!l.behind !== behind) continue;
        const e = def.effects[l.effect];
        if (!e) continue;
        const at = e.at ?? [0, 0];
        const bob = e.bob ? Math.sin((frame * Math.PI * 2) / e.bob.period) * e.bob.px : 0;
        const [x, y] = toScreen(p.x + p.facing * at[0] * UNIT, p.y + (at[1] + bob) * UNIT);
        ctx.save();
        ctx.globalAlpha *= Math.min(1, n / 60) * (e.alpha ?? 1);
        drawSheetFrame(def, e.sprite, Math.floor(frame / (e.hold ?? 4)) % e.sprite.count, x, y, p.facing);
        ctx.restore();
      }
    }
  }

  /** The frame to draw: a mechanic var with `art` swaps a state's drawings for another state's while it is above 0. */
  function artFrame(p, def, fr) {
    // An absorbed hit shows the vow_absorb drawing for a moment, if the character has one.
    if (p.state === 'vow_hold' && absorbUntil[p.id] > collected && def.sheets.vow_absorb) {
      const st = def.states.vow_absorb;
      return { ...fr, sprite: st.frames[Math.min(st.frames.length - 1, Math.max(0, collected - absorbUntil[p.id] + SLOTS.absorbPoseFrames))].sprite };
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

  /** Live projectiles (game state) and the ones that just ended (their impact frames, where they vanished). */
  function drawProjectiles(game, world) {
    for (const pr of game.projectiles) {
      const def = world.chars[pr.owner];
      const d = def.projectiles[pr.kind];
      if (!d?.sprite) continue;
      const rel = d.anim?.release ?? [], loop = d.anim?.loop ?? [1];
      const relLen = rel.reduce((a, b) => a + b, 0);
      const index = pr.age < relLen ? heldFrame(rel, pr.age, false)[0] : rel.length + heldFrame(loop, pr.age - relLen, true)[0];
      const [x, y] = toScreen(pr.x, pr.y);
      ctx.save();
      if (d.sprite.additive) ctx.globalCompositeOperation = 'lighter';
      drawSheetFrame(def, d.sprite, index, x, y, pr.facing);
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
  // The universal systems' effect slots (data/system/effects.json "slots").
  const SLOTS = FX.slots || { sheets: {}, absorbPoseFrames: 8, exTint: 0.45 };
  const absorbUntil = [-1, -1]; // drawing only: the game frame until which a fighter shows the vow_absorb drawing
  function slotFx(name, x, y, facing = 1) {
    const s = SLOTS.sheets[name];
    if (s) effects.push({ motion: s, x, y, facing, age: 0, life: s.sprite.count * s.hold });
  }
  const bodyOf = (p) => p.y + FX.motion.bodyY * UNIT;
  function slotCue(c, game) {
    const p = game.players[c.p];
    if (!p) return;
    if (c.type === 'absorb') {
      const d = game.players[1 - c.p];
      absorbUntil[d.id] = game.frame + SLOTS.absorbPoseFrames;
      slotFx('vow_guard', d.x, bodyOf(d), d.facing);
    } else if ((c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && String(c.move).startsWith('vow_strike')) slotFx('vow_strike', c.x, c.y, p.facing);
    else if (c.type === 'burst') slotFx('absolve_burst', p.x, bodyOf(p), p.facing);
    else if (c.type === 'repel') slotFx('repel_wave', p.x, bodyOf(p), p.facing);
    else if (c.type === 'perfect') slotFx('perfect_flash', p.x, bodyOf(p), p.facing);
    if (c.type === 'witness') slotFx('witness_flash', c.x, c.y, p.facing);
  }
  const lastVars = [{}, {}]; // drawing only: last seen mechanic vars, to notice a mark running out
  const lastMove = [null, null]; // drawing only: last seen state and x, to notice a dash starting or a landing
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
  function collect(game, world) {
    if (game.frame === collected) return;
    collected = game.frame;
    hud.notice(game);
    for (const c of game.cues) {
      slotCue(c, game);
      const named = c.type === 'fx' && world.chars[c.p]?.effects?.[c.name];
      if (named) {
        const at = named.at ?? [0, 0];
        effects.push({ sheet: named, def: world.chars[c.p], x: c.x + c.facing * at[0] * UNIT, y: c.y + at[1] * UNIT, facing: c.facing, age: 0, life: named.sprite.count * (named.hold ?? 3) });
      }
      if (c.type === 'projectileEnd') {
        // The projectile's impact frames play where it hit or vanished.
        const d = world.chars[c.p]?.projectiles[c.name];
        if (d?.sprite && d.anim?.impact) {
          const first = (d.anim.release?.length ?? 0) + (d.anim.loop?.length ?? 0);
          effects.push({ proj: d, def: world.chars[c.p], first, x: c.x, y: c.y, facing: c.facing, age: 0, life: d.anim.impact.reduce((a, b) => a + b, 0) - 1 });
        }
      }
      if (!SPARK[c.type]) continue;
      // A move (or projectile) with its own hit effect (art) shows that instead of the generic spark.
      const src = world.chars[c.p];
      const fx = (c.type === 'hit' || c.type === 'counter' || c.type === 'witness') && (src?.states[c.move]?.move ?? src?.projectiles[c.move]?.move)?.hitFx;
      if (fx) effects.push({ sheet: fx, def: world.chars[c.p], x: c.x, y: c.y, age: 0, life: fx.sprite.count * (fx.hold ?? 3) });
      // The universal sheet: a hit spark sized by the move's base damage (a counter hit goes one size up), or the
      // block flash, which curves toward the attacker.
      const isHit = c.type === 'hit' || c.type === 'counter' || c.type === 'witness';
      let uni = false;
      if ((isHit && !fx) || c.type === 'block') {
        let row;
        let facing = game.players[c.p].facing;
        if (isHit) {
          const base = (src?.states[c.move]?.move ?? src?.projectiles[c.move]?.move)?.damage ?? 0;
          let i = FX.hit.findIndex((h) => h.below === undefined || base < h.below);
          if (i < 0) i = FX.hit.length - 1;
          if (c.type === 'counter' || c.type === 'witness') i = Math.min(FX.hit.length - 1, i + 1);
          row = FX.hit[i].row;
        } else {
          row = FX.block.row;
          facing = game.players[1 - c.p].facing;
        }
        effects.push({ uni: row * FX.sheet.columns, x: c.x, y: c.y, facing, age: 0, life: FX.frames * FX.hold });
        uni = true;
      }
      // The drawn-in-code spark stays for what has no art (clash, armor, throw, tech, bounces, burst), and as the
      // COUNTER label over the art.
      if (!uni && !fx) effects.push({ ...SPARK[c.type], x: c.x, y: c.y, age: 0 });
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
    for (const p of game.players) {
      const was = lastMove[p.id];
      if (was && was.state !== p.state && p.state.endsWith('_ex')) slotFx('ex_flash', p.x, bodyOf(p), p.facing);
      // The guard aura plays again and again while Vow is held.
      const aura = SLOTS.sheets.vow_guard;
      if (aura && p.state === 'vow_hold' && p.stateTime % (aura.sprite.count * aura.hold) === 0) slotFx('vow_guard', p.x, bodyOf(p), p.facing);
      if (was && was.state !== p.state) {
        const dx = p.x - was.x;
        if (FX.motion.leave[was.state]) motionFx(FX.motion.leave[was.state], p, dx);
        if (FX.motion.enter[p.state]) motionFx(FX.motion.enter[p.state], p, dx);
      }
      lastMove[p.id] = { state: p.state, x: p.x };
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
    toScreen,
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
      // Camera follows the midpoint, held inside the stage.
      const mid = (game.players[0].x + game.players[1].x) / 2 / UNIT;
      const half = world.battle.stage.halfWidth;
      const lim = Math.max(0, half - W / 2 + 20);
      cam.x = Math.max(-lim, Math.min(lim, mid));
      // Rise with the highest fighter so super jumps stay on screen (eased: presentation only).
      const top = Math.max(game.players[0].y, game.players[1].y) / UNIT + 200;
      const wantY = Math.max(0, top - (GROUND - 40));
      cam.y += (wantY - cam.y) * 0.25;
      drawStage(world, opts);
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
      for (const p of order) {
        const def = world.chars[p.id];
        const fr = frameOf(def, p.state, p.frame);
        // Shadow.
        const [shx] = toScreen(p.x, 0);
        ctx.fillStyle = '#00000066';
        ctx.beginPath();
        ctx.ellipse(shx, GROUND + cam.y + 3, 34, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (flashing && p.id !== game.flashBy) ctx.globalAlpha = 0.45;
        const pal = opts.palettes ? opts.palettes[p.id] : p.id; // palette index (presentation only)
        drawAuras(p, def, game.frame, true);
        drawLayers(p, def, fr, true);
        const shown = artFrame(p, def, fr);
        if (!drawSprite(p, def, shown, pal)) drawPlaceholder(p, def, fr, placeholderColors(def.palettes, pal));
        else if (p.state.endsWith('_ex') && def.sheets[p.state]?.image === def.sheets[p.state.slice(0, -3)]?.image) {
          // An EX move with no art of its own: the normal animation, brightened.
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = SLOTS.exTint;
          drawSprite(p, def, shown, pal);
          ctx.restore();
        }
        drawLayers(p, def, fr, false);
        drawAuras(p, def, game.frame, false);
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
        if (e.proj) {
          ctx.save();
          if (e.proj.sprite.additive) ctx.globalCompositeOperation = 'lighter';
          drawSheetFrame(e.def, e.proj.sprite, e.first + heldFrame(e.proj.anim.impact, e.age - 1, false)[0], sx, sy, e.facing);
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
          drawSheetFrame(null, m.sprite, fr, sx, sy, e.facing);
          ctx.restore();
          continue;
        }
        if (e.uni !== undefined) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          drawSheetFrame(null, FX.sheet, e.uni + Math.min(FX.frames - 1, Math.floor((e.age - 1) / FX.hold)), sx, sy, e.facing);
          ctx.restore();
          continue;
        }
        if (e.sheet) {
          drawSheetFrame(e.def, e.sheet.sprite, Math.min(e.sheet.sprite.count - 1, Math.floor(e.age / (e.sheet.hold ?? 3))), sx, sy, e.facing ?? 1);
          continue;
        }
        const t = e.age / e.life;
        const r = e.size * (0.5 + t);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = e.color;
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
