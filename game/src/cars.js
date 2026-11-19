// Recovery note: this file is where every car in Neon Bay lives — the traffic, the parked cars, and the one the player is driving.
// Cars: traffic that follows the road lanes, parked cars, and the arcade
// driving model for whichever car the player is in. A car is a plain
// object — { pos, angle, speed, mesh, kind } — so the player, the police
// and the traffic AI all drive the same shape.

import { THREE } from './three-shim.js';
import { CFG, clamp } from './config.js';
import { pushOutOfBuildings } from './city.js';
import { range } from './random.js';

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

// Traffic: each car owns one road and one lane, drives its lane, and at
// an intersection sometimes turns onto the crossing road.
export function createTraffic(scene, rng) {
  const cars = [];
  for (let i = 0; i < CFG.trafficCount; i++) {
    const vertical = rng() < 0.5;
    const road = CFG.roadCenters[Math.floor(rng() * CFG.roadCenters.length)];
    const lane = rng() < 0.5 ? -3 : 3;
    const dir = rng() < 0.5 ? -1 : 1;
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

export function updateTraffic(cars, dt, rng) {
  for (const c of cars) {
    if (c.kind !== 'traffic') continue;
    c.turnCooldown -= dt;
    const step = c.speed * dt * c.dir;
    if (c.axis === 'v') {
      c.pos.z += step;
      if (c.turnCooldown <= 0) {
        const cross = CFG.roadCenters.find((r) => Math.abs(c.pos.z - r) < 4);
        if (cross !== undefined && rng() < 0.02) {
          c.axis = 'h';
          c.road = cross;
          c.lane = rng() < 0.5 ? -3 : 3;
          c.dir = rng() < 0.5 ? -1 : 1;
          c.pos.z = cross + c.lane;
          c.turnCooldown = 2.5;
        }
      }
      if (c.pos.z > 132 || c.pos.z < -132) c.dir *= -1;
    } else {
      c.pos.x += step;
      if (c.turnCooldown <= 0) {
        const cross = CFG.roadCenters.find((r) => Math.abs(c.pos.x - r) < 4);
        if (cross !== undefined && rng() < 0.02) {
          c.axis = 'v';
          c.road = cross;
          c.lane = rng() < 0.5 ? -3 : 3;
          c.dir = rng() < 0.5 ? -1 : 1;
          c.pos.x = cross + c.lane;
          c.turnCooldown = 2.5;
        }
      }
      if (c.pos.x > 132 || c.pos.x < -132) c.dir *= -1;
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
