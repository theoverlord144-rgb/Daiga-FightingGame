// Drawing helpers shared by the menu screens.
import { placeholderColors } from '../../render/palette.js';

export const FONT = 'system-ui, sans-serif';
export const INK = '#f2ecdf';
export const DIM = '#8f86a3';
export const GOLD = '#ffd36b';

/** A vertical menu. items: [{ label, value? }] or plain strings; the selected one is highlighted. */
export function drawMenu(ctx, items, index, x, y, { width = 320, gap = 44, align = 'center' } = {}) {
  items.forEach((item, i) => {
    const it = typeof item === 'string' ? { label: item } : item;
    const yy = y + i * gap;
    const on = i === index;
    if (on) {
      ctx.fillStyle = '#ffd36b22';
      ctx.fillRect(x - width / 2, yy - 28, width, 40);
      ctx.fillStyle = GOLD;
      ctx.fillRect(x - width / 2, yy - 28, 4, 40);
    }
    ctx.textAlign = align;
    ctx.font = `${on ? 800 : 600} 22px ${FONT}`;
    ctx.fillStyle = on ? GOLD : INK;
    if (it.value !== undefined) {
      ctx.textAlign = 'left';
      ctx.fillText(it.label, x - width / 2 + 20, yy);
      ctx.textAlign = 'right';
      ctx.fillStyle = on ? INK : DIM;
      ctx.fillText(on ? `◀ ${it.value} ▶` : it.value, x + width / 2 - 16, yy);
    } else ctx.fillText(it.label, x, yy);
  });
}

/** A darkened panel behind menus drawn over a fight. */
export function shade(ctx, W, H, alpha = 0.6) {
  ctx.fillStyle = `rgba(8, 5, 12, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

export function title(ctx, text, x, y, size = 40, color = INK) {
  ctx.textAlign = 'center';
  ctx.font = `900 ${size}px ${FONT}`;
  ctx.lineWidth = Math.max(4, size / 8);
  ctx.strokeStyle = '#0b0910';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** A character portrait: the placeholder figure in a palette (until characters have art). */
export function drawPortrait(ctx, def, pal, x, y, scale = 1, facing = 1) {
  const c = placeholderColors(def.palettes, pal);
  const w = 52 * scale;
  const h = 150 * scale;
  const r = 17 * scale;
  ctx.fillStyle = c.body;
  ctx.fillRect(x - w / 2, y - h + r * 2, w, h - r * 2);
  ctx.beginPath();
  ctx.arc(x, y - h + r, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = c.dark;
  ctx.fillRect(x + facing * r * 0.4 - 3 * scale, y - h + r - 3 * scale, 6 * scale, 6 * scale);
  ctx.strokeStyle = c.limb;
  ctx.lineWidth = 10 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y - h * 0.68);
  ctx.lineTo(x + facing * w * 0.9, y - h * 0.62);
  ctx.stroke();
}

/** Footer hint line. */
export function hint(ctx, W, H, text) {
  ctx.textAlign = 'center';
  ctx.font = `13px ${FONT}`;
  ctx.fillStyle = DIM;
  ctx.fillText(text, W / 2, H - 16);
}
