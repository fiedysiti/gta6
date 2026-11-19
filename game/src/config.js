// Recovery note: the one place where the game's numbers live — if a speed, price or timer ever needs tuning, it changes here.
// NEON BAY — central tuning and layout constants.
// Every number the rest of the game reads lives here so a balance tweak
// never means hunting through the simulation code.

export const CFG = {
  // Win condition
  goalCash: 5000,
  bagValue: 100,
  bagCount: 8,

  // City geometry (metres). 5 blocks of 40 m separated by 12 m roads,
  // six roads each way, so the built-up square runs -136 .. +136.
  blockSize: 40,
  roadWidth: 12,
  pitch: 52,
  halfCity: 136,
  roadCenters: [-130, -78, -26, 26, 78, 130],
  blockCenters: [-104, -52, 0, 52, 104],

  // Beach and ocean sit south of the city (positive z).
  beachStart: 136,
  beachEnd: 168,
  oceanStart: 168,

  // On-foot movement
  walkSpeed: 6,
  sprintSpeed: 10.5,
  playerRadius: 0.6,

  // Arcade driving
  carAccel: 16,
  carBrake: 30,
  carReverseMax: 11,
  carTopSpeed: 33,
  carSteer: 2.1,
  carDrag: 0.55,

  // Traffic and pedestrians
  trafficCount: 7,
  trafficSpeed: [7, 12],
  parkedCount: 4,
  pedCount: 12,
  pedWalk: 1.3,
  pedFlee: 3.2,

  // Wanted system
  maxWanted: 5,
  decaySeconds: 20, // one star fades per this many quiet seconds
  bustSeconds: 0.9, // police contact time on foot before BUSTED
  bustRange: 2.6,
  policeTopSpeed: 15,
  maxPolice: 4,

  // Robbery
  robSeconds: 3, // hold E this long inside a ring
  robRange: 4.5,
  punchRange: 2.6,
  punchCooldown: 0.6,
  bagRange: 2.2,
  carjackRange: 4.2,

  // Player state
  maxHp: 100,
  spawn: { x: 0, z: 150 }, // beach, south edge

  // Robbery targets. Corners sit just off the building line so the
  // beacons are never hidden inside a footprint.
  targets: [
    { id: 'jewelers', name: 'Casa Oro Jewelers', x: -85, z: -30, min: 800, max: 1500 },
    { id: 'bank', name: 'Bay Federal Bank', x: 33, z: -82, min: 1000, max: 1500 },
    { id: 'mart', name: '24/7 Mini-Mart', x: -33, z: 82, min: 500, max: 900 },
  ],

  // Colours
  skyTop: 0x2b1055,
  skyBottom: 0xff7e3d,
  fogColor: 0x4a2350,
  oceanColor: 0x0e4d6e,
  sandColor: 0xd9b380,
  asphalt: 0x23232e,
  sidewalk: 0x4d4a55,
};

// Wanted stars added by each crime.
export const HEAT = { robbery: 2, carjack: 1, punch: 1 };

// Small helpers shared by the simulation modules.
export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist2(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
}
export function randInt(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
