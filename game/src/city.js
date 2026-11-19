// Recovery note: this module builds the whole city you see — streets, towers, beach and all the neon — from code alone, no image files.
// Neon Bay itself: dusk sky, 5x5 blocks, beach and ocean to the south,
// canvas-painted facades and neon signs, instanced lamps, palms and road
// markings. No loaded assets — every texture is drawn on a canvas here.
// Also owns the building colliders and the AABB push-out every walker
// (player, pedestrians, police) shares.

import { THREE } from './three-shim.js';
import { CFG } from './config.js';
import { range } from './random.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// One facade variant: dark wall, a grid of windows, a random subset lit
// warm. Returns { map, glow } — glow is black except the lit windows,
// used as the emissive map so the city reads at dusk.
function facadeVariant(rng, base) {
  const lit = [];
  const map = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 2);
    const cols = 6, rows = 12;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = 8 + c * 19, y = 10 + r * 20;
        const on = rng() < 0.45;
        if (on) lit.push([x, y]);
        g.fillStyle = on ? '#ffd27a' : '#1c2436';
        g.fillRect(x, y, 12, 12);
      }
    }
  });
  const glow = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffca6a';
    for (const [x, y] of lit) g.fillRect(x, y, 12, 12);
  });
  return { map, glow };
}

function signTexture(text, color) {
  return canvasTexture(256, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    // Shrink the font until the text fits the canvas: "NEON BAY PIER"
    // at 40 px is ~336 px wide and loses its first and last letters.
    let size = 40;
    g.font = `bold ${size}px Arial, sans-serif`;
    while (g.measureText(text).width > w - 16 && size > 12) {
      size -= 2;
      g.font = `bold ${size}px Arial, sans-serif`;
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = color;
    g.shadowBlur = 18;
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
    g.shadowBlur = 4;
    g.fillStyle = '#ffffff';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

// Wooden-plank deck texture, drawn like facadeVariant/signTexture:
// ten planks running the length of the pier (canvas v = pier z),
// alternating warm wood tones, dark gaps, grain streaks and staggered
// butt joints so the deck reads as boards, not a flat brown slab.
function plankTexture() {
  return canvasTexture(256, 512, (g, w, h) => {
    g.fillStyle = '#5d4126';
    g.fillRect(0, 0, w, h);
    const planks = 10, pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const x = i * pw;
      g.fillStyle = i % 2 ? '#7d5732' : '#966f42';
      g.fillRect(x + 1.5, 0, pw - 3, h);
      // Grain: two wavy streaks down the length of each plank.
      g.strokeStyle = 'rgba(60,35,15,0.35)';
      g.lineWidth = 1.5;
      for (let s = 0; s < 2; s++) {
        const gx = x + pw * (0.3 + 0.4 * s);
        g.beginPath();
        g.moveTo(gx, 0);
        for (let y = 0; y <= h; y += 32) g.lineTo(gx + Math.sin(y / 47 + i * 2 + s * 3) * 2.5, y);
        g.stroke();
      }
      // Butt joints, staggered per plank so no joint runs across the deck.
      g.fillStyle = 'rgba(40,22,8,0.65)';
      const joints = i % 2 ? [128, 384] : [256];
      for (const y of joints) g.fillRect(x + 1.5, y, pw - 3, 3);
    }
  });
}

// Push a circle (pos, radius) out of every building AABB it overlaps.
// Mutates pos in place, returns true if anything pushed.
export function pushOutOfBuildings(pos, radius, colliders) {
  let pushed = false;
  for (const b of colliders) {
    const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // Dead centre inside the box: shove out along the shortest face.
      const left = pos.x - b.minX, right = b.maxX - pos.x;
      const top = pos.z - b.minZ, bottom = b.maxZ - pos.z;
      const m = Math.min(left, right, top, bottom);
      if (m === left) pos.x = b.minX - radius;
      else if (m === right) pos.x = b.maxX + radius;
      else if (m === top) pos.z = b.minZ - radius;
      else pos.z = b.maxZ + radius;
    }
    pushed = true;
  }
  return pushed;
}

// Random point inside the built-up square that is not inside any
// building (expanded by `margin`). Falls back to a road centre.
export function sampleClearSpot(rng, colliders, margin = 2) {
  for (let tries = 0; tries < 60; tries++) {
    const x = range(rng, -130, 130);
    const z = range(rng, -130, 130);
    const inside = colliders.some((b) =>
      x > b.minX - margin && x < b.maxX + margin &&
      z > b.minZ - margin && z < b.maxZ + margin);
    if (!inside) return { x, z };
  }
  const road = CFG.roadCenters[Math.floor(rng() * CFG.roadCenters.length)];
  return { x: road, z: range(rng, -120, 120) };
}

export function buildCity(scene, rng) {
  const colliders = [];
  const H = CFG.halfCity;

  scene.fog = new THREE.Fog(CFG.fogColor, 120, 520);
  scene.add(new THREE.HemisphereLight(0x9a7bd0, 0x3a2a1a, 0.95));
  const sun = new THREE.DirectionalLight(0xff9a4d, 1.25);
  sun.position.set(-90, 55, -60);
  scene.add(sun);

  // Dusk gradient dome.
  const skyTex = canvasTexture(4, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1d0b38');
    grad.addColorStop(0.45, '#5b2166');
    grad.addColorStop(0.72, '#c94b6d');
    grad.addColorStop(1, '#ff8a3d');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(620, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Ground, roads, sidewalk slabs, beach, ocean.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 1100),
    new THREE.MeshLambertMaterial({ color: 0x1b1b24 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  scene.add(ground);

  const roadMat = new THREE.MeshLambertMaterial({ color: CFG.asphalt });
  const roadGeo = new THREE.PlaneGeometry(CFG.roadWidth, H * 2 + CFG.roadWidth);
  for (const c of CFG.roadCenters) {
    const v = new THREE.Mesh(roadGeo, roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(c, 0, 0);
    scene.add(v);
    const hz = new THREE.Mesh(roadGeo, roadMat);
    hz.rotation.x = -Math.PI / 2;
    hz.rotation.z = Math.PI / 2;
    hz.position.set(0, 0, c);
    scene.add(hz);
  }
  const slabMat = new THREE.MeshLambertMaterial({ color: CFG.sidewalk });
  const slabGeo = new THREE.PlaneGeometry(CFG.blockSize, CFG.blockSize);
  for (const bx of CFG.blockCenters) {
    for (const bz of CFG.blockCenters) {
      const slab = new THREE.Mesh(slabGeo, slabMat);
      slab.rotation.x = -Math.PI / 2;
      slab.position.set(bx, 0.02, bz);
      scene.add(slab);
    }
  }
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(420, CFG.beachEnd - CFG.beachStart),
    new THREE.MeshLambertMaterial({ color: CFG.sandColor }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (CFG.beachStart + CFG.beachEnd) / 2);
  scene.add(sand);
  // Ocean: just above the ground plane (y -0.05) so it is actually
  // visible — at y -0.08 it sat underneath the ground and the whole
  // south side read as black void. Still below the sand (0.02).
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(1100, 420),
    new THREE.MeshLambertMaterial({ color: CFG.oceanColor }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.02, CFG.oceanStart + 210);
  scene.add(ocean);

  // Dashed centre lines, one InstancedMesh for all twelve roads.
  const dashGeo = new THREE.PlaneGeometry(0.35, 3);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c86a });
  const dashSpots = [];
  for (const c of CFG.roadCenters) {
    for (let t = -128; t <= 128; t += 8) {
      dashSpots.push([c, t, 0]);
      dashSpots.push([t, c, 1]);
    }
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const eul = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  dashSpots.forEach(([x, z, horiz], i) => {
    eul.set(-Math.PI / 2, 0, horiz ? Math.PI / 2 : 0);
    q.setFromEuler(eul);
    m4.compose(new THREE.Vector3(x, 0.04, z), q, one);
    dashes.setMatrixAt(i, m4);
  });
  scene.add(dashes);

  // Buildings: 1-3 per block, kept 5 m clear of the block edge so the
  // corner beacons and sidewalks stay open.
  const bases = ['#3a3f5e', '#4a3560', '#2f4a55', '#54364a'];
  const variants = bases.map((b) => facadeVariant(rng, b));
  const buildingMats = variants.map((v) => new THREE.MeshLambertMaterial({
    map: v.map, emissiveMap: v.glow, emissive: 0xffffff, emissiveIntensity: 0.85,
  }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const signDefs = [
    { text: 'HOTEL', color: '#ff5da2', at: [-104, -104] },
    { text: 'CASINO', color: '#ffd23d', at: [0, -52] },
    { text: '24/7', color: '#4de3ff', at: [-52, 52] },
    { text: 'BAY BANK', color: '#7dff8a', at: [52, -104] },
  ];
  const signMeshes = [];
  for (const bx of CFG.blockCenters) {
    for (const bz of CFG.blockCenters) {
      const downtown = 1 - Math.hypot(bx, bz) / 220;
      const count = 1 + Math.floor(rng() * 3);
      const spots = [];
      if (count === 1) {
        spots.push({ ox: 0, oz: 0, w: range(rng, 20, 27), d: range(rng, 20, 27) });
      } else if (count === 2) {
        const vertical = rng() < 0.5;
        for (const s of [-8, 8]) {
          spots.push({
            ox: vertical ? 0 : s, oz: vertical ? s : 0,
            w: vertical ? range(rng, 18, 24) : range(rng, 13, 16),
            d: vertical ? range(rng, 13, 16) : range(rng, 18, 24),
          });
        }
      } else {
        for (const s of [-9, 0, 9]) {
          spots.push({ ox: s, oz: -6, w: range(rng, 11, 13), d: range(rng, 12, 15) });
        }
        spots.push({ ox: 0, oz: 8, w: range(rng, 16, 20), d: range(rng, 9, 11) });
      }
      for (const s of spots) {
        const w = s.w, d = s.d;
        const h = Math.round(range(rng, 8, 16) + downtown * range(rng, 6, 24));
        const x = bx + s.ox, z = bz + s.oz;
        const mesh = new THREE.Mesh(boxGeo, buildingMats[Math.floor(rng() * buildingMats.length)]);
        mesh.scale.set(w, h, d);
        mesh.position.set(x, h / 2, z);
        scene.add(mesh);
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        for (const def of signDefs) {
          if (def.at[0] === bx && def.at[1] === bz && !def.placed) {
            def.placed = true;
            const sign = new THREE.Mesh(
              new THREE.PlaneGeometry(16, 4),
              new THREE.MeshBasicMaterial({ map: signTexture(def.text, def.color), transparent: true, side: THREE.DoubleSide }),
            );
            sign.position.set(x, Math.min(h - 2, 14), z + d / 2 + 0.15);
            scene.add(sign);
            signMeshes.push(sign);
          }
        }
      }
    }
  }

  // Street lamps: one instanced pole mesh + one instanced bulb mesh.
  const lampSpots = [];
  for (const c of CFG.roadCenters) {
    for (let t = -120; t <= 120; t += 26) {
      lampSpots.push([c + 5.4, t]);
      lampSpots.push([t, c + 5.4]);
    }
  }
  const poleGeo = new THREE.BoxGeometry(0.18, 5.2, 0.18);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2c2c38 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, lampSpots.length);
  lampSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, 2.6, z), new THREE.Quaternion(), one);
    poles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 5.3, z), new THREE.Quaternion(), one);
    bulbs.setMatrixAt(i, m4);
  });
  scene.add(poles);
  scene.add(bulbs);

  // Palm trees: a beach row plus a few sidewalk singles.
  const palmSpots = [];
  for (let x = -150; x <= 150; x += 13) palmSpots.push([x + range(rng, -3, 3), 146 + range(rng, -3, 5)]);
  for (let i = 0; i < 16; i++) {
    const s = sampleClearSpot(rng, colliders, 3);
    // Keep the robbery beacons clear: a palm in front of a `$` ring
    // would hide the player standing in it.
    const nearTarget = CFG.targets.some((t) => Math.hypot(s.x - t.x, s.z - t.z) < 16);
    if (!nearTarget) palmSpots.push([s.x, s.z]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const canopyGeo = new THREE.ConeGeometry(2.6, 3.2, 7);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x2f7d4a });
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, palmSpots.length);
  palmSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, 3, z), new THREE.Quaternion(), one);
    trunks.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 7.2, z), new THREE.Quaternion(), one);
    canopies.setMatrixAt(i, m4);
  });
  scene.add(trunks);
  scene.add(canopies);

  // ---- Boardwalk / pier (round 4, Task E) ---------------------------
  // A wooden pier on the south beach, centred on CFG.pierX, running
  // from the sand (z = CFG.pierStartZ) out over the ocean to
  // z = CFG.pierEndZ. The deck top sits at y ~= 0.05, flush with the
  // sand (y = 0.02), so the player walks on and off with no step.
  // WALKABLE BY DESIGN: the pier adds NO entries to `colliders` —
  // no push-out anywhere on the deck or the end platform, so the
  // player can walk from the spawn (0, 150) straight out over the
  // water to the end platform. Rails, posts and lamp poles are visual
  // only for the same reason; nothing on the pier blocks movement.
  // No new lights: emissive/basic materials only (software renderer).
  // The beach palm row (z ~= 146) is untouched — the pier crosses it
  // between palms, and a palm flanking the deck edge is fine because
  // palms have no colliders either.
  const pierLen = CFG.pierEndZ - CFG.pierStartZ; // 44 m
  const pierMidZ = (CFG.pierStartZ + CFG.pierEndZ) / 2; // 170
  const deckTex = plankTexture();
  const deckEdgeMat = new THREE.MeshLambertMaterial({ color: 0x5d4126 });
  const deckTopMat = new THREE.MeshLambertMaterial({ map: deckTex });

  // Deck: thin slab for a visible edge over the water, plank-textured
  // plane on top. Slab top y = 0.05, plane y = 0.055 (no z-fight).
  const deckSlab = new THREE.Mesh(
    new THREE.BoxGeometry(CFG.pierWidth, 0.1, pierLen), deckEdgeMat);
  deckSlab.position.set(CFG.pierX, 0, pierMidZ);
  scene.add(deckSlab);
  const deckTop = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.pierWidth, pierLen), deckTopMat);
  deckTop.rotation.x = -Math.PI / 2;
  deckTop.position.set(CFG.pierX, 0.055, pierMidZ);
  scene.add(deckTop);

  // Support piles: instanced cylinders under both deck edges, tops at
  // the deck underside (y = 0.05), dropping 2.4 m into sand / water.
  // Over the ocean only ~0.13 m shows above the waterline — the deck
  // is flush by design — but the pile line reads from the beach.
  const pileSpots = [];
  for (let z = CFG.pierStartZ + 2; z <= CFG.pierEndZ - 2; z += 4) {
    pileSpots.push([CFG.pierX - CFG.pierWidth / 2 + 0.4, z]);
    pileSpots.push([CFG.pierX + CFG.pierWidth / 2 - 0.4, z]);
  }
  const piles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.26, 0.3, 2.4, 7),
    new THREE.MeshLambertMaterial({ color: 0x4a3421 }),
    pileSpots.length);
  pileSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, -1.15, z), new THREE.Quaternion(), one);
    piles.setMatrixAt(i, m4);
  });
  scene.add(piles);

  // Edge rails: instanced posts both sides + two long thin rail bars.
  const railPostSpots = [];
  for (let z = CFG.pierStartZ + 2; z <= CFG.pierEndZ; z += 4) {
    railPostSpots.push([CFG.pierX - CFG.pierWidth / 2 + 0.15, z]);
    railPostSpots.push([CFG.pierX + CFG.pierWidth / 2 - 0.15, z]);
  }
  const railMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
  const railPosts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 1.05, 0.14), railMat, railPostSpots.length);
  railPostSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, 0.575, z), new THREE.Quaternion(), one);
    railPosts.setMatrixAt(i, m4);
  });
  scene.add(railPosts);
  // Rail bars run post-to-post (z 150..190), not the full deck length,
  // so neither end floats unsupported past the last post.
  const railBarGeo = new THREE.BoxGeometry(0.14, 0.14, pierLen - 4);
  for (const side of [-1, 1]) {
    const bar = new THREE.Mesh(railBarGeo, railMat);
    bar.position.set(CFG.pierX + side * (CFG.pierWidth / 2 - 0.15), 1.08, pierMidZ);
    scene.add(bar);
  }

  // Pier lamps: same pattern as the street lamps (instanced poles +
  // instanced emissive bulbs, reusing poleMat/bulbMat), three lamps
  // alternating sides so the walkway centre stays clear.
  const pierLampSpots = [
    [CFG.pierX - 4.3, 158], [CFG.pierX + 4.3, 172], [CFG.pierX - 4.3, 186],
  ];
  const pierPoles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 3.0, 0.14), poleMat, pierLampSpots.length);
  const pierBulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.28, 8, 6), bulbMat, pierLampSpots.length);
  pierLampSpots.forEach(([x, z], i) => {
    m4.compose(new THREE.Vector3(x, 1.55, z), new THREE.Quaternion(), one);
    pierPoles.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, 3.15, z), new THREE.Quaternion(), one);
    pierBulbs.setMatrixAt(i, m4);
  });
  scene.add(pierPoles);
  scene.add(pierBulbs);

  // End platform: a wider square deck at the ocean end, centred on
  // z = CFG.pierEndZ, 16 m wide x 10 m deep (x -8..8, z 187..197),
  // same flush top. Its top plane sits 5 mm above the deck plane so
  // the overlap (z 187..192) never z-fights.
  const platformSlab = new THREE.Mesh(
    new THREE.BoxGeometry(16, 0.1, 10), deckEdgeMat);
  platformSlab.position.set(CFG.pierX, -0.002, CFG.pierEndZ);
  scene.add(platformSlab);
  const platformTop = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 10), deckTopMat);
  platformTop.rotation.x = -Math.PI / 2;
  platformTop.position.set(CFG.pierX, 0.06, CFG.pierEndZ);
  scene.add(platformTop);

  // "NEON BAY PIER" sign on two posts at the platform's south edge
  // (z = 196.4, centre y = 2.5, 12 m x 3 m). Two back-to-back planes
  // so the text reads correctly from BOTH sides: the north-facing
  // plane (rotation.y = PI) reads from the beach / city, and the
  // south-facing plane reads from a camera south of the pier looking
  // north, with the pier stretching away behind it. Both are pushed
  // to signMeshes like the other neon signs.
  const pierSignMat = new THREE.MeshBasicMaterial({
    map: signTexture('NEON BAY PIER', '#ff7a3d'), transparent: true,
  });
  // The posts stand just OUTSIDE the 12 m sign (x ±6.8) and a touch
  // behind its plane (z 196.8): at ±5.5, coplanar with the sign, they
  // sat exactly on the first and last letters and hid the "N" and "R".
  const signPostGeo = new THREE.BoxGeometry(0.2, 2.6, 0.2);
  for (const sx of [-6.8, 6.8]) {
    const post = new THREE.Mesh(signPostGeo, poleMat);
    post.position.set(CFG.pierX + sx, 1.35, 196.8);
    scene.add(post);
  }
  const pierSignNorth = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), pierSignMat);
  pierSignNorth.rotation.y = Math.PI;
  pierSignNorth.position.set(CFG.pierX, 2.5, 196.4);
  scene.add(pierSignNorth);
  signMeshes.push(pierSignNorth);
  const pierSignSouth = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), pierSignMat);
  pierSignSouth.position.set(CFG.pierX, 2.5, 196.52);
  scene.add(pierSignSouth);
  signMeshes.push(pierSignSouth);

  // Beach umbrellas: four on the sand near the pier base, all clear
  // of the spawn (0, 150) and >= 9 m from the pier centre line (the
  // deck edge is 5 m out), so nobody spawns under one and the
  // walkway stays open. Poles instanced; canopies are four warm
  // colours, one mesh each.
  const umbrellaSpots = [
    { x: -9, z: 154, color: 0xff6b4a },
    { x: 9, z: 152, color: 0xffc94d },
    { x: -11, z: 163, color: 0xff8a5c },
    { x: 10, z: 165, color: 0xffd23d },
  ];
  const umbrellaPoles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6),
    new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }),
    umbrellaSpots.length);
  umbrellaSpots.forEach((u, i) => {
    m4.compose(new THREE.Vector3(u.x, 1.15, u.z), new THREE.Quaternion(), one);
    umbrellaPoles.setMatrixAt(i, m4);
    const canopy = new THREE.Mesh(
      new THREE.ConeGeometry(1.7, 0.9, 8),
      new THREE.MeshLambertMaterial({ color: u.color }));
    canopy.position.set(u.x, 2.55, u.z);
    scene.add(canopy);
  });
  scene.add(umbrellaPoles);

  return { colliders, signMeshes };
}
