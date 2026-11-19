// Recovery note: the NBPD heat — how pursuit cars appear, chase, ram, and finally make the bust.
// NBPD pursuit units. One to four cars spawn while the player has heat,
// chase the player down the roads, ram the player's car, and — on foot —
// close in until they can make the bust. They steer straight at the
// player and slow down as they arrive, so they stay on top of a runner
// instead of overshooting them.

import { THREE } from './three-shim.js';
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

// ---- Police helicopter -------------------------------------------------
// VISUAL ONLY: the heli never busts, never rams, never damages the
// player. It joins the chase once the heat hits CFG.heliMinWanted
// (3 stars) and leaves when the heat drops below it — pure air support
// theatre, a circling spotlight over the player's car. No real THREE
// lights: the software renderer cannot afford them, so the beam is a
// translucent cone mesh and the pool of light a flat bright circle.

export function createHeli(scene) {
  const group = new THREE.Group();
  // The body group carries the heading rotation; the outer group stays
  // unrotated so the spotlight cone/spot (aimed in world space every
  // frame) are never skewed by the heading.
  const body = new THREE.Group();
  group.add(body);

  const hullMat = new THREE.MeshLambertMaterial({ color: 0x8b98a8 }); // pale grey-blue: reads against the dusk sky
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14161f });
  const redMat = new THREE.MeshLambertMaterial({ color: 0xc22a2a });

  // Chunky body, readable at ~15 m in a 1280x720 frame.
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 4.6), hullMat);
  hull.position.y = 0;
  body.add(hull);
  // Glass nose.
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.7, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x9fd8e8 }),
  );
  glass.position.set(0, 0.45, 1.6);
  body.add(glass);
  // Red stripe down the flanks (slightly wider than the hull so it reads).
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.38, 4.0), redMat);
  stripe.position.y = 0.1;
  body.add(stripe);
  // Tail boom + fin.
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 3.4), hullMat);
  boom.position.set(0, 0.25, -3.8);
  body.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.9), redMat);
  fin.position.set(0, 0.7, -5.3);
  body.add(fin);
  // Skids: two bars on four short struts.
  for (const sx of [-0.9, 0.9]) {
    const skid = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 4.0), darkMat);
    skid.position.set(sx, -1.0, 0);
    body.add(skid);
    for (const sz of [-1.2, 1.2]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), darkMat);
      strut.position.set(sx, -0.72, sz);
      body.add(strut);
    }
  }
  // Spotlight bulb under the nose (unlit white = always bright).
  const bulb = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.3, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  bulb.position.set(0, -0.85, 1.9);
  body.add(bulb);

  // Main rotor on a mast: two crossed blades read as a spinning disc.
  const mast = new THREE.Mesh(
    new THREE.CylinderGeometry(0.16, 0.16, 0.9, 8),
    darkMat,
  );
  mast.position.y = 1.05;
  body.add(mast);
  const rotor = new THREE.Group();
  rotor.position.y = 1.55;
  const bladeMat = new THREE.MeshLambertMaterial({ color: 0x1a1d26 });
  const bladeA = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.1, 0.55), bladeMat);
  rotor.add(bladeA);
  const bladeB = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 9.5), bladeMat);
  rotor.add(bladeB);
  body.add(rotor);

  // Small tail rotor on the boom's port side, spinning around X.
  const tailRotor = new THREE.Group();
  tailRotor.position.set(0.5, 0.5, -5.2);
  const tailBlade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.8, 0.25), bladeMat);
  tailRotor.add(tailBlade);
  body.add(tailRotor);

  // Spotlight beam: narrow at the heli, wide at the ground. Height is
  // the straight-line heli-to-player distance at the configured orbit.
  // Kept slim (3.5 m base, faint) on purpose: a fat beam from the low
  // chase camera washes out the whole frame.
  const beamLen = Math.hypot(CFG.heliOrbit, CFG.heliAltitude);
  const cone = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 3.5, beamLen, 12, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.12,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  group.add(cone);
  // Bright pool of light on the ground under the player. Radius matches
  // the cone's base so the beam lands exactly inside the pool.
  const spot = new THREE.Mesh(
    new THREE.CircleGeometry(4, 24),
    new THREE.MeshBasicMaterial({
      color: 0xfff2b0, transparent: true, opacity: 0.25,
      side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  spot.rotation.x = -Math.PI / 2;
  group.add(spot);

  group.visible = false;
  scene.add(group);
  return {
    pos: { x: 0, z: 0 },
    y: CFG.heliAltitude,
    angle: 0,
    orbitAngle: 0,
    active: false,
    group, rotor, cone, spot,
    body, tailRotor,
  };
}

// One frame of helicopter. Spawns when wanted reaches CFG.heliMinWanted,
// despawns below it. Returns 'spawned' exactly once, on the frame the
// heli appears, so the caller can toast "AIR SUPPORT"; otherwise null.
export function updateHeli(heli, playerPos, wanted, dt, time) {
  if (wanted >= CFG.heliMinWanted && !heli.active) {
    heli.active = true;
    heli.group.visible = true;
    // Start the orbit due north of the player so it is in view at once.
    heli.orbitAngle = -Math.PI / 2;
    // Fall through and position it this same frame.
    positionHeli(heli, playerPos, dt, time);
    return 'spawned';
  }
  if (wanted < CFG.heliMinWanted && heli.active) {
    heli.active = false;
    heli.group.visible = false;
    return null;
  }
  if (!heli.active) return null;
  positionHeli(heli, playerPos, dt, time);
  return null;
}

function positionHeli(heli, playerPos, dt, time) {
  heli.orbitAngle += CFG.heliAngularSpeed * dt;
  // Gentle bob so the hover never looks frozen.
  heli.y = CFG.heliAltitude + Math.sin(time * 1.5) * 1.2;
  heli.pos.x = playerPos.x + Math.cos(heli.orbitAngle) * CFG.heliOrbit;
  heli.pos.z = playerPos.z + Math.sin(heli.orbitAngle) * CFG.heliOrbit;
  heli.group.position.set(heli.pos.x, heli.y, heli.pos.z);
  // Face the direction of travel (tangent to the orbit).
  heli.angle = Math.atan2(-Math.sin(heli.orbitAngle), Math.cos(heli.orbitAngle));
  heli.body.rotation.y = heli.angle;
  heli.rotor.rotation.y += dt * 20;
  heli.tailRotor.rotation.x += dt * 30;

  // Aim the beam at the player: cone/spot are children of the
  // (unrotated) group, so their local offsets are world offsets.
  const lx = playerPos.x - heli.pos.x;
  const ly = -heli.y;
  const lz = playerPos.z - heli.pos.z;
  const len = Math.hypot(lx, ly, lz) || 1;
  heli.cone.position.set(lx / 2, ly / 2, lz / 2);
  heli.cone.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-lx / len, -ly / len, -lz / len),
  );
  heli.spot.position.set(lx, -heli.y + 0.15, lz);
}
