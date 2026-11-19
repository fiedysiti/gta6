// Recovery note: the money trail — the three robbery spots and the loose cash bags that get Rex to $5,000.
// Missions and money: the three robbery targets with their floating `$`
// beacons, and the eight green cash bags scattered around the city.
// A robbery pays out once per target; bags pay $100 each on touch.

import { THREE } from './three-shim.js';
import { CFG, HEAT, randInt } from './config.js';
import { sampleClearSpot } from './city.js';

function dollarTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.font = 'bold 96px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#ffd23d';
  g.shadowBlur = 22;
  g.fillStyle = '#ffd23d';
  g.fillText('$', 64, 68);
  g.shadowBlur = 0;
  g.fillStyle = '#fff3c4';
  g.fillText('$', 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMissions(scene, rng, colliders) {
  const dollarTex = dollarTexture();
  const targets = CFG.targets.map((def) => {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3.4, 4.1, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd23d, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.4, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xffd23d, transparent: true, opacity: 0.14,
        side: THREE.DoubleSide, depthWrite: false,
      }),
    );
    pillar.position.y = 13;
    group.add(pillar);
    const glyph = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 4.4),
      new THREE.MeshBasicMaterial({ map: dollarTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
    );
    glyph.position.y = 5;
    group.add(glyph);
    group.position.set(def.x, 0, def.z);
    scene.add(group);
    return { ...def, robbed: false, progress: 0, group, glyph, ring };
  });

  const pickups = [];
  const bagGeo = new THREE.BoxGeometry(0.9, 0.55, 0.6);
  const bagMat = new THREE.MeshLambertMaterial({ color: 0x2fd35f, emissive: 0x0d5c22, emissiveIntensity: 0.7 });
  for (let i = 0; i < CFG.bagCount; i++) {
    const spot = sampleClearSpot(rng, colliders, 2.5);
    const mesh = new THREE.Mesh(bagGeo, bagMat);
    mesh.position.set(spot.x, 0.35, spot.z);
    scene.add(mesh);
    pickups.push({ x: spot.x, z: spot.z, taken: false, mesh });
  }
  return { targets, pickups };
}

export function resetMissions(missions) {
  for (const t of missions.targets) {
    t.robbed = false;
    t.progress = 0;
    t.group.visible = true;
  }
  for (const b of missions.pickups) {
    b.taken = false;
    b.mesh.visible = true;
  }
}

// Animate the beacon glyphs (bob + spin) and the bags (slow spin).
export function animateMissions(missions, time) {
  for (const t of missions.targets) {
    if (t.robbed) continue;
    t.glyph.position.y = 5 + Math.sin(time * 2 + t.x) * 0.5;
    t.glyph.rotation.y = time * 0.8;
  }
  missions.pickups.forEach((b, i) => {
    if (!b.taken) b.mesh.rotation.y = time * 1.2 + i;
  });
}

// Run one frame of robbery + pickup logic. `s` is the game state, `fx`
// the effects the game wires in (toast / sound are called by the game
// through the returned events instead of here, so this stays testable).
// Returns an array of event objects: { type, ... }.
export function updateMissions(missions, player, holdingE, dt, rng, s) {
  const events = [];
  let active = null;
  for (const t of missions.targets) {
    if (t.robbed) continue;
    const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
    const inRing = player.onFoot && d < CFG.robRange;
    if (inRing && holdingE) {
      t.progress += dt / CFG.robSeconds;
      active = t;
      if (t.progress >= 1) {
        const payout = randInt(rng, t.min, t.max);
        t.robbed = true;
        t.progress = 0;
        t.group.visible = false;
        events.push({ type: 'robbed', target: t, payout });
      }
    } else if (t.progress > 0) {
      t.progress = Math.max(0, t.progress - dt / CFG.robSeconds);
      if (inRing) active = t;
    }
  }
  if (player.onFoot) {
    for (const b of missions.pickups) {
      if (b.taken) continue;
      if (Math.hypot(player.pos.x - b.x, player.pos.z - b.z) < CFG.bagRange) {
        b.taken = true;
        b.mesh.visible = false;
        events.push({ type: 'bag', bag: b, payout: CFG.bagValue });
      }
    }
  }
  return { events, active };
}

export { HEAT };
