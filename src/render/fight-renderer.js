// Draws a fight: stage floor, fighters (sprites when they exist, a placeholder figure until then), and the
// optional box view. Reads the game state and the character definitions; never changes anything.

import { UNIT } from '../core/fixed.js';
import { frameOf } from '../core/character.js';

const SPRITE_URLS = import.meta.glob('../../data/characters/*/**/*.{png,webp}', { eager: true, query: '?url', import: 'default' });
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

const COLORS = [
  { body: '#d9534f', limb: '#ff8a7a', dark: '#7a2622' },
  { body: '#4f8fd9', limb: '#8ac2ff', dark: '#223f7a' },
];

export function createFightRenderer(ctx, W, H) {
  const GROUND = H - 70;
  const cam = { x: 0 };

  const toScreen = (x, y) => [W / 2 + (x / UNIT - cam.x), GROUND - y / UNIT];

  /** A character-space box [x, y, w, h] (units) to a screen rect, flipped by facing. */
  function boxRect(p, b) {
    const [bx, by, bw, bh] = b;
    const left = p.facing > 0 ? p.x + bx : p.x - bx - bw;
    const [sx, sy] = toScreen(left, p.y + by + bh);
    return [sx, sy, bw / UNIT, bh / UNIT];
  }

  function drawStage(world) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b1726');
    g.addColorStop(1, '#0d0b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#231e2e';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = '#3a3347';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();
    // Floor marks every 100 px, so movement reads clearly.
    ctx.fillStyle = '#2f2839';
    const half = world.battle.stage.halfWidth;
    for (let x = -half; x <= half; x += 100) {
      const [sx] = toScreen(x * UNIT, 0);
      ctx.fillRect(sx - 1, GROUND + 2, 2, 10);
    }
    // Walls.
    ctx.fillStyle = '#3a3347';
    for (const s of [-1, 1]) {
      const [sx] = toScreen(s * half * UNIT, 0);
      ctx.fillRect(sx - (s < 0 ? 6 : 0), 0, 6, GROUND);
    }
  }

  function drawPlaceholder(p, def, fr, col) {
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

  function drawSprite(p, def, fr) {
    const s = fr.sprite;
    if (!s) return false;
    const sheet = def.sheets[s.sheet];
    if (!sheet) return false;
    const img = spriteImage(def.id, sheet.image);
    if (!img) return false;
    const fw = sheet.frameW ?? img.naturalWidth / sheet.columns;
    const fh = sheet.frameH ?? img.naturalHeight / sheet.rows;
    const ox = sheet.originX ?? fw / 2;
    const oy = sheet.originY ?? fh;
    const col = s.index % sheet.columns;
    const row = Math.floor(s.index / sheet.columns);
    const [sx, sy] = toScreen(p.x, p.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(p.facing, 1);
    ctx.drawImage(img, col * fw, row * fh, fw, fh, -ox, -oy, fw, fh);
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
      // Camera follows the midpoint, held inside the stage.
      const mid = (game.players[0].x + game.players[1].x) / 2 / UNIT;
      const half = world.battle.stage.halfWidth;
      const lim = Math.max(0, half - W / 2 + 20);
      cam.x = Math.max(-lim, Math.min(lim, mid));
      drawStage(world);
      // Draw the fighter who is attacking last so their limb sits on top.
      const order = [...game.players].sort((a, b) => (frameOf(world.chars[a.id], a.state, a.frame).hit.length ? 1 : 0) - (frameOf(world.chars[b.id], b.state, b.frame).hit.length ? 1 : 0));
      for (const p of order) {
        const def = world.chars[p.id];
        const fr = frameOf(def, p.state, p.frame);
        // Shadow.
        const [shx] = toScreen(p.x, 0);
        ctx.fillStyle = '#00000066';
        ctx.beginPath();
        ctx.ellipse(shx, GROUND + 3, 34, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        if (!drawSprite(p, def, fr)) drawPlaceholder(p, def, fr, COLORS[p.id]);
        if (opts.boxes) drawBoxes(p, fr);
        if (opts.labels) {
          const [lx, ly] = toScreen(p.x, p.y + 18500);
          ctx.fillStyle = '#e8e2d4';
          ctx.font = '12px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${p.state} ${p.frame}`, lx, ly);
        }
      }
    },
  };
}
