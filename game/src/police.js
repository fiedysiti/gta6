// Recovery note: the NBPD heat — how pursuit cars appear, chase, ram, and finally make the bust.
// NBPD pursuit units. One to four cars spawn while the player has heat,
// chase the player down the roads, ram the player's car, and — on foot —
// close in until they can make the bust. They steer straight at the
// player and slow down as they arrive, so they stay on top of a runner
// instead of overshooting them.

import { CFG, clamp } from './config.js';
import { makeCarMesh } from './cars.js';
import { pushOutOfBuildings } from './city.js';

export function wantedPoliceCount(wanted) {
  if (wanted <= 0) return 0;
  return Math.min(wanted, CFG.maxPolice);
}

function spawnSpot(playerPos, rng) {
  // A road position 35-55 m from the player, on the nearest road line.
  const vertical = rng() < 0.5;
  if (vertical) {
    const road = CFG.roadCenters.reduce((a, b) =>
      Math.abs(b - playerPos.x) < Math.abs(a - playerPos.x) ? b : a);
    return {
      x: road + (rng() < 0.5 ? -3 : 3),
      z: clamp(playerPos.z + (rng() < 0.5 ? -1 : 1) * (35 + rng() * 20), -128, 128),
    };
  }
  const road = CFG.roadCenters.reduce((a, b) =>
    Math.abs(b - playerPos.z) < Math.abs(a - playerPos.z) ? b : a);
  return {
    x: clamp(playerPos.x + (rng() < 0.5 ? -1 : 1) * (35 + rng() * 20), -128, 128),
    z: road + (rng() < 0.5 ? -3 : 3),
  };
}

export function createPoliceUnit(scene, pos) {
  const built = makeCarMesh(scene, 0xe8e8e8, true);
  const unit = {
    pos: { x: pos.x, z: pos.z },
    angle: 0,
    speed: 0,
    kind: 'police',
    mesh: built.group,
    barL: built.barL,
    barR: built.barR,
    bustTimer: 0,
    flashT: 0,
  };
  unit.mesh.position.set(pos.x, 0, pos.z);
  return unit;
}

// Top the force up to the wanted level. Returns nothing; mutates the
// police array in place.
export function maintainPolice(police, scene, playerPos, wanted, rng) {
  const want = wantedPoliceCount(wanted);
  while (police.length < want) {
    police.push(createPoliceUnit(scene, spawnSpot(playerPos, rng)));
  }
  while (police.length > want) {
    const gone = police.pop();
    scene.remove(gone.mesh);
  }
}

function turnToward(unit, targetAngle, dt) {
  let diff = targetAngle - unit.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const maxTurn = 3.0 * dt;
  unit.angle += clamp(diff, -maxTurn, maxTurn);
}

// One frame of pursuit. `hooks` carries the callbacks the game wires in:
// onBust() when a foot bust completes, onRam(impact) when a unit clips
// the player's car hard, and damagePlayer(n) for the ram itself.
export function updatePolice(police, player, dt, colliders, hooks) {
  const target = player.onFoot ? player.pos : player.car.pos;
  for (const u of police) {
    const dx = target.x - u.pos.x, dz = target.z - u.pos.z;
    const dist = Math.hypot(dx, dz);
    const wantAngle = Math.atan2(dx, dz);
    turnToward(u, wantAngle, dt);
    // Arrive behaviour: ease off the throttle as the gap closes.
    const cruise = player.onFoot ? 9 : CFG.policeTopSpeed;
    const desired = clamp(dist * 0.85, 0, cruise);
    u.speed += clamp(desired - u.speed, -22 * dt, 12 * dt);
    u.pos.x += Math.sin(u.angle) * u.speed * dt;
    u.pos.z += Math.cos(u.angle) * u.speed * dt;
    pushOutOfBuildings(u.pos, 2.1, colliders);
    u.pos.x = clamp(u.pos.x, -160, 160);
    u.pos.z = clamp(u.pos.z, -160, 160);
    u.mesh.position.set(u.pos.x, 0, u.pos.z);
    u.mesh.rotation.y = u.angle;

    // Flashing light bar.
    u.flashT += dt;
    const redOn = Math.floor(u.flashT * 3) % 2 === 0;
    if (u.barL) u.barL.material.color.setHex(redOn ? 0xff2222 : 0x551111);
    if (u.barR) u.barR.material.color.setHex(redOn ? 0x111155 : 0x2244ff);

    if (player.onFoot) {
      if (dist < CFG.bustRange) {
        u.bustTimer += dt;
        if (u.bustTimer >= CFG.bustSeconds) hooks.onBust();
      } else {
        u.bustTimer = Math.max(0, u.bustTimer - dt);
      }
    } else if (dist < 3.8) {
      // Ram: shove the player's car and hurt the player if it was fast.
      const impact = Math.abs(u.speed);
      if (impact > 4) {
        hooks.onRam(impact);
        u.speed *= 0.4;
        // Shove the player's car away from the ram.
        const shove = Math.min(2.5, impact * 0.12);
        player.car.pos.x += ((player.car.pos.x - u.pos.x) / (dist || 1)) * shove;
        player.car.pos.z += ((player.car.pos.z - u.pos.z) / (dist || 1)) * shove;
      }
    }
  }
}
