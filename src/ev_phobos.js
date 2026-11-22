// Phobos : la lune de Mars spirale vers sa planète, se disloque et devient un anneau.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, rng, NOISE, YEAR, DAY, makeStars, makeGlow, skyBackdrop, makeGround } from './kit.js';
const RM = 3389.5, A0 = 9376, AB = 1.6 * RM, TB = 30e6 * YEAR, GMM = 42828;
const K = (Math.pow(A0, 6.5) - Math.pow(AB, 6.5)) / TB;
const aOf = (t) => t < TB ? Math.pow(Math.pow(A0, 6.5) - K * t, 1 / 6.5) : AB;
const period = (a) => 2 * Math.PI * Math.sqrt(a * a * a / GMM);
const MARS = /* glsl */`precision highp float;varying vec3 vP,vN,vW;uniform vec3 uSun;uniform vec4 uHit[6];${NOISE}
void main(){vec3 n=normalize(vP);float f=fbm(n*2.1+3.),g=fbm(n*7.+11.);
  vec3 c=mix(vec3(.80,.47,.27),vec3(.36,.21,.15),smoothstep(.42,.62,f+.15*g));c=mix(c,vec3(.93,.66,.42),smoothstep(.55,.8,fbm3(n*3.7+20.))*.5);
  c*=.8+.4*g;float cr=vnoise(n*38.);c*=1.-.18*smoothstep(.72,.8,cr);
  float cap=smoothstep(.87,.93,abs(n.y)+.05*(g-.5));c=mix(c,vec3(.95,.93,.9),cap);
  float lon=atan(n.z,n.x);
  for(int i=0;i<6;i++){vec4 h=uHit[i];if(h.w<=0.)continue;float dl=mod(lon-h.x+3.14159,6.28318)-3.14159;float e=dl*dl/(h.z*h.z*9.)+pow(n.y-h.y,2.)/(h.z*h.z);c=mix(c,vec3(.16,.09,.07),smoothstep(1.,.4,e)*h.w);}
  vec3 N=normalize(vN);float mu=dot(N,uSun);vec3 col=c*pow(max(mu,0.),.8)*1.15*smoothstep(-.03,.12,mu);
  float rim=pow(1.-max(dot(N,normalize(cameraPosition-vW)),0.),3.5);col+=vec3(.75,.5,.32)*rim*smoothstep(-.1,.3,mu)*.35;
  gl_FragColor=vec4(col,1.);}`;
export function start() {
  const SUN = new THREE.Vector3(1, 0.1, 0.25).normalize(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  let time = 0, ang = 0.6, mang = 0, lastT = null;
  const CH = [0.9, 2.1, 3.3, 4.4, 5.3, 0.2].map((lon, i) => ({ lon, t: TB + (300 + 2500 * i * i) * YEAR, lat: (i % 2 ? 1 : -1) * 0.015 * i }));
  const TE = TB + 6e7 * YEAR, lt = (t) => Math.log10(1 + t / (2 * DAY));
  const kit = createKit({
    title: T('Phobos · la lune qui deviendra un anneau'), kicker: T('Mars · d’aujourd’hui à dans 90 millions d’années'), h1: T('L’anneau de Mars'),
    intro: T('Phobos tourne si près de Mars qu’elle en fait le tour en moins de huit heures. Les marées la freinent : elle descend, de plus en plus vite. Dans quelques dizaines de millions d’années, la gravité de Mars la brisera, et la planète rouge portera un anneau.'),
    warn: T('Calendrier d’après Black et Mittal (2015) : rupture dans 20 à 40 millions d’années, anneau pendant 1 à 100 millions d’années. L’altitude de rupture dépend de la solidité de Phobos, mal connue ; la scène la place vers 2 000 km. Le rythme de la dislocation est une mise en scène.'),
    views: [{ id: 'mars', label: T('Autour de Mars'), cam: { mode: 'orbit', dist: 30000, min: 4200, max: 3e5, pitch: 0.3, yaw: 0.5, fov: 45 } }, { id: 'phobos', label: T('Près de Phobos'), cam: { mode: 'orbit', dist: 110, min: 30, max: 6000, pitch: 0.15, yaw: 2.6, fov: 50 } }, { id: 'ground', label: T('Sur Mars, à 30° nord'), cam: { mode: 'look', fov: 75, yaw: 3.14, pitch: 0.5 } }],
    t0: 0, t1: TE, tStart: 0, speed0: 1200, speedRange: [10, 4e6 * YEAR], speeds: [60, 1200, 3600 * 6, DAY * 30, YEAR * 100, YEAR * 1e4, YEAR * 3e5, YEAR * 1e6, YEAR * 4e6],
    autoRate: (t) => { const d = Math.abs(t - TB); let r = Math.max(1200, (t - 9 * 3600) * 0.45); r = Math.min(r, t < TB ? Math.max(d * 0.3, 2 * DAY) : Math.max(d * 0.4, 3 * DAY)); return Math.min(r, 3e6 * YEAR); },
    moments: [{ label: T('Aujourd’hui'), t: 0 }, { label: T('Dans 10 millions d’années'), t: 1e7 * YEAR }, { label: T('Dans 25 millions d’années'), t: 2.5e7 * YEAR }, { label: T('Mille ans avant la rupture'), t: TB - 1000 * YEAR, view: 'phobos' }, { label: T('La rupture'), t: TB - 4 * DAY, view: 'phobos', cam: { dist: 260 } },
      { label: T('Un mois après : l’arc s’étire'), t: TB + 30 * DAY, view: 'mars' }, { label: T('Un an après : l’anneau est fermé'), t: TB + YEAR, view: 'mars' }, { label: T('L’anneau vu du sol'), t: TB + 100 * YEAR, view: 'ground' }, { label: T('Un million d’années après'), t: TB + 1e6 * YEAR, view: 'mars' }, { label: T('L’anneau s’éteint'), t: TB + 4e7 * YEAR, view: 'mars' }],
    prog: (t) => lt(t) / lt(TE),
    journal: [
      { t: 0, title: T('Une lune condamnée'), text: T('Phobos mesure 27 km dans sa plus grande longueur et passe à 6 000 km du sol : aucune lune connue n’est aussi proche de sa planète. Elle tourne plus vite que Mars ne tourne sur elle-même, donc se lève à l’ouest et se couche à l’est, deux fois par jour.') },
      { t: 8 * 3600, title: T('L’inverse de notre Lune'), text: T('Le renflement de marée qu’elle soulève sur Mars est en retard sur elle et la tire en arrière. Elle perd de l’énergie et descend : environ 2 cm par an aujourd’hui. Notre Lune, plus lente que la rotation de la Terre, fait le contraire et s’éloigne.') },
      { t: 1e7 * YEAR, title: T('De plus en plus vite'), text: T('Plus elle est basse, plus la marée est forte, plus elle descend vite. Ses longues rainures parallèles pourraient être les premières fissures d’un corps déjà mis sous tension.') },
      { t: TB - 3000 * YEAR, title: T('La limite de Roche'), text: T('Phobos est un tas de gravats peu soudés. Sous une certaine altitude, la marée de Mars tire plus fort sur sa face proche que sa propre gravité ne la retient. Les couches externes partent les premières.') },
      { t: TB, title: T('Dislocation'), text: T('Le corps cède. Chaque morceau suit sa propre orbite, un peu plus rapide côté Mars, un peu plus lente à l’opposé : le nuage s’étire en arc, et l’arc se referme en anneau en quelques mois.') },
      { t: TB + 200 * YEAR, title: T('Mars a un anneau'), text: T('Aussi dense, au début, que l’un des grands anneaux de Saturne. Les blocs les plus solides, eux, continuent à descendre et frappent l’équateur en rasant le sol : ils laissent des cratères allongés.') },
      { t: TB + 3e6 * YEAR, title: T('La pluie'), text: T('L’anneau s’étale. Son bord intérieur atteint la haute atmosphère et retombe en pluies de météores le long de l’équateur. Selon l’altitude de la rupture, il dure d’un million à cent millions d’années.') },
    ],
    clock: (t) => t < 3 * DAY ? [TF('Aujourd’hui + {0}', [fmtDur(t)]), T('Phobos fait un tour en 7 h 39')] : [TF('Dans {0}', [fmtDur(t)]), t < TB ? T('la spirale') : T('après la rupture de Phobos')],
    data: (t) => {
      const a = aOf(t), P = period(a);
      if (t < TB) return TF('Phobos : à <b>{0} km</b> du sol ({1} rayons martiens)', [fr(a - RM, 0), fr(a / RM, 2)]) + '<br>' + TF('Un tour en <b>{0}</b> · jour martien : 24 h 37', [fmtDur(P)]) + '<br>' + TF('Taille dans le ciel martien : <b>{0}′</b> (notre Lune : 31′)', [fr(2 * Math.atan(11 / (a - RM)) * 180 / Math.PI * 60, 0)]) + '<br>' + TF('Rupture dans {0}', [fmtDur(TB - t)]);
      const dt = t - TB, w = ringWide(dt);
      return TF('Anneau à <b>{0} km</b> du sol, large de <b>{1} km</b>', [fr(AB - RM, 0), fr(2 * w, 0)]) + '<br>' + (dt < YEAR ? TF('Arc fermé à {0} %', [fr(clamp(spreadOf(dt), 0, 1) * 100, 0)]) : T('Anneau fermé')) + ' · ' + TF('matière restante : <b>{0} %</b>', [fr((1 - lossOf(dt)) * 100, 0)]) + '<br>' + TF('Blocs tombés sur Mars : {0} sur {1} (mise en scène)', [CH.filter(c => c.t < t).length, CH.length]);
    },
    bloom: [0.4, 0.5, 1.0], exposure: 1.05,
    update(t, dt, k) {
      time += dt; const a = aOf(t), P = period(a);
      const dsim = lastT === null ? 0 : t - lastT; lastT = t;
      if (dt > 0 && dsim > 0) { ang += Math.min(2 * Math.PI * dsim / P, 1.1 * dt); mang += Math.min(2 * Math.PI * dsim / 88643, 0.34 * dt); }
      else if (dsim !== 0) { ang += 1.7; }
      mars.rotation.y = -mang;
      const after = t - TB, broke = after > 0, shed = sstep(-5000 * YEAR, 0, after);
      const pp = tmp.set(Math.cos(ang) * a, 0, Math.sin(ang) * a);
      ph.visible = !broke || after < 20 * DAY; ph.position.copy(pp); ph.rotation.y = -ang; ph.scale.setScalar((1 - 0.25 * shed) * (broke ? 1 - sstep(0, 20 * DAY, after) * 0.7 : 1));
      const cd = k.camera.position.distanceTo(pp); mark.position.copy(pp); mark.visible = ph.visible && cd > 3000; mark.scale.setScalar(cd * 0.012);
      // anneau
      const ru = ring.material.uniforms; ring.visible = shed > 0; ru.uA.value = a; ru.uAng.value = ang; ru.uRel.value = broke ? 0.5 + 0.5 * sstep(0, 15 * DAY, after) : 0.5 * shed * shed;
      ru.uSpread.value = broke ? spreadOf(after) : 0.004 + 0.02 * shed; ru.uWide.value = broke ? ringWide(after) : 6 + 10 * shed; ru.uLoss.value = broke ? lossOf(after) : 0; ru.uSize.value = k.renderer.domElement.height;
      ru.uB.value = k.view === 'ground' ? 3 : 1;
      // gros blocs
      for (let i = 0; i < CH.length; i++) { const c = CH[i], h = mu.uHit.value[i]; h.set(c.lon, c.lat, 0.035 + 0.01 * (i % 3), t > c.t ? 1 : 0);
        const fl = flashes[i], age = (t - c.t); const vis = age > 0 && age < 40 * DAY; fl.visible = vis; if (vis) { fl.position.set(Math.cos(c.lon), c.lat, Math.sin(c.lon)).normalize().multiplyScalar(RM * 1.004).applyAxisAngle(Y, -mang); fl.scale.setScalar(900 * Math.exp(-age / (8 * DAY))); } }
      // caméras
      if (k.view === 'mars') k.cam.target.set(0, 0, 0);
      else if (k.view === 'phobos') { k.cam.target.copy(pp); k.cam.near = Math.max(1, k.cam.dist * 0.02); k.cam.far = 1e6; }
      const onGround = k.view === 'ground'; ground.mesh.visible = onGround; mars.visible = !onGround; halo.visible = !onGround; sky.mesh.visible = onGround;
      if (onGround) {
        const up = upAt(mang, tmp2);
        const east = new THREE.Vector3().crossVectors(Y, up).normalize(), north = new THREE.Vector3().crossVectors(up, east);
        frameQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east, up, north.clone().negate()));
        k.cam.basis.copy(frameQ); k.cam.pos.copy(up).multiplyScalar(RM + 0.003); k.cam.near = 0.0008; k.cam.far = 2e5;
        ground.mesh.position.copy(up).multiplyScalar(RM + 0.0012); ground.mesh.quaternion.copy(frameQ);
        const sl = tmp.copy(SUN).applyQuaternion(frameQ.clone().invert()); ground.u.uSun.value.copy(sl);
        const day = sstep(-0.08, 0.25, sl.y); ground.u.uSunCol.value.setRGB(1.5 * day, 1.2 * day, 0.95 * day); ground.u.uAmb.value.setRGB(0.04 + 0.2 * day, 0.035 + 0.14 * day, 0.04 + 0.1 * day);
        ground.u.uHaze.value.setRGB(0.02 + 0.6 * day, 0.018 + 0.44 * day, 0.02 + 0.3 * day);
        sky.u.uSunL.value.copy(SUN); sky.u.uUp.value.copy(up); sky.u.uDay.value = day;
      }
      stars.material.uniforms.uB.value = onGround ? 0 : 0.9;
      sunL.position.copy(SUN).multiplyScalar(1e6);
    },
    post: (t, k) => sky.sync(k.camera),
    onJump(m) { lastT = null; if (m && m.view === 'ground') { let best = 0, bv = 9; for (let i = 0; i < 360; i++) { const a = i / 360 * 6.2832, e = upAt(a, tmp2).dot(SUN), e2 = upAt(a + 0.02, tmp).dot(SUN); const sc = Math.abs(e + 0.16) + (e2 < e ? 0 : 5); if (sc < bv) { bv = sc; best = a; } } mang = best; } },
  });
  const upAt = (m, out) => out.set(0.866 * Math.cos(-m + 0.9), 0.5, -0.866 * Math.sin(-m + 0.9)).normalize();
  const spreadOf = (dt) => clamp(0.03 + Math.pow(dt / (150 * DAY), 0.9), 0, 1), ringWide = (dt) => 16 + 500 * sstep(2, 6.3, Math.log10(1 + dt / YEAR)), lossOf = (dt) => 0.97 * sstep(5.8, 7.75, Math.log10(1 + dt / YEAR));
  const S = kit.scene, frameQ = new THREE.Quaternion(), r = rng(8);
  const stars = kit.addSky(makeStars({ n: 6000, seed: 21, band: 0.45, bright: 0.9 }));
  const mu = { uSun: { value: SUN }, uHit: { value: CH.map(() => new THREE.Vector4()) } };
  const mars = new THREE.Mesh(new THREE.SphereGeometry(RM, 160, 96), new THREE.ShaderMaterial({ uniforms: mu, fragmentShader: MARS,
    vertexShader: 'varying vec3 vP,vN,vW;void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}' })); S.add(mars);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(RM * 1.018, 96, 64), new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN,vW;void main(){vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'varying vec3 vN,vW;uniform vec3 uSun;void main(){float f=pow(max(dot(normalize(vN),normalize(vW-cameraPosition)),0.),5.);float d=smoothstep(-.2,.3,dot(normalize(vW),uSun));gl_FragColor=vec4(vec3(.9,.6,.4)*f*d*.45,1.);}' })); S.add(halo);
  const sunL = new THREE.DirectionalLight(0xfff2e0, 3.2); S.add(sunL); S.add(new THREE.AmbientLight(0x221a16));
  // Phobos : patate cabossée, cratère Stickney côté avant
  const pg = new THREE.IcosahedronGeometry(1, 5), pa = pg.attributes.position, v = new THREE.Vector3(), st = new THREE.Vector3(-0.6, 0.25, 0.75).normalize();
  const nz = (x, y, z) => Math.sin(x * 3.1 + y * 1.7) * Math.cos(z * 2.9 - x) + 0.5 * Math.sin(x * 7.3 - z * 5.1) * Math.cos(y * 6.7) + 0.25 * Math.sin(x * 17 + y * 13 + z * 11);
  for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); let d = 1 + 0.07 * nz(v.x, v.y, v.z); const s = v.angleTo(st); d -= 0.2 * Math.exp(-Math.pow(s / 0.42, 2)) - 0.05 * Math.exp(-Math.pow((s - 0.5) / 0.1, 2));
    for (let c = 0; c < 9; c++) { const cc = new THREE.Vector3(Math.sin(c * 2.4) * Math.cos(c), Math.sin(c * 1.3), Math.cos(c * 2.4) * Math.cos(c)).normalize(); d -= 0.05 * Math.exp(-Math.pow(v.angleTo(cc) / 0.13, 2)); }
    pa.setXYZ(i, v.x * d * 13.5, v.y * d * 9, v.z * d * 11); } pg.computeVertexNormals();
  const ph = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x8a7d70, roughness: 1 })); S.add(ph);
  const mark = makeGlow(0xd8c8b8, 1, 0.8); S.add(mark);
  // anneau de débris
  const N = 60000, ra = new Float32Array(N * 3), rb = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { const g = (r() + r() + r() - 1.5) / 1.5; ra.set([g, (r() + r() - 1) , (r() - 0.5) * 2], i * 3); rb.set([r(), r()], i * 2); }
  const rgeo = new THREE.BufferGeometry(); rgeo.setAttribute('position', new THREE.BufferAttribute(ra, 3)); rgeo.setAttribute('prm', new THREE.BufferAttribute(rb, 2));
  const ring = new THREE.Points(rgeo, new THREE.ShaderMaterial({ uniforms: { uA: { value: AB }, uAng: { value: 0 }, uSpread: { value: 0 }, uWide: { value: 10 }, uRel: { value: 0 }, uLoss: { value: 0 }, uSun: { value: SUN }, uSize: { value: 500 }, uB: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec2 prm;uniform float uA,uAng,uSpread,uWide,uRel,uLoss,uSize;uniform vec3 uSun;varying float vA;
void main(){float rr=uA+position.x*uWide-uLoss*900.*(1.-prm.y);float an=uAng+position.y*3.14159*uSpread*(1.+.15*position.x);vec3 p=vec3(cos(an)*rr,position.z*(2.+uWide*.012),sin(an)*rr);
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;float ps=clamp(uSize*7./-mv.z,1.3,5.);gl_PointSize=ps;
  float sh=(dot(p,uSun)<0.&&length(p-uSun*dot(p,uSun))<${RM.toFixed(1)})?.04:1.;
  vA=(prm.x<uRel&&prm.y>uLoss&&rr>${(RM + 120).toFixed(1)})?sh*min(1.,3./(ps*ps))*(.35+.65*prm.y):0.;}`,
    fragmentShader: 'uniform float uB;varying float vA;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vec3(.82,.72,.62)*vA*uB*.16*smoothstep(.5,.1,d),1.);}' })); ring.frustumCulled = false; S.add(ring);
  const flashes = CH.map(() => { const f = makeGlow(0xffc080, 1, 1); f.visible = false; S.add(f); return f; });
  // sol martien et ciel
  const ground = makeGround({ a: 0xa8663c, b: 0x5e3622, scale: 1000, fade: 0.0009 }); ground.setSize(60); S.add(ground.mesh);
  const sky = skyBackdrop('uniform vec3 uSunL,uUp;uniform float uDay;', `float h=dot(d,uUp);float sd=max(dot(d,uSunL),0.);
  vec3 dayc=mix(vec3(.78,.58,.4),vec3(.5,.36,.27),clamp(h,0.,1.))*uDay;dayc+=vec3(.35,.5,.8)*pow(sd,24.)*uDay*.9+vec3(1.,.95,.9)*pow(sd,3000.)*8.;
  col=dayc+skyStars(d,normalize(vec3(.45,.35,.82)),.8)*(1.-uDay)*1.1;if(h<0.)col=mix(col,vec3(.02+.6*uDay,.018+.44*uDay,.02+.3*uDay),smoothstep(0.,-.02,h));`,
    { uSunL: { value: new THREE.Vector3() }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uDay: { value: 0 } }); S.add(sky.mesh);
  kit.run();
}
