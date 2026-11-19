// Robbery targets + cash-bag pickups: floating $ beacons, hold-E robberies, minimap markers.
import { THREE } from './three-shim.js';
import { PICKUP_COUNT, PICKUP_VALUE, ROBBERY } from './config.js';
import { range } from './random.js';

export const MISSION_DEFS = [
  // Block-corner spots on the sidewalk edge: building footprints never reach
  // the corners, so the beacons are never buried inside a building.
  { name: 'Casa Oro Jewelers', x: -85, z: -33, amount: [800, 1500] },
  { name: 'Bay Federal Bank', x: 33, z: -85, amount: [1000, 1500] },
  { name: '24/7 Mini-Mart', x: 85, z: 33, amount: [500, 900] },
];

function dollarTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.font = 'bold 96px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ffd23f'; g.shadowBlur = 16; g.fillStyle = '#ffd23f';
  g.fillText('$', 64, 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMissions(scene, rng, colliders = []) {
  const tex = dollarTexture();
  const missions = MISSION_DEFS.map((d) => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sprite.scale.set(5, 5, 1); sprite.position.set(d.x, 5.5, d.z);
    scene.add(sprite);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.6, 3.4, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true, opacity: 0.8 }),
    );
    ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.35, d.z); scene.add(ring);
    return { ...d, robbed: false, sprite, ring, progress: 0 };
  });
  const bagGeo = new THREE.BoxGeometry(0.9, 0.6, 0.9);
  const bagMat = new THREE.MeshLambertMaterial({ color: 0x2fae5f, emissive: 0x0a3a1a });
  const pickups = [];
  const spots = [];
  let guard = 0;
  while (spots.length < PICKUP_COUNT && guard++ < 500) {
    const x = range(rng, -150, 150), z = range(rng, -150, 150);
    if (spots.some((s) => Math.hypot(s.x - x, s.z - z) < 25)) continue;
    // Never inside a building (unreachable): reject and resample.
    if (colliders.some((c) => x > c.x0 - 1.5 && x < c.x1 + 1.5 && z > c.z0 - 1.5 && z < c.z1 + 1.5)) continue;
    spots.push({ x, z });
  }
  for (const s of spots) {
    const mesh = new THREE.Mesh(bagGeo, bagMat);
    mesh.position.set(s.x, 0.6, s.z); mesh.castShadow = true; scene.add(mesh);
    pickups.push({ ...s, taken: false, mesh });
  }
  return { missions, pickups };
}

// Returns events: {robbed: mission|null, picked: n}. Call every frame while playing.
export function updateMissions(state, holdingE, dt) {
  const p = state.player;
  const px = p.onFoot ? p.pos.x : p.car.pos.x;
  const pz = p.onFoot ? p.pos.z : p.car.pos.z;
  let robbed = null, picked = 0;
  for (const m of state.missions.missions) {
    if (m.robbed) { m.progress = 0; continue; }
    const d = Math.hypot(m.x - px, m.z - pz);
    if (p.onFoot && d < ROBBERY.radius && holdingE) {
      m.progress += dt / ROBBERY.holdSeconds;
      if (m.progress >= 1) {
        m.robbed = true; m.progress = 0;
        m.sprite.visible = false; m.ring.visible = false;
        robbed = m;
      }
    } else m.progress = 0;
  }
  for (const bag of state.missions.pickups) {
    if (bag.taken) continue;
    if (Math.hypot(bag.mesh.position.x - px, bag.mesh.position.z - pz) < 2.2) {
      bag.taken = true; bag.mesh.visible = false; picked += 1;
    }
  }
  return { robbed, picked };
}

export function nearestMission(state) {
  const p = state.player;
  const px = p.onFoot ? p.pos.x : p.car.pos.x;
  const pz = p.onFoot ? p.pos.z : p.car.pos.z;
  let best = null, bd = Infinity;
  for (const m of state.missions.missions) {
    if (m.robbed) continue;
    const d = Math.hypot(m.x - px, m.z - pz);
    if (d < bd) { bd = d; best = { mission: m, dist: d }; }
  }
  return best;
}
