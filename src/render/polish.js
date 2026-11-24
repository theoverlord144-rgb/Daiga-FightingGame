// The look-only polish switches (data/system/polish.json). Drawing reads POLISH; nothing in src/core/ ever does.
// The switches can be flipped live (training mode's polish panel) and are remembered in this browser.
import DATA from '../../data/system/polish.json';

const KEY = 'toska.polish.v1';
export const POLISH = JSON.parse(JSON.stringify(DATA));
/** The switchable items, in file order: [{ key, label, part }]. */
export const POLISH_ITEMS = Object.entries(DATA).filter(([, v]) => v && typeof v === 'object' && 'on' in v).map(([key, v]) => ({ key, label: v.label ?? key, part: v.part ?? 0 }));

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(POLISH_ITEMS.map((i) => [i.key, POLISH[i.key].on])))); } catch { /* no storage */ }
}
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const i of POLISH_ITEMS) if (typeof saved[i.key] === 'boolean') POLISH[i.key].on = saved[i.key];
} catch { /* no storage: the file's defaults */ }

export function setPolish(key, on) {
  if (!POLISH[key] || !('on' in POLISH[key])) return;
  POLISH[key].on = !!on;
  save();
}
/** Every switch at once: true, false, or 'default' (as the file says). */
export function setAllPolish(on) {
  for (const i of POLISH_ITEMS) POLISH[i.key].on = on === 'default' ? DATA[i.key].on : !!on;
  save();
}
