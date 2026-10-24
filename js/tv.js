// Cabin TV: canvas UI (idle / menu), in-world <video> player (mp4/webm/HLS), optional screen cast,
// and "open site in browser" tiles. WebGL cannot render cross-origin websites, so site tiles open a
// real browser tab (VR session ends) instead of drawing the page on the TV.
import * as THREE from 'three';

export const SITES = [
  { label: 'YouTube', sub: 'youtube.com', url: 'https://www.youtube.com', color: '#c4302b' },
  { label: 'X', sub: 'x.com', url: 'https://x.com', color: '#111111' },
  { label: 'OpenSea', sub: 'search Lil Foots', url: 'https://opensea.io/search?query=Lil%20Foots', color: '#2081e2' },
  { label: 'Magic Eden', sub: 'magiceden.io', url: 'https://magiceden.io/', color: '#e42575' },
  { label: 'BIGfoot.biz', sub: 'home of Lil\' Foots', url: 'https://bigfoot.biz', color: '#8a5a2b' },
  { label: 'Google', sub: 'google.com', url: 'https://www.google.com', color: '#34a853' },
];
export const VIDEOS = [
  { label: 'Campfire', sub: 'CC0 · Wikimedia', url: 'https://upload.wikimedia.org/wikipedia/commons/c/cf/ABOedit2015-Video-Fire.webm' },
  { label: 'Snowy forest', sub: 'Public domain · NPS', url: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Grand_Canyon_National_Park-_North_Rim_Forest_-_Snow_%288622560566%29.webm' },
  { label: 'Big Buck Bunny', sub: 'CC BY 3.0 · Blender Fdn', url: 'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm' },
  { label: 'HLS stream', sub: 'Mux test stream', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
];
const W = 1280, H = 720, BW = 1280, BH = 96;
const canCast = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

function rr(x, X, Y, w, h, r) { x.beginPath(); x.roundRect ? x.roundRect(X, Y, w, h, r) : x.rect(X, Y, w, h); }

export class TV {
  constructor({ width = 1.44, foot, onOpenSite, onStatus }) {
    this.onOpenSite = onOpenSite; this.onStatus = onStatus || (() => {});
    this.group = new THREE.Group();
    const sw = width, sh = width * 9 / 16; this.sw = sw; this.sh = sh;
    // bezel + stand
    const bez = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.35, metalness: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(sw + 0.05, sh + 0.05, 0.045), bez); body.castShadow = true; this.group.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.04), bez); neck.position.set(0, -sh / 2 - 0.09, -0.01); this.group.add(neck);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.015, 0.2), bez); base.position.set(0, -sh / 2 - 0.19, 0.0); this.group.add(base);
    this.group.userData.bottom = -sh / 2 - 0.2;
    // screen
    this.ui = document.createElement('canvas'); this.ui.width = W; this.ui.height = H; this.ctx = this.ui.getContext('2d');
    this.uiTex = new THREE.CanvasTexture(this.ui); this.uiTex.colorSpace = THREE.SRGBColorSpace; this.uiTex.anisotropy = 4;
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.uiTex, toneMapped: false });
    this.black = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), new THREE.MeshBasicMaterial({ color: 0x000000 })); this.black.position.z = 0.0235; this.group.add(this.black);
    this.screen = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), this.screenMat); this.screen.position.z = 0.024; this.screen.name = 'tv-screen'; this.group.add(this.screen);
    // soft screen glow on the room (cheap: emissive quad behind is not needed; a weak rect-ish point light)
    this.glow = new THREE.PointLight(0x9fb8ff, 0.0, 3.5, 2); this.glow.position.set(0, 0, 0.5); this.group.add(this.glow);
    // control bar under the TV
    this.bar = document.createElement('canvas'); this.bar.width = BW; this.bar.height = BH; this.bctx = this.bar.getContext('2d');
    this.barTex = new THREE.CanvasTexture(this.bar); this.barTex.colorSpace = THREE.SRGBColorSpace;
    this.barMesh = new THREE.Mesh(new THREE.PlaneGeometry(sw, sw * BH / BW), new THREE.MeshBasicMaterial({ map: this.barTex, toneMapped: false, transparent: true }));
    this.barMesh.position.set(0, -sh / 2 - 0.12, 0.14); this.barMesh.rotation.x = -0.35; this.barMesh.name = 'tv-bar'; this.group.add(this.barMesh);
    this.interactive = [this.screen, this.barMesh];
    // video
    const v = this.video = document.createElement('video');
    v.crossOrigin = 'anonymous'; v.playsInline = true; v.setAttribute('playsinline', ''); v.loop = true; v.preload = 'auto'; v.volume = 0.7;
    this.vtex = new THREE.VideoTexture(v); this.vtex.colorSpace = THREE.SRGBColorSpace;
    v.addEventListener('loadedmetadata', () => this.fitAspect());
    v.addEventListener('error', () => { if (this.mode === 'video' && !this.casting) this.fail('Could not load this video. It must be a direct mp4/webm/m3u8 URL served with CORS (Access-Control-Allow-Origin).'); });
    this.foot = foot; this.mode = 'idle'; this.hover = null; this.msg = ''; this.title = ''; this.regions = []; this.barRegions = [];
    this.draw(); this.drawBar();
    this._clock = setInterval(() => { if (this.mode === 'idle') this.draw(); }, 15000);
  }
  // ---------- drawing ----------
  draw() {
    const x = this.ctx; this.regions = [];
    if (this.mode === 'idle') {
      const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0d1814'); g.addColorStop(1, '#25331f'); x.fillStyle = g; x.fillRect(0, 0, W, H);
      x.globalAlpha = 0.18; for (let i = 0; i < 26; i++) { x.fillStyle = '#9fb48a'; const tx = (i * 97) % W, th = 120 + (i * 53) % 220; x.beginPath(); x.moveTo(tx, H); x.lineTo(tx + 40, H - th); x.lineTo(tx + 80, H); x.fill(); } x.globalAlpha = 1;
      if (this.foot) x.drawImage(this.foot, 820, 150, 380, 380);
      x.fillStyle = '#f2e6c8'; x.font = 'bold 84px Georgia, serif'; x.fillText('BIGfoot.biz', 80, 230);
      x.font = '40px Georgia, serif'; x.fillStyle = '#d6c08a'; x.fillText('Cabin TV · Lil\' Foots channel', 82, 290);
      const d = new Date(); x.font = 'bold 120px system-ui, sans-serif'; x.fillStyle = '#ffffff'; x.fillText(d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 80, 460);
      x.font = '34px system-ui, sans-serif'; x.fillStyle = '#cfd8c8'; x.fillText(d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), 84, 515);
      rr(x, 80, 590, 640, 74, 37); x.fillStyle = this.hover === 'open' ? '#e6b450' : 'rgba(255,255,255,0.14)'; x.fill();
      x.fillStyle = this.hover === 'open' ? '#1a1206' : '#fff'; x.font = 'bold 34px system-ui, sans-serif'; x.fillText('▶  Point here & pull trigger / click', 110, 638);
      this.regions.push({ id: 'open', x: 0, y: 0, w: W, h: H, act: () => this.setMode('menu') });
    } else if (this.mode === 'menu') {
      x.fillStyle = '#10141a'; x.fillRect(0, 0, W, H);
      x.fillStyle = '#fff'; x.font = 'bold 44px system-ui, sans-serif'; x.fillText('Open a website', 48, 70);
      x.font = '24px system-ui, sans-serif'; x.fillStyle = '#9aa5b5'; x.fillText('Opens in a new browser tab (exits VR) — browsers cannot draw live websites inside WebGL', 48, 104);
      const tw = 380, th = 112, gx = 48, gy = 128;
      SITES.forEach((s, i) => { const c = i % 3, r = Math.floor(i / 3), X = gx + c * (tw + 24), Y = gy + r * (th + 18); this.tile(X, Y, tw, th, 'site' + i, s.color, s.label, s.sub, '↗'); this.regions.push({ id: 'site' + i, x: X, y: Y, w: tw, h: th, act: () => this.onOpenSite(s.url, s.label) }); });
      x.fillStyle = '#fff'; x.font = 'bold 40px system-ui, sans-serif'; x.fillText('Watch on this TV', 48, 430);
      const items = VIDEOS.map((v, i) => ({ id: 'vid' + i, color: '#2c3a2a', label: v.label, sub: v.sub, act: () => this.playUrl(v.url, v.label) }));
      if (canCast) items.push({ id: 'cast', color: '#3a2c4a', label: 'Cast my screen', sub: 'share a tab / window', act: () => this.cast() });
      const vw = (W - 96 - (items.length - 1) * 18) / items.length;
      items.forEach((it, i) => { const X = 48 + i * (vw + 18), Y = 452; this.tile(X, Y, vw, 112, it.id, it.color, it.label, it.sub, '▶'); this.regions.push({ id: it.id, x: X, y: Y, w: vw, h: 112, act: it.act }); });
      x.font = '24px system-ui, sans-serif'; x.fillStyle = '#9aa5b5';
      x.fillText('Any direct .mp4 / .webm / .m3u8 link with CORS works: use the URL box on desktop or add ?video=URL to the page link.', 48, 620);
      if (this.msg) { x.fillStyle = '#ffb4a0'; x.font = 'bold 24px system-ui, sans-serif'; this.wrap(this.msg, 48, 662, W - 96, 30); }
    } else if (this.mode === 'loading') {
      x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.fillStyle = '#fff'; x.font = '40px system-ui, sans-serif'; x.fillText('Loading ' + this.title + ' …', 60, H / 2);
    }
    this.uiTex.needsUpdate = true;
  }
  tile(X, Y, w, h, id, color, label, sub, icon) {
    const x = this.ctx, hot = this.hover === id;
    rr(x, X, Y, w, h, 18); x.fillStyle = color; x.fill();
    if (hot) { x.lineWidth = 6; x.strokeStyle = '#ffd36b'; x.stroke(); }
    x.fillStyle = 'rgba(255,255,255,0.08)'; rr(x, X, Y, w, h / 2, 18); x.fill();
    x.fillStyle = '#fff'; x.font = `bold ${w < 260 ? 30 : 38}px system-ui, sans-serif`; x.fillText(label, X + 22, Y + 52);
    x.font = `${w < 260 ? 19 : 22}px system-ui, sans-serif`; x.fillStyle = 'rgba(255,255,255,0.82)'; x.fillText(sub, X + 22, Y + 88);
    x.font = 'bold 34px system-ui'; x.fillStyle = '#fff'; x.fillText(icon, X + w - 50, Y + 52);
  }
  wrap(t, X, Y, mw, lh) { const x = this.ctx, words = t.split(' '); let line = ''; for (const w of words) { const tt = line + w + ' '; if (x.measureText(tt).width > mw) { x.fillText(line, X, Y); line = w + ' '; Y += lh; } else line = tt; } x.fillText(line, X, Y); }
  drawBar() {
    const x = this.bctx; x.clearRect(0, 0, BW, BH); this.barRegions = [];
    rr(x, 0, 0, BW, BH, 30); x.fillStyle = 'rgba(14,16,20,0.92)'; x.fill();
    const btns = this.mode === 'video'
      ? [['menu', '☰ Menu', () => this.setMode('menu')], ['pp', this.video.paused ? '▶ Play' : '❚❚ Pause', () => this.togglePlay()], ['vd', '− Vol', () => this.vol(-0.15)], ['vu', '+ Vol', () => this.vol(0.15)], ['stop', '■ Stop', () => this.stop()]]
      : [['menu', '☰ Menu', () => this.setMode('menu')], ['idle', '⌂ Home', () => this.setMode('idle')]];
    let X = 14; x.font = 'bold 36px system-ui, sans-serif'; x.textBaseline = 'middle';
    for (const [id, label, act] of btns) { const w = x.measureText(label).width + 44; rr(x, X, 12, w, BH - 24, 20); x.fillStyle = this.hover === 'b:' + id ? '#e6b450' : 'rgba(255,255,255,0.13)'; x.fill(); x.fillStyle = this.hover === 'b:' + id ? '#1a1206' : '#fff'; x.fillText(label, X + 22, BH / 2 + 2); this.barRegions.push({ id: 'b:' + id, x: X, y: 0, w, h: BH, act }); X += w + 12; }
    x.font = '28px system-ui, sans-serif'; x.fillStyle = '#c8cfd8';
    const st = this.mode === 'video' ? `${this.title}  ·  vol ${Math.round(this.video.volume * 100)}%` : 'Point the laser & pull trigger (or click)';
    x.fillText(st.length > 46 ? st.slice(0, 45) + '…' : st, X + 12, BH / 2 + 2); x.textBaseline = 'alphabetic';
    this.barTex.needsUpdate = true;
  }
  // ---------- interaction ----------
  hit(mesh, uv) {
    if (!uv) return null;
    const list = mesh === this.screen ? (this.mode === 'video' ? [{ id: 'vidclick', x: 0, y: 0, w: W, h: H, act: () => this.togglePlay() }] : this.regions) : this.barRegions;
    const cw = mesh === this.screen ? W : BW, ch = mesh === this.screen ? H : BH;
    let px = uv.x * cw, py = (1 - uv.y) * ch;
    if (mesh === this.screen && this.mode === 'video') return list[0];
    return list.find((r) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) || null;
  }
  setHover(mesh, uv) {
    const r = mesh ? this.hit(mesh, uv) : null, id = r ? r.id : null;
    if (id !== this.hover) { this.hover = id; if (this.mode !== 'video') this.draw(); this.drawBar(); }
    return !!r;
  }
  click(mesh, uv) { const r = this.hit(mesh, uv); if (r) { r.act(); return true; } return false; }
  setMode(m) {
    if (m !== 'video' && this.mode === 'video') this.stop(true);
    this.mode = m; if (m !== 'menu') this.msg = '';
    if (m !== 'video') { this.screen.material.map = this.uiTex; this.screen.scale.set(1, 1, 1); this.glow.intensity = 0.25; }
    this.draw(); this.drawBar();
  }
  fail(msg) { this.stop(true); this.mode = 'menu'; this.msg = msg; this.screen.material.map = this.uiTex; this.screen.scale.set(1, 1, 1); this.draw(); this.drawBar(); this.onStatus(msg); }
  fitAspect() {
    const v = this.video, a = (v.videoWidth || 16) / (v.videoHeight || 9), sa = 16 / 9;
    if (a > sa) this.screen.scale.set(1, sa / a, 1); else this.screen.scale.set(a / sa, 1, 1);
  }
  async playUrl(url, title = 'Video') {
    url = (url || '').trim(); if (!url) return;
    this.stop(true); this.casting = false; this.title = title; this.mode = 'loading'; this.draw();
    const v = this.video; v.srcObject = null; v.muted = false;
    try {
      if (/\.m3u8(\?|$)/i.test(url) && !v.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.mjs');
        if (!Hls.isSupported()) throw new Error('HLS is not supported in this browser');
        this.hls = new Hls(); this.hls.loadSource(url); this.hls.attachMedia(v);
        this.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) this.fail('HLS stream failed (' + d.details + '). The stream must allow CORS.'); });
      } else { v.src = url; }
      this.showVideo();
      try { await v.play(); } catch (e) { v.muted = true; await v.play(); this.onStatus('Autoplay blocked sound — video muted, use + Vol to unmute.'); }
      this.drawBar();
    } catch (e) { if (this.mode !== 'menu') this.fail('Could not play: ' + (e.message || e) + '. Use a direct, CORS-enabled mp4/webm/m3u8 link.'); }
  }
  showVideo() { this.mode = 'video'; this.screen.material.map = this.vtex; this.screen.material.needsUpdate = true; this.glow.intensity = 0.6; this.drawBar(); }
  async cast() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      this.stop(true); const v = this.video; v.src = ''; v.srcObject = stream; v.muted = true; this.casting = true; this.title = 'Screen cast';
      stream.getVideoTracks()[0].addEventListener('ended', () => this.setMode('menu'));
      this.showVideo(); await v.play(); this.drawBar();
    } catch (e) { this.msg = 'Screen cast cancelled or not allowed here (' + (e.name || e) + ').'; this.draw(); }
  }
  togglePlay() { const v = this.video; if (v.paused) v.play().catch(() => {}); else v.pause(); setTimeout(() => this.drawBar(), 50); }
  vol(d) { const v = this.video; v.muted = false; v.volume = Math.min(1, Math.max(0, v.volume + d)); this.drawBar(); }
  stop(keep) {
    const v = this.video; v.pause();
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (v.srcObject) { v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; }
    v.removeAttribute('src'); v.load(); this.casting = false;
    if (!keep) this.setMode('menu');
  }
}
