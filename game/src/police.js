// NBPD: police cars spawn when wanted >= 1, chase and ram the player, chase on foot
// when the player is on foot. Touching the player on foot for a moment = BUSTED.
import { THREE } from './three-shim.js';
import { WANTED } from './config.js';
import { makeCar } from './cars.js';
import { resolveCollisions } from './city.js';

export function spawnPolice(scene, x, z, heading) {
  const car = makeCar(x, z, heading, 0xffffff, { police: true });
  car.speed = 0;
  scene.add(car.mesh);
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = heading;
  return car;
}

function steerToward(car, tx, tz, dt, maxSpeed, colliders) {
  const dx = tx - car.pos.x, dz = tz - car.pos.z;
  const want = Math.atan2(dx, dz);
  let d = want - car.heading;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  car.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
  car.speed = Math.min(maxSpeed, car.speed + 14 * dt);
  car.pos.x += Math.sin(car.heading) * car.speed * dt;
  car.pos.z += Math.cos(car.heading) * car.speed * dt;
  resolveCollisions(car.pos, 1.6, colliders);
  car.mesh.position.set(car.pos.x, 0, car.pos.z);
  car.mesh.rotation.y = car.heading;
}

// `target` is {x, z, speed, onFoot}. Returns {ram: impactSpeed} when it rams the player car,
// and sets state.player.bustProgress toward 1 while a police car is touching the player on foot.
export function updatePolice(state, dt) {
  const p = state.player;
  const tx = p.onFoot ? p.pos.x : p.car.pos.x;
  const tz = p.onFoot ? p.pos.z : p.car.pos.z;
  let touching = false;
  let ram = 0;
  for (const cop of state.police) {
    cop.flash += dt;
    const u = cop.mesh.userData;
    const on = Math.floor(cop.flash * 6) % 2 === 0;
    if (u.lightRed) u.lightRed.visible = on;
    if (u.lightBlue) u.lightBlue.visible = !on;
    const d0 = Math.hypot(cop.pos.x - tx, cop.pos.z - tz);
    // Arrive behaviour on foot: slow down as we close in, so the unit stays
    // on the player instead of overshooting past them (BUSTED must be reachable).
    const maxSpeed = p.onFoot ? Math.min(12, Math.max(1.5, d0 * 1.2)) : 31;
    steerToward(cop, tx, tz, dt, maxSpeed, state.city.colliders);
    const d = Math.hypot(cop.pos.x - tx, cop.pos.z - tz);
    if (p.onFoot) {
      if (d < WANTED.bustDistance) touching = true;
    } else if (d < 3.4 && cop.speed > 6) {
      // Ram: shove the player car and damage the player.
      ram = Math.max(ram, cop.speed);
      const px = p.car.pos.x - cop.pos.x, pz = p.car.pos.z - cop.pos.z;
      const len = Math.hypot(px, pz) || 1;
      p.car.pos.x += (px / len) * 1.2; p.car.pos.z += (pz / len) * 1.2;
      p.car.speed *= 0.6;
      cop.speed *= 0.4;
    }
  }
  if (touching) p.bustProgress = Math.min(1, p.bustProgress + dt / WANTED.bustTime);
  else p.bustProgress = Math.max(0, p.bustProgress - dt * 2);
  return { ram, touching };
}

export function desiredPoliceCount(wanted) {
  return wanted <= 0 ? 0 : Math.min(4, 1 + Math.floor(wanted / 2));
}
