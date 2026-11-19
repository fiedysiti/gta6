// Cars: player car physics (arcade), traffic that drives road lanes and turns at
// intersections, and the carjack interaction.
import { THREE } from './three-shim.js';
import { CAR_CFG, ROAD_XS, ROAD_ZS } from './config.js';
import { resolveCollisions } from './city.js';
import { pick, range } from './random.js';

const CAR_COLORS = [0xd94f4f, 0x4f7ad9, 0xe0c040, 0x40c060, 0xd9d9e0, 0x8a5fd9, 0xe08a40];

export function createCarMesh(color, police = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: police ? 0xf0f0f0 : color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2438 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55; body.castShadow = true; g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.0), glassMat);
  cabin.position.set(0, 1.1, -0.2); cabin.castShadow = true; g.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x141414 });
  for (const [x, z] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w);
  }
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.7, 0.7]) {
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), lightMat);
    l.position.set(x, 0.6, 2.22); g.add(l);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.18, 0.4), new THREE.MeshLambertMaterial({ color: 0x222222 }));
    bar.position.set(0, 1.45, -0.2); g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
    red.position.set(-0.3, 1.45, -0.2); g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: 0x2040ff }));
    blue.position.set(0.3, 1.45, -0.2); g.add(blue);
    g.userData.lightRed = red; g.userData.lightBlue = blue;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42), new THREE.MeshLambertMaterial({ color: 0x2040c0 }));
    stripe.position.y = 0.62; g.add(stripe);
  }
  return g;
}

export function makeCar(x, z, heading, color, opts = {}) {
  return {
    pos: { x, z }, heading, speed: 0, color,
    mesh: createCarMesh(color, !!opts.police),
    police: !!opts.police, traffic: !!opts.traffic, player: false,
    // traffic AI
    axis: opts.axis || 'z', dir: opts.dir || 1, lane: opts.lane || 0,
    cruise: opts.cruise || 8, turnCooldown: 0, flash: 0,
  };
}

function syncCar(car) {
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
}

// Arcade driving: W/S accelerate/brake, A/D steer (steering flips in reverse).
export function driveCar(car, input, dt, colliders, onCrash) {
  const fwd = input.y, steer = input.x;
  if (fwd > 0) car.speed += CAR_CFG.accel * dt;
  else if (fwd < 0) car.speed -= (car.speed > 0.5 ? CAR_CFG.brake : CAR_CFG.accel * 0.6) * dt;
  else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR_CFG.drag * 8 * dt);
  car.speed = Math.max(-CAR_CFG.maxReverse, Math.min(CAR_CFG.maxSpeed, car.speed));
  const steerAmt = steer * CAR_CFG.steer * dt * (car.speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(car.speed) / 6 + 0.25);
  car.heading += steerAmt * Math.sign(car.speed || 1);
  const prev = { x: car.pos.x, z: car.pos.z };
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  car.pos.x = Math.max(-170, Math.min(170, car.pos.x));
  car.pos.z = Math.max(-170, Math.min(172, car.pos.z));
  if (resolveCollisions(car.pos, CAR_CFG.radius, colliders)) {
    const impact = Math.abs(car.speed);
    car.speed *= -0.25;
    if (impact > 8 && onCrash) onCrash(impact);
    // nudge out along the wall so we do not stick
    car.pos.x = prev.x; car.pos.z = prev.z;
  }
  syncCar(car);
}

export function spawnTraffic(scene, rng) {
  const cars = [];
  for (let i = 0; i < 7; i++) {
    const vertical = rng() < 0.5;
    const road = vertical ? pick(rng, ROAD_XS) : pick(rng, ROAD_ZS);
    const dir = rng() < 0.5 ? 1 : -1;
    const lane = (rng() < 0.5 ? -3 : 3);
    const t = range(rng, -140, 140);
    const car = makeCar(
      vertical ? road + lane : t, vertical ? t : road + lane,
      vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      pick(rng, CAR_COLORS),
      { traffic: true, axis: vertical ? 'z' : 'x', dir, lane, cruise: range(rng, 7, 11) },
    );
    car.speed = car.cruise;
    scene.add(car.mesh); syncCar(car); cars.push(car);
  }
  return cars;
}

// Traffic: drive along the current road lane; at intersections sometimes turn.
export function updateTraffic(cars, dt, rng) {
  for (const car of cars) {
    car.turnCooldown -= dt;
    const along = car.axis === 'z' ? car.pos.z : car.pos.x;
    // Near an intersection centre? Turn with some probability.
    const roads = car.axis === 'z' ? ROAD_ZS : ROAD_XS;
    for (const r of roads) {
      if (Math.abs(along - r) < 1.2 && car.turnCooldown <= 0 && rng() < 0.35) {
        // Turn 90 degrees onto the cross road.
        const turnLeft = rng() < 0.5;
        car.heading += turnLeft ? Math.PI / 2 : -Math.PI / 2;
        car.axis = car.axis === 'z' ? 'x' : 'z';
        car.dir = Math.abs(Math.sin(car.heading)) > 0.5 ? (Math.sin(car.heading) > 0 ? 1 : -1) : (Math.cos(car.heading) > 0 ? 1 : -1);
        car.turnCooldown = 4;
        break;
      }
    }
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    // Wrap around the city edge so traffic never runs out.
    if (car.pos.x > 175) car.pos.x = -175; if (car.pos.x < -175) car.pos.x = 175;
    if (car.pos.z > 178) car.pos.z = -175; if (car.pos.z < -175) car.pos.z = 178;
    syncCar(car);
  }
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null, bd = maxDist;
  for (const c of cars) {
    const d = Math.hypot(c.pos.x - x, c.pos.z - z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
