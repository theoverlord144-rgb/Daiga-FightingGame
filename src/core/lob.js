// A lobbed projectile's path (Khai'ro's bracelet): thrown up along an arc to an apex above where it will land, a
// hang there, then straight down. Whole numbers only (game units), a pure function of its age, so the rules and the
// drawing (the trail behind it) read the same path.
//   L: the projectile's compiled `lob` { rise, hang, drop, apex, ... } (frames; apex in units above the floor)

/** Where it is `age` frames after the throw, while rising (age 0..rise): [x, y]. It leaves fast and slows to the apex. */
export function lobRise(L, x0, y0, tx, age) {
  const R = L.rise, a = age < 0 ? 0 : age > R ? R : age;
  const left = R - a;
  return [x0 + Math.trunc(((tx - x0) * a) / R), y0 + Math.trunc(((L.apex - y0) * (R * R - left * left)) / (R * R))];
}

/** How high it is `u` frames into the drop (u 0..drop): slow at first, then faster, on the floor at the end. */
export function lobDrop(L, u) {
  const D = L.drop;
  return u >= D ? 0 : L.apex - Math.trunc((L.apex * u * u) / (D * D));
}

/** The ages its phases end at: [end of rise, end of hang, landing, end of impact, gone]. */
export const lobAges = (L) => [L.rise, L.rise + L.hang, L.rise + L.hang + L.drop, L.rise + L.hang + L.drop + L.impact, L.rise + L.hang + L.drop + L.impact + L.back];
