// Shared helpers: seeded RNG, 2D simplex noise, terrain height + surface masks.
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const perm = new Uint8Array(512);
{ const r = mulberry32(1337); const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
export function noise2(x, y) {
  const s = (x + y) * F2, i = Math.floor(x + s), j = Math.floor(y + s);
  const t = (i + j) * G2, x0 = x - (i - t), y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
  const ii = i & 255, jj = j & 255;
  let n = 0;
  for (const [dx, dy, gi] of [[x0, y0, perm[ii + perm[jj]]], [x1, y1, perm[ii + i1 + perm[jj + j1]]], [x2, y2, perm[ii + 1 + perm[jj + 1]]]]) {
    let tt = 0.5 - dx * dx - dy * dy;
    if (tt > 0) { const g = grad[gi & 7]; tt *= tt; n += tt * tt * (g[0] * dx + g[1] * dy); }
  }
  return 70 * n; // -1..1
}
export const fbm = (x, y, o = 4) => { let a = 0, f = 1, amp = 0.5; for (let i = 0; i < o; i++) { a += amp * noise2(x * f, y * f); f *= 2; amp *= 0.5; } return a; };
export const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---- World layout (meters). Cabin footprint, lake, clearing, path ----
export const CABIN = { x0: -4, x1: 4, z0: -7, z1: -1, floorY: 0.14 };
export const LAKE = { x: 11, z: -31, rx: 20, rz: 11, level: -0.55 };
export const CLEARING = { x: 0, z: 2, r: 17 };
export function lakeD(x, z) { const dx = (x - LAKE.x) / LAKE.rx, dz = (z - LAKE.z) / LAKE.rz; return Math.sqrt(dx * dx + dz * dz); } // <1 inside
// Path polyline (spawn -> cabin door, branch -> fire pit and gallery)
export const PATHS = [
  [[0.5, 16], [1.0, 9], [1.7, 3], [1.8, -0.6]],
  [[1.2, 7], [4.0, 6.2], [6.5, 5.0]],
  [[1.0, 10], [-3.5, 10.5], [-7.5, 9.0], [-11.0, 6.0], [-13.0, 2.0]],
];
function segDist(px, pz, ax, az, bx, bz) { const vx = bx - ax, vz = bz - az; let t = ((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz); t = Math.max(0, Math.min(1, t)); const dx = px - ax - t * vx, dz = pz - az - t * vz; return Math.sqrt(dx * dx + dz * dz); }
export function pathDist(x, z) { let d = 1e9; for (const p of PATHS) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1])); return d; }
export function heightAt(x, z) {
  const r = Math.hypot(x - CLEARING.x, z - CLEARING.z);
  let h = fbm(x * 0.035, z * 0.035) * (0.35 + 2.6 * smooth(14, 60, r)) + fbm(x * 0.21, z * 0.21, 2) * 0.08;
  h += smooth(30, 95, r) * 3.5; // rise towards the distance -> bowl feel
  const ld = lakeD(x, z);
  const inside = 1 - smooth(0.7, 1.22, ld); h = h * (1 - inside) - 2.0 * inside;
  // flatten cabin pad + porch
  const cx = Math.max(CABIN.x0 - 1.5 - x, 0, x - CABIN.x1 - 1.5), cz = Math.max(CABIN.z0 - 1.5 - z, 0, z - CABIN.z1 - 2.5);
  const cd = Math.hypot(cx, cz);
  h = h * smooth(0, 4, cd);
  return h;
}
// 0 = lush grass, 1 = forest floor / dirt
export function dirtAt(x, z) {
  const r = Math.hypot(x - CLEARING.x, z - CLEARING.z);
  let d = smooth(CLEARING.r - 4, CLEARING.r + 6, r + fbm(x * 0.08, z * 0.08) * 6);
  d = Math.max(d, 1 - smooth(0.7, 1.6, pathDist(x, z) + fbm(x * 0.5, z * 0.5) * 0.5));
  const ld = lakeD(x, z); d = Math.max(d, 1 - smooth(1.0, 1.25, ld));
  return Math.min(1, d);
}
