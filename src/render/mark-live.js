// A mark with a `live` rule (War'Teun's Wiretap) is LIVE while the move that spends it could come out now: the mark
// is on the opponent, and the fighter who placed it is on the ground and not stunned, lying down or being thrown.
// The mark above the opponent's head pulses faster and brighter then, and the HUD icon lights up. Display only: it
// reads the game and decides nothing.

/** p: the fighter who placed the mark; def: their compiled character; name: the mechanic var that holds the mark. */
export function markLive(p, def, name) {
  const v = def.mechanic?.vars?.[name];
  if (!v?.mark?.live || !((p.vars[name] | 0) > 0)) return false;
  const st = def.states[p.state];
  return !!st && st.stance !== 'air' && !st.stun && !st.floor && !st.throwVictim;
}

/**
 * Which drawing of a mark's sheet shows: the intro once, the loop while it lasts, the fade over its last frames.
 *   m: the mark ({ intro, loop, fade: hold lists over the sheet's drawings in that order, live: { hold } })
 *   since: frames since the mark was placed; left: frames it still has; live: see markLive
 * Returns the index into the sheet.
 */
export function markFrame(m, since, left, live) {
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const pick = (holds, t) => { let i = 0; while (i < holds.length - 1 && t >= holds[i]) t -= holds[i++]; return i; };
  const fade = m.fade ?? [], intro = m.intro ?? [], loop = m.loop ?? [1];
  if (fade.length && left <= sum(fade)) return intro.length + loop.length + pick(fade, sum(fade) - left);
  if (since < sum(intro)) return pick(intro, since);
  const t = since - sum(intro);
  if (live && m.live?.hold) return intro.length + (Math.floor(t / m.live.hold) % loop.length);
  return intro.length + pick(loop, t % sum(loop));
}
