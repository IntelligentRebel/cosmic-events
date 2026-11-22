// GW170817 : deux étoiles à neutrons spiralent, fusionnent, et la kilonova forge l'or.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, rng, DAY, makeStars, makeGlow, glowTexture, NOISE } from './kit.js';
import { makeStar } from './bodies.js';
const C = 299792.458, TM = 1.188 * 4.925491e-6, GM = 2.73 * 1.32712e11, M1 = 1.46, M2 = 1.27, MT = M1 + M2, RNS = 11.9, A_C = 26;
const fgw = (tau) => Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(TM, -5 / 8) / Math.PI;
const sepOf = (f) => Math.cbrt(GM / Math.pow(Math.PI * f, 2));
const F_C = Math.sqrt(GM / A_C ** 3) / Math.PI, TAU_C = 5 / 256 * Math.pow(Math.PI * F_C, -8 / 3) * Math.pow(TM, -5 / 3), T_C = -TAU_C;
const phiIn = (tau) => -Math.pow(tau / (5 * TM), 5 / 8), PHI_C = phiIn(TAU_C), W_C = Math.PI * F_C;
const state = (t) => { // fréquence d'onde, séparation, phase orbitale
  if (t < T_C) { const f = fgw(-t); return { f, a: sepOf(f), phi: phiIn(-t), merged: 0 }; }
  const s = clamp((t - T_C) / 0.0022, 0, 1); return { f: F_C * (1 + 0.9 * s), a: A_C * (1 - s) ** 1.5, phi: PHI_C + W_C * (t - T_C) * (1 + 0.45 * s), merged: s };
};
export function start() {
  const lt = (t) => Math.sign(t) * Math.log10(1 + Math.abs(t) / 0.002), T0 = -100, T1 = 14 * DAY;
  let time = 0, lastDist = 0, osc = null, gain = null;
  const O = new THREE.Vector3();
  const kit = createKit({
    title: T('GW170817 · la collision de deux étoiles à neutrons'), kicker: T('17 août 2017 · galaxie NGC 4993 · à 130 millions d’années-lumière'), h1: T('La forge de l’or'),
    intro: T('Deux étoiles à neutrons, chacune plus lourde que le Soleil et large de 24 kilomètres, tournent l’une autour de l’autre depuis des centaines de millions d’années. Il leur reste cent secondes. La scène passe du millième de seconde à la semaine : le tempo automatique ralentit jusqu’à 5 000 fois au moment du contact.'),
    warn: T('Fréquence, séparation et calendrier viennent du signal mesuré par LIGO et Virgo. La forme des étoiles, des bras de matière et du jet est une mise en scène d’après les simulations publiées. Le son est la vraie fréquence de l’onde gravitationnelle.'),
    views: [{ id: 'orbit', label: T('Dans l’espace'), cam: { mode: 'orbit', dist: 1300, min: 45, max: 4e11, pitch: 0.42, yaw: 0.3 } }, { id: 'ride', label: T('Depuis une des étoiles'), cam: { mode: 'look', fov: 70, pitch: 0.1 } }],
    options: [{ id: 'waves', label: T('Ondes gravitationnelles (amplitude très exagérée)'), value: true }, { id: 'autocam', label: T('Caméra qui suit l’échelle de la scène'), value: true }],
    sound: true,
    t0: T0, t1: T1, tStart: T0, speed0: 4, speedRange: [1e-5, 2e5], speeds: [1e-4, 1e-3, 0.01, 0.1, 1, 10, 600, 3600, DAY / 2],
    autoRate: (t) => t < 0 ? clamp(-t / 6, 2e-4, 5) : clamp(t / 5, 2e-4, DAY / 3),
    moments: [{ label: T('Cent secondes avant : 24 Hz'), t: T0 }, { label: T('Dix secondes avant'), t: -10 }, { label: T('Une seconde avant'), t: -1 }, { label: T('Le dernier dixième de seconde'), t: -0.1 }, { label: T('Le contact'), t: T_C - 0.004 },
      { label: T('Trois millisecondes après : les bras'), t: 0.003 }, { label: T('Le jet (1,7 s après)'), t: 1.2 }, { label: T('Onze heures : la kilonova est repérée'), t: 10.87 * 3600 }, { label: T('Quatre jours : elle rougit'), t: 4 * DAY }, { label: T('Dix jours après'), t: 10 * DAY }],
    prog: (t) => (lt(t) - lt(T0)) / (lt(T1) - lt(T0)),
    journal: [
      { t: T0, title: T('Cent dernières secondes'), text: T('Les deux étoiles sont à 400 km l’une de l’autre et font douze tours par seconde. Elles perdent de l’énergie en ondes gravitationnelles, donc se rapprochent, donc tournent plus vite. Sur Terre, LIGO vient de commencer à les entendre.') },
      { t: -10, title: T('L’emballement'), text: T('Dix secondes : 57 Hz. Le son monte. Chaque cuillère à café de ces étoiles pèse des centaines de millions de tonnes ; elles foncent l’une vers l’autre à un dixième de la vitesse de la lumière.') },
      { t: -0.1, title: T('Un dixième de seconde'), text: T('Cent cinquante tours par seconde. La marée de chacune commence à déformer l’autre. Le tempo ralentit : la suite se joue en millisecondes.') },
      { t: T_C, title: T('Contact'), text: T('Les deux surfaces se touchent à près de 40 % de la vitesse de la lumière. En deux millisecondes, deux astres n’en font plus qu’un, qui tourne plus de mille fois par seconde.') },
      { t: 0.004, title: T('Les bras de matière'), text: T('La collision arrache des bras de matière ultra-dense, éjectés à 10 à 30 % de la vitesse de la lumière. Libérés de la pression, les neutrons s’agglutinent : en une seconde naissent or, platine, uranium.') },
      { t: 1.0, title: T('Le jet'), text: T('Le long de l’axe, un jet perce les débris presque à la vitesse de la lumière. 1,7 seconde après les ondes, le satellite Fermi reçoit un sursaut de rayons gamma : après 130 millions d’années de voyage, lumière et gravité arrivent ensemble.') },
      { t: 3600, title: T('La kilonova'), text: T('Les éléments tout neufs sont radioactifs. Leur désintégration chauffe le nuage, qui brille comme des centaines de millions de Soleils. Onze heures après le signal, un télescope chilien repère le point nouveau.') },
      { t: 2 * DAY, title: T('Du bleu au rouge'), text: T('Le nuage se dilate et refroidit. Les éléments les plus lourds, opaques, ne laissent passer que le rouge et l’infrarouge. Bilan estimé : environ dix masses terrestres d’or et de platine.') },
    ],
    pois: [{ id: 'c', label: T('Centre du système'), pos: () => O }, { id: 'a', label: T('Étoile à neutrons 1'), pos: (t) => t < T_C ? A.position : null, r: 30 }, { id: 'b', label: T('Étoile à neutrons 2'), pos: (t) => t < T_C ? B.position : null, r: 30 }],
    clock: (t) => [(t < 0 ? TF('T − {0}', [fmtDur(Math.abs(t))]) : TF('T + {0}', [fmtDur(Math.abs(t))])), t < 0 ? T('avant la fusion') : T('après la fusion')],
    data: (t) => {
      const s = state(t);
      if (t < T_C) return TF('Onde gravitationnelle : <b>{0} Hz</b> ({1} tours par seconde)', [fr(s.f, s.f < 100 ? 1 : 0), fr(s.f / 2, s.f < 100 ? 1 : 0)]) + '<br>' + TF('Séparation : <b>{0} km</b> · chaque étoile : 24 km de diamètre', [fr(s.a, 0)]) + '<br>' + TF('Vitesse relative : <b>{0} %</b> de la vitesse de la lumière', [fr(Math.PI * s.f * s.a / C * 100, 1)]);
      if (t < 0.5) return TF('Fusion : astre unique en rotation, <b>{0} tours par seconde</b>', [fr(s.f / 2, 0)]) + '<br>' + TF('Matière éjectée : jusqu’à {0} du centre', [fmtDist(0.3 * C * Math.max(t, 0))]);
      const d = t / DAY; return TF('Nuage en expansion : <b>{0}</b> de rayon', [fmtDist(0.2 * C * t)]) + '<br>' + T('Vitesse : 10 à 30 % de la vitesse de la lumière') + '<br>' + (d < 0.4 ? T('Trop chaud et opaque : il brille en ultraviolet et en bleu') : d < 2.5 ? T('Kilonova bleue, visible au télescope') : T('Kilonova rouge : les éléments lourds bloquent le bleu')) + '<br>' + T('Astre central : sort incertain (étoile à neutrons géante, puis sans doute trou noir)');
    },
    bloom: [0.9, 0.65, 0.8], exposure: 1,
    update(t, dt, k) {
      time += dt; const s = state(t), cp = Math.cos(s.phi), sp = Math.sin(s.phi);
      const r1 = s.a * M2 / MT, r2 = s.a * M1 / MT;
      A.position.set(r1 * cp, 0, r1 * sp); B.position.set(-r2 * cp, 0, -r2 * sp);
      const tid = clamp(Math.pow(A_C * 1.15 / Math.max(s.a, A_C * 0.6), 3) * 0.35, 0, 0.6), ang = -s.phi;
      for (const [m, R] of [[A, RNS], [B, RNS * 1.03]]) { m.visible = s.merged < 0.75; m.rotation.y = ang; m.scale.set(1 + tid, 1 - tid * 0.3, 1 - tid * 0.3); m.material.uniforms.uTime.value = time * 3; m.material.uniforms.uB.value = 1.2 + 6 * s.merged; }
      rem.visible = s.merged > 0.5 && t < 30; const bar = Math.exp(-Math.max(t - T_C, 0) / 0.006); rem.rotation.y = ang; rem.scale.set(1 + 0.9 * bar, 0.72, 1 - 0.25 * bar); rem.material.uniforms.uTime.value = time * 5; rem.material.uniforms.uB.value = 5;
      torus.visible = t > T_C + 0.001 && t < 60; torus.rotation.z = time * 2; torus.material.opacity = 0.8 * sstep(0.001, 0.006, t - T_C) * (1 - sstep(5, 60, t));
      const cd = k.camera.position.length();
      gA.position.copy(A.position); gB.position.copy(B.position); const gs = Math.max(RNS * 5, cd * 0.035); gA.scale.setScalar(gs); gB.scale.setScalar(gs); gA.visible = gB.visible = s.merged < 0.9;
      // éjectas et kilonova
      eMat.uniforms.uT.value = t - T_C; eMat.uniforms.uSize.value = k.renderer.domElement.height; ej.visible = t > T_C - 0.0005;
      const d = Math.max(t, 0) / DAY, hot = 1 - sstep(Math.log10(20), Math.log10(4 * 3600), Math.log10(Math.max(t, 1e-3)));
      eMat.uniforms.uHot.value = hot; eMat.uniforms.uGain.value = 0.3 + 0.7 * sstep(-1, 2, Math.log10(Math.max(t, 1e-4))); eMat.uniforms.uBlue.value = Math.exp(-d / 1.6); eMat.uniforms.uRed.value = clamp(0.25 + d / 2.5, 0, 1) * Math.exp(-d / 14);
      const Rej = 0.2 * C * Math.max(t - T_C, 0); ball.visible = t > 0.002; ball.scale.setScalar(20 + Rej * 2.2);
      ball.material.color.setRGB(lerp(lerp(0.35, 1, 1 - Math.exp(-d / 2)), 0.9, hot), lerp(lerp(0.5, 0.22, 1 - Math.exp(-d / 2)), 0.9, hot), lerp(lerp(1, 0.1, 1 - Math.exp(-d / 2)), 1, hot)); ball.material.opacity = (0.5 - 0.44 * hot) * sstep(0.002, 0.02, t) * Math.exp(-d / 12);
      // jets
      const tj = t - 0.9, L = Math.max(tj, 0) * C * 0.98; for (const j of jets) { j.visible = tj > 0 && t < 4000; j.scale.set(L, L, L); j.material.uniforms.uOp.value = sstep(0, 0.2, tj) * (1 - sstep(60, 4000, t)) * (1 + 3 * Math.exp(-Math.pow((t - 1.74) / 0.4, 2))); j.material.uniforms.uTime.value = time; }
      // ondes
      waves.visible = k.opt.waves && t < 0.3; const S = Math.max(cd, 80); waves.scale.set(S, S, S); wMat.uniforms.uS.value = S; wMat.uniforms.uTau.value = -t; wMat.uniforms.uPhi0.value = ((t < T_C ? s.phi : PHI_C) % (2 * Math.PI)); wMat.uniforms.uY.value = -Math.max(s.a, 30) * 0.9 - S * 0.12;
      wMat.uniforms.uOp.value = (1 - sstep(0.004, 0.04, t)) * 0.5;
      // caméras
      if (k.view === 'ride') {
        if (t > T_C + 0.0005) { k.setView('orbit', false); k.cam.dist = 160; lastDist = 0; }
        else { const out = B.position.clone().sub(A.position).normalize(); k.cam.pos.copy(A.position).addScaledVector(out, RNS * (1 + tid) * 1.01).add(new THREE.Vector3(0, RNS * 0.35, 0));
          const z = out.clone().negate(), x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = new THREE.Vector3().crossVectors(z, x); k.cam.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); k.cam.near = 0.2; k.cam.far = 1e7; }
      } else {
        k.cam.target.set(0, 0, 0);
        if (k.opt.autocam) {
          if (lastDist && Math.abs(k.cam.dist - lastDist) > 1e-6 * lastDist) { k.opt.autocam = false; const e = document.querySelector('[data-opt="autocam"]'); if (e) e.checked = false; }
          else { const want = t < T_C ? clamp(3.3 * s.a, 110, 1400) : Math.max(150, 3.2 * 0.3 * C * (t - T_C)); k.cam.dist = dt > 0 ? lerp(k.cam.dist, want, Math.min(1, dt * 3)) : want; lastDist = k.cam.dist; }
        } else lastDist = 0;
      }
      // son : la fréquence réelle de l'onde
      if (k.ac && osc) { const on = k.soundOn && !k.sim.paused && t > T0 && t < 0.02; const f = clamp(s.f, 20, 4000), amp = on ? 0.16 * Math.pow(f / 1500, 0.55) * (t < T_C ? 1 : Math.exp(-(t - T_C) / 0.006)) : 0;
        osc.frequency.setTargetAtTime(f, k.ac.currentTime, 0.02); gain.gain.setTargetAtTime(amp, k.ac.currentTime, 0.03); }
    },
    onStart(k) { if (!k.ac) return; osc = k.ac.createOscillator(); osc.type = 'triangle'; gain = k.ac.createGain(); gain.gain.value = 0; osc.connect(gain).connect(k.ac.destination); osc.start(); },
    onOpt(id) { if (id === 'autocam') lastDist = 0; }, onJump() { lastDist = 0; },
  });
  const S = kit.scene;
  kit.addSky(makeStars({ n: 7000, seed: 5, band: 0.45, bright: 1.1 }));
  const A = makeStar(RNS, { T: 21000, bright: 1.2, cells: 5, contrast: 0.3 }), B = makeStar(RNS * 1.03, { T: 17000, bright: 1.2, cells: 5, contrast: 0.3 }); S.add(A, B);
  const rem = makeStar(15, { T: 30000, bright: 5, cells: 4, contrast: 0.5 }); S.add(rem);
  const gA = makeGlow(0x9fc0ff, 60, 0.7), gB = makeGlow(0x9fc0ff, 60, 0.7); S.add(gA, gB);
  const torus = new THREE.Mesh(new THREE.TorusGeometry(48, 20, 16, 80), new THREE.MeshBasicMaterial({ color: 0xffb070, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 })); torus.rotation.x = Math.PI / 2; torus.scale.set(1, 1, 0.3); S.add(torus);
  const ball = makeGlow(0xffffff, 1, 0.5); S.add(ball);
  // éjectas : lancés depuis les extrémités de la barre en rotation, puis balistiques
  const N = 46000, r = rng(3), dir = new Float32Array(N * 3), prm = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const polar = r() < 0.22, tl = polar ? 0.001 + r() * 0.03 : -0.0006 + Math.pow(r(), 1.4) * 0.006, arm = r() < 0.5 ? 0 : Math.PI;
    const az = -(PHI_C + W_C * tl) + arm + (r() - 0.5) * (polar ? 6.3 : 0.5), la = polar ? (0.5 + r() * 1.0) * (r() < 0.5 ? 1 : -1) : (r() - 0.5) * (r() - 0.5) * 2.2;
    dir.set([Math.cos(la) * Math.cos(az), Math.sin(la), -Math.cos(la) * Math.sin(az)], i * 3);
    prm.set([tl, (polar ? 0.22 + r() * 0.12 : 0.08 + Math.pow(r(), 1.6) * 0.24) * C, r()], i * 3);
  }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(dir, 3)); eg.setAttribute('prm', new THREE.BufferAttribute(prm, 3));
  const eMat = new THREE.ShaderMaterial({
    uniforms: { uGain: { value: 1 }, uT: { value: 0 }, uSize: { value: 500 }, uTex: { value: glowTexture() }, uHot: { value: 1 }, uBlue: { value: 1 }, uRed: { value: 0 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 prm;uniform float uT,uSize;varying float vA,vLat,vR;
void main(){float dt=uT-prm.x;float rr=18.+prm.y*max(dt,0.);vec3 p=position*rr;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
  float ws=5.+rr*.035;float ps=clamp(uSize*ws/-mv.z,2.,40.);gl_PointSize=ps;vA=dt>0.?min(1.,14./(ps*ps))*(.5+prm.z):0.;vLat=abs(position.y);vR=prm.z;}`,
    fragmentShader: `uniform sampler2D uTex;uniform float uHot,uBlue,uRed,uGain;varying float vA,vLat,vR;
void main(){float a=texture2D(uTex,gl_PointCoord).a;float pol=smoothstep(.35,.6,vLat);
  vec3 cool=mix(vec3(1.,.2,.04)*uRed*1.3,vec3(.35,.55,1.)*uBlue*1.6,pol)+vec3(.9,.25,.05)*uRed*.25;
  vec3 c=mix(cool,vec3(1.,.82,.6)+vec3(0.,.1,.4)*pol,uHot);gl_FragColor=vec4(c*a*vA*uGain,1.);}`,
  });
  const ej = new THREE.Points(eg, eMat); ej.frustumCulled = false; S.add(ej);
  // jets
  const jets = [1, -1].map(sg => {
    const g = new THREE.ConeGeometry(0.09, 1, 40, 24, true); g.translate(0, -0.5, 0); g.rotateX(sg > 0 ? Math.PI : 0);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: { uOp: { value: 0 }, uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: `varying vec3 vP;varying vec3 vN;varying vec3 vV;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec3 vP,vN,vV;uniform float uOp,uTime;${NOISE}void main(){float h=abs(vP.y);float f=pow(abs(dot(normalize(vN),vV)),1.4);
  float n=.5+.8*vnoise(vec3(vP.x*60.,h*14.-uTime*3.,vP.z*60.));float head=smoothstep(.75,1.,h)*2.+smoothstep(0.,.15,h);
  gl_FragColor=vec4(vec3(.6,.72,1.)*uOp*f*n*head*.9,1.);}` }));
    m.frustumCulled = false; S.add(m); return m;
  });
  // grille d'espace-temps : anneaux et rayons déplacés par l'onde quadripolaire
  const wp = []; const NR = 90, NA = 144, RM = 9;
  const rr = (i) => 0.02 + RM * Math.pow(i / NR, 1.6);
  for (let i = 1; i <= NR; i++) for (let j = 0; j < NA; j++) { const a0 = j / NA * 6.2832, a1 = (j + 1) / NA * 6.2832; wp.push(rr(i) * Math.cos(a0), 0, rr(i) * Math.sin(a0), rr(i) * Math.cos(a1), 0, rr(i) * Math.sin(a1)); }
  for (let j = 0; j < NA; j += 4) for (let i = 1; i < NR; i++) { const a0 = j / NA * 6.2832; wp.push(rr(i) * Math.cos(a0), 0, rr(i) * Math.sin(a0), rr(i + 1) * Math.cos(a0), 0, rr(i + 1) * Math.sin(a0)); }
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
  const wMat = new THREE.ShaderMaterial({
    uniforms: { uS: { value: 1 }, uTau: { value: 100 }, uPhi0: { value: 0 }, uY: { value: 0 }, uOp: { value: 0.5 }, uTM: { value: TM }, uTauC: { value: TAU_C }, uWC: { value: W_C } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `uniform float uS,uTau,uPhi0,uY,uTM,uTauC,uWC;varying float vH,vR;
void main(){float r=length(position.xz)*uS;float az=atan(position.z,position.x);float del=r/${C.toFixed(3)};float tau=uTau+del;float h;
  if(tau>uTauC){float x=del/max(uTau,uTauC);float k=pow(max(uTau,uTauC)/(5.*uTM),.625);
    float dphi=x<.02?-k*(.625*x-.1171875*x*x):-k*(pow(1.+x,.625)-1.);
    float amp=pow(uTauC/tau,.25);h=amp*cos(2.*(-az-(uPhi0+dphi)));}
  else{float e=uTauC-tau;h=exp(-e/.004)*cos(2.*(-az-(uPhi0+uWC*1.6*e)));}
  float fall=1./(1.+r/(uS*2.2));h*=fall*smoothstep(0.,.25*uS,r);
  vH=h;vR=length(position.xz);vec3 p=position;p.y=h*.16;vec4 w=modelMatrix*vec4(p,1.);w.y+=uY;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uOp;varying float vH,vR;void main(){float a=uOp*(.25+abs(vH)*2.2)*smoothstep(${RM.toFixed(1)},${(RM * 0.5).toFixed(1)},vR);gl_FragColor=vec4(mix(vec3(.25,.4,.9),vec3(.7,.9,1.),clamp(vH*2.+.5,0.,1.))*a,1.);}`,
  });
  const waves = new THREE.LineSegments(wg, wMat); waves.frustumCulled = false; S.add(waves);
  kit.run();
}
