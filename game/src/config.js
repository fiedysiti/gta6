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
  trafficAvoidDist: 14, // a traffic car brakes for anything this far ahead in its lane
  trafficMinGap: 7.5, // minimum bumper gap it will hold behind another car
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

  // Police helicopter: joins the chase once the heat is serious.
  // Altitude 15 (not 30): the chase camera looks down 23.5° with a 62°
  // FOV, so a heli at 30 m sits above the top of the frame — at 15 m
  // the airframe itself is visible above the player's car, clear of
  // the mission-tracker panel, and the spotlight beam still reads
  // from the ground. Low and loud, the way a pursuit heli should be.
  heliMinWanted: 3,
  heliOrbit: 26, // metres out from the player as it circles
  heliAltitude: 15, // metres up
  heliAngularSpeed: 0.35, // radians per second around the player

  // Robbery
  robSeconds: 3, // hold E this long inside a ring
  robRange: 4.5,
  punchRange: 2.6,
  punchCooldown: 0.6,
  bagRange: 2.2,
  carjackRange: 4.2,
  missionBonus: 150, // extra cash for finishing one job of the chain

  // Round 4 sound: procedural music loop + skid threshold.
  musicBpm: 112,
  musicVolume: 0.05,
  skidSpeed: 14, // skids only above this speed while steering hard

  // Boardwalk: the wooden pier off the south beach, over the ocean.
  pierX: 0,
  pierWidth: 10,
  pierStartZ: 148,
  pierEndZ: 192,

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
