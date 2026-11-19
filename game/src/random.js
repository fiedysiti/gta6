// Recovery note: one seeded generator behind every shuffle in the game, so the same seed always rebuilds the same Neon Bay.
// Seeded RNG (mulberry32) so a ?seed= URL always builds the same city,
// the same traffic and the same pedestrians. Everything random in the
// game draws from one of these, never from Math.random, except for
// cosmetic flicker that must not change the simulation.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick one element of an array with the given rng.
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// Random float in [lo, hi).
export function range(rng, lo, hi) { return lo + rng() * (hi - lo); }
