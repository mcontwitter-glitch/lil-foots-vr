// Exterior: terrain, lake, instanced pines/grass/ferns/rocks, fire pit, sign, footprints, gallery.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tex, pbr, canvasTex, normalFromHeight, loadImage, instanceModel, placeM, addWind, windUniforms } from './mats.js';
import { mulberry32, fbm, smooth, heightAt, dirtAt, lakeD, pathDist, CABIN, LAKE, CLEARING, PATHS } from './util.js';

export const TRAITS = [
  ['Lil\' Foot #1', 'Black fur · Overalls · BibFoot · Cowboy · Rolex'],
  ['Lil\' Foot #2', 'Lava · HALO · Diamonds'],
  ['Lil\' Foot #3', 'Yeti · Diaper · Green Beanie'],
  ['Lil\' Foot #4', 'Pink · Pink Bow'],
  ['Lil\' Foot #5', 'Skunk Ape · Top Hat · Night Vision'],
  ['Lil\' Foot #6', 'Snow Leopard · Royalty · \'Merica'],
];

function insideCabin(x, z, pad = 0) { return x > CABIN.x0 - pad && x < CABIN.x1 + pad && z > CABIN.z0 - pad && z < CABIN.z1 + pad; }

// ---------------- Terrain (two-layer PBR splat) ----------------
function buildTerrain() {
  const S = 240, N = 150;
  const g = new THREE.PlaneGeometry(S, S, N, N); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, n = p.count;
  const dirt = new Float32Array(n), tint = new Float32Array(n), uv = g.attributes.uv;
  for (let i = 0; i < n; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z));
    dirt[i] = dirtAt(x, z);
    tint[i] = 0.82 + 0.3 * (fbm(x * 0.05 + 9, z * 0.05 - 3, 3) * 0.5 + 0.5);
    uv.setXY(i, x / 2.6, z / 2.6);
  }
  g.setAttribute('aDirt', new THREE.BufferAttribute(dirt, 1));
  g.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  g.computeVertexNormals();
  const A = pbr('leafy_grass'), B = 'assets/tex/forrest_ground_01';
  const mapB = tex(B + '_diff.jpg', { srgb: true }), norB = tex(B + '_nor.jpg'), armB = tex(B + '_arm.jpg');
  A.normalScale = new THREE.Vector2(1.2, 1.2);
  A.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { mapB: { value: mapB }, normalB: { value: norB }, armB: { value: armB } });
    sh.vertexShader = 'attribute float aDirt; attribute float aTint; varying float vDirt; varying float vTint; varying vec2 vW;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vDirt = aDirt; vTint = aTint; vW = position.xz;');
    sh.fragmentShader = 'uniform sampler2D mapB; uniform sampler2D normalB; uniform sampler2D armB; varying float vDirt; varying float vTint; varying vec2 vW;\n' +
      sh.fragmentShader
        .replace('#include <map_fragment>', `
          vec2 uvB = vMapUv * 0.77 + vec2(0.31, 0.17);
          vec4 cA = texture2D(map, vMapUv); vec4 cB = texture2D(mapB, uvB);
          float bl = clamp((vDirt - 0.5) * 2.4 + 0.5 + (dot(cB.rgb, vec3(0.33)) - dot(cA.rgb, vec3(0.33))) * 1.5, 0.0, 1.0);
          diffuseColor *= mix(cA * vec4(0.7, 0.92, 0.5, 1.0), cB, bl);
          diffuseColor.rgb *= vTint;`)
        .replace('#include <roughnessmap_fragment>', `
          float roughnessFactor = roughness;
          vec4 texelRoughness = mix(texture2D(roughnessMap, vRoughnessMapUv), texture2D(armB, uvB), bl);
          roughnessFactor *= texelRoughness.g;`)
        .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('texture2D( normalMap, vNormalMapUv )', 'mix(texture2D( normalMap, vNormalMapUv ), texture2D(normalB, uvB), bl)'))
        .replace('#include <aomap_fragment>', THREE.ShaderChunk.aomap_fragment.replace('texture2D( aoMap, vAoMapUv ).r', 'mix(texture2D( aoMap, vAoMapUv ).r, texture2D(armB, uvB).r, bl)'));
  };
  const m = new THREE.Mesh(g, A); m.receiveShadow = true; m.name = 'terrain';
  return m;
}

// ---------------- Lake ----------------
function buildLake() {
  const g = new THREE.CircleGeometry(1, 72); g.rotateX(-Math.PI / 2); g.scale(LAKE.rx * 1.35, 1, LAKE.rz * 1.35);
  const nm = tex('assets/tex/waternormals.jpg', { repeat: [9, 5] });
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x23302c, roughness: 0.06, metalness: 0, normalMap: nm, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.25, transparent: true, opacity: 0.93, ior: 1.33 });
  const w = new THREE.Mesh(g, mat); w.position.set(LAKE.x, LAKE.level, LAKE.z); w.receiveShadow = true; w.name = 'water';
  w.userData.update = (t) => { nm.offset.set(t * 0.006, t * 0.004); };
  return w;
}

// ---------------- Pines (ez-tree geometry, instanced, static LOD) ----------------
function pineMaterials() {
  const bark = new THREE.MeshStandardMaterial({
    map: tex('assets/tex/pinebark_color.jpg', { srgb: true }), normalMap: tex('assets/tex/pinebark_normal.jpg'),
    roughnessMap: tex('assets/tex/pinebark_roughness.jpg'), aoMap: tex('assets/tex/pinebark_ao.jpg'), color: 0xb8a898, roughness: 1,
  });
  const leaves = new THREE.MeshStandardMaterial({
    map: tex('assets/tex/pine_needles.png', { srgb: true }), alphaTest: 0.42, side: THREE.DoubleSide, color: 0x95a57e, roughness: 0.9,
  });
  addWind(leaves, { amp: 0.00035, freq: 0.9 });
  return { bark, leaves };
}
function fixLeafNormals(geo, mw) { // radial normals -> volumetric shading for billboard needles (positions are meshopt-quantized, so go through the node matrix)
  const p = geo.attributes.position, nrm = geo.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mw); v.set(v.x, Math.max(0, v.y) * 0.15 + 6, v.z).normalize(); nrm.setXYZ(i, v.x, v.y * 0.8, v.z); }
  nrm.needsUpdate = true;
}
function buildTrees(gl, Q, rand) {
  const mats = pineMaterials();
  const variants = [0, 1, 2, 3].map((i) => ({ hi: gl['tree_hi' + i], lo: gl['tree_lo' + i] }));
  const pos = []; let tries = 0;
  while (pos.length < Q.trees && tries++ < 20000) {
    const a = rand() * Math.PI * 2, r = CLEARING.r + 2 + Math.pow(rand(), 0.8) * 70;
    const x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r;
    if (lakeD(x, z) < 1.35 || Math.abs(x) > 115 || Math.abs(z) > 115) continue;
    if (pathDist(x, z) < 3) continue;
    if (pos.some((q) => (q[0] - x) ** 2 + (q[1] - z) ** 2 < (r < 35 ? 30 : 45))) continue;
    pos.push([x, z, r]);
  }
  // a few framing trees just behind / beside the cabin like the reference photo
  for (const [x, z] of [[-9, -9], [-7.5, -14], [6.5, -12.5], [-12, -3], [12.5, -9], [-14, 9.5], [15.5, 3]]) pos.push([x, z, 10]);
  const buckets = {};
  for (const [x, z, r] of pos) {
    const v = Math.floor(rand() * 4), lod = r < Q.nearR ? 'hi' : 'lo';
    const s = (v === 2 ? 0.3 : v === 3 ? 0.38 : 0.34) * (0.8 + rand() * 0.45);
    const sec = Math.floor(((Math.atan2(z - CLEARING.z, x - CLEARING.x) + Math.PI) / (Math.PI * 2)) * 6) % 6; // angular sectors -> frustum culling works
    const k = lod + v + '_' + sec; (buckets[k] ||= []).push(placeM(x, heightAt(x, z) - 0.2, z, rand() * 6.283, s, (rand() - 0.5) * 0.04, (rand() - 0.5) * 0.04));
  }
  const g = new THREE.Group(); let tris = 0;
  for (const [k, ms] of Object.entries(buckets)) {
    const src = variants[+k[2]][k.slice(0, 2)]; src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const isLeaf = o.name.includes('leaves') || o.material.name === 'leaves';
      if (isLeaf && !o.geometry.userData.fixed) { fixLeafNormals(o.geometry, o.matrixWorld); o.geometry.userData.fixed = 1; }
      const im = new THREE.InstancedMesh(o.geometry, isLeaf ? mats.leaves : mats.bark, ms.length);
      const tm = new THREE.Matrix4(); ms.forEach((m, i) => im.setMatrixAt(i, tm.multiplyMatrices(m, o.matrixWorld))); im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      tris += (o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3) * ms.length;
      g.add(im);
    });
  }
  g.userData.tris = tris; g.userData.count = pos.length;
  g.userData.trunks = pos.map(([x, z]) => [x, z]);
  return g;
}

// ---------------- Grass clumps (procedural blades, instanced, wind) ----------------
function grassClump(rand) {
  const geos = [];
  const blades = 8;
  for (let b = 0; b < blades; b++) {
    const h = 0.16 + rand() * 0.3, w = 0.012 + rand() * 0.012, a = rand() * Math.PI * 2, lean = 0.08 + rand() * 0.22;
    const ox = (rand() - 0.5) * 0.18, oz = (rand() - 0.5) * 0.18, segs = 3;
    const pos = [], uv = [], col = [], nor = [], idx = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, ww = w * (1 - t * 0.85), bend = lean * t * t;
      const cx = ox + Math.cos(a) * bend, cz = oz + Math.sin(a) * bend, y = h * t;
      const px = -Math.sin(a) * ww, pz = Math.cos(a) * ww;
      pos.push(cx - px, y, cz - pz, cx + px, y, cz + pz); uv.push(0, t, 1, t);
      const c0 = [0.03, 0.05, 0.015], c1 = [0.1, 0.14, 0.04];
      for (let k = 0; k < 2; k++) col.push(c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t);
      nor.push(0, 1, 0, 0, 1, 0);
      if (s < segs) { const i = s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    geos.push(g);
  }
  return mergeGeometries(geos);
}
function buildGrass(Q, rand) {
  const geo = grassClump(rand);
  const mat = addWind(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85, envMapIntensity: 0.8 }), { amp: 0.09, heightAttr: 'uv', freq: 1.6 });
  { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { prev(sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );'); }; } // blades use up-normals: don't flip them on back faces (that made backs black)
  const SEC = 8, ims = [...Array(SEC)].map(() => { const m = new THREE.InstancedMesh(geo, mat, Q.grass); m.receiveShadow = true; m.count = 0; return m; });
  const c = new THREE.Color(); let n = 0, tries = 0;
  while (n < Q.grass && tries++ < Q.grass * 20) {
    const a = rand() * 6.283, r = Math.sqrt(rand()) * (CLEARING.r + 8);
    const x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r;
    const d = dirtAt(x, z); if (d > 0.35 + rand() * 0.25) continue;
    if (insideCabin(x, z, 0.35) || lakeD(x, z) < 1.25) continue;
    const s = 0.7 + rand() * 0.7, im = ims[Math.floor((a / 6.2832) * SEC) % SEC]; // angular chunks so frustum culling drops what is behind you
    im.setMatrixAt(im.count, placeM(x, heightAt(x, z) - 0.02, z, rand() * 6.283, s));
    c.setHSL(0.21 + rand() * 0.06, 0.3 + rand() * 0.25, 0.5 + rand() * 0.22); im.setColorAt(im.count, c); im.count++; n++;
  }
  const g = new THREE.Group(); ims.forEach((m) => { m.computeBoundingSphere(); g.add(m); });
  g.userData.tris = n * geo.index.count / 3; return g;
}

// ---------------- Mushrooms (lathe, instanced) ----------------
function mushroomGeo(type) {
  const stem = new THREE.LatheGeometry([[0.0, 0], [0.018, 0], [0.016, 0.04], [0.013, 0.08], [0.0, 0.085]].map(([x, y]) => new THREE.Vector2(x, y)), 7);
  const cap = type ? new THREE.LatheGeometry([[0.0, 0.07], [0.055, 0.068], [0.06, 0.075], [0.048, 0.095], [0.02, 0.108], [0, 0.11]].map(([x, y]) => new THREE.Vector2(x, y)), 10)
    : new THREE.LatheGeometry([[0.0, 0.075], [0.04, 0.072], [0.045, 0.085], [0.03, 0.115], [0, 0.125]].map(([x, y]) => new THREE.Vector2(x, y)), 10);
  const paint = (g, c) => { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c[0]; a[i + 1] = c[1]; a[i + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
  return mergeGeometries([paint(stem, [0.78, 0.72, 0.6]), paint(cap, type ? [0.55, 0.08, 0.04] : [0.36, 0.22, 0.12])]);
}

// ---------------- Fire (shader flames) ----------------
const flameMat = new THREE.ShaderMaterial({
  uniforms: { uTime: windUniforms.uTime },
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uTime; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
    float fb(vec2 p){ float a=0.0, w=0.5; for(int i=0;i<4;i++){ a+=w*n(p); p*=2.03; w*=0.5; } return a; }
    void main(){
      vec2 uv = vUv; float t = uTime;
      float q = fb(vec2(uv.x*4.0, uv.y*3.0 - t*2.2));
      float w = (0.5 - abs(uv.x - 0.5 + (q-0.5)*0.25*uv.y)) * 2.0;
      float shape = w - uv.y*1.05 - q*0.55 + 0.32;
      float f = smoothstep(0.0, 0.35, shape) * (1.0 - smoothstep(0.85, 1.0, uv.y));
      vec3 c = mix(vec3(0.9,0.18,0.02), vec3(1.0,0.62,0.18), smoothstep(0.1,0.5,shape));
      c = mix(c, vec3(1.0,0.92,0.7), smoothstep(0.45,0.8,shape));
      gl_FragColor = vec4(c * f * 1.6, f);
    }`,
});
export function makeFire(scale = 1, light) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), flameMat); p.position.y = 0.45; p.rotation.y = i * Math.PI / 3; p.renderOrder = 5; g.add(p); }
  // glowing embers disk
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,170,60,1)'); gr.addColorStop(0.4, 'rgba(200,60,10,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const e = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  e.rotation.x = -Math.PI / 2; e.position.y = 0.06; g.add(e);
  g.scale.setScalar(scale);
  if (light) { g.userData.light = light; g.userData.base = light.intensity; }
  g.userData.update = (t) => { if (light) light.intensity = g.userData.base * (0.82 + 0.12 * Math.sin(t * 13.1) + 0.08 * Math.sin(t * 7.3 + 1.3) + 0.06 * Math.sin(t * 23.7)); };
  return g;
}
export function fireLogs(barkMat, endMat, n = 4, len = 0.7, r = 0.06) {
  const geo = new THREE.CylinderGeometry(r, r, len, 10, 1);
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, [barkMat, endMat, endMat]); const a = i / n * Math.PI * 2;
    m.rotation.set(0.95, a, 0, 'YXZ'); m.position.set(Math.cos(a) * 0.12, 0.17, Math.sin(a) * 0.12); m.castShadow = true; g.add(m);
  }
  return g;
}
export function endGrainTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#c9a674'; x.fillRect(0, 0, 256, 256);
  for (let r = 120; r > 4; r -= 5 + Math.random() * 6) { x.strokeStyle = `rgba(110,70,35,${0.25 + Math.random() * 0.35})`; x.lineWidth = 1 + Math.random() * 2; x.beginPath(); x.ellipse(128 + Math.random() * 3, 128 + Math.random() * 3, r, r * 0.97, 0, 0, Math.PI * 2); x.stroke(); }
  x.strokeStyle = 'rgba(60,35,15,0.5)'; for (let i = 0; i < 4; i++) { x.lineWidth = 1.5; x.beginPath(); x.moveTo(128, 128); const a = Math.random() * 6.28; x.lineTo(128 + Math.cos(a) * 118, 128 + Math.sin(a) * 118); x.stroke(); }
  x.lineWidth = 14; x.strokeStyle = '#4a3220'; x.beginPath(); x.arc(128, 128, 122, 0, Math.PI * 2); x.stroke();
  return canvasTex(c);
}

// ---------------- Carved BIGfoot.biz sign ----------------
async function buildSign() {
  const W = 1024, H = 320;
  const wood = await loadImage('assets/tex/weathered_brown_planks_diff.jpg');
  const col = document.createElement('canvas'); col.width = W; col.height = H; const c = col.getContext('2d');
  c.drawImage(wood, 0, 0, 1024, 1024, 0, 0, W, H * 3.2); c.drawImage(wood, 0, 0, 1024, 320, 0, 0, W, H);
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H; const h = hc.getContext('2d');
  h.fillStyle = '#fff'; h.fillRect(0, 0, W, H);
  const text = (ctx, style) => {
    ctx.fillStyle = style; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 150px Georgia, "Times New Roman", serif'; ctx.fillText('BIGfoot.biz', W / 2, 135);
    ctx.font = 'bold 54px Georgia, serif'; ctx.fillText("LIL' FOOTS  ·  BIGFOOT COUNTRY", W / 2, 258);
  };
  h.filter = 'blur(3px)'; text(h, '#000'); h.filter = 'none';
  // carved look on color: darken grooves + lighter rim
  c.save(); c.globalCompositeOperation = 'multiply'; c.filter = 'blur(1.5px)'; text(c, '#3a2614'); c.restore();
  c.save(); c.translate(-2, -2); c.globalCompositeOperation = 'soft-light'; text(c, 'rgba(255,220,170,0.6)'); c.restore();
  c.strokeStyle = 'rgba(30,18,8,0.6)'; c.lineWidth = 10; c.strokeRect(5, 5, W - 10, H - 10);
  const mat = new THREE.MeshStandardMaterial({ map: canvasTex(col), normalMap: canvasTex(normalFromHeight(hc, 5), false), roughness: 0.85 });
  const side = pbr('weathered_brown_planks', [0.4, 0.12]);
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.82, 0.08), [side, side, side, side, mat, side]);
  const g = new THREE.Group(); board.position.y = 1.55; board.castShadow = board.receiveShadow = true; g.add(board);
  const postM = pbr('rough_wood', [1, 1], { color: 0xb59a7a });
  for (const sx of [-1.15, 1.15]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 2.2, 10), postM); p.position.set(sx, 1.05, -0.08); p.castShadow = true; g.add(p); }
  return g;
}

// ---------------- Footprint decals ----------------
function footprintTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
  x.filter = 'blur(4px)'; x.fillStyle = 'rgba(38,26,16,0.85)';
  x.beginPath(); x.ellipse(64, 160, 34, 78, 0.05, 0, Math.PI * 2); x.fill();
  [[34, 66, 13], [54, 52, 14], [76, 52, 13], [95, 62, 12], [108, 80, 10]].forEach(([a, b, r]) => { x.beginPath(); x.ellipse(a, b, r, r * 1.2, 0, 0, Math.PI * 2); x.fill(); });
  x.filter = 'none'; return canvasTex(c);
}
function buildFootprints() {
  const pts = [];
  const walk = (path, step = 0.85) => {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i], [bx, bz] = path[i + 1], L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
      for (let s = 0.4; s < L; s += step) pts.push([ax + dx * s - dz * ((pts.length % 2) ? 0.2 : -0.2), az + dz * s + dx * ((pts.length % 2) ? 0.2 : -0.2), Math.atan2(dx, dz), pts.length % 2]);
    }
  };
  walk(PATHS[0]); walk(PATHS[2]);
  const mat = new THREE.MeshStandardMaterial({ map: footprintTex(), transparent: true, depthWrite: false, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -4 });
  const geo = new THREE.PlaneGeometry(0.3, 0.6); geo.rotateX(-Math.PI / 2);
  const im = new THREE.InstancedMesh(geo, mat, pts.length); im.receiveShadow = true;
  pts.forEach(([x, z, a, m], i) => { const M = placeM(x, heightAt(x, z) + 0.03, z, a + Math.PI, 1); if (m) M.scale(new THREE.Vector3(-1, 1, 1)); im.setMatrixAt(i, M); });
  im.renderOrder = 2; return im;
}

// ---------------- Trail gallery (framed Lil' Foots) ----------------
export function framedArt(img, w, h, frameMat, label) {
  const g = new THREE.Group();
  const t = tex(img, { srgb: true });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55, envMapIntensity: 0.6 }));
  pic.position.z = 0.031; g.add(pic);
  const fw = 0.07, d = 0.06;
  for (const [sx, sy, px, py] of [[w + fw * 2, fw, 0, h / 2 + fw / 2], [w + fw * 2, fw, 0, -h / 2 - fw / 2], [fw, h, -w / 2 - fw / 2, 0], [fw, h, w / 2 + fw / 2, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, d), frameMat); b.position.set(px, py, 0.02); b.castShadow = true; g.add(b);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), frameMat); g.add(back);
  if (label) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#b08d4a'; x.fillRect(0, 0, 512, 96); x.fillStyle = '#2a1d0c'; x.textAlign = 'center';
    x.font = 'bold 34px Georgia, serif'; x.fillText(label[0], 256, 40); x.font = '22px Georgia, serif'; x.fillText(label[1], 256, 76);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, w * 0.8 * 96 / 512), new THREE.MeshStandardMaterial({ map: canvasTex(c), metalness: 0.6, roughness: 0.35 }));
    pl.position.set(0, -h / 2 - fw - w * 0.1, 0.04); g.add(pl);
  }
  return g;
}
function buildGallery() {
  const g = new THREE.Group();
  const frameMat = pbr('weathered_brown_planks', [0.3, 0.3], { color: 0x9a7a5a });
  const postM = pbr('rough_wood', [1, 1], { color: 0xa08868 });
  const path = PATHS[2]; const spots = [];
  for (let i = 0; i < 6; i++) {
    const t = 0.12 + i * 0.16, seg = Math.min(path.length - 2, Math.floor(t * (path.length - 1))), f = t * (path.length - 1) - seg;
    const [ax, az] = path[seg], [bx, bz] = path[seg + 1];
    const x = ax + (bx - ax) * f, z = az + (bz - az) * f, dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz);
    const side = i % 2 ? 1 : -1, nx = -dz / L * side, nz = dx / L * side;
    spots.push([x + nx * 1.9, z + nz * 1.9, Math.atan2(-nx, -nz)]);
  }
  spots.forEach(([x, z, a], i) => {
    const s = new THREE.Group();
    const art = framedArt(`assets/card${i}.jpg`, 0.9, 0.9, frameMat, TRAITS[i]); art.position.y = 1.55; s.add(art);
    for (const px of [-0.55, 0.55]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8), postM); p.position.set(px, 1.0, -0.05); p.castShadow = true; s.add(p); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.05, 0.4), postM); roof.position.set(0, 2.15, 0.08); roof.rotation.x = 0.25; roof.castShadow = true; s.add(roof);
    s.position.set(x, heightAt(x, z), z); s.rotation.y = a; g.add(s);
  });
  // gold Lil' Foot finale at the end of the trail
  const [ex, ez] = path[path.length - 1];
  const gold = new THREE.Group();
  const goldFrame = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 1, roughness: 0.32 });
  const art = framedArt('assets/gold.jpg', 1.5, 1.5, goldFrame, ['The Golden Lil\' Foot', 'BIGfoot.biz · 1 of 1']); art.position.y = 1.7; gold.add(art);
  for (const px of [-0.85, 0.85]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.9, 10), postM); p.position.set(px, 1.35, -0.06); p.castShadow = true; gold.add(p); }
  gold.position.set(ex - 1.0, heightAt(ex - 1, ez - 1.5), ez - 1.5); gold.rotation.y = 0.75; g.add(gold);
  return g;
}

// ---------------- Chimney smoke ----------------
function buildSmoke(x, y, z) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const k = c.getContext('2d');
  const gr = k.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(200,200,200,0.55)'); gr.addColorStop(1, 'rgba(200,200,200,0)'); k.fillStyle = gr; k.fillRect(0, 0, 128, 128);
  const t = canvasTex(c); const g = new THREE.Group(); const N = 12;
  for (let i = 0; i < N; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, color: 0xbfbfbf })); s.userData.o = i / N; g.add(s); }
  g.position.set(x, y, z);
  g.userData.update = (time) => { g.children.forEach((s) => { const p = (time * 0.08 + s.userData.o) % 1; s.position.set(p * 2.2 + Math.sin(p * 9 + s.userData.o * 20) * 0.2, p * 5, Math.cos(p * 7) * 0.2); s.scale.setScalar(0.5 + p * 2.6); s.material.opacity = Math.sin(p * Math.PI) * 0.45; }); };
  return g;
}

// ---------------- Assemble exterior ----------------
export async function buildWorld(scene, gl, Q) {
  const rand = mulberry32(2026);
  const out = { updates: [], walk: [], stats: {} };
  const terrain = buildTerrain(); scene.add(terrain); out.walk.push(terrain); out.terrain = terrain;
  const lake = buildLake(); scene.add(lake); out.updates.push(lake.userData.update);
  const trees = buildTrees(gl, Q, rand); scene.add(trees); out.stats.treeTris = trees.userData.tris; out.stats.trees = trees.userData.count; out.trunks = trees.userData.trunks;
  const grass = buildGrass(Q, rand); scene.add(grass); out.grass = grass; out.stats.grassTris = grass.userData.tris;

  // ferns around the clearing edge and cabin
  const fernM = [];
  for (let i = 0, t = 0; i < Q.ferns && t < 4000; t++) {
    const a = rand() * 6.283, r = CLEARING.r - 4 + rand() * 16, x = CLEARING.x + Math.cos(a) * r, z = CLEARING.z + Math.sin(a) * r;
    if (pathDist(x, z) < 1.6 || lakeD(x, z) < 1.3 || insideCabin(x, z, 1)) continue;
    fernM.push(placeM(x, heightAt(x, z) - 0.05, z, rand() * 6.28, 1.3 + rand() * 0.9)); i++;
  }
  for (const [x, z] of [[-4.6, -1.2], [4.7, -6.5], [-4.8, -6.8], [3.2, -7.8], [-2.5, -7.9]]) fernM.push(placeM(x, 0, z, rand() * 6, 1.4));
  const ferns = instanceModel(gl.fern_02, fernM); ferns.traverse((o) => { if (o.isMesh) { o.material.alphaTest = 0.5; o.material.side = THREE.DoubleSide; addWind(o.material, { amp: 0.05, freq: 1.1 }); } }); scene.add(ferns); out.ferns = ferns;

  // mossy rock clusters
  const rockA = [placeM(-10, heightAt(-10, -2) - 0.25, -2, 0.4, 0.55), placeM(14, heightAt(14, -18) - 0.3, -18, 2.1, 0.7), placeM(-6, heightAt(-6, 16) - 0.2, 16, 1.2, 0.45), placeM(22, heightAt(22, -27) - 0.4, -27, 4.1, 0.8)];
  const rockB = [placeM(1, heightAt(1, -19) - 0.3, -19, 0.9, 0.6), placeM(11, heightAt(11, 12) - 0.25, 12, 2.6, 0.5), placeM(-16, heightAt(-16, -10) - 0.3, -10, 5.2, 0.7), placeM(-3, heightAt(-3, -24) - 0.4, -24, 3.3, 0.8)];
  scene.add(instanceModel(gl.rock_moss_set_01, rockA), instanceModel(gl.rock_moss_set_02, rockB));
  // stumps, fallen trunk, branches, shrubs
  scene.add(instanceModel(gl.tree_stump_01, [placeM(6.2, heightAt(6.2, 0.6), 0.6, 0.5, 1), placeM(-8, heightAt(-8, 13), 13, 2, 0.9), placeM(13, heightAt(13, 5), 5, 4, 1.1)]));
  scene.add(instanceModel(gl.dead_tree_trunk, [placeM(-11.5, heightAt(-11.5, 13) - 0.05, 13, 1.1, 1), placeM(16, heightAt(16, -14) - 0.1, -14, 2.4, 1)]));
  scene.add(instanceModel(gl.dry_branches_medium_01, [placeM(-6, heightAt(-6, 4), 4, 1, 1), placeM(9, heightAt(9, -3), -3, 3, 1), placeM(-2, heightAt(-2, 17), 17, 5, 1)]));
  scene.add(instanceModel(gl.shrub_03, [placeM(-5.2, 0, 0.2, 0.3, 1.1), placeM(5.6, 0, -3.4, 2.1, 1.0), placeM(-8.5, heightAt(-8.5, -6.5), -6.5, 1.0, 1.3), placeM(9.5, heightAt(9.5, 1.5), 1.5, 4.0, 1.2)]));

  // mushrooms in clusters near stumps / logs / rocks
  const mush = [mushroomGeo(0), mushroomGeo(1)].map((geo) => new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), 60));
  const centers = [[6.2, 0.6], [-8, 13], [-11.5, 13.8], [-9.6, -1.6], [-5.6, 15.6], [13, 5], [-4.7, -0.6], [9, 11.5], [-14, 3]];
  const cnt = [0, 0];
  for (const [cx, cz] of centers) for (let k = 0; k < 8; k++) {
    const ty = rand() < 0.22 ? 1 : 0; if (cnt[ty] >= 60) continue;
    const x = cx + (rand() - 0.5) * 1.6, z = cz + (rand() - 0.5) * 1.6;
    mush[ty].setMatrixAt(cnt[ty]++, placeM(x, heightAt(x, z) - 0.005, z, rand() * 6, 0.8 + rand() * 1.6, (rand() - 0.5) * 0.3, (rand() - 0.5) * 0.3));
  }
  mush.forEach((m, i) => { m.count = cnt[i]; m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); scene.add(m); });

  // fire pit + log benches + campfire
  const fp = [6.5, 5.2], fy = heightAt(...fp);
  const pit = gl.stone_fire_pit.clone(); pit.position.set(fp[0], fy, fp[1]); pit.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } }); scene.add(pit);
  const barkM = new THREE.MeshStandardMaterial({ map: tex('assets/tex/pinebark_color.jpg', { srgb: true, repeat: [1, 0.5] }), normalMap: tex('assets/tex/pinebark_normal.jpg', { repeat: [1, 0.5] }), roughness: 0.95 });
  const endM = new THREE.MeshStandardMaterial({ map: endGrainTex(), roughness: 0.9 });
  const charM = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 1, emissive: 0x3a0c00, emissiveIntensity: 0.6 });
  const logsF = fireLogs(charM, charM, 5, 0.65, 0.055); logsF.position.set(fp[0], fy + 0.05, fp[1]); scene.add(logsF);
  const pitLight = new THREE.PointLight(0xff8a3a, 6, 9, 1.6); pitLight.position.set(fp[0], fy + 0.7, fp[1]); scene.add(pitLight);
  const fire = makeFire(0.85, pitLight); fire.position.set(fp[0], fy + 0.1, fp[1]); scene.add(fire); out.updates.push(fire.userData.update);
  const benchGeo = new THREE.CylinderGeometry(0.2, 0.22, 1.9, 14);
  for (const [bx, bz, a] of [[6.5, 7.4, 0.1], [8.7, 4.6, 1.7], [4.4, 4.2, -1.3]]) { const b = new THREE.Mesh(benchGeo, [barkM, endM, endM]); b.rotation.set(0, a, Math.PI / 2, 'YXZ'); b.position.set(bx, heightAt(bx, bz) + 0.18, bz); b.castShadow = b.receiveShadow = true; scene.add(b); }
  out.barkM = barkM; out.endM = endM;

  // axe in the chopping stump next to the woodpile
  const axe = gl.wooden_axe.clone(); axe.position.set(6.25, heightAt(6.2, 0.6) + 0.42, 0.6); axe.rotation.set(0, 0.6, 0.45); axe.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(axe);

  // carved sign near spawn + gallery + footprints
  const sign = await buildSign(); sign.position.set(-2.6, heightAt(-2.6, 11.4), 11.4); sign.rotation.y = 0.45; scene.add(sign);
  scene.add(buildFootprints());
  scene.add(buildGallery());
  return out;
}
export { buildSmoke };
