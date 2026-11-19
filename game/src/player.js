// Recovery note: Rex on foot, plus the twelve pedestrians who share his walk cycle and his habit of bouncing off walls.
// On-foot figures: Rex Marlowe (the player) and the twelve pedestrians.
// Both share the same walk-cycle box figure and the same building
// push-out; pedestrians add wandering and fleeing, the player adds
// camera-relative WASD movement and sprinting.

import { THREE } from './three-shim.js';
import { CFG, clamp } from './config.js';
import { pushOutOfBuildings, sampleClearSpot } from './city.js';
import { range } from './random.js';

const JACKET = 0x1fb6a6;
const SKIN = 0xe8b88a;
const PANTS = 0x2b3245;

function buildFigure(scene, jacket, pants) {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), mat(jacket));
  torso.position.y = 1.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.42, 0.4), mat(SKIN));
  head.position.y = 1.75;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.72, 0.3), mat(pants));
  legL.position.set(-0.18, 0.36, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.18;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.24), mat(jacket));
  armL.position.set(-0.48, 1.1, 0);
  g.add(armL);
  const armR = armL.clone();
  armR.position.x = 0.48;
  g.add(armR);
  scene.add(g);
  return { group: g, legL, legR, armL, armR };
}

export function createPlayer(scene) {
  const fig = buildFigure(scene, JACKET, PANTS);
  return {
    pos: { x: CFG.spawn.x, z: CFG.spawn.z },
    angle: Math.PI, // facing north, into the city from the beach
    onFoot: true,
    car: null,
    mesh: fig.group,
    parts: fig,
    walkPhase: 0,
    moving: false,
    stepped: false, // overwritten every frame by updatePlayerOnFoot:
    // true only on the frame the walk phase crosses a multiple of PI;
    // the loop reads it and calls sound.footstep() for that step
  };
}

// Move on foot, relative to the camera yaw. Forward on screen is away
// from the camera: (-sin yaw, -cos yaw) in world xz.
export function updatePlayerOnFoot(player, input, dt, colliders, camYaw) {
  const speed = input.sprint ? CFG.sprintSpeed : CFG.walkSpeed;
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
  const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
  let mx = fx * input.axis.y + rx * input.axis.x;
  let mz = fz * input.axis.y + rz * input.axis.x;
  const len = Math.hypot(mx, mz);
  player.moving = len > 0.01;
  if (player.moving) {
    const prevStep = Math.floor(player.walkPhase / Math.PI);
    mx /= len; mz /= len;
    player.pos.x += mx * speed * dt;
    player.pos.z += mz * speed * dt;
    player.angle = Math.atan2(mx, mz);
    player.walkPhase += dt * speed * 1.7;
    // One footstep per half walk-cycle: the phase crossed a multiple of PI.
    player.stepped = Math.floor(player.walkPhase / Math.PI) > prevStep;
  } else {
    player.stepped = false;
  }
  player.pos.x = clamp(player.pos.x, -168, 168);
  // South edge: the beach ends at z 166, but the pier runs to z 197 —
  // let Rex walk the boardwalk to its end (and wade the shallows
  // beside it) instead of hitting an invisible wall at the sand.
  player.pos.z = clamp(player.pos.z, -168, 197);
  pushOutOfBuildings(player.pos, CFG.playerRadius, colliders);
  player.mesh.position.set(player.pos.x, 0, player.pos.z);
  player.mesh.rotation.y = player.angle;
  // Sprinting swings the limbs 25% wider than walking.
  const swing = player.moving ? Math.sin(player.walkPhase) * 0.55 * (input.sprint ? 1.25 : 1) : 0;
  player.parts.legL.rotation.x = swing;
  player.parts.legR.rotation.x = -swing;
  player.parts.armL.rotation.x = -swing * 0.8;
  player.parts.armR.rotation.x = swing * 0.8;
}

// ---- Pedestrians -------------------------------------------------------

const PED_JACKETS = [0xd94f6a, 0x4f7dd9, 0xe0a83c, 0x7dd94f, 0x9a5fd9, 0xd9d9d9];

export function createPedestrians(scene, rng, colliders) {
  const peds = [];
  for (let i = 0; i < CFG.pedCount; i++) {
    const spot = sampleClearSpot(rng, colliders, 2);
    const fig = buildFigure(scene, PED_JACKETS[i % PED_JACKETS.length], 0x333a4d);
    fig.group.scale.setScalar(0.94 + rng() * 0.12);
    peds.push({
      pos: { x: spot.x, z: spot.z },
      angle: rng() * Math.PI * 2,
      speed: 0,
      target: { x: spot.x, z: spot.z },
      fallen: 0,
      mesh: fig.group,
      parts: fig,
      walkPhase: rng() * 6,
      retargetIn: rng() * 2,
    });
  }
  return peds;
}

export function updatePedestrians(peds, dt, colliders, rng, threat, wanted) {
  for (const p of peds) {
    if (p.fallen > 0) {
      p.fallen -= dt;
      p.mesh.rotation.z = p.fallen > 0 ? Math.PI / 2 : 0;
      if (p.fallen <= 0) p.mesh.rotation.z = 0;
      continue;
    }
    // Flee the player when there is heat, or any car that gets close.
    let run = null;
    if (wanted > 0 && threat) {
      const d2 = (p.pos.x - threat.x) ** 2 + (p.pos.z - threat.z) ** 2;
      if (d2 < 30 * 30) run = threat;
    }
    let tx, tz, spd;
    if (run) {
      const dx = p.pos.x - run.x, dz = p.pos.z - run.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = p.pos.x + (dx / d) * 12;
      tz = p.pos.z + (dz / d) * 12;
      spd = CFG.pedFlee;
    } else {
      p.retargetIn -= dt;
      const arrived = Math.hypot(p.target.x - p.pos.x, p.target.z - p.pos.z) < 1.2;
      if (arrived || p.retargetIn <= 0) {
        p.retargetIn = range(rng, 3, 8);
        const t = {
          x: clamp(p.pos.x + range(rng, -22, 22), -132, 132),
          z: clamp(p.pos.z + range(rng, -22, 22), -132, 132),
        };
        pushOutOfBuildings(t, 1, colliders);
        p.target = t;
      }
      tx = p.target.x; tz = p.target.z;
      spd = CFG.pedWalk;
    }
    const dx = tx - p.pos.x, dz = tz - p.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      p.pos.x += (dx / d) * spd * dt;
      p.pos.z += (dz / d) * spd * dt;
      p.angle = Math.atan2(dx, dz);
      p.walkPhase += dt * spd * 2.2;
    }
    pushOutOfBuildings(p.pos, 0.55, colliders);
    p.mesh.position.set(p.pos.x, 0, p.pos.z);
    p.mesh.rotation.y = p.angle;
    const swing = Math.sin(p.walkPhase) * 0.5;
    p.parts.legL.rotation.x = swing;
    p.parts.legR.rotation.x = -swing;
    p.parts.armL.rotation.x = -swing * 0.7;
    p.parts.armR.rotation.x = swing * 0.7;
  }
}
