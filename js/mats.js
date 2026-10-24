// Texture + PBR material helpers (all textures CC0, see README).
import * as THREE from 'three';
const TL = new THREE.TextureLoader();
const cache = new Map();
export let ANISO = 4;
export function setAniso(a) { ANISO = a; }
export function tex(url, { srgb = false, repeat = [1, 1] } = {}) {
  const key = url + '|' + repeat.join(',');
  if (cache.has(key)) return cache.get(key);
  const t = TL.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}
// Poly Haven set: <name>_diff.jpg, _nor.jpg (GL), _arm.jpg (AO/Rough/Metal)
export function pbr(name, repeat = [1, 1], opts = {}) {
  const base = 'assets/tex/' + name;
  const arm = tex(base + '_arm.jpg', { repeat });
  const m = new THREE.MeshStandardMaterial({
    map: tex(base + '_diff.jpg', { srgb: true, repeat }),
    normalMap: tex(base + '_nor.jpg', { repeat }),
    roughnessMap: arm, aoMap: arm, metalness: 0, roughness: 1,
    ...opts,
  });
  return m;
}
export function canvasTex(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  return t;
}
// Height canvas (white=high) -> tangent-space normal map canvas
export function normalFromHeight(hc, strength = 2) {
  const w = hc.width, h = hc.height, src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const H = (x, y) => src[((Math.min(h - 1, Math.max(0, y)) * w) + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    let nx = -dx, ny = dy, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return out;
}
export function loadImage(url) { return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
// Instance every mesh of a glTF scene at the given placement matrices
export function instanceModel(root, matrices, { cast = true, receive = true } = {}) {
  const g = new THREE.Group(); root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    const im = new THREE.InstancedMesh(o.geometry, o.material, matrices.length);
    const local = o.matrixWorld.clone(), m = new THREE.Matrix4();
    matrices.forEach((M, i) => { m.multiplyMatrices(M, local); im.setMatrixAt(i, m); });
    im.castShadow = cast; im.receiveShadow = receive; im.computeBoundingSphere();
    g.add(im);
  });
  return g;
}
export function placeM(x, y, z, ry = 0, s = 1, rx = 0, rz = 0) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
}
// Wind sway injected into standard materials (uTime shared)
export const windUniforms = { uTime: { value: 0 } };
export function addWind(mat, { amp = 0.08, heightAttr = 'pos', freq = 1.3 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = windUniforms.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float hh = ${heightAttr === 'uv' ? 'uv.y' : 'max(position.y, 0.0)'};
        float ph = ip.x * 0.37 + ip.z * 0.23;
        float w = sin(uTime * ${freq.toFixed(2)} + ph) * 0.6 + sin(uTime * ${(freq * 2.3).toFixed(2)} + ph * 1.7) * 0.25;
        transformed.x += w * hh * hh * ${amp.toFixed(4)};
        transformed.z += w * 0.6 * hh * hh * ${amp.toFixed(4)};
      }`);
  };
  mat.customProgramCacheKey = () => 'wind' + amp + heightAttr + freq;
  return mat;
}
// Box with world-scaled UVs (texel density = 1 tile per `tile` meters)
export function boxGeo(w, h, d, tile = 1) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
