// Recovery note: stages each screenshot scene from the real running game, then raises the flag the harness waits for.
// Deterministic screenshot staging for ?shot=<name>&seed=1.
// Builds on the real game (a fresh seeded world from main.js), puts it
// in the scene each shot needs, simulates it forward a few seconds so
// traffic, beacons and police are alive in the frame, paints twice, and
// sets window.__shotReady. No animation loop runs in shot mode — the
// harness drives everything from here, which is also what lets the
// functional tests step the same game by hand.
//
//   start — title screen over the dusk city
//   play  — on foot at the Casa Oro `$` beacon, HUD + minimap visible
//   drive — driving north up the neon avenue at speed
//   chase — three wanted stars, NBPD units closing in to ram

import { CFG } from './config.js';

const IDLE = { axis: { x: 0, y: 0 }, sprint: false, holdingE: false, pressed: new Set() };
const FOOT_DOWN = { axis: { x: 0, y: 1 }, sprint: false, holdingE: false, pressed: new Set() };

function step(game, n, input) {
  for (let i = 0; i < n; i++) game.update(1 / 60, input);
}

function paint(game) {
  game.render();
  game.render();
}

// Put the player in a parked car (no heat — it is empty) at the given
// spot, heading north, already rolling.
function stageDriving(game, x, z, speed) {
  const s = game.state;
  const car = s.parked[0];
  game.enterCar(car);
  car.pos.x = x;
  car.pos.z = z;
  car.angle = Math.PI; // forward (sin PI, cos PI) = (0, -1): north
  car.speed = speed;
  car.mesh.position.set(x, 0, z);
  car.mesh.rotation.y = Math.PI;
  s.camYaw = 0; // camera behind, looking north up the avenue
}

export function stageShot(game, name) {
  const s = game.state;
  if (name === 'play') {
    game.start();
    s.cash = 1200;
    s.player.pos.x = -79;
    s.player.pos.z = -30;
    s.player.mesh.position.set(-79, 0, -30);
    s.player.angle = -Math.PI / 2; // facing west, at the beacon
    s.camYaw = Math.PI / 2; // camera east of Rex, looking west
    step(game, 30, IDLE);
    paint(game);
  } else if (name === 'drive') {
    game.start();
    s.cash = 1200;
    stageDriving(game, 26, 40, 24);
    step(game, 90, FOOT_DOWN); // accelerate up the avenue
    paint(game);
  } else if (name === 'chase') {
    game.start();
    s.cash = 1200;
    stageDriving(game, 26, 10, 12);
    s.wanted = 3;
    s.wantedTimer = CFG.decaySeconds;
    step(game, 5, IDLE); // let the force spawn its three units
    const cops = s.police;
    if (cops[0]) {
      cops[0].pos.x = 22; cops[0].pos.z = 26;
      cops[0].angle = Math.PI; cops[0].speed = 14;
    }
    if (cops[1]) {
      cops[1].pos.x = 30; cops[1].pos.z = 29;
      cops[1].angle = Math.PI; cops[1].speed = 14;
    }
    step(game, 150, IDLE); // coast while the NBPD closes in and rams
    paint(game);
  } else {
    // 'start' and anything unknown: the title screen over the city.
    step(game, 30, IDLE);
    paint(game);
  }
  window.__shotReady = true;
}
