// Draws a fight: stage floor, fighters (sprites when they exist, a placeholder figure until then), and the
// optional box view. Reads the game state and the character definitions; never changes anything.

import { UNIT } from '../core/fixed.js';
import { frameOf } from '../core/character.js';
import { createHud } from './hud.js';
import { createStageRenderer } from './stage-renderer.js';
import { paletteSheet, placeholderColors } from './palette.js';

// Game-ready sheets only (data/characters/<id>/sheets/): raw art dropped elsewhere in a character's folder is not
// shipped with the game.
const SPRITE_URLS = import.meta.glob('../../data/characters/*/sheets/*.{png,webp}', { eager: true, query: '?url', import: 'default' });
const images = new Map();

function spriteImage(charId, path) {
  const key = Object.keys(SPRITE_URLS).find((k) => k.endsWith(`/characters/${charId}/${path}`));
  if (!key) return null;
  let img = images.get(key);
  if (!img) {
    img = new Image();
    img.src = SPRITE_URLS[key];
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
  burst: { color: '#7fe0ff', size: 70, life: 26, text: 'BURST' },
  superflash: { color: '#ffffff', size: 80, life: 22, text: '' },
};

export function createFightRenderer(ctx, W, H) {
  const GROUND = H - 70;
  const cam = { x: 0, y: 0 };
  const effects = []; // visual only: spawned from the game's cues, never fed back into the game
  let lastFrame = -1;
  const comboShow = [null, null]; // per victim: { combo, hold } - keeps the finished combo on screen a moment
  const hud = createHud(ctx, W);
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
    const img = spriteImage(def.id, sheet.image);
    if (!img) return false;
    const cols = sheet.columns ?? 1;
    const fw = sheet.frameW ?? img.naturalWidth / cols;
    const fh = sheet.frameH ?? img.naturalHeight / (sheet.rows ?? 1);
    const k = sheet.scale ?? 1;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.scale(facing * k, k);
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
    const [hx, hy] = toScreen(p.x + p.facing * (ch.hand?.[0] ?? 40) * UNIT, p.y + (ch.hand?.[1] ?? 100) * UNIT);
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

  return {
    cam,
    toScreen,
    /** opts: { boxes: bool, labels: bool } */
    draw(game, world, opts = {}) {
      if (game.frame !== lastFrame) {
        // Cues live for one game frame: pick them up once.
        for (const c of game.cues) {
          if (!SPARK[c.type]) continue;
          // A move with its own hit effect (art) shows that instead of the generic spark.
          const fx = (c.type === 'hit' || c.type === 'counter') && world.chars[c.p]?.states[c.move]?.move?.hitFx;
          if (fx) effects.push({ sheet: fx, def: world.chars[c.p], x: c.x, y: c.y, age: 0, life: fx.sprite.count * (fx.hold ?? 3) });
          if (!fx || c.type === 'counter') effects.push({ ...SPARK[c.type], x: c.x, y: c.y, age: 0 });
        }
        for (const e of effects) e.age++;
        for (let i = effects.length - 1; i >= 0; i--) if (effects[i].age > effects[i].life) effects.splice(i, 1);
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
      // Draw the fighter who is attacking last so their limb sits on top.
      const order = [...game.players].sort((a, b) => (frameOf(world.chars[a.id], a.state, a.frame).hit.length ? 1 : 0) - (frameOf(world.chars[b.id], b.state, b.frame).hit.length ? 1 : 0));
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
        if (!drawSprite(p, def, fr, pal)) drawPlaceholder(p, def, fr, placeholderColors(def.palettes, pal));
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
      // Sparks.
      for (const e of effects) {
        const [sx, sy] = toScreen(e.x, e.y);
        if (e.sheet) {
          drawSheetFrame(e.def, e.sheet.sprite, Math.min(e.sheet.sprite.count - 1, Math.floor(e.age / (e.sheet.hold ?? 3))), sx, sy, 1);
          continue;
        }
        const t = e.age / e.life;
        const r = e.size * (0.5 + t);
        ctx.globalAlpha = 1 - t;
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath();
        for (let k = 0; k < 8; k++) {
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
