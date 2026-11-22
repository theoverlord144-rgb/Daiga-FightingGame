// Integer maths for the core. Every position, velocity and timer is an integer.
// 1 pixel = UNIT sub-pixel units. Percentages are integers out of PCT (10000 = 100%).

export const UNIT = 100;
export const PCT = 10000;

/** Pixels to units (data is authored in pixels; the core works in units). Rounded, so 4.55 px = 455. */
export const px = (n) => Math.round(n * UNIT);

/** n scaled by a percentage (PCT = 100%), truncated toward zero. */
export const pct = (n, p) => Math.trunc((n * p) / PCT);

export const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

export const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/** Integer division toward zero. */
export const idiv = (a, b) => Math.trunc(a / b);
