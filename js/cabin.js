// Log cabin: exterior shell + enterable PBR interior (fireplace, furniture, lamp, art, TV wall).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, pbr, boxGeo } from './mats.js';
import { CABIN } from './util.js';
import { makeFire, fireLogs, framedArt, endGrainTex, TRAITS, buildSmoke } from './world.js';

const R = 0.17, STEP = 0.31, COURSES = 9;
export const WALL_TOP = R + (COURSES - 1) * STEP + R; // ~2.82
const PITCH = 33 * Math.PI / 180;
const CZ = (CABIN.z0 + CABIN.z1) / 2, HALFZ = (CABIN.z1 - CABIN.z0) / 2;
export const RIDGE = WALL_TOP + HALFZ * Math.tan(PITCH);
// openings: wall id -> [{a0,a1,y0,y1}] along wall axis
export const DOOR = { a0: 1.25, a1: 2.35, y0: 0, y1: 2.18 };
const OPEN = {
  front: [DOOR, { a0: -2.9, a1: -1.4, y0: 0.95, y1: 2.0 }],
  back: [{ a0: 1.9, a1: 3.2, y0: 1.0, y1: 2.0 }],
  right: [{ a0: -4.9, a1: -3.3, y0: 0.95, y1: 2.0 }],
  left: [],
};

function logSide(len, r) { const g = new THREE.CylinderGeometry(r, r * 1.03, len, 14, 1, true); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 1.3); return g; }
function logCap(r) { return new THREE.CircleGeometry(r, 14); }

export function buildCabin(scene, gl, Q) {
  const out = { updates: [], walk: [], blockers: [], segs: [], interactive: [] };
  const sides = [], caps = [], chink = [];
  const addLog = (axis, c0, c1, fixed, y, r = R) => { // axis 'x' -> along x at z=fixed
    const len = c1 - c0, mid = (c0 + c1) / 2; if (len < 0.15) return;
    const s = logSide(len, r), m = new THREE.Matrix4();
    if (axis === 'x') m.makeRotationZ(Math.PI / 2).setPosition(mid, y, fixed); else m.makeRotationX(Math.PI / 2).setPosition(fixed, y, mid);
    s.applyMatrix4(m); sides.push(s);
    for (const e of [c0, c1]) { const c = logCap(r * 0.98); const mm = new THREE.Matrix4(); if (axis === 'x') mm.makeRotationY(e === c0 ? -Math.PI / 2 : Math.PI / 2).setPosition(e, y, fixed); else mm.makeRotationY(e === c0 ? Math.PI : 0).setPosition(fixed, y, e); c.applyMatrix4(mm); caps.push(c); }
    const cb = new THREE.BoxGeometry(axis === 'x' ? len - 0.1 : 0.2, STEP, axis === 'x' ? 0.2 : len - 0.1); cb.translate(axis === 'x' ? mid : fixed, y + STEP / 2, axis === 'x' ? fixed : mid);
    if (y + STEP < WALL_TOP) chink.push(cb);
  };
  const wallLogs = (id, axis, a0, a1, fixed, yOff, ext) => {
    for (let i = 0; i < COURSES; i++) {
      const y = R + i * STEP + yOff; if (y > WALL_TOP) continue;
      let segs = [[a0 - ext, a1 + ext]];
      for (const o of OPEN[id]) if (y + R * 0.6 > o.y0 && y - R * 0.6 < o.y1) segs = segs.flatMap(([s0, s1]) => (o.a1 <= s0 || o.a0 >= s1) ? [[s0, s1]] : [[s0, o.a0], [o.a1, s1]]);
      for (const [s0, s1] of segs) addLog(axis, s0, s1, fixed, y);
    }
  };
  const { x0, x1, z0, z1 } = CABIN;
  wallLogs('front', 'x', x0, x1, z1, 0, 0.32);
  wallLogs('back', 'x', x0, x1, z0, 0, 0.32);
  // side walls run along z; their axis coordinate is z but OPEN.right uses z values directly
  wallLogs('right', 'z', z0, z1, x1, STEP / 2, 0.32);
  wallLogs('left', 'z', z0, z1, x0, STEP / 2, 0.32);
  // gable logs (shrinking courses)
  for (let y = WALL_TOP + R * 0.2; y < RIDGE - 0.15; y += STEP) {
    const hl = HALFZ * (1 - (y - WALL_TOP) / (RIDGE - WALL_TOP)) + 0.12;
    for (const x of [x0, x1]) addLog('z', CZ - hl, CZ + hl, x, y);
  }
  // purlins + ridge beam
  addLog('x', x0 - 0.75, x1 + 0.75, CZ, RIDGE - 0.12, 0.13);
  for (const f of [0.5]) for (const s of [-1, 1]) { const zz = CZ + s * HALFZ * f; addLog('x', x0 - 0.75, x1 + 0.75, zz, WALL_TOP + (RIDGE - WALL_TOP) * (1 - f) - 0.12, 0.11); }
  // interior ceiling beams (tie logs)
  for (const x of [-2, 0.2, 2.2]) addLog('z', z0 + 0.1, z1 - 0.1, x, WALL_TOP - 0.05, 0.11);

  const logMat = pbr('rough_wood', [1, 1], { color: 0xd6a878 });
  logMat.normalScale = new THREE.Vector2(1.4, 1.4);
  const endMat = new THREE.MeshStandardMaterial({ map: endGrainTex(), roughness: 0.9 });
  const chinkMat = new THREE.MeshStandardMaterial({ color: 0xa89c88, roughness: 1 });
  const mk = (geos, mat) => { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  mk(sides, logMat); mk(caps, endMat); mk(chink, chinkMat);
  out.stats = { logs: sides.length };

  // roof slabs: shingles on top, planks underneath
  const shingles = pbr('grey_roof_01', [1, 1]), planksIn = pbr('weathered_brown_planks', [1, 1], { color: 0xc8a888 }), trim = pbr('weathered_brown_planks', [1, 1], { color: 0x8a6a50 });
  const slope = (HALFZ + 0.65) / Math.cos(PITCH), RL = x1 - x0 + 1.5, TH = 0.14;
  for (const s of [-1, 1]) {
    const g = boxGeo(RL, TH, slope, 2.2);
    const m = new THREE.Mesh(g, [trim, trim, shingles, planksIn, trim, trim]);
    m.rotation.x = s * PITCH;
    const d = slope / 2; m.position.set((x0 + x1) / 2, RIDGE + 0.06 - Math.sin(PITCH) * d + TH * 0.5 * Math.cos(PITCH), CZ + s * Math.cos(PITCH) * d);
    m.castShadow = m.receiveShadow = true; scene.add(m); out.blockers.push(m);
  }
  // ridge cap
  { const m = new THREE.Mesh(boxGeo(RL, 0.12, 0.3, 1), trim); m.position.set(0, RIDGE + 0.16, CZ); m.castShadow = true; scene.add(m); }

  // floor + foundation + porch
  const floorMat = pbr('old_wood_floor', [1, 1], { envMapIntensity: 0.5 });
  const floor = new THREE.Mesh(boxGeo(x1 - x0 - 0.2, CABIN.floorY, z1 - z0 - 0.2, 1.6), floorMat); floor.position.set(0, CABIN.floorY / 2, CZ); floor.receiveShadow = true; floor.name = 'floor'; scene.add(floor); out.walk.push(floor);
  const stone = pbr('stone_wall', [1, 1]);
  for (const [w, d, x, z] of [[x1 - x0 + 0.6, 0.5, 0, z1], [x1 - x0 + 0.6, 0.5, 0, z0], [0.5, z1 - z0, x0, CZ], [0.5, z1 - z0, x1, CZ]]) { const m = new THREE.Mesh(boxGeo(w, 0.4, d, 1.2), stone); m.position.set(x, -0.18, z); m.receiveShadow = true; scene.add(m); }
  const deck = new THREE.Mesh(boxGeo(2.4, 0.12, 1.2, 1.6), floorMat); deck.position.set((DOOR.a0 + DOOR.a1) / 2, 0.06, z1 + 0.75); deck.receiveShadow = deck.castShadow = true; scene.add(deck); out.walk.push(deck);

  // door (open, swung inward) + frames + windows
  const doorMat = pbr('weathered_brown_planks', [1, 1], { color: 0xa07a58 });
  const door = new THREE.Mesh(boxGeo(DOOR.a1 - DOOR.a0 - 0.04, DOOR.y1 - 0.02, 0.06, 1.0), doorMat);
  const hinge = new THREE.Group(); hinge.position.set(DOOR.a0 + 0.03, CABIN.floorY, z1 + 0.2); door.position.set((DOOR.a1 - DOOR.a0) / 2, (DOOR.y1 - 0.02) / 2, 0); hinge.add(door); hinge.rotation.y = -1.45; door.castShadow = true; scene.add(hinge);
  const frameMat = trim;
  const addFrame = (axis, a0, a1, fixed, y0, y1, glass) => {
    const pieces = [[a1 - a0 + 0.2, 0.1, (a0 + a1) / 2, y1 + 0.05], [0.1, y1 - y0, a0 - 0.05, (y0 + y1) / 2], [0.1, y1 - y0, a1 + 0.05, (y0 + y1) / 2]];
    if (y0 > 0.1) pieces.push([a1 - a0 + 0.24, 0.08, (a0 + a1) / 2, y0 - 0.04]);
    for (const [w, h, a, y] of pieces) { const g = axis === 'x' ? boxGeo(w, h, 0.42, 1) : boxGeo(0.42, h, w, 1); const m = new THREE.Mesh(g, frameMat); m.position.set(axis === 'x' ? a : fixed, y, axis === 'x' ? fixed : a); m.castShadow = true; scene.add(m); }
    if (glass) {
      const gm = new THREE.Mesh(new THREE.PlaneGeometry(a1 - a0, y1 - y0), new THREE.MeshPhysicalMaterial({ color: 0xb8c8c8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false }));
      gm.position.set(axis === 'x' ? (a0 + a1) / 2 : fixed, (y0 + y1) / 2, axis === 'x' ? fixed : (a0 + a1) / 2); if (axis === 'z') gm.rotation.y = Math.PI / 2; scene.add(gm);
      for (const [w, h, da, dy] of [[0.04, y1 - y0, 0, 0], [a1 - a0, 0.04, 0, 0]]) { const g = axis === 'x' ? boxGeo(w, h, 0.06, 1) : boxGeo(0.06, h, w, 1); const m = new THREE.Mesh(g, frameMat); m.position.set(axis === 'x' ? (a0 + a1) / 2 + da : fixed, (y0 + y1) / 2 + dy, axis === 'x' ? fixed : (a0 + a1) / 2 + da); scene.add(m); }
    }
  };
  addFrame('x', DOOR.a0, DOOR.a1, z1, CABIN.floorY, DOOR.y1, false);
  for (const o of OPEN.front.slice(1)) addFrame('x', o.a0, o.a1, z1, o.y0, o.y1, true);
  for (const o of OPEN.back) addFrame('x', o.a0, o.a1, z0, o.y0, o.y1, true);
  for (const o of OPEN.right) addFrame('z', o.a0, o.a1, x1, o.y0, o.y1, true);

  // ---- chimney (exterior, left gable) ----
  const brick = pbr('red_brick_03', [1, 1]);
  const ch = [[1.6, 1.7, 0.9, -4.62, 0.85], [0.95, RIDGE + 1.0 - 1.7, 0.7, -4.5, 1.7 + (RIDGE + 1.0 - 1.7) / 2]];
  for (const [d, h, w, x, y] of ch) { const m = new THREE.Mesh(boxGeo(w, h, d, 1.1), brick); m.position.set(x, y, CZ); m.castShadow = m.receiveShadow = true; scene.add(m); out.blockers.push(m); }
  { const cap = new THREE.Mesh(boxGeo(0.8, 0.1, 1.05, 1), stone); cap.position.set(-4.5, RIDGE + 1.05, CZ); cap.castShadow = true; scene.add(cap); }
  const smoke = buildSmoke(-4.5, RIDGE + 1.2, CZ); scene.add(smoke); out.updates.push(smoke.userData.update);

  // ---- woodpile (exterior, right wall) ----
  { const bark = new THREE.MeshStandardMaterial({ map: tex('assets/tex/pinebark_color.jpg', { srgb: true, repeat: [1, 0.4] }), normalMap: tex('assets/tex/pinebark_normal.jpg', { repeat: [1, 0.4] }), roughness: 0.95 });
    const N = 60, g = new THREE.CylinderGeometry(0.1, 0.1, 0.62, 9); const im = new THREE.InstancedMesh(g, [bark, endMat, endMat], N); let k = 0;
    for (let row = 0; row < 6; row++) for (let i = 0; i < 10 && k < N; i++) { const zz = -6.3 + i * 0.21 + (row % 2) * 0.1, yy = 0.1 + row * 0.18; if (row >= 4 && (i < 1 || i > 8)) continue; im.setMatrixAt(k++, new THREE.Matrix4().compose(new THREE.Vector3(x1 + 0.6 + Math.sin(i * 7.1 + row) * 0.03, yy, zz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2 + Math.sin(i * 3 + row) * 0.05)), new THREE.Vector3(1 + Math.sin(i * 11 + row * 3) * 0.12, 1, 1 + Math.sin(i * 11 + row * 3) * 0.12))); }
    im.count = k; im.castShadow = im.receiveShadow = true; scene.add(im);
    const bucket = gl.wooden_bucket_01.clone(); bucket.position.set(x1 + 0.6, 0, -3.9); scene.add(bucket);
    const lantern = gl.wooden_lantern_01.clone(); lantern.position.set(DOOR.a1 + 0.55, 0.12, z1 + 0.85); scene.add(lantern);
  }

  // ============ INTERIOR ============
  const IN = { x0: x0 + R, x1: x1 - R, z0: z0 + R, z1: z1 - R }, FY = CABIN.floorY;
  // rug
  { const rt = pbr('fabric_pattern_07', [2.5, 2], { color: 0xd8c8c0, envMapIntensity: 0.4 }); const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.0), rt); rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, FY + 0.006, -4.4); rug.receiveShadow = true; scene.add(rug); }
  // stone fireplace on the left wall (inside), chimney breast to ceiling
  const fx = IN.x0, fz = CZ;
  const stoneIn = pbr('stone_wall', [1, 1], { envMapIntensity: 0.6 });
  const fpParts = [ // [w(x), h, d(z), x, y, z]
    [0.62, 1.15, 0.42, fx + 0.31, FY + 0.575, fz - 0.62], [0.62, 1.15, 0.42, fx + 0.31, FY + 0.575, fz + 0.62],
    [0.62, 0.42, 1.66, fx + 0.31, FY + 1.36, fz], [0.42, WALL_TOP - FY - 1.57, 1.3, fx + 0.21, (FY + 1.57 + WALL_TOP) / 2, fz],
    [0.9, 0.1, 2.2, fx + 0.45, FY + 0.05, fz],
  ];
  for (const [w, h, d, x, y, z] of fpParts) { const m = new THREE.Mesh(boxGeo(w, h, d, 0.9), stoneIn); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; scene.add(m); }
  const soot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.15, 0.84), new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 1 })); soot.position.set(fx + 0.06, FY + 0.575, fz); scene.add(soot);
  const mantel = new THREE.Mesh(boxGeo(0.34, 0.14, 2.0, 1), pbr('rough_wood', [1, 1], { color: 0x9a6a44 })); mantel.position.set(fx + 0.4, FY + 1.62, fz); mantel.castShadow = true; scene.add(mantel);
  const fireLight = new THREE.PointLight(0xff8a3a, 4.5, 7, 1.5); fireLight.position.set(fx + 0.75, FY + 0.6, fz); scene.add(fireLight);
  const charM = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 1, emissive: 0x3a0c00, emissiveIntensity: 0.7 });
  const logsF = fireLogs(charM, charM, 4, 0.5, 0.045); logsF.position.set(fx + 0.34, FY + 0.1, fz); scene.add(logsF);
  const fire = makeFire(0.62, fireLight); fire.position.set(fx + 0.34, FY + 0.12, fz); scene.add(fire); out.updates.push(fire.userData.update);
  // furniture (Poly Haven CC0)
  const place = (o, x, y, z, ry, s = 1) => { const c = o.clone(); c.position.set(x, y, z); c.rotation.y = ry; c.scale.setScalar(s); c.traverse((q) => { if (q.isMesh) { q.castShadow = q.receiveShadow = true; } }); scene.add(c); return c; };
  place(gl.Sofa_01, 0.15, FY, -2.75, Math.PI, 1.12);
  place(gl.CoffeeTable_01, 0.15, FY, -4.35, 0, 0.7);
  place(gl.ArmChair_01, -2.2, FY, -2.6, -2.25);
  place(gl.Rockingchair_01, -2.45, FY, -5.9, -0.75);
  place(gl.wooden_bookshelf_worn, IN.x1 - 0.32, FY, -5.75, -Math.PI / 2, 0.95);
  place(gl.ClassicConsole_01, 0.15, FY, IN.z0 + 0.36, 0);
  place(gl.wooden_bucket_01, fx + 0.45, FY, fz + 1.35, 0.4, 0.8);
  place(gl.wooden_lantern_01, fx + 0.42, FY + 1.69, fz + 0.7, 0.3, 0.8);
  // oil lamp with warm light on the coffee table
  place(gl.vintage_oil_lamp, -0.3, FY + 0.7 * 0.525, -4.3, 0, 0.7);
  const lampLight = new THREE.PointLight(0xffb36b, 2.2, 6, 1.6); lampLight.position.set(-0.3, FY + 0.37 + 0.42, -4.3); scene.add(lampLight);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd090 })); glow.position.copy(lampLight.position); scene.add(glow);
  out.lampLight = lampLight;
  // Lil' Foots framed art on the walls
  const fmat = pbr('weathered_brown_planks', [0.3, 0.3], { color: 0x7a5a40 });
  const art = [
    ['assets/card0.jpg', 0.62, -0.45, IN.z1 - 0.03, Math.PI, 1.55, TRAITS[0]],
    ['assets/card2.jpg', 0.55, IN.x1 - 0.03, -2.4, -Math.PI / 2, 1.5, TRAITS[2]],
    ['assets/card4.jpg', 0.5, fx + 0.03, fz - 1.65, Math.PI / 2, 1.6, TRAITS[4]],
    ['assets/card5.jpg', 0.5, fx + 0.03, fz + 1.65, Math.PI / 2, 1.6, TRAITS[5]],
    ['assets/gold.jpg', 0.7, -2.4, IN.z0 + 0.03, 0, 1.6, ['The Golden Lil\' Foot', 'BIGfoot.biz']],
  ];
  for (const [img, s, x, z, ry, y, lab] of art) { const a = framedArt(img, s, s, fmat, lab); a.position.set(x, FY + y, z); a.rotation.y = ry; scene.add(a); }

  // collision segments (xz) for walls, door gap included
  out.segs.push([x0, z1, DOOR.a0, z1], [DOOR.a1, z1, x1, z1], [x0, z0, x1, z0], [x0, z0, x0, z1], [x1, z0, x1, z1]);
  out.segs.push([IN.x0 + 0.62, fz - 0.85, IN.x0 + 0.62, fz + 0.85]); // fireplace face
  out.segs.push([x0 - 0.7, CZ - 0.8, x0 - 0.7, CZ + 0.8]); // chimney outside
  out.segs.push([x1 + 0.45, -6.4, x1 + 0.75, -6.4], [x1 + 0.75, -6.4, x1 + 0.75, -4.3], [x1 + 0.45, -4.3, x1 + 0.75, -4.3]); // woodpile
  // teleport blockers: invisible wall proxies
  const bm = new THREE.MeshBasicMaterial({ visible: false });
  for (const [ax, az, bx, bz] of out.segs.slice(0, 5)) { const L = Math.hypot(bx - ax, bz - az); const b = new THREE.Mesh(new THREE.BoxGeometry(ax === bx ? 0.34 : L, WALL_TOP, ax === bx ? L : 0.34), bm); b.position.set((ax + bx) / 2, WALL_TOP / 2, (az + bz) / 2); b.updateMatrixWorld(); out.blockers.push(b); }
  { const b = new THREE.Mesh(new THREE.BoxGeometry(DOOR.a1 - DOOR.a0, WALL_TOP - DOOR.y1, 0.34), bm); b.position.set((DOOR.a0 + DOOR.a1) / 2, (WALL_TOP + DOOR.y1) / 2, z1); b.updateMatrixWorld(); out.blockers.push(b); }
  out.tvAnchor = { x: 0.15, y: FY + 0.949 + 0.52, z: IN.z0 + 0.22 };
  out.interior = IN;
  return out;
}
