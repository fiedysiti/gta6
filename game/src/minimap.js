// Top-down minimap on a 180 px canvas: roads, blocks, ocean, the player
// arrow, traffic (yellow), police (flashing red/blue), robbery `$`
// markers and cash bags (green). Drawn from the same state the game
// simulates, so it can never disagree with the world.

import { CFG } from './config.js';

const SIZE = 180;
// World spans -170 .. +170; the ocean strip lives past +136.
function toMap(v) { return ((v + 170) / 340) * SIZE; }

export function drawMinimap(canvas, s) {
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, SIZE, SIZE);
  // Ocean along the south edge.
  g.fillStyle = '#0e4d6e';
  g.fillRect(0, toMap(136), SIZE, SIZE - toMap(136));
  // Blocks.
  g.fillStyle = '#2c2838';
  for (const bx of CFG.blockCenters) {
    for (const bz of CFG.blockCenters) {
      g.fillRect(toMap(bx - 20), toMap(bz - 20), 40 / 340 * SIZE, 40 / 340 * SIZE);
    }
  }
  // Roads.
  g.strokeStyle = '#55555f';
  g.lineWidth = 12 / 340 * SIZE;
  for (const c of CFG.roadCenters) {
    g.beginPath(); g.moveTo(toMap(c), 0); g.lineTo(toMap(c), SIZE); g.stroke();
    g.beginPath(); g.moveTo(0, toMap(c)); g.lineTo(SIZE, toMap(c)); g.stroke();
  }
  // Cash bags.
  g.fillStyle = '#2fd35f';
  for (const b of s.missions.pickups) {
    if (b.taken) continue;
    g.beginPath(); g.arc(toMap(b.x), toMap(b.z), 2.5, 0, Math.PI * 2); g.fill();
  }
  // Robbery markers.
  g.font = 'bold 11px Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const t of s.missions.targets) {
    if (t.robbed) continue;
    g.fillStyle = '#ffd23d';
    g.fillText('$', toMap(t.x), toMap(t.z));
  }
  // Traffic.
  g.fillStyle = '#ffe14d';
  for (const c of s.traffic) {
    g.fillRect(toMap(c.pos.x) - 2, toMap(c.pos.z) - 2, 4, 4);
  }
  for (const c of s.parked) {
    g.fillStyle = '#9a9aa8';
    g.fillRect(toMap(c.pos.x) - 2, toMap(c.pos.z) - 2, 4, 4);
  }
  // Police, flashing with wall time.
  const red = Math.floor(performance.now() / 300) % 2 === 0;
  g.fillStyle = red ? '#ff3333' : '#3388ff';
  for (const u of s.police) {
    g.beginPath(); g.arc(toMap(u.pos.x), toMap(u.pos.z), 3.5, 0, Math.PI * 2); g.fill();
  }
  // Player arrow, rotated to the facing angle.
  const px = toMap(s.player.pos.x), pz = toMap(s.player.pos.z);
  g.save();
  g.translate(px, pz);
  // Canvas y points down, so the map direction of the facing angle
  // (sin a, cos a) needs a rotation of PI - a for an up-drawn arrow.
  g.rotate(Math.PI - s.player.angle);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath();
  g.fill();
  g.restore();
}
