// Lil' Foots Cabin — realistic WebXR forest (three.js r170). Quest 2 friendly: static shadows, instancing, fixed light count.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { setAniso, windUniforms, loadImage } from './mats.js';
import { heightAt, CABIN, LAKE } from './util.js';
import { buildWorld } from './world.js';
import { buildCabin } from './cabin.js';
import { TV } from './tv.js';

const P = new URLSearchParams(location.search);
const UA = navigator.userAgent;
const isQuest = /OculusBrowser|Quest|Pico|Mobile VR/i.test(UA);
const HQ = P.has('hq') ? P.get('hq') !== '0' : (P.has('lite') ? false : !isQuest && !/Android|iPhone|iPad/i.test(UA));
const Q = HQ ? { trees: 120, nearR: 42, grass: 6000, ferns: 80, shadow: 2048, pr: Math.min(devicePixelRatio, 1.75), aniso: 8 }
  : { trees: 65, nearR: 15, grass: 2600, ferns: 40, shadow: 1024, pr: 1, aniso: 4 };
setAniso(Q.aniso);
const $ = (id) => document.getElementById(id);
$('hqbtn').textContent = HQ ? 'Quality: HQ' : 'Quality: Lite (Quest)';
$('hqbtn').onclick = () => { const u = new URL(location.href); u.searchParams.delete('hq'); u.searchParams.delete('lite'); u.searchParams.set(HQ ? 'lite' : 'hq', '1'); location.href = u; };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor'); renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa3a5a2, HQ ? 0.016 : 0.019);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
const rig = new THREE.Group(); rig.add(camera); scene.add(rig); camera.position.y = 1.6;

const sun = new THREE.DirectionalLight(0xfff0dd, 1.9);
sun.position.set(14, 26, 17); sun.target.position.set(0, 0, -3); scene.add(sun, sun.target);
sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 90 });
sun.shadow.mapSize.set(Q.shadow, Q.shadow); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035; sun.shadow.radius = 3;
const hemi = new THREE.HemisphereLight(0xc8d0d4, 0x3a3428, 0.25); scene.add(hemi);

// ---------- loading ----------
const mgr = new THREE.LoadingManager();
THREE.DefaultLoadingManager.onProgress = mgr.onProgress = (u, l, t) => { $('bar').style.width = Math.round(l / Math.max(t, 1) * 100) + '%'; };
const gltfL = new GLTFLoader(mgr).setMeshoptDecoder(MeshoptDecoder);
const MODELS = ['fern_02', 'rock_moss_set_01', 'rock_moss_set_02', 'tree_stump_01', 'dead_tree_trunk', 'dry_branches_medium_01', 'shrub_03', 'stone_fire_pit', 'wooden_axe',
  'ArmChair_01', 'ClassicConsole_01', 'CoffeeTable_01', 'Rockingchair_01', 'Sofa_01', 'wooden_bookshelf_worn', 'vintage_oil_lamp', 'wooden_bucket_01', 'wooden_lantern_01'];
const TREES = [0, 1, 2, 3].flatMap((i) => ['tree_hi' + i, 'tree_lo' + i]);
const gl = {}; window.__gl = gl; window.__scene = () => scene;
const loadG = (name, url) => gltfL.loadAsync(url).then((g) => { gl[name] = g.scene; });

let world, cabin, tv; const updates = []; const walkables = []; let blockers = []; let segs = []; let trunks = [];
async function init() {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envP = new RGBELoader(mgr).loadAsync('assets/hdri/misty_pines_1k.hdr').then((h) => { scene.environment = pmrem.fromEquirectangular(h).texture; h.dispose(); });
  const bgP = new THREE.TextureLoader(mgr).loadAsync('assets/hdri/misty_pines_bg.jpg').then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; scene.background = t; });
  scene.environmentIntensity = 0.85; scene.backgroundIntensity = 1.0;
  await Promise.all([envP, bgP, ...MODELS.map((m) => loadG(m, `assets/models/${m}.glb`)), ...TREES.map((m) => loadG(m, `assets/trees/${m}.glb`))]);
  world = await buildWorld(scene, gl, Q);
  cabin = buildCabin(scene, gl, Q);
  updates.push(...world.updates, ...cabin.updates); walkables.push(...world.walk, ...cabin.walk); blockers = cabin.blockers; segs = cabin.segs; trunks = world.trunks;
  // TV on the back wall console
  const foot = await loadImage('assets/foot0.png').catch(() => null);
  tv = new TV({ width: 1.7, foot, onOpenSite: openSite, onStatus: toast }); window.__tv = tv;
  const a = cabin.tvAnchor; tv.group.position.set(a.x, a.y + 0.2 + tv.sh / 2 - 0.2 + 0.0, a.z); tv.group.position.y = a.y - 0.52 + 0.2 + tv.sh / 2 + 0.02; scene.add(tv.group);
  // ensure TV base sits on console top
  tv.group.position.y = CABIN.floorY + 0.949 - tv.group.userData.bottom;
  renderer.shadowMap.needsUpdate = true;
  THREE.DefaultLoadingManager.onLoad = () => { renderer.shadowMap.needsUpdate = true; };
  [800, 2500, 6000].forEach((ms) => setTimeout(() => { renderer.shadowMap.needsUpdate = true; }, ms));
  $('loading').style.display = 'none';
  const pv = P.get('video'); if (pv) tv.playUrl(pv, 'Video from link');
  setView(P.get('view') || 'spawn');
  window.__stats = () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs.length, world: world.stats, hq: HQ });
  let frames = 0; const chk = () => { if (++frames > 8) { window.DONE = true; } else requestAnimationFrame(chk); }; requestAnimationFrame(chk);
}

// ---------- views ----------
let yaw = 0, pitch = 0;
const VIEWS = {
  spawn: [0, 13, 0, 1.55, -4, 0.02],
  exterior: [3.6, 13.2, -0.4, 2.2, -4, 0],
  interior: [3.0, -1.45, -0.7, 0.95, -6.6, 0],
  fire: [-0.8, -2.4, -3.6, 0.7, -4, 0],
  tv: [0.2, -3.2, 0.15, 1.5, -6.6, 0],
  up: [0, 13, 0, 9, -10, 0],
  lake: [6, -14, 11, 0, -31, 0],
};
function setView(name) {
  const v = VIEWS[name] || VIEWS.spawn; const [x, z, tx, ty, tz] = v;
  const g = groundAt(x, z); rig.position.set(x, g, z);
  const d = new THREE.Vector3(tx - x, ty - (g + 1.6), tz - z).normalize();
  yaw = Math.atan2(-d.x, -d.z); pitch = Math.asin(d.y); applyLook();
}
window.__view = setView;
function applyLook() { if (renderer.xr.isPresenting) return; rig.rotation.y = yaw; camera.rotation.set(pitch, 0, 0, 'YXZ'); }

// ---------- ground + collision ----------
const IN = { x0: CABIN.x0 + 0.17, x1: CABIN.x1 - 0.17, z0: CABIN.z0 + 0.17, z1: CABIN.z1 - 0.17 };
function inCabin(x, z) { return x > CABIN.x0 - 0.05 && x < CABIN.x1 + 0.05 && z > CABIN.z0 - 0.05 && z < CABIN.z1 + 0.1; }
function groundAt(x, z) { if (inCabin(x, z)) return CABIN.floorY; if (x > 0.5 && x < 3.1 && z > -1.1 && z < 1.4) return 0.12; return heightAt(x, z); }
const PR = 0.28;
function collide(x, z) {
  for (let it = 0; it < 2; it++) {
    for (const [ax, az, bx, bz] of segs) {
      const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
      const cx = ax + dx * t, cz = az + dz * t, ex = x - cx, ez = z - cz, d = Math.hypot(ex, ez), rr = PR + 0.17;
      if (d < rr && d > 1e-6) { x = cx + ex / d * rr; z = cz + ez / d * rr; }
    }
    for (const [tx, tz] of trunks) { const ex = x - tx, ez = z - tz, d = Math.hypot(ex, ez); if (d < PR + 0.35 && d > 1e-6) { x = tx + ex / d * (PR + 0.35); z = tz + ez / d * (PR + 0.35); } }
  }
  return [Math.max(-105, Math.min(105, x)), Math.max(-105, Math.min(105, z))];
}
const headW = new THREE.Vector3();
function moveBy(dx, dz) {
  camera.getWorldPosition(headW);
  let [nx, nz] = collide(headW.x + dx, headW.z + dz);
  if (heightAt(nx, nz) < LAKE.level + 0.2 && !inCabin(nx, nz)) return; // stay out of the lake
  rig.position.x += nx - headW.x; rig.position.z += nz - headW.z;
}
function followGround(dt) { camera.getWorldPosition(headW); const g = groundAt(headW.x, headW.z); rig.position.y += (g - rig.position.y) * Math.min(1, dt * 10); }

// ---------- XR controllers: laser UI, teleport, stick locomotion ----------
const factory = new XRControllerModelFactory();
const ctrls = [];
const ray = new THREE.Raycaster(), tmpM = new THREE.Matrix4();
const arcPts = new Float32Array(64 * 3);
const arcGeo = new THREE.BufferGeometry(); arcGeo.setAttribute('position', new THREE.BufferAttribute(arcPts, 3));
const arc = new THREE.Line(arcGeo, new THREE.LineBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9 })); arc.frustumCulled = false; arc.visible = false; scene.add(arc);
const marker = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.85, depthWrite: false })); marker.visible = false; scene.add(marker);
for (let i = 0; i < 2; i++) {
  const c = renderer.xr.getController(i);
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
  const laser = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })); laser.scale.z = 2; c.add(laser);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd36b })); dot.visible = false; scene.add(dot);
  const st = { c, laser, dot, hand: '', gp: null, ui: null, tele: false, snapArmed: true };
  c.addEventListener('connected', (e) => { st.hand = e.data.handedness; st.gp = e.data.gamepad; });
  c.addEventListener('disconnected', () => { st.gp = null; });
  c.addEventListener('selectstart', () => { if (!st.ui && (st.hand === 'right' || ctrls.filter((s) => s.gp).length < 2)) st.tele = true; });
  c.addEventListener('selectend', () => { if (st.tele) { st.tele = false; if (teleTarget) doTeleport(teleTarget); arc.visible = marker.visible = false; } });
  c.addEventListener('select', () => { if (st.ui && tv) tv.click(st.ui.object, st.ui.uv); }); // 'select' carries user activation (window.open)
  rig.add(c);
  const grip = renderer.xr.getControllerGrip(i); grip.add(factory.createControllerModel(grip)); rig.add(grip);
  ctrls.push(st);
}
let teleTarget = null;
function doTeleport(p) { camera.getWorldPosition(headW); rig.position.x += p.x - headW.x; rig.position.z += p.z - headW.z; rig.position.y = groundAt(p.x, p.z); }
const v3 = new THREE.Vector3(), dir3 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
function updateArc(st) {
  st.c.getWorldPosition(v3); dir3.set(0, 0, -1).applyQuaternion(st.c.getWorldQuaternion(new THREE.Quaternion()));
  const vel = dir3.clone().multiplyScalar(7.5), p = v3.clone(), targets = walkables.concat(blockers); let n = 0; teleTarget = null;
  for (let i = 0; i < 63; i++) {
    arcPts.set([p.x, p.y, p.z], n++ * 3);
    const np = p.clone().addScaledVector(vel, 0.035); vel.y -= 9.8 * 0.035;
    const seg = np.clone().sub(p), L = seg.length(); ray.set(p, seg.normalize()); ray.far = L;
    const h = ray.intersectObjects(targets, false)[0];
    if (h) { arcPts.set([h.point.x, h.point.y, h.point.z], n++ * 3); if (walkables.includes(h.object) && (!h.face || h.face.normal.y > 0.5 || h.object.name === 'terrain') && heightAt(h.point.x, h.point.z) > LAKE.level + 0.2 || (h.object.name === 'floor')) teleTarget = h.point.clone(); break; }
    p.copy(np); if (p.y < -5) break;
  }
  arcGeo.setDrawRange(0, n); arcGeo.attributes.position.needsUpdate = true; arc.visible = true;
  arc.material.color.set(teleTarget ? 0x9fe8ff : 0xff6b5a);
  marker.visible = !!teleTarget; if (teleTarget) marker.position.copy(teleTarget).add(new THREE.Vector3(0, 0.03, 0));
}
function xrInput(dt) {
  let anyHover = false;
  for (const st of ctrls) {
    if (!st.gp) { st.laser.visible = false; st.dot.visible = false; continue; }
    st.laser.visible = true;
    tmpM.identity().extractRotation(st.c.matrixWorld); ray.ray.origin.setFromMatrixPosition(st.c.matrixWorld); ray.ray.direction.set(0, 0, -1).applyMatrix4(tmpM); ray.far = 12;
    const h = tv ? ray.intersectObjects(tv.interactive, false)[0] : null;
    st.ui = h && tv.hit(h.object, h.uv) ? h : null;
    if (st.ui) { anyHover = true; tv.setHover(h.object, h.uv); st.laser.scale.z = h.distance; st.dot.visible = true; st.dot.position.copy(h.point); st.laser.material.opacity = 0.9; }
    else { st.laser.scale.z = 1.2; st.dot.visible = false; st.laser.material.opacity = 0.35; }
    if (st.tele) updateArc(st);
    const ax = st.gp.axes; const sx = ax.length >= 4 ? ax[2] : (ax[0] || 0), sy = ax.length >= 4 ? ax[3] : (ax[1] || 0);
    if (st.hand === 'left' || (st.hand !== 'right' && ctrls.indexOf(st) === 0)) {
      if (Math.hypot(sx, sy) > 0.15) { camera.getWorldDirection(dir3); dir3.y = 0; dir3.normalize(); const right = new THREE.Vector3().crossVectors(dir3, up); const sp = 2.0 * dt; moveBy((dir3.x * -sy + right.x * sx) * sp, (dir3.z * -sy + right.z * sx) * sp); }
    } else {
      if (Math.abs(sx) > 0.7 && st.snapArmed) { st.snapArmed = false; snapTurn(sx > 0 ? -Math.PI / 6 : Math.PI / 6); }
      if (Math.abs(sx) < 0.3) st.snapArmed = true;
    }
  }
  if (!anyHover && tv && !mouseHover) tv.setHover(null);
}
function snapTurn(a) {
  camera.getWorldPosition(headW); const ox = headW.x, oz = headW.z;
  rig.rotation.y += a; rig.updateMatrixWorld(true); camera.getWorldPosition(headW);
  rig.position.x += ox - headW.x; rig.position.z += oz - headW.z;
}
renderer.xr.addEventListener('sessionstart', () => { camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0); startAudio(); $('links').style.display = 'none'; });
renderer.xr.addEventListener('sessionend', () => { camera.position.set(0, 1.6, 0); yaw = rig.rotation.y; pitch = 0; applyLook(); arc.visible = marker.visible = false; });

// ---------- desktop controls ----------
const keys = {}; let drag = null, mouseHover = false;
addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT') return; keys[e.code] = true; startAudio(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const cvs = renderer.domElement, ndc = new THREE.Vector2();
function pickUI(e) { if (!tv) return null; ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera); ray.far = 12; const h = ray.intersectObjects(tv.interactive, false)[0]; return h && tv.hit(h.object, h.uv) ? h : null; }
cvs.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, moved: 0 }; cvs.setPointerCapture(e.pointerId); startAudio(); });
cvs.addEventListener('pointermove', (e) => {
  if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved += Math.abs(dx) + Math.abs(dy); drag.x = e.clientX; drag.y = e.clientY; yaw -= dx * 0.004; pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * 0.004)); applyLook(); }
  const h = pickUI(e); mouseHover = !!h; if (tv) tv.setHover(h ? h.object : null, h ? h.uv : null); cvs.style.cursor = h ? 'pointer' : 'grab';
});
cvs.addEventListener('pointerup', (e) => { if (drag && drag.moved < 6) { const h = pickUI(e); if (h) tv.click(h.object, h.uv); } drag = null; });
function desktopMove(dt) {
  let f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0), s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  if (keys.KeyQ) { yaw += dt * 1.6; applyLook(); } if (keys.KeyE) { yaw -= dt * 1.6; applyLook(); }
  if (!f && !s) return; const sp = (keys.ShiftLeft ? 4.2 : 2.2) * dt, c = Math.cos(yaw), si = Math.sin(yaw);
  moveBy((-si * f + c * s) * sp, (-c * f - si * s) * sp);
}

// ---------- HUD ----------
let toastT;
function toast(m) { const t = $('toast'); t.textContent = m; t.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { t.style.opacity = 0; }, 5000); }
function openSite(url, label) {
  const s = renderer.xr.getSession(); let w = null;
  try { w = window.open(url, '_blank'); if (w) w.opener = null; } catch (e) { w = null; }
  const a = $('linkA'); a.href = url; a.textContent = 'Open ' + label + ' ↗';
  $('linkMsg').textContent = w ? `${label} opened in a new browser tab. Come back to this tab and press Enter VR to return to the cabin.` : `Your browser blocked the pop-up. Tap the button to open ${label}:`;
  $('links').style.display = 'flex';
  if (s) s.end();
}
$('linkClose').onclick = () => { $('links').style.display = 'none'; };
$('playurl').onclick = () => { const u = $('url').value.trim(); if (u && tv) { tv.playUrl(u, 'Your link'); setView('tv'); } };
$('url').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('playurl').click(); });
$('inside').onclick = () => setView('tv'); $('outside').onclick = () => setView('spawn');
$('snd').onclick = () => { startAudio(); if (!audio) return; audio.on = !audio.on; audio.master.gain.value = audio.on ? 1 : 0; $('snd').textContent = audio.on ? 'Sound: on' : 'Sound: off'; };

// ---------- ambient audio (procedural wind + fire crackle) ----------
let audio = null;
function startAudio() {
  if (audio) { if (audio.ctx.state === 'suspended') audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(), master = ctx.createGain(); master.connect(ctx.destination);
  const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate), d = buf.getChannelData(0); let b = 0; for (let i = 0; i < d.length; i++) { b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = b * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 700; const wg = ctx.createGain(); wg.gain.value = 0.25;
  const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.08; lg.gain.value = 0.12; lfo.connect(lg).connect(wg.gain); lfo.start();
  src.connect(bp).connect(wg).connect(master); src.start();
  const fg = ctx.createGain(); fg.gain.value = 0; fg.connect(master);
  const crackle = () => { const t = ctx.currentTime, n = ctx.createBufferSource(), e = ctx.createBuffer(1, 400, ctx.sampleRate), ed = e.getChannelData(0); for (let i = 0; i < 400; i++) ed[i] = (Math.random() * 2 - 1) * Math.exp(-i / 40); n.buffer = e; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500 + Math.random() * 2500; n.connect(hp).connect(fg); n.start(t); setTimeout(crackle, 40 + Math.random() * 260); };
  crackle();
  audio = { ctx, master, wg, fg, on: true }; $('snd').textContent = 'Sound: on';
}
function updateAudio() {
  if (!audio) return; camera.getWorldPosition(headW);
  const dIn = Math.hypot(headW.x + 3.3, headW.z + 4), dPit = Math.hypot(headW.x - 6.5, headW.z - 5.2), d = Math.min(dIn, dPit);
  audio.fg.gain.value = Math.min(0.9, 2.2 / (1 + d * d * 0.35)); audio.wg.gain.value = inCabin(headW.x, headW.z) ? 0.08 : 0.25;
}

// ---------- loop ----------
const clock = new THREE.Clock();
const _hp = new THREE.Vector3();
const loop = () => {
  const dt = Math.min(clock.getDelta(), 0.1), t = clock.elapsedTime;
  windUniforms.uTime.value = t;
  for (const u of updates) u(t);
  if (renderer.xr.isPresenting) xrInput(dt); else desktopMove(dt);
  if (world) { followGround(dt); camera.getWorldPosition(_hp); const ins = _hp.x > CABIN.x0 + 0.1 && _hp.x < CABIN.x1 - 0.1 && _hp.z > CABIN.z0 + 0.1 && _hp.z < CABIN.z1 - 0.2; world.grass.visible = world.ferns.visible = !ins; } // perf: grass/ferns are only seen through windows when inside
  updateAudio();
  renderer.render(scene, camera);
};
renderer.setAnimationLoop(loop);
// test hooks (headless screenshots)
window.__pause = () => renderer.setAnimationLoop(null);
window.__snap = (n = 1) => { for (let i = 0; i < n; i++) { if (world) followGround(1); loop(); } return renderer.domElement.toDataURL('image/png'); };
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
const vrb = VRButton.createButton(renderer, { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] }); vrb.id = 'vrbtn'; document.body.appendChild(vrb);
init().catch((e) => { console.error(e); $('loadmsg').textContent = 'Error: ' + e.message; });
