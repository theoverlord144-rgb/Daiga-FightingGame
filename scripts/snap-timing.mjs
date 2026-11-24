// The "snap" timing pass:  node scripts/snap-timing.mjs [avner malik]
//
// For every move of a character whose drawings are timed by plain holds, writes into data/snap/<id>.json:
//   holds     the move's holds as they are now (the snap only applies while the character file still says the same)
//   roles     one per drawing: anticipation | smear | impact | followthrough | recovery | neutral
//   snap      the same drawings re-timed: same number of holds, same total, and the same frames inside startup,
//             active and recovery, so nothing about the move changes but when each drawing shows
//   strength  light | medium | heavy (sizes the overshoot);  impact: true = this move's hit shows the impact frame
//   overshoot { dir: [forward, up] } when the strike is not straight forward
//   unsure    why a tag is a guess (worth a look)
// An entry with "hand": true is yours: it is never rewritten. Drawing only: the game's rules never read this file.
// Rules: startup = the drawings that begin before the first hitting frame; the last of them is the smear when it is
// short (3 frames or less) and gets 1 frame, the frames it gives up go to the drawing before it (the wind-up), which
// also borrows from earlier startup drawings up to 6 (heavy) / 4 (medium) / 3 (light) frames. Active is left alone
// (its first drawing is the impact, held through hitstop by the game itself). Recovery: the first drawing gets 2 to 4
// frames, the ones between at most 3, the last one the rest.
import fs from 'node:fs';
import { createServer } from 'vite';

globalThis.Image = class { set src(v) { this._s = v; } get src() { return this._s; } };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
globalThis.localStorage = { getItem: () => null, setItem() {} };

/** Pure: the roles and snap holds of one move. m = { holds, first (first hitting frame), end (first recovery frame), strength, hasHit }. */
export function snapOf({ holds, first, end, strength, hasHit }) {
  const n = holds.length, start = [];
  holds.reduce((t, h, i) => { start[i] = t; return t + h; }, 0);
  const group = start.map((s) => (s < first ? 'S' : s < end ? 'A' : 'R'));
  const S = [], A = [], R = [];
  group.forEach((g, i) => (g === 'S' ? S : g === 'A' ? A : R).push(i));
  const roles = new Array(n).fill('neutral'), snap = holds.slice(), unsure = [];
  let smear = -1;
  for (const i of S) roles[i] = 'anticipation';
  if (!A.length && S.length) { roles[S[S.length - 1]] = 'impact'; unsure.push('the drawing on the hit starts before the hit: no smear'); }
  else if (S.length >= 2) {
    const last = S[S.length - 1];
    if (holds[last] <= 3) { roles[last] = 'smear'; smear = last; } else unsure.push('no short drawing right before the hit: no smear tagged');
  } else if (S.length === 1 && A.length) unsure.push('one startup drawing only: no smear');
  A.forEach((i, k) => { roles[i] = k === 0 ? 'impact' : 'followthrough'; });
  R.forEach((i, k) => { roles[i] = k === 0 && A.length <= 1 ? 'followthrough' : 'recovery'; });
  if (!hasHit) unsure.push('no hitbox: the frame the move lets go is taken as its hit');
  // Startup.
  if (smear >= 0) {
    const wind = S[S.length - 2];
    snap[wind] += snap[smear] - 1; snap[smear] = 1;
    const aim = strength === 'heavy' ? 6 : strength === 'medium' ? 4 : 3, floor = strength === 'light' ? 1 : 2;
    for (let k = S.length - 3; k >= 0 && snap[wind] < aim; k--) {
      const take = Math.min(aim - snap[wind], Math.max(0, snap[S[k]] - floor));
      snap[S[k]] -= take; snap[wind] += take;
    }
  }
  // Recovery.
  if (R.length >= 2) {
    const total = R.reduce((t, i) => t + holds[i], 0);
    let used = 0;
    R.slice(0, -1).forEach((i, k) => { snap[i] = k === 0 ? Math.max(2, Math.min(4, holds[i])) : Math.min(3, holds[i]); used += snap[i]; });
    if (total - used >= 1) snap[R[R.length - 1]] = total - used; else R.forEach((i) => { snap[i] = holds[i]; });
  }
  return { roles, snap, unsure };
}

async function main() {
  const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const boot = await server.ssrLoadModule('/src/ui/boot.js');
    const chars = boot.loadCharacters();
    for (const id of ids.length ? ids : ['avner', 'malik']) {
      const def = chars[id];
      const path = `data/snap/${id}.json`;
      const old = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : {};
      const moves = {};
      const skipped = [];
      for (const [name, st] of Object.entries(def.states)) {
        if (old.moves?.[name]?.hand) { moves[name] = old.moves[name]; continue; }
        const sheet = def.sheets[st.frames[0]?.sprite?.sheet];
        if (!st.move || !sheet?.holds) continue;
        const holds = sheet.holds;
        // Only moves whose drawings really are timed by these holds (no hand-placed drawing order).
        const want = holds.flatMap((h, i) => new Array(h).fill(i));
        if (holds.length !== sheet.count || want.length !== st.frames.length || st.frames.some((f, i) => f.sprite?.index !== want[i])) { skipped.push(name); continue; }
        let first = -1, last = -1;
        st.frames.forEach((f, i) => { if (f.hit.length || f.throw.length) { if (first < 0) first = i; last = i; } });
        const hasHit = first >= 0;
        if (!hasHit) { first = Math.max(0, (st.move.startup ?? 1) - 1); last = first; }
        const mv = st.move, dmg = mv.damage ?? 0;
        const isThrow = st.frames.some((f) => f.throw.length);
        const strength = dmg >= 800 ? 'heavy' : dmg >= 500 || !dmg ? 'medium' : 'light';
        const r = snapOf({ holds, first, end: last + 1, strength, hasHit });
        // Something the move does on a set frame (a projectile leaves the hand, an effect starts, he starts to slide)
        // was timed to the drawing shown on that frame: where the snap would show another drawing there, that part of
        // the move (startup or recovery) keeps its original holds.
        const at = (hs, t) => { let i = 0; while (t >= hs[i]) t -= hs[i++]; return i; };
        const has = (x) => (Array.isArray(x) ? x.length > 0 : x && typeof x === 'object' ? Object.keys(x).length > 0 : !!x);
        const kept = new Set();
        st.onEnter.forEach((shots, t) => { if (t > 0 && has(shots) && at(holds, t) !== at(r.snap, t)) kept.add(t < first ? 'startup' : 'recovery'); });
        if (kept.size) {
          let t = 0;
          holds.forEach((h, i) => { if (kept.has(t < first ? 'startup' : t <= last ? 'active' : 'recovery')) r.snap[i] = h; t += h; });
          r.unsure.push(`${[...kept].join(' and ')} left as drawn: something is timed to a drawing there`);
        }
        const e = { holds, roles: r.roles, snap: r.snap, strength };
        if (isThrow || /^spirit5/.test(name)) { e.roles = holds.map(() => 'neutral'); e.snap = holds.slice(); r.unsure.length = 0; r.unsure.push(isThrow ? 'a grab: left as it is' : 'he holds his idle while the guardian strikes: left as it is'); }
        if (hasHit && !isThrow && (dmg >= 800 || mv.launchType === 'hard' || mv.kind === 'super' || name === 'vow_strike_full')) e.impact = true;
        if (mv.launchType === 'hard' || (mv.launchVel && mv.launchVel.y > 1500)) e.overshoot = { dir: [0.3, 1] };
        else if (mv.groundBounce || /^j\.S/.test(name)) e.overshoot = { dir: [0.3, -1] };
        if (mv.kind === 'super') r.unsure.push('a super: many drawings, tagged by the same rules');
        if (r.unsure.length) e.unsure = r.unsure.join('; ');
        moves[name] = e;
      }
      const out = { notes: 'Roles and snap timing per move, for drawing only (scripts/snap-timing.mjs writes it; add "hand": true to an entry to keep your own edit). ribbons.anchors: { "sheets/idle.png": [[[forward, up], ...] per drawing] } = where cloth ribbons attach (none marked yet).', ribbons: old.ribbons ?? { anchors: {} }, moves };
      fs.mkdirSync('data/snap', { recursive: true });
      const body = Object.entries(moves).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
      fs.writeFileSync(path, `{\n "notes": ${JSON.stringify(out.notes)},\n "ribbons": ${JSON.stringify(out.ribbons)},\n "moves": {\n${body}\n }\n}\n`);
      const changed = Object.values(moves).filter((m) => m.snap.join() !== m.holds.join()).length;
      console.log(`${id}: ${Object.keys(moves).length} moves tagged, ${changed} re-timed, ${Object.values(moves).filter((m) => m.unsure).length} unsure; not timed by plain holds (left alone): ${skipped.join(' ') || 'none'}`);
    }
  } finally { await server.close(); }
}
if (process.argv[1]?.endsWith('snap-timing.mjs')) await main();
