// Rex Marlowe on foot: stylised box figure, WASD movement relative to camera yaw,
// building collision, punch, enter/exit cars.
import { THREE } from './three-shim.js';
import { PLAYER_CFG } from './config.js';
import { resolveCollisions } from './city.js';

const SKIN = 0xd9a066, JACKET = 0x2fa8a0, PANTS = 0x2c3242, SHOE = 0x1c1c22;

export function createPlayerMesh() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), mat(JACKET));
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), mat(SKIN));
  head.position.y = 1.82; head.castShadow = true; g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.46), mat(0x1a1210));
  hair.position.y = 2.05; g.add(hair);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.75, 0.32), mat(PANTS));
  legL.position.set(-0.19, 0.38, 0); legL.castShadow = true; g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.19; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.26), mat(JACKET));
  armL.position.set(-0.48, 1.18, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.48; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

export function createPedMesh(rng) {
  const g = createPlayerMesh();
  const jacket = [0xc94f4f, 0x4f7ac9, 0x7ac94f, 0xc9a44f, 0x9a4fc9, 0xd9d9d9][Math.floor(rng() * 6)];
  g.children[0].material = new THREE.MeshLambertMaterial({ color: jacket });
  g.children[4].material = new THREE.MeshLambertMaterial({ color: jacket });
  g.children[5].material = new THREE.MeshLambertMaterial({ color: jacket });
  g.scale.setScalar(0.95 + rng() * 0.12);
  return g;
}

// Move on foot. `move` is {x, y} in camera space (y = forward). Returns distance moved.
export function updateOnFoot(state, move, sprint, dt) {
  const p = state.player;
  const speed = sprint ? PLAYER_CFG.sprint : PLAYER_CFG.walk;
  const yaw = state.camYaw;
  const mx = Math.sin(yaw) * move.y + Math.cos(yaw) * move.x;
  const mz = Math.cos(yaw) * move.y - Math.sin(yaw) * move.x;
  const len = Math.hypot(mx, mz);
  let moved = 0;
  if (len > 0.01) {
    const nx = mx / len, nz = mz / len;
    p.pos.x += nx * speed * dt; p.pos.z += nz * speed * dt;
    p.pos.x = Math.max(-170, Math.min(170, p.pos.x));
    p.pos.z = Math.max(-170, Math.min(172, p.pos.z));
    const target = Math.atan2(nx, nz);
    let d = target - p.heading;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    p.heading += d * Math.min(1, dt * 12);
    moved = speed * dt;
    p.walkPhase += dt * (sprint ? 14 : 9);
  }
  resolveCollisions(p.pos, PLAYER_CFG.radius, state.city.colliders);
  const u = p.mesh.userData;
  const swing = len > 0.01 ? Math.sin(p.walkPhase) * 0.55 : 0;
  u.legL.rotation.x = swing; u.legR.rotation.x = -swing;
  u.armL.rotation.x = -swing * 0.8; u.armR.rotation.x = swing * 0.8;
  p.mesh.position.set(p.pos.x, 0, p.pos.z);
  p.mesh.rotation.y = p.heading;
  return moved;
}
