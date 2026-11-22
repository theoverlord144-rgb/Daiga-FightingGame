// Input: raw device bits in, one resolved input frame per player per step out, kept in a ring buffer.
//
// Raw input (what the UI hands the core each step) is a bitmask of held controls:
//   LEFT RIGHT UP DOWN, then the buttons L M H S.
// A resolved input frame is an integer: numpad direction (1-9) in the low 4 bits, buttons in bits 4-7.
// Directions in the buffer are ABSOLUTE (screen) directions; motion reading mirrors them by facing.

export const RAW = { LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8, L: 16, M: 32, H: 64, S: 128 };
export const BTN = { L: 1, M: 2, H: 4, S: 8 };
export const BUTTONS = ['L', 'M', 'H', 'S'];

export const dirOf = (frame) => frame & 15;
export const buttonsOf = (frame) => (frame >> 4) & 15;
export const makeFrame = (dir, buttons) => (dir & 15) | ((buttons & 15) << 4);

/** Mirror a numpad direction left-right (used when the fighter faces left). */
const MIRROR = [0, 3, 2, 1, 6, 5, 4, 9, 8, 7];
export const mirrorDir = (d) => MIRROR[d];

/** Fresh per-player input state. Plain data: cloned and compared with the rest of the game state. */
export function createInputState(size) {
  return { buf: new Array(size).fill(makeFrame(5, 0)), head: 0, count: 0, prevRaw: 0, lastH: 0, lastV: 0 };
}

/**
 * Resolve SOCD (opposite directions held together) per the data rules.
 * horizontal: 'neutral' | 'last' (newest press wins);  vertical: 'up' | 'down' | 'neutral' | 'last'.
 * Mutates inp.lastH / inp.lastV, which remember the winner for the 'last' rule.
 */
export function resolveDirection(raw, inp, socd) {
  const prev = inp.prevRaw;
  let left = (raw & RAW.LEFT) !== 0;
  let right = (raw & RAW.RIGHT) !== 0;
  let up = (raw & RAW.UP) !== 0;
  let down = (raw & RAW.DOWN) !== 0;

  // Remember which side was pressed most recently (for 'last').
  if (left && !(prev & RAW.LEFT)) inp.lastH = -1;
  if (right && !(prev & RAW.RIGHT)) inp.lastH = 1;
  if (up && !(prev & RAW.UP)) inp.lastV = 1;
  if (down && !(prev & RAW.DOWN)) inp.lastV = -1;

  if (left && right) {
    if (socd.horizontal === 'last') { left = inp.lastH === -1; right = !left; }
    else { left = false; right = false; }
  }
  if (up && down) {
    const rule = socd.vertical;
    if (rule === 'up') down = false;
    else if (rule === 'down') up = false;
    else if (rule === 'last') { up = inp.lastV === 1; down = !up; }
    else { up = false; down = false; }
  }
  const x = right ? 1 : left ? -1 : 0;
  const y = up ? 1 : down ? -1 : 0;
  return 5 + x + 3 * y;
}

/** Push this step's raw input into the player's buffer. */
export function pushInput(inp, raw, rules) {
  const dir = resolveDirection(raw, inp, rules.socd);
  const buttons = (raw >> 4) & 15;
  inp.head = (inp.head + 1) % inp.buf.length;
  inp.buf[inp.head] = makeFrame(dir, buttons);
  if (inp.count < inp.buf.length) inp.count++;
  inp.prevRaw = raw;
}

/** The input frame `age` steps ago (0 = this step). Older than the buffer holds = neutral, nothing pressed. */
export function frameAt(inp, age) {
  if (age >= inp.count) return makeFrame(5, 0);
  const n = inp.buf.length;
  return inp.buf[(inp.head - age + n * 2) % n];
}

/** Direction `age` steps ago, relative to facing (1 = right, -1 = left): 6 always means "forward". */
export function relDirAt(inp, age, facing) {
  const d = dirOf(frameAt(inp, age));
  return facing < 0 ? mirrorDir(d) : d;
}

/** Was button `b` (a BTN bit) pressed (newly down) at `age`? */
export function pressedAt(inp, b, age) {
  return (buttonsOf(frameAt(inp, age)) & b) !== 0 && (buttonsOf(frameAt(inp, age + 1)) & b) === 0;
}

/** Was button `b` released at `age`? (negative edge) */
export function releasedAt(inp, b, age) {
  return (buttonsOf(frameAt(inp, age)) & b) === 0 && (buttonsOf(frameAt(inp, age + 1)) & b) !== 0;
}

export const held = (inp, b) => (buttonsOf(frameAt(inp, 0)) & b) !== 0;

/** Age of the newest press of `b` within the last `within` steps, or -1. */
export function pressedWithin(inp, b, within, negativeEdge = false) {
  for (let age = 0; age < within; age++) {
    if (pressedAt(inp, b, age) || (negativeEdge && releasedAt(inp, b, age))) return age;
  }
  return -1;
}

// ---------- Motion reading ----------

/** Parse a step string: "123" -> set {1,2,3}; "!123" -> every direction except those; trailing '?' = optional. */
function parseStep(str) {
  let s = str;
  const optional = s.endsWith('?');
  if (optional) s = s.slice(0, -1);
  const negate = s.startsWith('!');
  if (negate) s = s.slice(1);
  let mask = 0;
  for (const ch of s) mask |= 1 << Number(ch);
  if (negate) mask = 0b1111111110 & ~mask;
  return { mask, optional };
}

const stepCache = new Map();
function steps(list) {
  const key = list.join(',');
  let parsed = stepCache.get(key);
  if (!parsed) {
    // Optional steps never make a match harder to find, so the matcher reads only the required ones.
    parsed = list.map(parseStep).filter((s) => !s.optional).map((s) => s.mask);
    stepCache.set(key, parsed);
  }
  return parsed;
}

/**
 * Does the direction history, ending `endAge` steps ago, contain the motion within `window` steps?
 * Steps are matched newest-first, each strictly earlier than the next, taking the latest frame that fits
 * (which leaves the most room for the earlier steps, so it never misses a valid match).
 */
function matchSteps(inp, masks, facing, endAge, window) {
  let age = endAge;
  const limit = endAge + window;
  for (let k = masks.length - 1; k >= 0; k--) {
    const m = masks[k];
    while (age <= limit && !(m & (1 << relDirAt(inp, age, facing)))) age++;
    if (age > limit) return false;
    if (k > 0) age++;
  }
  return true;
}

function maskOf(str) {
  let mask = 0;
  for (const ch of str) mask |= 1 << Number(ch);
  return mask;
}

/** Charge: `charge` held at least chargeFrames, then `release` direction, all ending within `window` of endAge. */
function matchCharge(inp, def, facing, endAge, window, lenient) {
  const release = maskOf(lenient && def.lenientRelease ? def.lenientRelease : def.release);
  const charge = maskOf(def.charge);
  for (let age = endAge; age <= endAge + window; age++) {
    if (!(release & (1 << relDirAt(inp, age, facing)))) continue;
    // Release found; count the charge held just before it.
    let a = age + 1;
    let n = 0;
    while (charge & (1 << relDirAt(inp, a, facing))) { n++; a++; if (n >= def.chargeFrames) return true; }
  }
  return false;
}

/**
 * Was motion `name` completed and finished by the button event at `endAge`?
 * opts: { leniency } (defaults to the data's global setting).
 */
export function motionAt(inp, rules, name, facing, endAge, opts = {}) {
  const def = rules.motions[name];
  if (!def) throw new Error(`Unknown motion ${name}`);
  const lenient = opts.leniency ?? rules.leniency;
  const window = lenient ? def.lenientWindow ?? def.window : def.window;
  if (def.charge) return matchCharge(inp, def, facing, endAge, window, lenient);
  return matchSteps(inp, steps(lenient && def.lenient ? def.lenient : def.steps), facing, endAge, window);
}

/**
 * Read a special input: a press (or release, with negative edge) of `b` within the press buffer,
 * finishing `motion`. Returns the age of the button event, or -1.
 */
export function readMotion(inp, rules, motion, b, facing, opts = {}) {
  const within = opts.pressBuffer ?? rules.pressBuffer;
  for (let age = 0; age < within; age++) {
    const ev = pressedAt(inp, b, age) || (opts.negativeEdge && releasedAt(inp, b, age));
    if (ev && motionAt(inp, rules, motion, facing, age, opts)) return age;
  }
  return -1;
}

/**
 * Direction-only motions (dashes 66/44, super jump 28): completed THIS frame, with the last direction freshly
 * entered (it wasn't held the frame before), so holding forward never re-triggers a dash.
 */
export function dirMotionNow(inp, rules, name, facing, opts = {}) {
  const def = rules.motions[name];
  const list = (opts.leniency ?? rules.leniency) && def.lenient ? def.lenient : def.steps;
  const last = steps([list[list.length - 1]])[0];
  if (!(last & (1 << relDirAt(inp, 0, facing))) || (last & (1 << relDirAt(inp, 1, facing)))) return false;
  return motionAt(inp, rules, name, facing, 0, opts);
}

/** Every motion completed by the button event at `endAge`, in the data's priority order. */
export function motionsAt(inp, rules, facing, endAge = 0, opts = {}) {
  return rules.motionPriority.filter((name) => motionAt(inp, rules, name, facing, endAge, opts));
}
