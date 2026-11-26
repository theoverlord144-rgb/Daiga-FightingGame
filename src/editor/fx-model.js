// The editor's FX page: which effects a character owns, and where each one's size, rotation, opacity and colour are
// written in the character's file. Nothing here draws, and nothing here touches the rules: these are drawing-only
// settings of a sheet.
//
//   size      sprite.scale      (1 = the sheet's own pixels)
//   rotation  sprite.angle      degrees, clockwise when facing right (mirrored when facing left)
//   colour    sprite.tint       "#rrggbb": the drawing multiplied by that colour; absent = as painted
//   opacity   an effect or a projectile: art.opacity[<name>] (or the entry's own "opacity" when it has one), else
//             the system's class default; a burst projectile's own sheet: sprite.opacity; a burst layer (fire,
//             smoke): the layer's "opacity".
// In the game an effect's opacity is further lowered while it covers a fighter, and multiplied by the player's
// effects setting; what is edited here is the effect's own number.

const LAYERS = ['fire', 'smoke'];

/**
 * Every effect in the file that has a sheet: [{ id, label, kind, name, layer }].
 *   kind: 'effect' (a named one-shot or aura) | 'projectile' | 'burst' (a burst projectile's own sheet) | 'layer'
 */
export function fxEntries(raw) {
  const out = [];
  for (const [name, e] of Object.entries(raw.effects ?? {})) if (e?.sprite) out.push({ id: `fx:${name}`, label: name, kind: 'effect', name });
  for (const [name, p] of Object.entries(raw.projectiles ?? {})) {
    if (!p?.sprite) continue;
    const burst = !!(p.burst && p.burstArt);
    out.push({ id: `proj:${name}`, label: name, kind: burst ? 'burst' : 'projectile', name });
    if (burst) for (const layer of LAYERS) if (p.burstArt[layer]?.sprite) out.push({ id: `proj:${name}:${layer}`, label: `${name} · ${layer}`, kind: 'layer', name, layer });
  }
  return out;
}

export const fxEntry = (raw, id) => fxEntries(raw).find((e) => e.id === id) ?? null;

/** The object in the file that holds an entry (the effect, the projectile, or the burst layer). */
function holder(raw, entry) {
  if (entry.kind === 'effect') return raw.effects[entry.name];
  const p = raw.projectiles[entry.name];
  return entry.kind === 'layer' ? p.burstArt[entry.layer] : p;
}
export const spriteOf = (raw, entry) => holder(raw, entry).sprite;

export const FX_FIELDS = [
  { key: 'scale', label: 'Size', min: 0.05, max: 6, step: 0.05, big: 0.25, digits: 3, help: 'How big the sheet is drawn. 1 = its own pixels; most sheets are cut at double size and drawn at 0.5.' },
  { key: 'angle', label: 'Rotation', unit: '°', min: -180, max: 180, step: 5, big: 15, digits: 0, help: 'Degrees, clockwise when he faces right (it mirrors when he faces left). 0 = as painted.' },
  { key: 'opacity', label: 'Opacity', min: 0, max: 1, step: 0.05, big: 0.2, digits: 2, help: '1 = solid, 0 = invisible. In the game it also drops a little while the effect covers a fighter.' },
  { key: 'tint', label: 'Colour', type: 'colour', help: 'The drawing multiplied by a colour. White and light effects take it cleanly; a painted one gets darker. NONE = as painted.' },
  { key: 'tint.r', label: 'Red', min: 0, max: 255, step: 5, big: 25, digits: 0, colour: 0, help: 'The red part of the colour (255 = leave the red as painted).' },
  { key: 'tint.g', label: 'Green', min: 0, max: 255, step: 5, big: 25, digits: 0, colour: 1, help: 'The green part of the colour.' },
  { key: 'tint.b', label: 'Blue', min: 0, max: 255, step: 5, big: 25, digits: 0, colour: 2, help: 'The blue part of the colour.' },
];
export const fxField = (key) => FX_FIELDS.find((f) => f.key === key);

export const SWATCHES = [null, '#ffffff', '#ff4040', '#ff9a30', '#ffd36b', '#6be06b', '#40e0d0', '#5aa0ff', '#a070ff', '#ff70c0'];

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
export const rgbOf = (colour) => (/^#[0-9a-f]{6}$/i.test(colour ?? '') ? [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16)) : [255, 255, 255]);
export const hexOf = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** The class an entry's opacity falls back to (data/system/effects.json "opacity.classes"). */
const classOf = (raw, entry) => (entry.kind === 'effect' ? 'burst' : raw.projectiles[entry.name].zone ? 'zone' : 'projectile');

/**
 * A setting as it stands: { value, own } (own = written in the file, not a default).
 * classes: the system's opacity classes ({ burst: 0.8, projectile: 0.85, ... }).
 */
export function readFx(raw, entry, key, classes = {}) {
  const h = holder(raw, entry), s = h.sprite;
  if (key === 'scale') return { value: s.scale ?? 1, own: s.scale !== undefined };
  if (key === 'angle') return { value: s.angle ?? 0, own: s.angle !== undefined };
  if (key === 'tint') return { value: s.tint ?? null, own: s.tint !== undefined };
  if (key.startsWith('tint.')) return { value: rgbOf(s.tint)[fxField(key).colour], own: s.tint !== undefined };
  if (key === 'opacity') {
    if (entry.kind === 'layer') return { value: h.opacity ?? 1, own: h.opacity !== undefined };
    if (entry.kind === 'burst') return { value: s.opacity ?? 1, own: s.opacity !== undefined };
    const named = raw.art?.opacity?.[entry.name];
    if (h.opacity !== undefined) return { value: h.opacity, own: true };
    if (named !== undefined) return { value: named, own: true };
    return { value: classes[classOf(raw, entry)] ?? 1, own: false };
  }
  throw new Error(`${key} is not an effect setting`);
}

const round = (v, digits) => Number(v.toFixed(digits));

/** Write a setting into `raw`. */
export function writeFx(raw, entry, key, value) {
  const f = fxField(key);
  if (!f) throw new Error(`${key} is not an effect setting`);
  const h = holder(raw, entry), s = h.sprite;
  if (key === 'tint') {
    if (value === null) delete s.tint;
    else if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('A colour is written #rrggbb');
    else s.tint = value.toLowerCase();
    return;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${f.label} needs a number`);
  const v = round(Math.max(f.min, Math.min(f.max, value)), f.digits);
  if (key.startsWith('tint.')) {
    const rgb = rgbOf(s.tint);
    rgb[f.colour] = v;
    s.tint = hexOf(rgb);
    return;
  }
  if (key === 'scale') { s.scale = v; return; }
  if (key === 'angle') { if (v === 0) delete s.angle; else s.angle = v; return; }
  // opacity
  if (entry.kind === 'layer') h.opacity = v;
  else if (entry.kind === 'burst') { if (v === 1) delete s.opacity; else s.opacity = v; }
  else if (h.opacity !== undefined) h.opacity = v;
  else {
    raw.art = raw.art ?? {};
    raw.art.opacity = raw.art.opacity ?? {};
    raw.art.opacity[entry.name] = v;
  }
}

/** Back to the default: the setting is taken out of the file. Size has no default (the cutter writes it). */
export function resetFx(raw, entry, key) {
  const h = holder(raw, entry), s = h.sprite;
  if (key === 'scale') throw new Error('Size has no default: every sheet says how big it is drawn.');
  if (key === 'angle') { delete s.angle; return; }
  if (key === 'tint' || key.startsWith('tint.')) { delete s.tint; return; }
  if (key === 'opacity') {
    if (entry.kind === 'layer') delete h.opacity;
    else if (entry.kind === 'burst') delete s.opacity;
    else { delete h.opacity; if (raw.art?.opacity) delete raw.art.opacity[entry.name]; }
    return;
  }
  throw new Error(`${key} is not an effect setting`);
}

export function nudgeFx(raw, entry, key, dir, big, classes) {
  const f = fxField(key);
  if (f.type === 'colour') {
    const at = SWATCHES.indexOf(readFx(raw, entry, 'tint', classes).value);
    writeFx(raw, entry, 'tint', SWATCHES[(Math.max(0, at) + dir + SWATCHES.length) % SWATCHES.length]);
    return;
  }
  writeFx(raw, entry, key, readFx(raw, entry, key, classes).value + dir * (big ? f.big : f.step));
}

export function showFx(key, value) {
  const f = fxField(key);
  if (f.type === 'colour') return value ?? 'none';
  return `${round(value, f.digits)}${f.unit ?? ''}`;
}

/**
 * How an entry plays, for the preview: { seq: [[drawing index, frames held, extra size], ...], at: [x, y] px from
 * the fighter's feet }. The extra size is what the game applies on top of the sheet's own (burstArt.scale on a
 * burst's layers and ring).
 */
export function fxPlayback(raw, entry) {
  const h = holder(raw, entry), s = h.sprite;
  const count = s.count ?? (s.columns ?? 1) * (s.rows ?? 1);
  let next = 0;
  const run = (holds, size = 1) => (holds ?? []).map((hold) => [next++, hold, size]);
  const done = (seq, at) => ({ seq: seq.filter(([index]) => index < count), at });
  if (entry.kind === 'effect') return done(run(h.holds ?? Array(count).fill(h.hold ?? 3)), h.at ?? [0, 0]);
  const p = raw.projectiles[entry.name];
  const at = p.spawn ?? [0, 0];
  if (entry.kind === 'layer') return done(run(h.holds ?? Array(count).fill(3), p.burstArt.scale ?? 1), at);
  if (entry.kind === 'burst') {
    const A = p.burstArt;
    const start = run(A.start), loop = run(A.fuseLoop), collapse = run(A.collapse), ring = run(A.burst, A.scale ?? 1);
    return done([...start, ...loop, ...loop, ...loop, ...collapse, ...ring], at); // the waiting loop three times
  }
  const anim = p.anim ?? {};
  const release = run(anim.release), loop = run(anim.loop ?? [3]), impact = run(anim.impact);
  return done([...release, ...loop, ...loop, ...impact], at);
}

/** The drawing shown at frame t of a looping preview: [index, extra size], with a short gap before it starts again. */
export function fxFrameAt(play, t, gap = 12) {
  const total = play.seq.reduce((a, [, hold]) => a + hold, 0);
  if (!total) return null;
  let k = t % (total + gap);
  if (k >= total) return null;
  for (const [index, hold, size] of play.seq) { if (k < hold) return [index, size]; k -= hold; }
  return null;
}
