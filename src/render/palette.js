// Palette swaps. A sprite sheet is drawn in its character's base colours only (an indexed palette): each pixel is
// one of palettes.base, or transparent. An alternate colour set swaps base colour i for its colour i, pixel by
// pixel, by exact match. Pure functions plus a browser cache; the game never sees colours.

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Recolour RGBA pixel data in place. Pixels that are exactly base[i] become colors[i] (alpha kept).
 * Returns how many opaque pixels matched no base colour (a sheet that isn't in its palette: worth a warning).
 */
export function recolorPixels(data, base, colors) {
  const map = new Map();
  base.forEach((b, i) => {
    const [r, g, bl] = hexToRgb(b);
    map.set((r << 16) | (g << 8) | bl, hexToRgb(colors[i]));
  });
  let stray = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const to = map.get((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    if (!to) { stray++; continue; }
    data[i] = to[0];
    data[i + 1] = to[1];
    data[i + 2] = to[2];
  }
  return stray;
}

const cache = new WeakMap(); // image -> Map(paletteKey -> canvas)

/** The sheet recoloured to a palette (made once, then cached). Palette 0 is the sheet itself. */
export function paletteSheet(img, palettes, index) {
  if (!index) return img;
  const set = palettes.colors[index % palettes.colors.length];
  let perImg = cache.get(img);
  if (!perImg) { perImg = new Map(); cache.set(img, perImg); }
  const key = set.colors.join();
  let c = perImg.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const stray = recolorPixels(d.data, palettes.base, set.colors);
    if (stray) console.warn(`palette: ${stray} pixels in a sheet are not in the character's base palette (left as they are)`);
    x.putImageData(d, 0, 0);
    perImg.set(key, c);
  }
  return c;
}

/** The placeholder figure's colours for a palette. */
export function placeholderColors(palettes, index) {
  const set = palettes.colors[index % palettes.colors.length].colors;
  return { body: set[0], limb: set[1] ?? set[0], dark: set[2] ?? set[0] };
}
