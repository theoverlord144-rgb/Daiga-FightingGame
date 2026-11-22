// The game state: one plain object (numbers, strings, booleans, arrays, plain objects; no classes,
// no functions, no Maps). That keeps it cloneable, serializable and comparable, which rollback needs.

/** Deep copy. JSON-shaped data only. */
export function cloneState(s) {
  return structuredClone(s);
}

/** Serialize to a string (for replays, save files and desync reports). Key order is the creation order. */
export function serializeState(s) {
  return JSON.stringify(s);
}

export function deserializeState(str) {
  return JSON.parse(str);
}

/** Deep equality for plain data. Returns true, or the path of the first difference as a string. */
export function diffState(a, b, path = '$') {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return path;
  if (Array.isArray(a) !== Array.isArray(b)) return path;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return `${path} (keys differ)`;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return `${path}.${k} (missing)`;
    const d = diffState(a[k], b[k], `${path}.${k}`);
    if (d !== true) return d;
  }
  return true;
}

export const statesEqual = (a, b) => diffState(a, b) === true;

/** 32-bit FNV-1a hash of the serialized state: a cheap checksum for sync tests and desync detection. */
export function hashState(s) {
  const str = serializeState(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
