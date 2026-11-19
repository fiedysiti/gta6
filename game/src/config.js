// NEON BAY — tuning constants and shared layout numbers.
// Original game for the make.fun competition. No third-party assets.
export const STEP = 1 / 60;
export const GOAL_CASH = 5000;
export const BEST_KEY = 'neon-bay.best-cash';
export const WIN_CASH = 5000;

// City grid: 6 roads each way, 52 m pitch, 40 m blocks, 12 m roads.
export const PITCH = 52;
export const ROAD_XS = [-130, -78, -26, 26, 78, 130];
export const ROAD_ZS = [-130, -78, -26, 26, 78, 130];
export const BLOCK_CENTERS = [-104, -52, 0, 52, 104];
export const CITY_HALF = 162; // playable edge; ocean starts just south of this

export const PLAYER_CFG = {
  walk: 6, sprint: 10, radius: 0.6, hp: 100,
  punchRange: 2.6, punchCooldown: 0.6,
};
export const CAR_CFG = {
  accel: 16, brake: 26, maxSpeed: 30, maxReverse: 10,
  steer: 1.9, drag: 0.35, radius: 1.6,
};
export const WANTED = {
  decaySeconds: 20, maxStars: 5,
  carjack: 1, punch: 1, robbery: 2,
  bustDistance: 2.8, bustTime: 0.9,
};
export const ROBBERY = { holdSeconds: 3, radius: 4.5, min: 500, max: 1500 };
export const PICKUP_VALUE = 100;
export const PICKUP_COUNT = 8;
export const PED_COUNT = 12;
export const TRAFFIC_COUNT = 7;

export const PALETTE = {
  skyTop: '#2b1e5e', skyMid: '#c65d7b', skyLow: '#ff9e5e',
  fog: '#e08a6d', sun: '#ffb36b', hemiSky: '#8a6bb8', hemiGround: '#3a2a33',
  asphalt: '#2e2a33', sidewalk: '#8d7f8a', buildingGlass: '#3a4a6b',
  ocean: '#1e6f8e', sand: '#d9b380',
};
