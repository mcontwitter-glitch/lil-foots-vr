/* Bigfoot Country VR — procedural low-poly world for Lil' Foots (BIGfoot.biz) */
(function(){
const T = AFRAME.THREE;
// deterministic RNG so the world is the same every visit
let seed = 404; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const lerp=(a,b,t)=>a+(b-a)*t, smooth=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t);};
const FLAT = 26;               // walkable flat radius
function height(x,z){ const r=Math.hypot(x,z);
  const n=Math.sin(x*0.13)*Math.cos(z*0.11)*2.2+Math.sin(x*0.05+z*0.07)*3+Math.sin(z*0.21+1.3)*0.8;
  return smooth(FLAT,48,r)*(6+n*1.6) + smooth(FLAT, FLAT+0.01, r)*0; }

const LAKE = {x:11, z:-5, rx:6.5, rz:4.5};
const CABIN = {x:-11, z:-7, rot:0.6};
function blocked(x,z,pad){ pad=pad||0;
  const lx=(x-LAKE.x)/(LAKE.rx+1.5+pad), lz=(z-LAKE.z)/(LAKE.rz+1.5+pad); if(lx*lx+lz*lz<1) return true;
  if(Math.hypot(x-CABIN.x,z-CABIN.z)<6+pad) return true;
  if(Math.abs(x)<7.5+pad && z>-17-pad && z<-10) return true; if(Math.hypot(x-6.5,z+12)<3+pad) return true; return false; }

function canvasTex(w,h,draw){ const c=document.createElement('canvas'); c.width=w; c.height=h; draw(c.getContext('2d'),w,h);
  const t=new T.CanvasTexture(c); t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; return t; }
const lambert=(color,o)=>new T.MeshLambertMaterial(Object.assign({color, flatShading:true},o||{}));

AFRAME.registerComponent('bigfoot-world',{
  init(){
    const scene=this.el; const root=new T.Group(); this.root=root; scene.object3D.add(root);
    this.sky(); this.terrain(); this.lake(); this.trees(); this.rocks(); this.cabin(); this.campfire();
    this.footprints(); this.fireflies(); this.gallery(); this.standees(); this.totem(); this.sign();
  },
  sky(){
    const g=new T.SphereGeometry(400,24,12);
    const m=new T.ShaderMaterial({side:T.BackSide, depthWrite:false, fog:false, uniforms:{},
      vertexShader:'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`varying vec3 vP; void main(){ float h=vP.y;
        vec3 top=vec3(0.07,0.06,0.18), mid=vec3(0.36,0.22,0.42), hor=vec3(0.98,0.52,0.32), fogc=vec3(0.227,0.208,0.314);
        float sunSide=smoothstep(-0.2,1.0,dot(normalize(vec3(vP.x,0.0,vP.z)),normalize(vec3(-0.6,0.0,-0.8))));
        vec3 c=mix(mix(fogc,hor,sunSide*0.85),mid,smoothstep(0.0,0.25,h)); c=mix(c,top,smoothstep(0.25,0.8,h));
        if(h<0.0) c=fogc; gl_FragColor=vec4(c,1.0);} `});
    const sky=new T.Mesh(g,m); sky.renderOrder=-1; this.root.add(sky);
    // moon + a few stars
    const moon=new T.Mesh(new T.CircleGeometry(9,20), new T.MeshBasicMaterial({color:'#fff4d6',fog:false}));
    moon.position.set(140,190,-260); moon.lookAt(0,0,0); this.root.add(moon);
    const sp=[]; for(let i=0;i<300;i++){ const th=rnd()*Math.PI*2, ph=0.35+rnd()*1.1; sp.push(Math.cos(th)*Math.cos(ph)*380, Math.sin(ph)*380, Math.sin(th)*Math.cos(ph)*380); }
    const sg=new T.BufferGeometry(); sg.setAttribute('position',new T.Float32BufferAttribute(sp,3));
    this.root.add(new T.Points(sg,new T.PointsMaterial({color:'#ffffff',size:1.6,sizeAttenuation:true,fog:false})));
  },
  terrain(){
    const g=new T.PlaneGeometry(140,140,70,70); g.rotateX(-Math.PI/2);
    const p=g.attributes.position, col=[];
    const c1=new T.Color('#3d4a2a'), c2=new T.Color('#2a3520'), c3=new T.Color('#5a4a34'), tmp=new T.Color();
    for(let i=0;i<p.count;i++){ const x=p.getX(i), z=p.getZ(i); const y=height(x,z); p.setY(i,y);
      tmp.copy(c1).lerp(c2, Math.min(1,y/6)); const r=Math.hypot(x,z); if(r<4.5) tmp.lerp(c3,1-r/4.5);
      tmp.offsetHSL(0,0,(rnd()-0.5)*0.03); col.push(tmp.r,tmp.g,tmp.b); }
    g.setAttribute('color',new T.Float32BufferAttribute(col,3)); g.computeVertexNormals();
    const mesh=new T.Mesh(g,new T.MeshLambertMaterial({vertexColors:true,flatShading:true}));
    const el=document.createElement('a-entity'); el.classList.add('ground'); this.el.appendChild(el);
    el.addEventListener('loaded',()=>el.setObject3D('mesh',mesh)); if(el.hasLoaded) el.setObject3D('mesh',mesh);
  },
  lake(){
    const g=new T.CircleGeometry(1,40); g.rotateX(-Math.PI/2);
    const water=new T.Mesh(g,new T.MeshLambertMaterial({color:'#2f4f6f',emissive:'#1a2a48',transparent:true,opacity:0.88}));
    water.scale.set(LAKE.rx,1,LAKE.rz); water.position.set(LAKE.x,0.04,LAKE.z); this.root.add(water);
    const shore=new T.Mesh(g,lambert('#4b3f2c')); shore.scale.set(LAKE.rx+1.1,1,LAKE.rz+1.1); shore.position.set(LAKE.x,0.02,LAKE.z); this.root.add(shore);
    // moon glint ripple strip
    const gl=new T.Mesh(new T.PlaneGeometry(0.5,6).rotateX(-Math.PI/2), new T.MeshBasicMaterial({color:'#ffd9a8',transparent:true,opacity:0.25}));
    gl.position.set(LAKE.x-1,0.06,LAKE.z); gl.rotation.y=-0.6; this.root.add(gl); this.glint=gl;
    // stream flowing out of the lake into the forest
    const pts=[]; for(let i=0;i<=12;i++){ const t=i/12; pts.push(new T.Vector3(LAKE.x+LAKE.rx*0.9+t*22, 0.05, LAKE.z-1+Math.sin(t*6)*2.5-t*10)); }
    const curve=new T.CatmullRomCurve3(pts); const sg=new T.BufferGeometry(); const v=[], idx=[];
    for(let i=0;i<=40;i++){ const t=i/40, pt=curve.getPoint(t), tg=curve.getTangent(t); const w=1.3-t*0.5;
      const nx=-tg.z, nz=tg.x; const y=height(pt.x,pt.z)+0.06;
      v.push(pt.x+nx*w,y,pt.z+nz*w, pt.x-nx*w,y,pt.z-nz*w); if(i<40){ const a=i*2; idx.push(a,a+2,a+1,a+1,a+2,a+3);} }
    sg.setAttribute('position',new T.Float32BufferAttribute(v,3)); sg.setIndex(idx); sg.computeVertexNormals();
    this.root.add(new T.Mesh(sg,new T.MeshLambertMaterial({color:'#36597a',emissive:'#1a2a48',side:T.DoubleSide})));
  },
  trees(){
    const N=230, trunkG=new T.CylinderGeometry(0.18,0.28,1,5); trunkG.translate(0,0.5,0);
    const coneG=new T.ConeGeometry(1,1,6); coneG.translate(0,0.5,0);
    const trunks=new T.InstancedMesh(trunkG,lambert('#4a3020'),N);
    const tiers=[0,1,2].map(i=>new T.InstancedMesh(coneG,lambert(['#1f3a2a','#24442f','#2b4f36'][i]),N));
    const m=new T.Matrix4(), q=new T.Quaternion(), s=new T.Vector3(), p=new T.Vector3(); let n=0, tries=0;
    while(n<N && tries<5000){ tries++;
      const r=n<40? lerp(13,24,rnd()) : lerp(20,66,Math.sqrt(rnd())); const a=rnd()*Math.PI*2;
      const x=Math.cos(a)*r, z=Math.sin(a)*r; if(blocked(x,z,1)) continue;
      const y=height(x,z)-0.1, H=lerp(5,11,rnd()), W=H*lerp(0.2,0.28,rnd());
      q.setFromAxisAngle(new T.Vector3(0,1,0),rnd()*6.28);
      m.compose(p.set(x,y,z),q,s.set(1,H*0.35,1)); trunks.setMatrixAt(n,m);
      for(let t=0;t<3;t++){ const f=1-t*0.28; m.compose(p.set(x,y+H*(0.22+t*0.22),z),q,s.set(W*f,H*0.42,W*f)); tiers[t].setMatrixAt(n,m); }
      n++; }
    [trunks,...tiers].forEach(im=>{ im.count=n; im.instanceMatrix.needsUpdate=true; this.root.add(im); });
  },
  rocks(){
    const g=new T.DodecahedronGeometry(1,0), N=60, im=new T.InstancedMesh(g,lambert('#6b6a72'),N);
    const m=new T.Matrix4(), q=new T.Quaternion(), e=new T.Euler(); let n=0;
    // fire ring
    for(let i=0;i<10;i++){ const a=i/10*Math.PI*2; q.setFromEuler(e.set(rnd(),rnd(),rnd()));
      m.compose(new T.Vector3(Math.cos(a)*1.1,0.05,Math.sin(a)*1.1),q,new T.Vector3(0.28,0.2,0.25)); im.setMatrixAt(n++,m); }
    while(n<N){ const r=lerp(6,40,rnd()), a=rnd()*6.28, x=Math.cos(a)*r, z=Math.sin(a)*r; if(blocked(x,z)&&rnd()<0.8) continue;
      const sc=lerp(0.3,1.6,rnd()*rnd()); q.setFromEuler(e.set(rnd(),rnd(),rnd()));
      m.compose(new T.Vector3(x,height(x,z)+sc*0.2,z),q,new T.Vector3(sc*lerp(0.8,1.4,rnd()),sc*0.7,sc)); im.setMatrixAt(n++,m); }
    im.instanceMatrix.needsUpdate=true; this.root.add(im);
  },
  cabin(){
    const c=new T.Group(); c.position.set(CABIN.x,0,CABIN.z); c.rotation.y=CABIN.rot;
    const W=6, D=5, rows=8, R=0.17; const logG=new T.CylinderGeometry(R,R,1,6); logG.rotateZ(Math.PI/2);
    const logs=new T.InstancedMesh(logG,lambert('#7a4b2a'),rows*4+10); const m=new T.Matrix4(), q=new T.Quaternion(), e=new T.Euler(); let n=0;
    for(let r=0;r<rows;r++){ const y=R+r*R*1.9;
      m.compose(new T.Vector3(0,y,D/2),q.identity(),new T.Vector3(W+0.6,1,1)); logs.setMatrixAt(n++,m);
      m.compose(new T.Vector3(0,y,-D/2),q,new T.Vector3(W+0.6,1,1)); logs.setMatrixAt(n++,m);
      q.setFromEuler(e.set(0,Math.PI/2,0));
      m.compose(new T.Vector3(W/2,y+R*0.95,0),q,new T.Vector3(D+0.6,1,1)); logs.setMatrixAt(n++,m);
      m.compose(new T.Vector3(-W/2,y+R*0.95,0),q,new T.Vector3(D+0.6,1,1)); logs.setMatrixAt(n++,m); }
    // woodpile
    for(let i=0;i<10;i++){ q.setFromEuler(e.set(0,Math.PI/2,0)); m.compose(new T.Vector3(W/2+0.6,R+Math.floor(i/4)*0.3,-1.5+(i%4)*0.36+Math.floor(i/4)*0.15),q,new T.Vector3(1.1,1,1)); logs.setMatrixAt(n++,m); }
    logs.count=n; c.add(logs);
    const wallH=R+rows*R*1.9;
    const inner=new T.Mesh(new T.BoxGeometry(W-0.1,wallH,D-0.1),lambert('#5a3820')); inner.position.y=wallH/2; c.add(inner);
    const gable=new T.Shape(); gable.moveTo(-W/2,0); gable.lineTo(W/2,0); gable.lineTo(0,1.8); gable.lineTo(-W/2,0);
    const gg=new T.ExtrudeGeometry(gable,{depth:D-0.2,bevelEnabled:false}); gg.translate(0,wallH,-(D-0.2)/2);
    c.add(new T.Mesh(gg,lambert('#6a4226')));
    const roofMat=lambert('#3b2a22'); const slope=Math.atan2(1.8,W/2), len=Math.hypot(1.8,W/2)+0.5;
    [-1,1].forEach(sd=>{ const rf=new T.Mesh(new T.BoxGeometry(len,0.15,D+0.9),roofMat);
      rf.position.set(sd*W/4,wallH+0.95,0); rf.rotation.z=-sd*slope; c.add(rf); });
    const door=new T.Mesh(new T.BoxGeometry(1.1,2,0.1),lambert('#3a2414')); door.position.set(-1,1,D/2+0.18); c.add(door);
    const win=new T.Mesh(new T.PlaneGeometry(1.1,0.8),new T.MeshBasicMaterial({color:'#ffc266'})); win.position.set(1.3,1.4,D/2+0.2); c.add(win);
    const win2=win.clone(); win2.position.set(W/2+0.2,1.4,0.8); win2.rotation.y=Math.PI/2; c.add(win2);
    const chim=new T.Mesh(new T.BoxGeometry(0.7,2.4,0.7),lambert('#6b6a72')); chim.position.set(-1.6,wallH+1.4,-0.8); c.add(chim);
    c.position.y=0; this.root.add(c);
  },
  campfire(){
    const f=new T.Group(); this.root.add(f);
    const logG=new T.CylinderGeometry(0.09,0.11,1.3,5); logG.rotateZ(Math.PI/2);
    for(let i=0;i<4;i++){ const l=new T.Mesh(logG,lambert('#3c2616')); l.position.y=0.12; l.rotation.set(0,i*Math.PI/4,0.15); f.add(l); }
    const add=T.AdditiveBlending; this.flames=[];
    [['#ff5a1a',0.45,1.1],['#ffa21a',0.32,0.85],['#ffe27a',0.17,0.55]].forEach(([c,r,h],i)=>{
      const fl=new T.Mesh(new T.ConeGeometry(r,h,7,1,true).translate(0,h/2,0),
        new T.MeshBasicMaterial({color:c,transparent:true,opacity:0.85,blending:add,depthWrite:false,fog:false,side:T.DoubleSide}));
      fl.position.y=0.12; f.add(fl); this.flames.push(fl); });
    const light=new T.PointLight('#ff8a3a',6,16,1.3); light.position.set(0,1.0,0); f.add(light); this.fireLight=light;
    // embers
    const E=40, ep=new Float32Array(E*3); this.emberData=[]; for(let i=0;i<E;i++){ this.emberData.push({x:(rnd()-0.5)*0.5,z:(rnd()-0.5)*0.5,y:rnd()*3,s:0.4+rnd()*0.8}); }
    const eg=new T.BufferGeometry(); eg.setAttribute('position',new T.BufferAttribute(ep,3));
    this.embers=new T.Points(eg,new T.PointsMaterial({color:'#ffb24a',size:0.06,transparent:true,blending:add,depthWrite:false}));
    f.add(this.embers);
    // log benches
    const bg=new T.CylinderGeometry(0.25,0.25,2.2,7); bg.rotateZ(Math.PI/2);
    [[0,-3.2,0],[3.0,1.4,1.1],[-3.0,1.4,-1.1]].forEach(([x,z,ry])=>{ const b=new T.Mesh(bg,lambert('#6a4428')); b.position.set(x,0.25,z); b.rotation.y=ry; f.add(b); });
  },
  footprints(){
    const tex=canvasTex(128,256,(g,w,h)=>{ g.fillStyle='rgba(30,18,10,0.9)';
      g.beginPath(); g.ellipse(64,150,40,80,0,0,Math.PI*2); g.fill(); g.beginPath(); g.ellipse(64,225,30,26,0,0,Math.PI*2); g.fill();
      g.globalCompositeOperation='destination-out'; g.beginPath(); g.ellipse(94,150,14,40,0,0,Math.PI*2); g.fill(); g.globalCompositeOperation='source-over';
      [[24,48,14],[48,26,13],[73,18,12],[96,26,11],[114,46,10]].forEach(([x,y,r])=>{ g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); }); });
    const g=new T.PlaneGeometry(0.5,1); g.rotateX(-Math.PI/2);
    const mat=new T.MeshLambertMaterial({map:tex,transparent:true,depthWrite:false,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
    // trail loop: spawn -> sign -> lake -> totem -> gallery -> cabin -> back
    const way=[[0,7],[4,5],[6,1],[5,-3],[5,-10],[2,-12],[-3,-12],[-6,-10],[-7,-3],[-6,3],[-3,6.5]];
    const curve=new T.CatmullRomCurve3(way.map(([x,z])=>new T.Vector3(x,0,z)),true);
    const L=curve.getLength(), step=0.9, N=Math.floor(L/step), im=new T.InstancedMesh(g,mat,N);
    const m=new T.Matrix4(), q=new T.Quaternion(), up=new T.Vector3(0,1,0);
    for(let i=0;i<N;i++){ const t=i/N, p=curve.getPointAt(t), tg=curve.getTangentAt(t); const side=i%2?1:-1;
      const ang=Math.atan2(tg.x,tg.z)+Math.PI; q.setFromAxisAngle(up,ang);
      p.x+=Math.cos(-ang)*0.28*side; p.z+=Math.sin(-ang)*0.28*side; p.y=0.03;
      m.compose(p,q,new T.Vector3(side,1,1)); im.setMatrixAt(i,m); }
    im.instanceMatrix.needsUpdate=true; this.root.add(im);
  },
  fireflies(){
    const N=70, pos=new Float32Array(N*3); this.ff=[];
    for(let i=0;i<N;i++){ const r=lerp(5,22,rnd()), a=rnd()*6.28; this.ff.push({x:Math.cos(a)*r,z:Math.sin(a)*r,y:lerp(0.5,3,rnd()),p:rnd()*6.28}); }
    const g=new T.BufferGeometry(); g.setAttribute('position',new T.BufferAttribute(pos,3));
    this.ffPts=new T.Points(g,new T.PointsMaterial({color:'#d8ff6a',size:0.09,transparent:true,blending:T.AdditiveBlending,depthWrite:false,fog:false}));
    this.root.add(this.ffPts);
  },
  gallery(){
    // wooden gallery wall at the north edge of the clearing
    const wall=document.createElement('a-entity'); wall.setAttribute('position','0 0 -14');
    wall.innerHTML=`
      <a-box width="11" height="4.4" depth="0.25" position="0 2.6 0" material="color:#5b3a22; flatShading:true"></a-box>
      <a-cylinder radius="0.22" height="5.4" position="-5.6 2.7 0.1" segments-radial="6" material="color:#3e2716"></a-cylinder>
      <a-cylinder radius="0.22" height="5.4" position="5.6 2.7 0.1" segments-radial="6" material="color:#3e2716"></a-cylinder>
      <a-box width="11.8" height="0.35" depth="0.6" position="0 4.95 0.1" material="color:#3e2716"></a-box>
      <a-image src="#gold" width="2.6" height="2.6" position="0 2.65 0.16"></a-image>
      <a-image src="#c0" width="1.6" height="1.6" position="-2.4 3.45 0.16"></a-image>
      <a-image src="#c1" width="1.6" height="1.6" position="-4.2 3.45 0.16"></a-image>
      <a-image src="#c2" width="1.6" height="1.6" position="-3.3 1.6 0.16"></a-image>
      <a-image src="#c3" width="1.6" height="1.6" position="2.4 3.45 0.16"></a-image>
      <a-image src="#c4" width="1.6" height="1.6" position="4.2 3.45 0.16"></a-image>
      <a-image src="#c5" width="1.6" height="1.6" position="3.3 1.6 0.16"></a-image>
      <a-entity text="value: LIL' FOOTS GALLERY; align: center; color: #ffd27a; width: 9; font: exo2bold" position="0 4.6 0.16"></a-entity>
      <a-entity text="value: ApeChain  ·  BIGfoot.biz; align: center; color: #f3e6c8; width: 6" position="0 0.75 0.16"></a-entity>`;
    this.el.appendChild(wall);
  },
  standees(){
    // Lil Foots billboards gathered around the campfire + a giant gold Lil Foot
    const spots=[[0,-4.4],[3.9,-2.2],[4.3,2.2],[-3.9,-2.2],[-4.3,2.2],[-1.8,4.2]];
    spots.forEach(([x,z],i)=>{ const e=document.createElement('a-image');
      e.setAttribute('src','#f'+i); e.setAttribute('width','1.5'); e.setAttribute('height','1.5');
      e.setAttribute('material','alphaTest: 0.5; transparent: false; shader: flat'); e.setAttribute('position',`${x} 0.68 ${z}`); e.setAttribute('billboard','');
      this.el.appendChild(e); });
    // giant gold Lil Foot on a stump-framed easel by the lake
    const g=document.createElement('a-entity'); g.setAttribute('position','6.5 0 -12'); g.setAttribute('rotation','0 -25 0');
    g.innerHTML=`<a-box width="3.6" height="3.6" depth="0.2" position="0 2.4 -0.12" material="color:#d8a640; metalness:0.4"></a-box>
      <a-image src="#gold" width="3.3" height="3.3" position="0 2.4 0" material="shader: flat"></a-image>
      <a-cylinder radius="0.6" height="0.6" position="0 0.3 0" segments-radial="7" material="color:#5a3820"></a-cylinder>`;
    this.el.appendChild(g);
  },
  totem(){
    const t=document.createElement('a-entity'); t.setAttribute('position','-8.5 0 0.5'); t.setAttribute('totem-spin','');
    let h=`<a-cylinder radius="0.55" height="6.4" position="0 3.2 0" segments-radial="8" material="color:#6a4428"></a-cylinder>
      <a-cone radius-bottom="0.9" radius-top="0" height="0.9" position="0 6.85 0" segments-radial="8" material="color:#d8a640"></a-cone>`;
    for(let lvl=0;lvl<3;lvl++) for(let s=0;s<4;s++){ const a=s*90, rad=a*Math.PI/180, img='#c'+((lvl*4+s)%6);
      h+=`<a-image src="${img}" width="1.05" height="1.05" position="${(Math.sin(rad)*0.58).toFixed(3)} ${1.2+lvl*1.75} ${(Math.cos(rad)*0.58).toFixed(3)}" rotation="0 ${a} 0" material="shader: flat"></a-image>`; }
    t.innerHTML=h; this.el.appendChild(t);
  },
  sign(){
    const s=document.createElement('a-entity'); s.setAttribute('position','-3.2 0 5.2'); s.setAttribute('rotation','0 35 0');
    s.innerHTML=`<a-box width="0.18" height="2.2" depth="0.18" position="-1.1 1.1 0" material="color:#3e2716"></a-box>
      <a-box width="0.18" height="2.2" depth="0.18" position="1.1 1.1 0" material="color:#3e2716"></a-box>
      <a-box width="2.8" height="0.9" depth="0.12" position="0 1.75 0.05" material="color:#7a4b2a"></a-box>
      <a-entity text="value: BIGfoot.biz; align: center; color: #ffd27a; width: 6; font: exo2bold" position="0 1.8 0.13"></a-entity>
      <a-entity text="value: Bigfoot country - follow the tracks; align: center; color: #f3e6c8; width: 2.4; font: exo2bold; wrapCount: 36" position="0 1.45 0.14"></a-entity>`;
    this.el.appendChild(s);
  },
  tick(time,dt){
    const t=time/1000;
    if(this.flames){ this.flames.forEach((f,i)=>{ const k=1+Math.sin(t*(9+i*3)+i)*0.12+Math.sin(t*23+i*2)*0.06; f.scale.set(1+(k-1)*0.5,k,1+(k-1)*0.5); f.rotation.y=t*(0.6+i*0.4); });
      this.fireLight.intensity=5.5+Math.sin(t*11)*0.8+Math.sin(t*27.3)*0.5+(Math.random()-0.5)*0.6; }
    if(this.embers){ const a=this.embers.geometry.attributes.position; this.emberData.forEach((e,i)=>{ e.y+=dt/1000*e.s; if(e.y>3){ e.y=0.2; }
      a.setXYZ(i,e.x+Math.sin(t*2+i)*0.15*e.y,e.y,e.z+Math.cos(t*1.7+i)*0.15*e.y); }); a.needsUpdate=true; }
    if(this.ffPts){ const a=this.ffPts.geometry.attributes.position; this.ff.forEach((f,i)=>{
      a.setXYZ(i,f.x+Math.sin(t*0.3+f.p)*1.5,f.y+Math.sin(t*0.9+f.p*2)*0.4,f.z+Math.cos(t*0.25+f.p)*1.5); }); a.needsUpdate=true;
      this.ffPts.material.opacity=0.6+Math.sin(t*2)*0.3; }
    if(this.glint) this.glint.material.opacity=0.18+Math.sin(t*1.3)*0.07;
  }
});

// Face the camera around Y only (for Lil Foots standees)
AFRAME.registerComponent('billboard',{ init(){ this.c=new T.Vector3(); this.p=new T.Vector3(); },
  tick(){ const cam=this.el.sceneEl.camera; if(!cam) return; cam.getWorldPosition(this.c); this.el.object3D.getWorldPosition(this.p);
    this.el.object3D.rotation.y=Math.atan2(this.c.x-this.p.x,this.c.z-this.p.z); } });
AFRAME.registerComponent('totem-spin',{ tick(t,dt){ this.el.object3D.rotation.y+=dt*0.00015; } });

// Left thumbstick smooth locomotion (head-relative)
AFRAME.registerComponent('stick-move',{ schema:{speed:{default:2.5}},
  init(){ this.ax={x:0,y:0}; this.d=new T.Vector3(); this.q=new T.Quaternion(); this.e=new T.Euler(0,0,0,'YXZ');
    const lh=document.getElementById('lh'); lh.addEventListener('thumbstickmoved',e=>{ this.ax.x=e.detail.x; this.ax.y=e.detail.y; }); },
  tick(t,dt){ const {x,y}=this.ax; if(Math.abs(x)<0.15&&Math.abs(y)<0.15) return;
    const cam=this.el.sceneEl.camera; cam.getWorldQuaternion(this.q); this.e.setFromQuaternion(this.q,'YXZ');
    const yaw=this.e.y, s=this.data.speed*dt/1000;
    this.d.set(x,0,y).applyAxisAngle(new T.Vector3(0,1,0),yaw).multiplyScalar(s); this.el.object3D.position.add(this.d); } });

// Right thumbstick snap turn (30°) around the head position
AFRAME.registerComponent('snap-turn',{ init(){ this.ready=true; const rig=document.getElementById('rig'), cam=document.getElementById('cam');
  this.el.addEventListener('thumbstickmoved',e=>{ const x=e.detail.x; if(Math.abs(x)<0.3){ this.ready=true; return; } if(!this.ready||Math.abs(x)<0.75) return; this.ready=false;
    const ang=(x>0?-1:1)*Math.PI/6, before=new T.Vector3(), after=new T.Vector3();
    cam.object3D.getWorldPosition(before); rig.object3D.rotation.y+=ang; rig.object3D.updateMatrixWorld(true); cam.object3D.getWorldPosition(after);
    rig.object3D.position.x+=before.x-after.x; rig.object3D.position.z+=before.z-after.z; }); } });

// Keep the player inside the walkable clearing
AFRAME.registerComponent('bounds',{ schema:{radius:{default:25}},
  init(){ this.w=new T.Vector3(); },
  tick(){ const o=this.el.object3D; o.getWorldPosition(this.w); const r=Math.hypot(this.w.x,this.w.z); const R=Math.min(this.data.radius,FLAT-1);
    if(r>R){ const k=R/r; const target=new T.Vector3(this.w.x*k,this.w.y,this.w.z*k);
      if(o.parent){ o.parent.worldToLocal(target); } o.position.x=target.x; o.position.z=target.z; } } });
})();
