// Vue depuis l'espace : globe, astéroïde en volume, panache, gerbe balistique des éjectas.
// Repère centré sur la Terre, en km : +Y passe par le point d'impact, +X = est local, −Z = nord local.
import { T, TF, I18N, DEC } from './i18n.js';
import * as THREE from 'three';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const R = 6371;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const NOISE3 = /* glsl */`
float hash31(vec3 p){ p=fract(p*vec3(0.1031,0.1030,0.0973)); p+=dot(p,p.yxz+33.33); return fract((p.x+p.y)*p.z); }
float vn3(vec3 p){
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm3(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*vn3(p); p=p*2.03+vec3(7.1,3.3,5.7); a*=0.5; } return s; }
`;

// continents d'il y a 66 millions d'années : positions approximatives, contours inventés
const LAND = [[48, -105, 24], [38, -80, 12], [62, -120, 16], [72, -38, 10], [-12, -55, 22], [-35, -62, 12], [8, 8, 26], [-18, 22, 18],
  [48, 12, 9], [58, 35, 12], [50, 85, 30], [30, 105, 18], [62, 140, 16], [-28, 68, 9], [-80, 40, 20], [-58, 125, 13], [5, 45, 10]];
const NL = LAND.length;

export function createOrbit() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000004);
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 3e6);
  const UP = new V3(0, 1, 0);
  const GZ = new V3(0, R, 0);
  const SUN = new V3(Math.sin(62 * DEG) * Math.cos(15 * DEG), Math.sin(15 * DEG), -Math.cos(62 * DEG) * Math.cos(15 * DEG));
  const TRACK = new V3(Math.SQRT1_2 * 0.5, Math.sin(60 * DEG), -Math.SQRT1_2 * 0.5);          // d'où il vient : nord-est, 60°
  const OBS = new V3(Math.SQRT1_2 * Math.cos(50 * DEG), Math.sin(50 * DEG), Math.SQRT1_2 * Math.cos(50 * DEG)); // vous : au sud-est, 50° au-dessus de l'horizon de l'impact

  // repère géographique -> repère de la scène
  const geo = (lat, lon) => new V3(Math.cos(lat * DEG) * Math.cos(lon * DEG), Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG));
  const gUp = geo(21, -88), pole = new V3(0, 0, 1);
  const gN = pole.clone().addScaledVector(gUp, -pole.dot(gUp)).normalize(), gE = new V3().crossVectors(gN, gUp);
  const toScene = g => new V3(g.dot(gE), g.dot(gUp), -g.dot(gN));

  const U = {
    uSun: { value: SUN }, uT: { value: -60 }, uTime: { value: 0 },
    uLand: { value: LAND.map(([la, lo, r]) => { const v = toScene(geo(la, lo)); return new THREE.Vector4(v.x, v.y, v.z, r * DEG); }) },
    uRe: { value: 0 }, uReGlow: { value: 0 }, uShock: { value: 0 }, uTsu: { value: 0 }, uCrater: { value: 0 }, uFlash: { value: 0 },
    uHot: { value: 0 }, uAge: { value: 0 }, uPx: { value: 800 },
  };

  const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 120), new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform vec3 uSun; uniform float uT, uTime, uRe, uReGlow, uShock, uTsu, uCrater, uFlash;
      uniform vec4 uLand[${NL}];
      varying vec3 vP;
      void main(){
        vec3 n=normalize(vP); vec3 V=normalize(cameraPosition-vP);
        float f=-1.0;
        for(int i=0;i<${NL};i++){ float ad=acos(clamp(dot(n,uLand[i].xyz),-1.0,1.0)); f=max(f,1.0-ad/uLand[i].w); }
        f+=(fbm3(n*3.2)+0.5*fbm3(n*9.0)-0.75)*0.55;
        float land=smoothstep(0.0,0.03,f), shelf=smoothstep(-0.24,0.0,f);
        vec3 ocean=mix(vec3(0.010,0.045,0.15),vec3(0.03,0.30,0.36),shelf*0.8);
        float veg=fbm3(n*14.0+3.0);
        vec3 landc=mix(vec3(0.09,0.20,0.06),vec3(0.40,0.34,0.20),smoothstep(0.38,0.70,veg));
        vec3 base=mix(ocean,landc,land);
        vec3 cp=n*5.0+vec3(0.0,uTime*0.0015,0.0);
        float cl=smoothstep(0.50,0.72,fbm3(cp+fbm3(cp*1.7)*1.3));
        float ndl=dot(n,uSun), day=smoothstep(-0.10,0.25,ndl);
        vec3 sunc=mix(vec3(1.0,0.50,0.26),vec3(1.0,0.97,0.92),smoothstep(0.0,0.35,ndl))*2.6;
        vec3 col=base*sunc*day;
        col+=sunc*pow(max(dot(reflect(-uSun,n),V),0.0),90.0)*(1.0-land)*(1.0-cl)*0.5*day;
        col=mix(col,vec3(0.92)*sunc*day*0.42,cl*0.92);
        col+=vec3(0.003,0.005,0.011);
        float rim=clamp(1.0-dot(n,V),0.0,1.0); rim=rim*rim*rim;
        col+=vec3(0.22,0.42,0.95)*rim*day*0.75;
        if(uT>0.0){
          float d=6371.0*acos(clamp(n.y,-1.0,1.0));
          float dn=fbm3(n*20.0+uTime*0.01);
          float inside=smoothstep(uRe,uRe*0.82-30.0,d);
          vec3 shr=vec3(0.16,0.11,0.08)*(0.5+dn)*(0.22+0.78*day)*1.5;
          col=mix(col,shr,inside*0.88);
          float bx=(d-uRe)/(0.10*uRe+50.0); float band=exp(-bx*bx);
          float wake=inside*exp(-(uRe-d)/(0.45*uRe+80.0));
          col+=vec3(1.0,0.30,0.05)*(band*2.4+wake*0.7)*(0.6+0.8*dn)*uReGlow;
          col+=vec3(1.0,0.40,0.08)*land*inside*step(0.60,fbm3(n*60.0))*0.6*(1.0-day*0.8);
          col+=vec3(1.0,0.55,0.20)*smoothstep(95.0,55.0,d)*uCrater;
          col+=(base+vec3(cl)*0.6)*vec3(1.0,0.95,0.85)*uFlash*exp(-d/800.0);
          if(uShock>1.0) col+=vec3(0.40)*exp(-((d-uShock)/(14.0+0.012*uShock))*((d-uShock)/(14.0+0.012*uShock)))*(0.25+cl)*(0.15+day);
          if(uTsu>1.0) col+=vec3(0.10,0.17,0.19)*exp(-((d-uTsu)/12.0)*((d-uTsu)/12.0))*(1.0-land)*day*(1.0-inside);
        }
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  scene.add(earth);

  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.018, 96, 64), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uSun; varying vec3 vP;
      void main(){ vec3 n=normalize(vP); vec3 V=normalize(cameraPosition-vP); float rim=clamp(1.0-dot(n,V),1e-5,1.0);
        float a=pow(rim,3.5)*smoothstep(1.0,0.82,rim)*smoothstep(-0.25,0.2,dot(n,uSun));
        gl_FragColor=vec4(vec3(0.25,0.5,1.0)*a*1.6,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  atmo.renderOrder = 2; scene.add(atmo);

  // étoiles, Soleil
  {
    const n = 5000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new V3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(2e6);
      p.set([v.x, v.y, v.z], i * 3); const b = 0.25 + 0.9 * Math.random() ** 3; c.set([b, b, b * (0.85 + 0.3 * Math.random())], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const st = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })); st.frustumCulled = false; scene.add(st);
  }
  const glowTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
  })();
  const sprite = (r, g, b) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(r, g, b), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.renderOrder = 6; scene.add(s); return s; };
  const sun = sprite(40, 36, 30); sun.position.copy(SUN).multiplyScalar(1.5e6); sun.scale.setScalar(1.5e6 * 0.06); sun.material.depthTest = false; sun.renderOrder = -1;

  // astéroïde : 12 km, forme bosselée
  const astGeo = new THREE.SphereGeometry(6, 200, 140);   // maillage continu : relief lissé, vu de près depuis sa surface
  {
    const p = astGeo.attributes.position, v = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const k = 1 + 0.16 * Math.sin(v.x * 2.3 + 1) * Math.sin(v.y * 3.1) + 0.10 * Math.sin(v.z * 5.2 + v.x * 3.7) + 0.05 * Math.sin(v.y * 11 + v.z * 9) + 0.03 * Math.sin(v.x * 23 + v.y * 17)
        + 0.012 * Math.sin(v.x * 61 + v.z * 47) * Math.sin(v.y * 53) + 0.006 * Math.sin(v.x * 131 + v.y * 97 + v.z * 113);
      p.setXYZ(i, v.x * 6 * k * 1.12, v.y * 6 * k * 0.9, v.z * 6 * k);
    }
    astGeo.computeVertexNormals();
  }
  const astMat = new THREE.MeshLambertMaterial({ color: 0x6f675c, emissive: 0x000000 });
  const ast = new THREE.Mesh(astGeo, astMat); scene.add(ast);
  const sunL = new THREE.DirectionalLight(0xfff4e6, 3.2); sunL.position.copy(SUN); scene.add(sunL);
  scene.add(new THREE.HemisphereLight(0x101820, 0x30405a, 0.9));   // clair de Terre, par en dessous
  const head = sprite(1, 0.9, 0.75), flash = sprite(1, 0.95, 0.85);
  const trail = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.35, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.6), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  trail.renderOrder = 5; scene.add(trail);
  const astPos = (t, out = new V3()) => out.copy(GZ).addScaledVector(TRACK, 20 * Math.max(-t, 0));
  const T_ENTRY = -(100 / Math.sin(60 * DEG)) / 20, ENTRY_P = astPos(T_ENTRY);

  // panache : un ellipsoïde posé sur le point d'impact
  const plume = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vO; varying vec3 vW; void main(){ vO=position; vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: /* glsl */`
      ${NOISE3}
      uniform vec3 uSun; uniform float uHot, uAge, uTime;
      varying vec3 vO; varying vec3 vW;
      void main(){
        vec3 o=normalize(vO);
        float nz=fbm3(o*4.0+vec3(0.0,-uAge*0.004,0.0)), n2=fbm3(o*11.0+uTime*0.01);
        vec3 nw=normalize(vW-vec3(0.0,6371.0,0.0));
        float l=0.25+0.75*max(dot(normalize(nw+0.6*(vec3(nz,n2,nz)-0.5)),uSun),0.0);
        vec3 dark=mix(vec3(0.30,0.23,0.18),vec3(0.62,0.58,0.55),smoothstep(0.0,1.0,o.y))*(0.75+0.5*nz)*l*1.7;
        vec3 em=vec3(1.0,0.86,0.62)*uHot*(0.4+0.6*nz)+vec3(1.0,0.34,0.06)*3.0*exp(-uAge/200.0)*smoothstep(0.42,0.70,n2+0.15-o.y*0.35);
        float V=abs(dot(o,normalize(cameraPosition-vW)));
        float thin=1.0-0.78*smoothstep(120.0,1200.0,uAge);
        float a=pow(V+1e-5,0.9)*(0.75+0.35*nz)*thin*smoothstep(0.0,0.25,V);
        gl_FragColor=vec4(dark+em,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
  plume.position.copy(GZ); plume.renderOrder = 3; scene.add(plume);

  // gerbe d'éjectas : chaque point suit sa parabole, calculée dans le shader
  {
    const n = 16000, a = new Float32Array(n * 4), p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      a[i * 4] = 0.6 + 6.6 * Math.random() ** 1.6;                         // vitesse, km/s
      a[i * 4 + 1] = (35 + 27 * Math.random()) * DEG;                        // angle de tir
      a[i * 4 + 2] = Math.random() * 6.2832;                                 // azimut
      a[i * 4 + 3] = 1 + 45 * Math.random() ** 2;                            // instant de départ
      p[i * 3] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('shot', new THREE.BufferAttribute(a, 4));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        attribute vec4 shot; uniform float uT, uPx; varying vec3 vC;
        void main(){
          float tt=uT-shot.w; float v=shot.x, th=shot.y;
          float r=v*cos(th)*tt, h=v*sin(th)*tt-0.5*0.00981*tt*tt;
          if(tt<0.0||h<0.0){ gl_Position=vec4(2.0,2.0,2.0,1.0); gl_PointSize=0.0; return; }
          float ang=r/6371.0; vec3 e=vec3(cos(shot.z),0.0,sin(shot.z));
          vec3 pw=(6371.0+h)*(cos(ang)*vec3(0.0,1.0,0.0)+sin(ang)*e);
          vec4 mv=viewMatrix*vec4(pw,1.0); gl_Position=projectionMatrix*mv;
          float falling=step(v*sin(th),0.00981*tt), reentry=falling*smoothstep(140.0,60.0,h);
          vC=mix(vec3(1.6,1.2,0.7),vec3(0.7,0.16,0.03),smoothstep(0.0,260.0,tt))*(0.55+3.0*reentry)*(0.4+0.6*position.x);
          gl_PointSize=clamp(uPx*14.0/max(-mv.z,1.0),1.2,5.0);
        }`,
      fragmentShader: `varying vec3 vC; void main(){ vec2 u=gl_PointCoord-0.5; if(dot(u,u)>0.25) discard; gl_FragColor=vec4(vC,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` }));
    m.frustumCulled = false; m.renderOrder = 4; scene.add(m);
  }

  // ------------------------------------------------------------ état
  const st = { dist: 2000, pos: new V3(), yaw: 0, pitch: 0, basis: new THREE.Quaternion(), fov: 60, fovT: 60, veil: 0 };
  const info = {};
  const plumeDims = t => {
    const tp = Math.max(t, 0), Rf = 150 * (1 - Math.exp(-tp / 2.5));
    return { w: Math.min(Rf * 0.95 + 1.1 * tp, 150 + 620 * (1 - Math.exp(-tp / 400)) + 0.3 * tp), H: Math.min(Math.max(Rf, 20 + 5.5 * Math.pow(tp, 0.92)), 1300 + 0.15 * tp) };
  };
  const insidePlume = (p, t) => { if (t <= 0) return 0; const d = plumeDims(t), q = p.clone().sub(GZ); const hx = Math.hypot(q.x, q.z) / d.w, hy = q.y / d.H; return q.y > 0 ? clamp(1.25 - Math.hypot(hx, hy), 0, 1) * 4 : 0; };
  function set(dist) {
    st.dist = dist;
    st.pos.copy(GZ).addScaledVector(OBS, dist);
    info.alt = st.pos.length() - R;
    info.earthDeg = 2 * Math.asin(Math.min(1, R / st.pos.length())) / DEG;
    // passage au plus près de la trajectoire
    const rel = st.pos.clone().sub(GZ), along = rel.dot(TRACK);
    info.miss = rel.clone().addScaledVector(TRACK, -along).length(); info.tClosest = -along / 20;
    info.tPlume = null; for (let t = 1; t < 3000; t += 2) if (insidePlume(st.pos, t) > 0.2) { info.tPlume = t; break; }
  }
  function reset() {
    const p = st.pos, up = p.clone().normalize();
    // regard entre le point d'impact et l'astéroïde à T−60
    // regard entre le point d'impact et l'astéroïde
    const dG = GZ.clone().sub(p).normalize(), dA = astPos(-40).sub(p).normalize();
    const tgt = dG.multiplyScalar(0.62).addScaledVector(dA, 0.38).normalize();
    const right = new V3().crossVectors(tgt, up).normalize(), u2 = new V3().crossVectors(right, tgt);
    st.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, u2, tgt.clone().negate()));
    st.yaw = 0; st.pitch = 0; st.fovT = 60; st.veil = 0;
  }
  const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), tmp = new V3(), tmp2 = new V3();
  function look(dx, dy) { const k = 0.0022 * st.fov / 60; st.yaw -= dx * k; st.pitch = clamp(st.pitch - dy * k, -1.55, 1.55); }

  // à cheval sur l'astéroïde : posé sur sa face éclairée, regard vers le point d'impact
  const RIDE_U = SUN.clone().addScaledVector(TRACK, -SUN.dot(TRACK)).normalize();
  const rideBasis = (() => { const f = TRACK.clone().negate().addScaledVector(RIDE_U, -0.30).normalize(), r = new V3().crossVectors(f, RIDE_U).normalize(), u = new V3().crossVectors(r, f);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u, f.clone().negate())); })();
  function setRide(on) { st.ride = !!on; st.yaw = 0; st.pitch = 0; st.fovT = 60; st.veil = 0; }
  function update(t, time, dt, keys, aspect, pxScale) {
    if (st.ride) { if (t < 0) st.pos.copy(astPos(t, tmp)).addScaledVector(TRACK, 5).addScaledVector(RIDE_U, 10.2); else st.pos.copy(GZ).addScaledVector(UP, 20); }
    // déplacement libre, d'autant plus rapide qu'on est loin du sol
    e.set(st.pitch, st.yaw, 0); q.copy(st.ride ? rideBasis : st.basis).multiply(new THREE.Quaternion().setFromEuler(e));
    const k = c => keys[c] ? 1 : 0;
    const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), s = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'), v = k('Space') - k('KeyC');
    const alt = st.pos.length() - R, sp = (st.ride ? 0 : 1) * Math.max(alt, 40) * ((keys.ShiftLeft || keys.ShiftRight) ? 0.6 : 0.18) * dt;
    st.pos.addScaledVector(tmp.set(0, 0, -1).applyQuaternion(q), f * sp).addScaledVector(tmp.set(1, 0, 0).applyQuaternion(q), s * sp).addScaledVector(tmp.set(0, 1, 0).applyQuaternion(q), v * sp);
    if (!st.ride && st.pos.length() < R + 60) st.pos.setLength(R + 60);
    if (st.pos.length() > 60000) st.pos.setLength(60000);
    st.fov += (st.fovT - st.fov) * Math.min(1, dt * 9);
    camera.position.copy(st.pos); camera.quaternion.copy(q);
    const a2 = st.pos.length() - R;
    camera.near = st.ride ? 0.3 : Math.max(0.2, Math.min(a2 * 0.02, 50)); camera.far = 3e6; camera.fov = st.fov; camera.aspect = aspect; camera.updateProjectionMatrix();

    const tp = Math.max(t, 0);
    U.uT.value = t; U.uTime.value = time; U.uPx.value = pxScale;
    const re = Math.min(0.0049 * tp * tp + 150 * (1 - Math.exp(-tp / 2.5)), Math.PI * R);
    U.uRe.value = re; U.uReGlow.value = t > 0 ? sstep(20, 120, t) * Math.exp(-Math.max(t - 2020, 0) / 700) : 0;
    U.uShock.value = 0.34 * tp; U.uTsu.value = Math.max(0, 0.18 * (tp - 200));
    U.uCrater.value = t > 0 ? 6 * Math.exp(-t / 500) + 0.6 : 0;
    U.uFlash.value = t > 0 ? 60 * Math.exp(-t / 0.7) + 2.2 * sstep(0.3, 4, t) * Math.exp(-t / 30) : (t > T_ENTRY ? 1.5 * sstep(T_ENTRY, 0, t) : 0);
    // astéroïde et sa traînée
    const ap = astPos(t, tmp2);
    ast.visible = t < 0; ast.position.copy(ap); ast.rotation.set(time * 0.07, time * 0.11, 0.4);
    const ent = t < 0 ? sstep(T_ENTRY - 0.3, T_ENTRY + 0.8, t) : 0;
    astMat.emissive.setRGB(3 * ent, 1.6 * ent, 0.6 * ent);
    head.visible = ent > 0.01 && !st.ride; head.position.copy(ap); head.scale.setScalar(140 * ent * (1 + 1.5 * sstep(-3, 0, t))); head.material.color.setRGB(30 * ent, 26 * ent, 20 * ent);
    const tr = t < T_ENTRY ? 0 : t < 0 ? 1 : Math.exp(-t / 10);
    trail.visible = tr > 0.01;
    if (trail.visible) {
      const b = t < 0 ? ap : GZ, mid = tmp.copy(ENTRY_P).add(b).multiplyScalar(0.5), len = ENTRY_P.distanceTo(b);
      trail.position.copy(mid); trail.scale.set(3 + 0.6 * tp, Math.max(len, 0.01), 3 + 0.6 * tp);
      trail.quaternion.setFromUnitVectors(UP, tmp.copy(ENTRY_P).sub(b).normalize()); trail.material.opacity = tr;
    }
    const fl = t > 0 ? Math.exp(-t / 1.3) : 0;
    flash.visible = fl > 0.01; flash.position.copy(GZ).addScaledVector(UP, 30); flash.scale.setScalar(900 + 1500 * (1 - fl)); flash.material.color.setRGB(60 * fl, 55 * fl, 45 * fl);
    // panache
    const d = plumeDims(t);
    plume.visible = t > 0.05; plume.scale.set(d.w, d.H, d.w);
    U.uHot.value = t > 0 ? 40 * Math.exp(-t / 9) + 1.2 * Math.exp(-t / 60) : 0; U.uAge.value = tp;
    st.veil += (insidePlume(st.pos, t) - st.veil) * Math.min(1, dt * 3);
    // exposition : l'éclair vu de près éblouit
    const app = (t > 0 ? 400 * Math.exp(-t / 0.6) + 14 * Math.exp(-t / 12) : 6 * ent) * Math.min(1, (1500 / Math.max(camera.position.distanceTo(GZ), 100)) ** 2);
    return { exposure: 0.95 / (1 + 0.25 * Math.pow(app, 0.85)), re, astRange: ap.distanceTo(st.pos), astPos: ap, veil: st.ride && t > 0 ? 1 : clamp(st.veil, 0, 1) };
  }
  // le curseur de distance : on glisse le long de la ligne impact -> vous, sans toucher au temps ni au regard
  function moveTo(dist) { const dir = st.pos.clone().sub(GZ); if (dir.lengthSq() < 1) dir.copy(OBS); dir.normalize(); st.pos.copy(GZ).addScaledVector(dir, dist); if (st.pos.length() < R + 60) st.pos.setLength(R + 60); }
  const where = () => ({ dist: st.pos.distanceTo(GZ), alt: st.pos.length() - R });
  return { scene, camera, st, info, set, reset, setRide, look, update, astPos, moveTo, where, T_ENTRY, R };
}
