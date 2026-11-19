// Recovery note: this file is where every car in Neon Bay lives — the traffic, the parked cars, and the one the player is driving.
// Cars: traffic that follows the road lanes, parked cars, and the arcade
// driving model for whichever car the player is in. A car is a plain
// object — { pos, angle, speed, mesh, kind } — so the player, the police
// and the traffic AI all drive the same shape.

import { THREE } from './three-shim.js';
import { CFG, clamp } from './config.js';
import { pushOutOfBuildings } from './city.js';
import { chance, range } from './random.js';

const PAINT = [0xc23b3b, 0x3b7dc2, 0xd8b13c, 0x3cc27a, 0x8a5fd0, 0xd8d8d8, 0x22242e];

export function makeCarMesh(scene, color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xe8e8e8 : color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 0.72, 4.4), bodyMat);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.62, 2.1),
    new THREE.MeshLambertMaterial({ color: police ? 0x1a1d26 : 0x14161f }),
  );
  cabin.position.set(0, 1.22, -0.25);
  g.add(cabin);
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(2.04, 0.3, 4.44),
    new THREE.MeshLambertMaterial({ color: 0x0c0d12 }),
  );
  skirt.position.y = 0.28;
  g.add(skirt);
  let barL = null, barR = null;
  if (police) {
    barL = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }),
    );
    barL.position.set(-0.45, 1.62, -0.25);
    g.add(barL);
    barR = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.22, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }),
    );
    barR.position.set(0.45, 1.62, -0.25);
    g.add(barR);
  }
  scene.add(g);
  return { group: g, barL, barR };
}

function syncMesh(car) {
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.angle;
}

// Right-hand lane for a direction of travel: vertical roads run north
// (-z) / south (+z), horizontal roads east (+x) / west (-x). Facing
// south the right hand is west (-3), facing north east (+3), facing
// east south (+3), facing west north (-3). Lanes follow direction so
// two cars never share a lane head-on (round 4 fix: a random lane
// could put two cars nose-to-nose in one lane forever).
function laneFor(axis, dir) {
  if (axis === 'v') return dir > 0 ? -3 : 3;
  return dir > 0 ? 3 : -3;
}

// Traffic: each car owns one road and one lane, drives its lane, and at
// an intersection sometimes turns onto the crossing road.
export function createTraffic(scene, rng) {
  const cars = [];
  for (let i = 0; i < CFG.trafficCount; i++) {
    const vertical = rng() < 0.5;
    const road = CFG.roadCenters[Math.floor(rng() * CFG.roadCenters.length)];
    const dir = rng() < 0.5 ? -1 : 1;
    const lane = laneFor(vertical ? 'v' : 'h', dir);
    const along = range(rng, -120, 120);
    const car = {
      pos: vertical ? { x: road + lane, z: along } : { x: along, z: road + lane },
      angle: 0,
      speed: range(rng, CFG.trafficSpeed[0], CFG.trafficSpeed[1]),
      kind: 'traffic',
      axis: vertical ? 'v' : 'h',
      road, lane, dir,
      turnCooldown: range(rng, 0, 2),
      color: PAINT[i % PAINT.length],
      mesh: null,
    };
    car.mesh = makeCarMesh(scene, car.color).group;
    car.angle = car.axis === 'v' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    syncMesh(car);
    cars.push(car);
  }
  return cars;
}

export function createParked(scene, rng) {
  const cars = [];
  for (let i = 0; i < CFG.parkedCount; i++) {
    const vertical = rng() < 0.5;
    const road = CFG.roadCenters[Math.floor(rng() * CFG.roadCenters.length)];
    const side = rng() < 0.5 ? -5.4 : 5.4;
    const along = range(rng, -110, 110);
    const car = {
      pos: vertical ? { x: road + side, z: along } : { x: along, z: road + side },
      angle: vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
      speed: 0,
      kind: 'parked',
      color: PAINT[(i + 3) % PAINT.length],
      mesh: null,
    };
    car.mesh = makeCarMesh(scene, car.color).group;
    syncMesh(car);
    cars.push(car);
  }
  return cars;
}

// Traffic AI (round 4): a car is 4.4 m long (see makeCarMesh), so the
// bumper gap to the car ahead is the centre distance along the lane
// minus CAR_LEN. The player counts as a 0.6 m-radius obstacle, so the
// gap to the player is the centre distance minus the car's half-length
// (2.2 m) minus 0.6 m.
const CAR_LEN = 4.4;
const CAR_HALF_LEN = 2.2;
const PLAYER_CLEARANCE = 2.8; // 2.2 m half-length + 0.6 m player radius
const INTERSECT_APPROACH = 6; // stop line: front bumper this far from a crossing centre
const INTERSECT_HALF = 7; // intersection box half-size around a crossing centre
const LANE_HALF_WIDTH = 3; // player counts as "in the lane" within this lateral distance
const TURN_CLEAR = 8; // destination must be this clear (m) before a turn teleports the car

// Along-lane coordinate (direction of travel) and lateral coordinate.
function alongOf(c) { return c.axis === 'v' ? c.pos.z : c.pos.x; }
function lateralOf(c) { return c.axis === 'v' ? c.pos.x : c.pos.z; }

// Speed factor for a bumper gap: 0 below the minimum gap, then ramping
// linearly (gap / avoidDist) up to full speed at the avoid distance.
function gapFactor(gap) {
  if (gap < CFG.trafficMinGap) return 0;
  if (gap < CFG.trafficAvoidDist) return gap / CFG.trafficAvoidDist;
  return 1;
}

// Traffic: each car owns one road and one lane, drives its lane, brakes
// for the car ahead and for the player, waits outside occupied
// intersections, and at an intersection sometimes turns onto the
// crossing road.
//
// Signature (round 4): updateTraffic(cars, dt, rng, playerPos) —
// playerPos is the player's world position {x, z} (on foot or in a
// car), or null on the title screen, in which case player avoidance
// is skipped. The car's cruising speed (c.speed) is never mutated:
// braking only scales the step taken this frame, so the car resumes
// at full speed once the obstacle clears. All decisions use only the
// passed rng and positions — no Math.random, no Date.now.
export function updateTraffic(cars, dt, rng, playerPos = null) {
  // Cars decided to wait at a stop line this frame, keyed by the
  // intersection they wait for. The stop line puts the front bumper
  // 6 m from the crossing centre, so a waiting car's centre (~8.2 m
  // out) is normally outside the 7 m box — but a car can still end up
  // stopped inside the box if the box filled after it had already
  // closed within 7 m. Without this set, two such cars waiting at the
  // same intersection would each see the other as "inside" and
  // deadlock forever, so waiting cars are ignored as occupants of the
  // intersection they wait for. A car actually moving through still
  // blocks entry.
  const waiting = []; // { car, boxX, boxZ }
  for (const c of cars) {
    if (c.kind !== 'traffic') continue;
    c.turnCooldown -= dt;
    const along = alongOf(c);
    let factor = 1;

    // (a) Car-ahead following: nearest other traffic car in the same
    // lane (same axis, road and lane) ahead of this one.
    for (const o of cars) {
      if (o === c || o.kind !== 'traffic') continue;
      if (o.axis !== c.axis || o.road !== c.road || o.lane !== c.lane) continue;
      const ahead = (alongOf(o) - along) * c.dir;
      if (ahead <= 0) continue;
      factor = Math.min(factor, gapFactor(ahead - CAR_LEN));
      if (factor === 0) break;
    }

    // (b) Player avoidance: the player (on foot or in a car) is an
    // obstacle at playerPos. Null on the title screen — skip.
    if (playerPos && factor > 0) {
      const playerAlong = c.axis === 'v' ? playerPos.z : playerPos.x;
      const playerLateral = c.axis === 'v' ? playerPos.x : playerPos.z;
      if (Math.abs(playerLateral - lateralOf(c)) < LANE_HALF_WIDTH) {
        const ahead = (playerAlong - along) * c.dir;
        if (ahead > 0) factor = Math.min(factor, gapFactor(ahead - PLAYER_CLEARANCE));
      }
    }

    // (c) Intersection anti-pileup: when about to enter an
    // intersection, wait at the stop line while another traffic car is
    // already inside that intersection's box.
    let cross = undefined;
    let crossDist = Infinity;
    for (const r of CFG.roadCenters) {
      const d = (r - along) * c.dir;
      if (d > 0 && d < crossDist) { crossDist = d; cross = r; }
    }
    // Measured from the front bumper: the car stops with its bumper
    // 6 m short of the crossing centre, centre ~8.2 m out, i.e. outside
    // the 7 m box, so a waiting car does not itself block the crossing.
    if (cross !== undefined && crossDist - CAR_HALF_LEN <= INTERSECT_APPROACH) {
      const boxX = c.axis === 'v' ? c.road : cross;
      const boxZ = c.axis === 'v' ? cross : c.road;
      let occupied = false;
      for (const o of cars) {
        if (o === c || o.kind !== 'traffic') continue;
        if (Math.abs(o.pos.x - boxX) >= INTERSECT_HALF) continue;
        if (Math.abs(o.pos.z - boxZ) >= INTERSECT_HALF) continue;
        if (waiting.some((w) => w.car === o && w.boxX === boxX && w.boxZ === boxZ)) continue;
        occupied = true;
        break;
      }
      if (occupied) {
        factor = 0;
        waiting.push({ car: c, boxX, boxZ });
      }
    }

    const step = c.speed * factor * dt * c.dir;
    if (c.axis === 'v') {
      c.pos.z += step;
      // Stopped cars don't turn: a turn teleports the car sideways
      // into the new lane, which must only happen while moving.
      if (factor > 0 && c.turnCooldown <= 0) {
        const crossRoad = CFG.roadCenters.find((r) => Math.abs(c.pos.z - r) < 4);
        if (crossRoad !== undefined && chance(rng, 0.02)) {
          const newDir = rng() < 0.5 ? -1 : 1;
          const newLane = laneFor('h', newDir);
          // Don't teleport onto a car already near the destination.
          const destX = c.pos.x;
          const destZ = crossRoad + newLane;
          const blocked = cars.some((o) => o !== c && o.kind === 'traffic' &&
            Math.abs(o.pos.x - destX) < TURN_CLEAR && Math.abs(o.pos.z - destZ) < TURN_CLEAR);
          if (!blocked) {
            c.axis = 'h';
            c.road = crossRoad;
            c.lane = newLane;
            c.dir = newDir;
            c.pos.z = destZ;
            c.turnCooldown = 2.5;
          }
        }
      }
      // U-turn at the city edge: flip direction AND lane (right-hand
      // traffic), snapping across to the correct side of the road so
      // the car never ends up head-on in its old lane.
      if (c.pos.z > 132 || c.pos.z < -132) {
        c.dir *= -1;
        c.lane *= -1;
        c.pos.x = c.road + c.lane;
      }
    } else {
      c.pos.x += step;
      if (factor > 0 && c.turnCooldown <= 0) {
        const crossRoad = CFG.roadCenters.find((r) => Math.abs(c.pos.x - r) < 4);
        if (crossRoad !== undefined && chance(rng, 0.02)) {
          const newDir = rng() < 0.5 ? -1 : 1;
          const newLane = laneFor('v', newDir);
          const destX = crossRoad + newLane;
          const destZ = c.pos.z;
          const blocked = cars.some((o) => o !== c && o.kind === 'traffic' &&
            Math.abs(o.pos.x - destX) < TURN_CLEAR && Math.abs(o.pos.z - destZ) < TURN_CLEAR);
          if (!blocked) {
            c.axis = 'v';
            c.road = crossRoad;
            c.lane = newLane;
            c.dir = newDir;
            c.pos.x = destX;
            c.turnCooldown = 2.5;
          }
        }
      }
      // U-turn at the city edge: flip direction AND lane (right-hand
      // traffic), snapping across to the correct side of the road.
      if (c.pos.x > 132 || c.pos.x < -132) {
        c.dir *= -1;
        c.lane *= -1;
        c.pos.z = c.road + c.lane;
      }
    }
    c.angle = c.axis === 'v' ? (c.dir > 0 ? 0 : Math.PI) : (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    syncMesh(c);
  }
}

// Arcade driving for the player's car. Returns { crashed, impact } —
// impact is the speed at the moment of a building hit, 0 otherwise.
export function driveCar(car, input, dt, colliders) {
  const forward = input.axis.y;
  const steer = input.axis.x;
  if (forward > 0) car.speed += CFG.carAccel * dt;
  else if (forward < 0) {
    car.speed -= (car.speed > 0.5 ? CFG.carBrake : CFG.carAccel * 0.6) * dt;
  }
  // Drag + rolling resistance.
  car.speed -= car.speed * CFG.carDrag * dt;
  car.speed = clamp(car.speed, -CFG.carReverseMax, CFG.carTopSpeed);
  if (Math.abs(car.speed) < 0.05 && forward === 0) car.speed = 0;
  const turnAuthority = clamp(Math.abs(car.speed) / 9, 0, 1);
  car.angle += steer * CFG.carSteer * turnAuthority * dt * (car.speed >= 0 ? 1 : -1);
  car.pos.x += Math.sin(car.angle) * car.speed * dt;
  car.pos.z += Math.cos(car.angle) * car.speed * dt;
  let crashed = false, impact = 0;
  if (pushOutOfBuildings(car.pos, 2.1, colliders)) {
    if (Math.abs(car.speed) > 6) {
      crashed = true;
      impact = Math.abs(car.speed);
    }
    car.speed *= 0.25;
  }
  car.pos.x = clamp(car.pos.x, -168, 168);
  car.pos.z = clamp(car.pos.z, -168, 166);
  syncMesh(car);
  return { crashed, impact };
}
