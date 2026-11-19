// Recovery note: the money trail — the three robbery spots and the loose cash bags that get Rex to $5,000.
// Missions and money: the three robbery targets with their floating `$`
// beacons, and the eight green cash bags scattered around the city.
// A robbery pays out once per target; bags pay $100 each on touch.
//
// Round 4 — mission chain: the three targets in CFG.targets order are a
// sequential chain of three named jobs. Only the current job's target is
// robbable and only its beacon is visible; finishing a job reveals the
// next beacon and fires a `mission-complete` event (the bonus cash itself
// is added by main.js, not here).

import { THREE } from './three-shim.js';
import { CFG, HEAT, randInt } from './config.js';
import { sampleClearSpot } from './city.js';

// The chain, in CFG.targets order. `targetId` matches CFG.targets[].id;
// `id` is the mission's own slug. Fresh `done` flags are made per run
// inside createMissions so a reset never shares state with an old chain.
const CHAIN_DEFS = [
  { id: 'gold-touch', name: 'The Gold Touch', brief: 'Lift the gold, quiet and quick.', targetId: 'jewelers' },
  { id: 'vault-job', name: 'The Vault Job', brief: 'Crack the vault and take the big haul.', targetId: 'bank' },
  { id: 'quick-score', name: 'The Quick Score', brief: 'In and out fast — grab the till.', targetId: 'mart' },
];

export function currentMission(missions) {
  if (!missions || !Array.isArray(missions.chain)) return null;
  return missions.chain[missions.currentIndex] || null;
}

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

  // Chain order matches CFG.targets order, so targets[i] is chain[i]'s spot.
  const chain = CHAIN_DEFS.map((def) => ({ ...def, done: false }));
  // Only the first job's beacon is visible at the start of a run. Match
  // by targetId (not by index) so the chain stays right even if the
  // CFG.targets order ever changes.
  targets.forEach((t) => { t.group.visible = t.id === chain[0].targetId; });

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
  return { targets, pickups, chain, currentIndex: 0 };
}

export function resetMissions(missions) {
  for (const t of missions.targets) {
    t.robbed = false;
    t.progress = 0;
  }
  // Chain back to job 1; only its beacon comes back.
  if (Array.isArray(missions.chain)) {
    for (const m of missions.chain) m.done = false;
    missions.currentIndex = 0;
  }
  missions.targets.forEach((t) => {
    // Only job 1's beacon comes back — matched by targetId, as in create.
    t.group.visible = Array.isArray(missions.chain) && missions.chain.length > 0
      ? t.id === missions.chain[0].targetId
      : false;
    t.ring.material.opacity = 0.9;
  });
  for (const b of missions.pickups) {
    b.taken = false;
    b.mesh.visible = true;
  }
}

// Animate only the current beacon (bob + spin) and gently pulse its
// ring's opacity; the bags keep their slow spin as before. Future
// beacons are hidden and robbed ones stay hidden, so neither animates.
export function animateMissions(missions, time) {
  const mission = currentMission(missions);
  if (mission) {
    const t = missions.targets.find((tr) => tr.id === mission.targetId);
    if (t && !t.robbed) {
      t.glyph.position.y = 5 + Math.sin(time * 2 + t.x) * 0.5;
      t.glyph.rotation.y = time * 0.8;
      t.ring.material.opacity = 0.75 + 0.15 * Math.sin(time * 2.5);
    }
  }
  missions.pickups.forEach((b, i) => {
    if (!b.taken) b.mesh.rotation.y = time * 1.2 + i;
  });
}

// Run one frame of robbery + pickup logic. `s` is the game state, `fx`
// the effects the game wires in (toast / sound are called by the game
// through the returned events instead of here, so this stays testable).
// Returns { events, active }: events are { type, ... } objects, active
// is the target currently being robbed (for the HUD progress bar).
// Only the current chain job's target is robbable — standing in a
// future target's ring does nothing until its turn comes.
export function updateMissions(missions, player, holdingE, dt, rng, s) {
  const events = [];
  let active = null;
  const mission = currentMission(missions);
  if (mission) {
    const t = missions.targets.find((tr) => tr.id === mission.targetId);
    if (t && !t.robbed) {
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
          // Chain advance: mark this job done, reveal the next beacon.
          mission.done = true;
          missions.currentIndex += 1;
          const next = currentMission(missions);
          if (next) {
            const nt = missions.targets.find((tr) => tr.id === next.targetId);
            if (nt) nt.group.visible = true;
          }
          // Bonus cash is NOT added here — main.js adds CFG.missionBonus
          // and toasts it when it handles this event.
          events.push({ type: 'mission-complete', mission, bonus: CFG.missionBonus });
        }
      } else if (t.progress > 0) {
        t.progress = Math.max(0, t.progress - dt / CFG.robSeconds);
        if (inRing) active = t;
      }
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
