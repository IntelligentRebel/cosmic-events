// Tcheliabinsk, 15 février 2013 : un astéroïde de 18 m explose à 30 km d'altitude.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, rng, NOISE, makeBackdrop, BACKDROP_VERT, makeGlow, glowTexture } from './kit.js';
const V0 = 19.16, DIR = new THREE.Vector3(-0.925, -0.314, -0.214).normalize(), P0 = new THREE.Vector3(0, 29.7, 38); // km, x est, y haut, z sud
const CS = 0.325, T_SHOCK = P0.length() / CS, T_START = -12.5;
const sAlong = (t) => t < 0 ? V0 * t : V0 * 1.6 * (1 - Math.exp(-t / 1.6));       // km parcourus depuis le pic
const speed = (t) => t < 0 ? V0 : V0 * Math.exp(-t / 1.6);
const posKm = (t, out) => out.copy(P0).addScaledVector(DIR, sAlong(t));
const flare = (t) => { // éclat relatif (1 = maximum)
  const ramp = t < 0 ? Math.exp(t / 2.2) * 0.25 * sstep(T_START, T_START + 2, t) : 0.25 * Math.exp(-t / 1.2);
  return ramp + 0.75 * Math.exp(-Math.pow(t / 0.55, 2)) + 0.3 * Math.exp(-Math.pow((t - 1.5) / 0.3, 2)) + 0.16 * Math.exp(-Math.pow((t - 2.6) / 0.25, 2));
};
const SKY = /* glsl */`precision highp float;varying vec2 vUv;uniform mat3 uBasis;uniform float uTan,uAspect,uT,uI,uTrailOp,uTrailW,uAge;uniform vec3 uCam,uSun,uBol,uTA,uTB;
${NOISE}
float segDist(vec3 ro,vec3 rd,vec3 a,vec3 b,out float s,out float tt){vec3 ab=b-a,ao=ro-a;float l=dot(ab,ab),m=dot(ab,rd),n=dot(ab,ao),o=dot(rd,ao);
  float den=l-m*m;s=den>1e-6?clamp((n-m*o)/den,0.,1.):0.;tt=max(dot(a+ab*s-ro,rd),0.);return length(ro+rd*tt-(a+ab*s));}
void main(){vec3 d=normalize(uBasis*vec3(vUv.x*uTan*uAspect,vUv.y*uTan,-1.));
  float dip=-sqrt(2.*max(uCam.y,0.)/6371.);float y=d.y-dip;
  vec3 sunH=normalize(vec3(uSun.x,0.,uSun.z));float sa=max(dot(normalize(vec3(d.x,0.,d.z)+1e-5),sunH),0.);
  vec3 hor=mix(vec3(.62,.70,.86),vec3(1.08,.78,.52),pow(sa,3.));vec3 zen=vec3(.12,.27,.60);float air=exp(-uCam.y/9.);
  vec3 col=mix(hor,zen,pow(clamp(y,0.,1.),.42));col*=mix(exp(-max(y,0.)*26.)*.85+.015,1.,air);
  float sd=dot(d,uSun);col+=vec3(1.,.75,.45)*(pow(max(sd,0.),600.)*6.+pow(max(sd,0.),40.)*.35*air);
  if(y>0.){vec2 q=d.xz/(d.y+.12)*1.4;float c=fbm3(vec3(q*1.3+uT*.002,3.));c=smoothstep(.5,.85,c)*smoothstep(0.,.25,y)*.35*air;col=mix(col,vec3(1.,.9,.85),c);}
  else col=mix(hor*.92,vec3(.78,.82,.9),smoothstep(0.,-.25,y));
  // lumière du bolide dans l'air
  vec3 bd=uBol-uCam;float bl=length(bd);float cb=dot(d,bd/bl);
  col+=vec3(1.,.95,.85)*uI*clamp(bl/30.,.03,1.)*(.012/(1.0004-cb)+.35*pow(max(cb,0.),8.));
  // traînée : deux panaches parallèles
  if(uTrailOp>0.){float s,tt;vec3 up=normalize(cross(cross(uTB-uTA,vec3(0.,1.,0.)),uTB-uTA));float acc=0.,glow=0.;
    for(int i=0;i<2;i++){vec3 off=up*uTrailW*(i==0?.55:-.55);float dist=segDist(uCam,d,uTA+off,uTB+off,s,tt);
      float along=s*length(uTB-uTA);float n=fbm3(vec3(along*.25,float(i)*7.,uAge*.02));float sage=(1.-s)*length(uTB-uTA)/19.+uAge;float w=(.04+.03*pow(sage,.75))*(.5+n*1.1)*smoothstep(0.,.06,s);off=up*w*(i==0?.9:-.9);dist=segDist(uCam,d,uTA+off,uTB+off,s,tt);
      float e=exp(-pow(dist/max(w,1e-3),2.))*smoothstep(.03,.5,tt);acc+=e*(.5+.6*fbm3(vec3(along*1.2,dist*2.,uAge*.05+float(i))));
      glow+=e*exp(-(1.-s)*length(uTB-uTA)/6.);}
    float nearK=smoothstep(1.,7.,bl);acc=clamp(acc,0.,1.)*uTrailOp*nearK;glow*=nearK;vec3 tc=mix(vec3(.55,.56,.66),vec3(1.,.86,.7),.5+.5*sa);
    col=mix(col,tc,acc*.9);col+=vec3(1.,.55,.2)*glow*uTrailOp*exp(-uAge/5.)*.8+vec3(1.,.9,.7)*glow*uI*2.5;}
  gl_FragColor=vec4(col,1.);}`;
export function start() {
  const bolKm = new THREE.Vector3(), bolM = new THREE.Vector3(), tmp = new THREE.Vector3();
  let time = 0, shake = 0, prevT = -1e9;
  const O = new THREE.Vector3(), SUNP = new THREE.Vector3(Math.sin(2.2) * Math.cos(0.085), Math.sin(0.085), -Math.cos(2.2) * Math.cos(0.085)).multiplyScalar(1e7), TRAILP = posKm(-2, new THREE.Vector3()).multiplyScalar(1000);
  const kit = createKit({
    title: T('Tcheliabinsk · 15 février 2013'), kicker: T('Oural, Russie · 9 h 20, heure locale · −15 °C'), h1: T('Le matin de Tcheliabinsk'),
    intro: T('Un astéroïde de 18 mètres et de 10 000 tonnes entre dans l’atmosphère à 19 km/s, sous un angle rasant. Personne ne l’a vu venir : il arrivait du côté du Soleil. Il lui reste douze secondes de vol lumineux. Vous êtes dans une rue de la ville.'),
    warn: T('Trajectoire, vitesse, altitudes et délai de l’onde de choc suivent les mesures publiées. La ville est un décor générique, pas un plan de Tcheliabinsk ; l’allure du bolide et de la traînée est reconstituée d’après les vidéos.'),
    views: [{ id: 'ground', label: T('Dans la rue'), cam: { mode: 'look', fov: 68, yaw: 2.45, pitch: 0.32 } }, { id: 'sky', label: T('À côté du bolide'), cam: { mode: 'orbit', dist: 420, min: 40, max: 80000, pitch: 0.08, yaw: 2.75 } }, { id: 'ride', label: T('Sur l’astéroïde'), cam: { mode: 'look', fov: 75, pitch: 0.0 } }],
    sound: true, bg: 0x8090b0,
    t0: -25, t1: 260, tStart: -22, speed0: 1, speedRange: [0.05, 60], speeds: [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    autoRate: (t) => t < 9 ? 1 : t < T_SHOCK - 8 ? clamp(1 + (t - 9) * 2, 1, 14) : t < T_SHOCK + 14 ? 1 : 8,
    moments: [{ label: T('Un matin ordinaire'), t: -22 }, { label: T('Le bolide apparaît (9 h 20 min 21 s)'), t: T_START }, { label: T('L’éclat maximal'), t: -1.5 }, { label: T('La traînée, dix secondes après'), t: 10 }, { label: T('L’onde de choc arrive'), t: T_SHOCK - 6 }, { label: T('Après'), t: T_SHOCK + 15 }],
    journal: [
      { t: -25, title: T('Vendredi matin'), text: T('Le Soleil vient de se lever. Les gens partent au travail, les enfants sont en classe. Le ciel est clair, il fait −15 °C.') },
      { t: T_START, title: T('Une étoile en plein jour'), text: T('Au sud-est, un point lumineux apparaît à 97 km d’altitude et file vers l’ouest. Il parcourt 19 kilomètres par seconde : vingt fois la vitesse d’une balle de fusil.') },
      { t: -2.5, title: T('Plus brillant que le Soleil'), text: T('L’air comprimé devant lui chauffe et le brise. À 30 km d’altitude, il libère en une seconde l’énergie d’environ 500 kilotonnes de TNT, trente fois Hiroshima. Les ombres tournent dans les rues.') },
      { t: 3, title: T('Une traînée double'), text: T('Il ne reste qu’un sillage de fumée et de poussière, scindé en deux rouleaux, long de plus de cent kilomètres. Les gens s’approchent des fenêtres pour regarder. C’est le piège.') },
      { t: 30, title: T('Le son voyage lentement'), text: T('L’explosion a eu lieu à près de 50 km. La lumière a mis un instant ; l’onde de choc met environ deux minutes et demie. Personne ne le sait.') },
      { t: T_SHOCK, title: T('L’onde de choc'), text: T('Une détonation, puis une série de claquements. Les vitres de plus de 7 000 bâtiments éclatent. Près de 1 500 personnes sont blessées, presque toutes par le verre, parce qu’elles regardaient dehors.') },
      { t: T_SHOCK + 25, title: T('Ce qu’il en reste'), text: T('Le plus gros fragment, 654 kg, a troué la glace du lac Tchebarkoul, 70 km plus à l’ouest. Un objet de cette taille frappe la Terre quelques fois par siècle ; presque toujours au-dessus d’un océan ou d’un désert.') },
    ],
    pois: [{ id: 'bol', label: T('Le bolide'), pos: (t) => t > T_START && t < 8 ? bolM : null, r: 100 }, { id: 'sun', label: T('Soleil'), far: true, pos: () => SUNP }, { id: 'city', label: T('Tcheliabinsk'), pos: (t, k) => k.view === 'ground' ? null : O, r: 3000 }, { id: 'trail', label: T('La traînée'), pos: (t, k) => t > 8 ? TRAILP : null, r: 12000 }],
    clock: (t) => [(t < 0 ? TF('T − {0}', [fmtDur(Math.abs(t))]) : TF('T + {0}', [fmtDur(Math.abs(t))])), t < 0 ? T('avant l’éclat maximal') : T('après l’éclat maximal')],
    data: (t) => {
      posKm(t, tmp); const vis = t > T_START;
      const l1 = vis && t < 6 ? TF('Bolide : altitude <b>{0} km</b>, vitesse <b>{1} km/s</b>, à {2} km de vous', [fr(tmp.y, 1), fr(speed(t), 1), fr(tmp.length(), 0)]) + '<br>' + TF('Éclat : <b>{0} %</b> du maximum (au pic : plus que le Soleil)', [fr(flare(t) * 100, 0)]) : vis ? T('Fragments en chute libre, invisibles, vers l’ouest') : T('Astéroïde encore invisible, dans la direction du Soleil levant');
      const l2 = t > 0 && t < T_SHOCK ? '<br>' + TF('Onde de choc : arrive dans <b>{0}</b>', [fmtDur(T_SHOCK - t)]) : t >= T_SHOCK ? '<br>' + T('Onde de choc passée : vitres brisées, alarmes') : '';
      return l1 + l2;
    },
    distLabel: (d) => fmtDist(d / 1000), bloom: [0.5, 0.6, 1.0], exposure: 0.85, msaa: 2,
    update(t, dt, k) {
      time += dt; posKm(t, bolKm); bolM.copy(bolKm).multiplyScalar(1000);
      const I = t > T_START ? flare(t) : 0, lit = t > T_START && t < 8;
      // lumière et ombres du bolide
      bl.intensity = 7 * I; bl.position.copy(bolKm).normalize().multiplyScalar(600); bl.visible = I > 0.002;
      k.renderer.toneMappingExposure = 0.85 / (1 + 1.2 * I);
      // astéroïde et fragments
      const frag = sstep(-0.6, 1.2, t);
      rock.visible = t < 8; rock.position.copy(bolM); rock.rotation.set(time * 0.7, time * 0.4, 0); rock.scale.setScalar(1 - 0.75 * frag);
      rockMat.emissiveIntensity = 0.02 + 3 * I;
      for (const f of frags) { f.m.visible = t > -0.6 && t < 8; f.m.position.copy(bolM).addScaledVector(f.o, 60 * frag * (1 + Math.max(t, 0) * 0.6)).addScaledVector(DIR, -f.lag * 900 * frag * Math.max(t + 0.6, 0)); f.m.rotation.set(time * f.s, time * 1.3 * f.s, 0); }
      head.position.copy(bolM); const cd = k.camera.position.distanceTo(bolM); head.visible = lit; head.scale.setScalar(clamp(cd * 0.22 * Math.sqrt(I + 0.004), 26, 1e6) * (k.view === 'ride' ? 0.5 : 1)); head.material.opacity = clamp(I * 3 + 0.25, 0, 1);
      sheath.visible = lit && cd < 30000 && k.view !== 'ride'; sheath.position.copy(bolM); sheath.quaternion.setFromUnitVectors(yAxis, tmp.copy(DIR).negate()); sheath.material.opacity = clamp(0.25 + I, 0, 1) * (1 - sstep(4, 8, t));
      const sl = 30 + 250 * I + 60 * sstep(-10, 0, t); sheath.scale.set(sl * 0.2, sl * 7, sl * 0.2);
      // ciel
      const su = sky.material.uniforms; su.uT.value = time; su.uI.value = I; su.uBol.value.copy(bolKm); su.uCam.value.copy(k.camera.position).multiplyScalar(0.001);
      posKm(Math.max(Math.min(t, 6), T_START + 4.2), su.uTB.value); posKm(T_START + 4, su.uTA.value);
      su.uTrailOp.value = t > T_START + 4.2 ? 1 * Math.exp(-Math.max(t - 60, 0) / 400) : 0; su.uAge.value = Math.max(t - 6, 0) + Math.max(Math.min(t, 6) - (T_START + 4.2), 0) * 0; su.uTrailW.value = 0.5 + 0.9 * sstep(0, 120, t) + 0.35 * sstep(-6, 2, t);
      // onde de choc au sol
      const since = t - T_SHOCK;
      if (prevT < T_SHOCK && t >= T_SHOCK && dt > 0) { shake = 1; boom(k); }
      prevT = t; shake *= Math.exp(-dt * 1.6);
      winMat.emissiveIntensity = since < 0 ? 1 : 0.25; glass.visible = since > 0 && since < 6; if (glass.visible) { glass.material.uniforms.uT.value = since; }
      snow.visible = since > 0 && since < 14; if (snow.visible) snow.material.uniforms.uT.value = since;
      // caméras
      if (k.view === 'ground') { k.cam.pos.set(0, 1.7, 0); if (shake > 0.01) k.cam.pos.add(tmp.set(Math.sin(time * 61), Math.sin(time * 47), Math.sin(time * 53)).multiplyScalar(0.07 * shake)); k.cam.near = 0.3; k.cam.far = 4e5; }
      else if (k.view === 'sky') { k.cam.target.copy(bolM); k.cam.near = Math.max(1, k.cam.dist * 0.02); k.cam.far = 6e5; }
      else { const z = tmp.copy(DIR).negate(), x = new THREE.Vector3().crossVectors(yAxis, z).normalize(), y = new THREE.Vector3().crossVectors(z, x); k.cam.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        k.cam.pos.copy(bolM).addScaledVector(y, 14).addScaledVector(z, 30); k.cam.near = 1; k.cam.far = 6e5; }
      sunL.target.position.set(0, 0, 0);
    },
    post: (t, k) => { const u = sky.material.uniforms, c = k.camera; u.uBasis.value.setFromMatrix4(c.matrixWorld); u.uTan.value = Math.tan(c.fov * Math.PI / 360); u.uAspect.value = c.aspect; },
  });
  const S = kit.scene, R = kit.renderer, yAxis = new THREE.Vector3(0, 1, 0), r = rng(2013);
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  const sunDir = new THREE.Vector3(Math.sin(2.2) * Math.cos(0.085), Math.sin(0.085), -Math.cos(2.2) * Math.cos(0.085)).normalize();
  const sky = makeBackdrop(new THREE.ShaderMaterial({ vertexShader: BACKDROP_VERT, fragmentShader: SKY, uniforms: { uBasis: { value: new THREE.Matrix3() }, uTan: { value: 1 }, uAspect: { value: 1 }, uT: { value: 0 }, uI: { value: 0 }, uTrailOp: { value: 0 }, uTrailW: { value: 0.6 }, uAge: { value: 0 },
    uCam: { value: new THREE.Vector3() }, uSun: { value: sunDir }, uBol: { value: new THREE.Vector3() }, uTA: { value: new THREE.Vector3() }, uTB: { value: new THREE.Vector3() } } }));
  S.add(sky); S.fog = new THREE.FogExp2(0xb9c3da, 0.000016);
  S.add(new THREE.HemisphereLight(0x9db4e8, 0xd8dcf0, 0.75));
  const mkLight = (col, int, size, map) => { const l = new THREE.DirectionalLight(col, int); l.castShadow = true; l.shadow.mapSize.set(map, map); const c = l.shadow.camera; c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 50; c.far = 1400; l.shadow.bias = -0.0006; l.shadow.normalBias = 0.6; S.add(l, l.target); return l; };
  const sunL = mkLight(0xffc48a, 1.5, 320, 2048); sunL.position.copy(sunDir).multiplyScalar(600);
  const bl = mkLight(0xfff4e0, 0, 320, 2048);
  // sol : neige, puis plaine jusqu'à l'horizon
  const tex = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const snowTex = tex(256, 256, (x, w, h) => { x.fillStyle = '#e9edf6'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { const g = 215 + r() * 40 | 0; x.fillStyle = `rgba(${g},${g + 3},${g + 10},.5)`; x.fillRect(r() * w, r() * h, 1 + r() * 5, 1 + r() * 3); } });
  snowTex.repeat.set(300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ map: snowTex, roughness: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; S.add(ground);
  const farTex = tex(512, 512, (x, w, h) => { x.fillStyle = '#dfe5f0'; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const g = 120 + r() * 70 | 0; x.fillStyle = `rgba(${g - 30},${g - 10},${g},${0.25 + r() * 0.4})`; const s = 4 + r() * 46; x.beginPath(); x.ellipse(r() * w, r() * h, s, s * (0.3 + r()), r() * 3, 0, 7); x.fill(); } });
  farTex.repeat.set(40, 40);
  const plain = new THREE.Mesh(new THREE.PlaneGeometry(9e5, 9e5), new THREE.MeshStandardMaterial({ map: farTex, roughness: 1 })); plain.rotation.x = -Math.PI / 2; plain.position.y = -2; S.add(plain);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(22, 2400), new THREE.MeshStandardMaterial({ color: 0xa9adb8, roughness: 0.9 })); road.rotation.x = -Math.PI / 2; road.position.set(-14, 0.03, 0); road.receiveShadow = true; S.add(road);
  // immeubles
  const facade = (lit) => tex(256, 256, (x, w, h) => { x.fillStyle = lit ? '#000' : '#b8b2a8'; x.fillRect(0, 0, w, h); const rr = rng(77);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { const on = rr() < 0.3; if (lit) { if (on) { x.fillStyle = rr() < 0.7 ? '#ffc56e' : '#cfe0ff'; x.fillRect(i * 32 + 9, j * 32 + 8, 14, 17); } } else { x.fillStyle = on ? '#6b5a3a' : '#39414f'; x.fillRect(i * 32 + 8, j * 32 + 7, 16, 19); x.fillStyle = '#9a948b'; x.fillRect(i * 32, j * 32 + 30, 32, 2); } } });
  const winMat = new THREE.MeshStandardMaterial({ map: facade(false), emissiveMap: facade(true), emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xeef1f8, roughness: 1 });
  const builds = [];
  function building(x, z, w, d, h) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) { const face = i / 4 | 0, len = face < 2 ? d : w; if (face === 2 || face === 3) continue; uv.setXY(i, uv.getX(i) * len / 24, uv.getY(i) * h / 24); }
    const m = new THREE.Mesh(g, [winMat, winMat, roofMat, roofMat, winMat, winMat]); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; S.add(m); builds.push({ x, z, w, d, h });
  }
  for (let bx = -7; bx <= 7; bx++) for (let bz = -7; bz <= 7; bz++) {
    const x = bx * 112 + (bx >= 0 ? 72 : 22), z = bz * 95;
    if (r() < 0.14) continue;
    const nearMe = Math.hypot(x, z) < 190, tall = !nearMe && r() < 0.35, h = tall ? 27 + (r() < 0.3 ? 21 : 0) : 15, along = nearMe || r() < 0.65;
    building(x + (r() - 0.5) * 10, z + (r() - 0.5) * 12, along ? 84 : 15, along ? 15 : 66, h);
  }
  // cheminées d'usine et leurs panaches
  for (const [x, z, h] of [[520, 760, 110], [600, 820, 90], [-700, 500, 120]]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(3, 5, h, 12), new THREE.MeshStandardMaterial({ color: 0x8a6f66 })); c.position.set(x, h / 2, z); c.castShadow = true; S.add(c);
    for (let i = 0; i < 7; i++) { const p = makeGlow(0xe8e4ea, 40 + i * 26, 0.5 - i * 0.05); p.material.blending = THREE.NormalBlending; p.position.set(x - i * 34, h + 12 + i * 13, z + i * 6); S.add(p); } }
  // voitures, lampadaires
  const carG = new THREE.BoxGeometry(1.8, 1.3, 4.2); for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(carG, new THREE.MeshStandardMaterial({ color: [0x8c2a2a, 0x2c3e66, 0xd8d8d8, 0x30343c, 0x6f7f8c][i % 5], roughness: 0.5 })); m.position.set(-3 - (i % 2) * 22 + (r() - .5), 0.7, -260 + i * 21 + r() * 6); m.castShadow = true; S.add(m); }
  const poleG = new THREE.CylinderGeometry(0.12, 0.16, 9, 6); for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(poleG, new THREE.MeshStandardMaterial({ color: 0x555a66 })); m.position.set(i % 2 ? -1 : -27, 4.5, -280 + i * 36); m.castShadow = true; S.add(m); }
  // arbres nus
  const trunkG = new THREE.CylinderGeometry(0.1, 0.26, 8, 5), brG = new THREE.CylinderGeometry(0.03, 0.09, 4.2, 4), trunkM = new THREE.MeshStandardMaterial({ color: 0x2e2826, roughness: 1 });
  brG.translate(0, 2.1, 0);
  for (let i = 0; i < 40; i++) { const x = (i % 2 ? 9 : -34) + r() * 3, z = -300 + i * 15 + r() * 5; const a = new THREE.Mesh(trunkG, trunkM); a.position.set(x, 4, z); a.castShadow = true; S.add(a);
    for (let j = 0; j < 7; j++) { const b = new THREE.Mesh(brG, trunkM); b.position.set(x, 3.4 + j * 0.65, z); b.rotation.set((r() - .5) * 1.7, r() * 6.3, (r() - .5) * 1.7); b.scale.setScalar(1.15 - j * 0.1); b.castShadow = true; S.add(b); } }
  // astéroïde
  const rg = new THREE.IcosahedronGeometry(9.5, 3), rp = rg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); const n = 1 + 0.18 * Math.sin(v.x * 0.5 + 1) * Math.cos(v.y * 0.7) + 0.1 * Math.sin(v.z * 1.3 + v.x); v.multiplyScalar(n); rp.setXYZ(i, v.x, v.y * 0.8, v.z); } rg.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 1, emissive: 0xff7a30, emissiveIntensity: 0.2, flatShading: true });
  const rock = new THREE.Mesh(rg, rockMat); S.add(rock);
  const frags = []; for (let i = 0; i < 22; i++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + r() * 3.2, 1), rockMat); S.add(m); frags.push({ m, o: new THREE.Vector3(r() - .5, r() - .5, r() - .5), lag: r(), s: 1 + r() * 3 }); }
  const head = makeGlow(0xfff2dc, 1, 1); head.material.depthTest = true; head.material.fog = false; S.add(head);
  const sg = new THREE.ConeGeometry(1, 1, 24, 12, true); sg.translate(0, 0.5, 0);
  const sheath = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: { opacity: { value: 1 }, uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vP;varying float vF;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.);vF=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'uniform float opacity;varying vec3 vP;varying float vF;void main(){float a=pow(1.-vP.y,2.2)*(.35+.65*vF)*opacity;gl_FragColor=vec4(mix(vec3(1.,.45,.12),vec3(1.,.95,.85),pow(1.-vP.y,5.))*a*1.1,1.);}' }));
  Object.defineProperty(sheath.material, 'opacity', { get() { return this.uniforms.opacity.value; }, set(x) { this.uniforms.opacity.value = x; } }); S.add(sheath);
  // éclats de verre et neige soufflée par l'onde de choc
  function burst(n, src, col, size, grav, spd) {
    const p = new Float32Array(n * 3), vv = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const s = src(i); p.set(s.p, i * 3); vv.set(s.v, i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('vel', new THREE.BufferAttribute(vv, 3));
    const m = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: { uT: { value: 0 }, uCol: { value: new THREE.Color(col) } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec3 vel;uniform float uT;varying float vA;void main(){vec3 p=position+vel*uT*${spd.toFixed(1)};p.y=max(p.y-${grav.toFixed(1)}*uT*uT,0.05);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(${size.toFixed(1)}/-mv.z,1.,9.);vA=p.y>.06?1.:.25;}`,
      fragmentShader: 'uniform vec3 uCol;varying float vA;void main(){gl_FragColor=vec4(uCol,.85*vA);}' })); m.frustumCulled = false; m.visible = false; S.add(m); return m;
  }
  const near = builds.filter(b => Math.hypot(b.x, b.z) < 420);
  const glass = burst(9000, () => { const b = near[r() * near.length | 0], side = r() < 0.5 ? 1 : -1, alongW = b.w > b.d; const u = (r() - 0.5) * (alongW ? b.w : b.d), y = 2 + r() * (b.h - 3);
    return { p: alongW ? [b.x + u, y, b.z + side * b.d / 2] : [b.x + side * b.w / 2, y, b.z + u], v: alongW ? [(r() - .5) * 2, r() * 1.5, side * (1 + r() * 4)] : [side * (1 + r() * 4), r() * 1.5, (r() - .5) * 2] }; }, 0xdfeaff, 900, 4.9, 1);
  const snow = burst(14000, () => { const b = near[r() * near.length | 0]; return { p: [b.x + (r() - .5) * b.w, b.h + 0.3, b.z + (r() - .5) * b.d], v: [(r() - .5) * 3 - 2, 0.5 + r() * 2.5, -3 - r() * 4] }; }, 0xffffff, 700, 0.5, 1);
  function boom(k) {
    if (!k.ac || !k.soundOn) return; const ac = k.ac, now = ac.currentTime, len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    for (const [dl, g, f] of [[0, 1, 140], [0.55, 0.5, 220], [1.3, 0.6, 180], [2.4, 0.35, 260], [3.3, 0.3, 200]]) { const s = ac.createBufferSource(); s.buffer = buf; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f; const gn = ac.createGain();
      gn.gain.setValueAtTime(0, now + dl); gn.gain.linearRampToValueAtTime(g * 1.4, now + dl + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, now + dl + 1.6); s.connect(lp).connect(gn).connect(ac.destination); s.start(now + dl); s.stop(now + dl + 2); }
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; g.gain.value = 0; g.gain.setValueAtTime(0.012, now + 1.2); g.gain.linearRampToValueAtTime(0, now + 22);
    for (let i = 0; i < 50; i++) o.frequency.setValueAtTime(i % 2 ? 950 : 720, now + 1.2 + i * 0.4); o.connect(g).connect(ac.destination); o.start(now + 1.2); o.stop(now + 22);
  }
  kit.run();
}
