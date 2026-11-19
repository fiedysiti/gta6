// NEON BAY city: 5x5 blocks between 6 roads each way, dusk look, ocean to the south.
// All textures are procedural canvas textures; no external assets.
import { THREE } from './three-shim.js';
import { BLOCK_CENTERS, CITY_HALF, PALETTE, PITCH, ROAD_XS, ROAD_ZS } from './config.js';
import { pick, range } from './random.js';

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildingTexture(rng, base) {
  return canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    const cols = 6, rows = 14;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.55;
      g.fillStyle = lit ? pick(rng, ['#ffd27a', '#ffe9a8', '#9fd8ff', '#ffb36b']) : '#1c2438';
      g.globalAlpha = lit ? 0.95 : 0.8;
      g.fillRect(8 + x * 19, 10 + y * 17, 12, 10);
    }
    g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, h - 14, w, 14);
  });
}

function neonTexture(text, color, bg = '#14081f') {
  return canvasTexture(256, 96, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = color; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18; g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

function skyTexture() {
  return canvasTexture(16, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, PALETTE.skyTop); grad.addColorStop(0.55, PALETTE.skyMid); grad.addColorStop(1, PALETTE.skyLow);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
}

// Push a circle (x,z,r) out of every building AABB it overlaps. Returns true if it hit.
export function resolveCollisions(p, r, colliders) {
  let hit = false;
  for (const c of colliders) {
    const nx = Math.max(c.x0, Math.min(p.x, c.x1));
    const nz = Math.max(c.z0, Math.min(p.z, c.z1));
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      hit = true;
      if (d2 > 1e-6) {
        const d = Math.sqrt(d2);
        p.x = nx + (dx / d) * r; p.z = nz + (dz / d) * r;
      } else {
        // centre inside the box: push out along the smallest penetration axis
        const pl = p.x - c.x0, pr = c.x1 - p.x, pt = p.z - c.z0, pb = c.z1 - p.z;
        const m = Math.min(pl, pr, pt, pb);
        if (m === pl) p.x = c.x0 - r; else if (m === pr) p.x = c.x1 + r;
        else if (m === pt) p.z = c.z0 - r; else p.z = c.z1 + r;
      }
    }
  }
  return hit;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const wallColors = ['#c98a7a', '#d9a06b', '#7a9bb8', '#b8a7c9', '#e0b48f', '#8fb8a8', '#c9c9d9'];
  const texes = wallColors.map((c) => buildingTexture(rng, c));
  const mats = texes.map((t) => new THREE.MeshLambertMaterial({ map: t, emissive: 0x222222, emissiveMap: t, emissiveIntensity: 0.55 }));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a3340 });

  // Sky dome + fog + lights
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 120, 620);
  const sun = new THREE.DirectionalLight(new THREE.Color(PALETTE.sun), 1.6);
  sun.position.set(-120, 90, -160); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -90; sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90; sun.shadow.camera.bottom = -90;
  sun.shadow.camera.far = 600; sun.shadow.bias = -0.002;
  scene.add(sun); scene.add(sun.target);
  scene.add(new THREE.HemisphereLight(new THREE.Color(PALETTE.hemiSky), new THREE.Color(PALETTE.hemiGround), 0.85));

  // Ground: asphalt, then a sidewalk slab per block, then a sand strip + ocean to the south.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1100, 1100), new THREE.MeshLambertMaterial({ color: PALETTE.asphalt }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(1100, 26), new THREE.MeshLambertMaterial({ color: PALETTE.sand }));
  sand.rotation.x = -Math.PI / 2; sand.position.set(0, 0.02, CITY_HALF + 13); sand.receiveShadow = true; scene.add(sand);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(1100, 500), new THREE.MeshLambertMaterial({ color: PALETTE.ocean, emissive: 0x0a2f45 }));
  ocean.rotation.x = -Math.PI / 2; ocean.position.set(0, 0.01, CITY_HALF + 26 + 250); scene.add(ocean);

  const sidewalkMat = new THREE.MeshLambertMaterial({ color: PALETTE.sidewalk });
  const markingMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a0 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2a2a30 });
  const lampGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const dummy = new THREE.Object3D();

  // Road centre dashes along every road — one InstancedMesh, not ~300 meshes.
  const dashPositions = [];
  for (const x of ROAD_XS) for (let z = -150; z <= 150; z += 12) dashPositions.push([x, z, 0]);
  for (const z of ROAD_ZS) for (let x = -150; x <= 150; x += 12) dashPositions.push([x, z, Math.PI / 2]);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.05, 4), markingMat, dashPositions.length);
  dashPositions.forEach(([x, z, rot], i) => {
    dummy.position.set(x, 0.05, z); dummy.rotation.set(0, rot, 0); dummy.updateMatrix();
    dashes.setMatrixAt(i, dummy.matrix);
  });
  dashes.instanceMatrix.needsUpdate = true; scene.add(dashes);

  // Sidewalk slabs + lamps: instanced too.
  const slabPositions = [];
  const lampPositions = [];
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    slabPositions.push([bx, bz]);
    lampPositions.push([bx + 20, bz - 20]); // NE corner: clear of the mission markers
  }
  const slabs = new THREE.InstancedMesh(boxGeo, sidewalkMat, slabPositions.length);
  slabPositions.forEach(([bx, bz], i) => {
    dummy.position.set(bx, 0.15, bz); dummy.rotation.set(0, 0, 0); dummy.scale.set(42, 0.3, 42); dummy.updateMatrix();
    slabs.setMatrixAt(i, dummy.matrix);
  });
  slabs.instanceMatrix.needsUpdate = true; slabs.receiveShadow = true; scene.add(slabs);
  dummy.scale.set(1, 1, 1);
  const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lampMat, lampPositions.length);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.35, 8, 6), lampGlowMat, lampPositions.length);
  lampPositions.forEach(([x, z], i) => {
    dummy.position.set(x, 3.5, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 7.1, z); dummy.updateMatrix();
    bulbs.setMatrixAt(i, dummy.matrix);
  });
  poles.instanceMatrix.needsUpdate = true; bulbs.instanceMatrix.needsUpdate = true;
  scene.add(poles); scene.add(bulbs);

  // Blocks: 1-2 buildings (or a palm plaza) per block.
  const palmTrunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a3a });
  const palmLeafMat = new THREE.MeshLambertMaterial({ color: 0x2f7a4a });
  const palmPositions = [];
  function palm(x, z) { palmPositions.push([x, z]); }

  const signs = [
    { text: 'HOTEL', color: '#ff5ea8' }, { text: 'CASINO', color: '#ffd23f' },
    { text: '24/7', color: '#5eff8a' }, { text: 'BAY BANK', color: '#5ec8ff' },
  ];
  let signIdx = 0;
  for (const bx of BLOCK_CENTERS) for (const bz of BLOCK_CENTERS) {
    const roll = rng();
    if (roll < 0.18) { // plaza with palms
      palm(bx - 10, bz - 8); palm(bx + 11, bz + 9); palm(bx + 8, bz - 11);
      continue;
    }
    const two = rng() < 0.4;
    const spots = two ? [[-9, 0, 20, 34], [11, 0, 16, 34]] : [[0, 0, 32, 32]];
    for (const [ox, , w, d] of spots) {
      const hgt = range(rng, 8, 40);
      const mat = mats[Math.floor(rng() * mats.length)];
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(w, hgt, d); b.position.set(bx + ox, hgt / 2 + 0.3, bz);
      b.castShadow = true; b.receiveShadow = true; scene.add(b);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w + 0.6, 0.5, d + 0.6); roof.position.set(bx + ox, hgt + 0.55, bz); scene.add(roof);
      colliders.push({ x0: bx + ox - w / 2, x1: bx + ox + w / 2, z0: bz - d / 2, z1: bz + d / 2 });
      // Neon sign on some taller buildings, facing the nearest road.
      if (hgt > 18 && rng() < 0.5) {
        const s = signs[signIdx++ % signs.length];
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(10, 3.75),
          new THREE.MeshBasicMaterial({ map: neonTexture(s.text, s.color), transparent: false }),
        );
        sign.position.set(bx + ox, hgt * 0.75, bz + d / 2 + 0.15);
        scene.add(sign);
      }
    }
  }
  // Palms along the beach promenade + plazas — two InstancedMeshes.
  // (Lamps were already instanced above, for every block including plazas.)
  for (let x = -140; x <= 140; x += 35) palm(x, CITY_HALF - 4);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 6, 6), palmTrunkMat, palmPositions.length);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 2.2, 6), palmLeafMat, palmPositions.length);
  palmPositions.forEach(([x, z], i) => {
    dummy.position.set(x, 3, z); dummy.rotation.set(0, 0, 0); dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(x, 6.6, z); dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix);
  });
  trunks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks); scene.add(leaves);

  return { colliders, sun, cityHalf: CITY_HALF };
}
