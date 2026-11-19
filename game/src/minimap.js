// 2D top-down minimap on a small canvas: roads, blocks, ocean, player arrow,
// traffic (yellow), police (red/blue), mission $ markers (gold), pickups (green).
import { CITY_HALF, ROAD_XS, ROAD_ZS } from './config.js';

export function drawMinimap(canvas, state) {
  const g = canvas.getContext('2d');
  const S = canvas.width, H = CITY_HALF + 30;
  const to = (x, z) => [(x / H + 1) / 2 * S, (z / H + 1) / 2 * S];
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#17131f'; g.fillRect(0, 0, S, S);
  // Ocean strip (south edge, bottom of the map).
  g.fillStyle = '#1e6f8e';
  const [, oy] = to(0, CITY_HALF);
  g.fillRect(0, oy, S, S - oy);
  // Blocks.
  g.fillStyle = '#3a3345';
  for (const bx of [-104, -52, 0, 52, 104]) for (const bz of [-104, -52, 0, 52, 104]) {
    const [x, y] = to(bx - 20, bz - 20);
    g.fillRect(x, y, 40 / (2 * H) * S, 40 / (2 * H) * S);
  }
  // Roads.
  g.strokeStyle = '#6b6478'; g.lineWidth = 3;
  for (const x of ROAD_XS) { const [px] = to(x, 0); g.beginPath(); g.moveTo(px, 0); g.lineTo(px, S); g.stroke(); }
  for (const z of ROAD_ZS) { const [, py] = to(0, z); g.beginPath(); g.moveTo(0, py); g.lineTo(S, py); g.stroke(); }
  // Pickups.
  g.fillStyle = '#2fae5f';
  for (const b of state.missions.pickups) {
    if (b.taken) continue;
    const [x, y] = to(b.x, b.z); g.fillRect(x - 2, y - 2, 4, 4);
  }
  // Mission markers.
  g.font = 'bold 13px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const m of state.missions.missions) {
    if (m.robbed) continue;
    const [x, y] = to(m.x, m.z);
    g.fillStyle = '#ffd23f';
    g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#17131f'; g.fillText('$', x, y + 0.5);
  }
  // Traffic.
  g.fillStyle = '#ffe27a';
  for (const c of state.traffic) { const [x, y] = to(c.pos.x, c.pos.z); g.fillRect(x - 2, y - 2, 4, 4); }
  // Police.
  for (const c of state.police) {
    const [x, y] = to(c.pos.x, c.pos.z);
    g.fillStyle = '#ff4040'; g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4080ff'; g.lineWidth = 2; g.stroke();
  }
  // Player arrow.
  const p = state.player;
  const px = p.onFoot ? p.pos.x : p.car.pos.x;
  const pz = p.onFoot ? p.pos.z : p.car.pos.z;
  const heading = p.onFoot ? p.heading : p.car.heading;
  const [x, y] = to(px, pz);
  g.save(); g.translate(x, y); g.rotate(heading);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, S - 1, S - 1);
}
