// DART, 26 septembre 2022 : une sonde percute Dimorphos, lune de l'astéroïde Didymos, et raccourcit son orbite de 33 minutes.
// Mètres, origine au centre de Didymos, orbite de Dimorphos dans le plan xz. Chiffres : NASA/APL, Thomas et al. 2023, Cheng et al. 2023 (Nature).
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, rng, NOISE, makeStars, makeGlow } from './kit.js';
const A0 = 1190, P0 = 11.92 * 3600, P1 = P0 - 33 * 60, A1 = A0 * Math.pow(P1 / P0, 2 / 3), V = 6140, HOUR = 3600, DAYS = 86400;
const VH = new THREE.Vector3(0.16, -0.12, -0.98).normalize();           // direction de vol de DART : presque de face, contre le mouvement orbital (+z)
const SUN = new THREE.Vector3(0.75, 0.35, 0.56).normalize(), EARTH = new THREE.Vector3(-0.5, 0.2, 0.84).normalize();
const DIM = [88.5, 58, 87], IMP = new THREE.Vector3(A0, 0, 0).addScaledVector(VH, -70);
const dimPos = (t, o) => { const th = 2 * Math.PI * t / (t < 0 ? P0 : P1), a = t < 0 ? A0 : A1; return o.set(a * Math.cos(th), 0, a * Math.sin(th)); };
const ghostPos = (t, o) => { const th = 2 * Math.PI * t / P0; return o.set(A0 * Math.cos(th), 0, A0 * Math.sin(th)); };
const dartPos = (t, o) => o.copy(IMP).addScaledVector(VH, V * Math.min(t, 0));
const LPERP = new THREE.Vector3().crossVectors(VH, new THREE.Vector3(0, 1, 0)).normalize();
const cubePos = (t, o) => o.set(A0, 0, 0).addScaledVector(LPERP, 56700).addScaledVector(VH, V * (t - 165));

export function start() {
  const pD = new THREE.Vector3(), pG = new THREE.Vector3(), pS = new THREE.Vector3(), pC = new THREE.Vector3(), O = new THREE.Vector3(), tmp = new THREE.Vector3();
  const SUNP = SUN.clone().multiplyScalar(1e12), EARTHP = EARTH.clone().multiplyScalar(1e12);
  let time = 0, switched = false, fovNow = 30;
  const POIS = [{ id: 'dim', label: T('Dimorphos'), pos: () => pD, r: 110 }, { id: 'did', label: T('Didymos'), pos: () => O, r: 500 }, { id: 'dart', label: T('DART'), pos: (t, k) => t < 0 && k.view !== 'dart' ? pS : null, r: 8 },
    { id: 'ghost', label: T('Où serait Dimorphos sans l’impact'), pos: (t, k) => t > 600 && k.view === 'sys' ? pG : null, r: 110 }, { id: 'cube', label: T('LICIACube'), pos: (t, k) => t > -900 && t < 900 && k.view !== 'dart' ? pC : null, r: 3 },
    { id: 'sun', label: T('Soleil'), far: true, pos: () => SUNP }, { id: 'earth', label: T('Terre (11 millions de km)'), far: true, pos: () => EARTHP }];
  const kit = createKit({
    title: T('DART · 26 septembre 2022'), kicker: T('Astéroïde double Didymos · à 11 millions de km de la Terre · 23 h 14 TU'), h1: T('DART : dévier un astéroïde'),
    intro: T('Pour la première fois, l’humanité essaie de déplacer un corps céleste. Une sonde d’une demi-tonne vise Dimorphos, une lune de 160 mètres qui tourne autour de l’astéroïde Didymos, et la percute à plus de 6 km par seconde. Ni l’un ni l’autre ne menaçait la Terre : c’est une répétition générale.'),
    warn: T('Distances, vitesses, calendrier de l’approche et changement d’orbite suivent les mesures publiées. Le relief des deux astéroïdes, le cône de débris et la queue de poussière sont une mise en scène d’après les images de DART, de LICIACube et de Hubble. Les deux orbites sont tracées circulaires.'),
    views: [{ id: 'dart', label: T('À bord de DART'), cam: { mode: 'look', fov: 30, yaw: 0, pitch: 0 } }, { id: 'near', label: T('Près de Dimorphos'), cam: { mode: 'orbit', dist: 900, min: 130, max: 4e5, pitch: 0.25, yaw: 2.2, fov: 45 } }, { id: 'sys', label: T('Le système double'), cam: { mode: 'orbit', dist: 5200, min: 600, max: 2e8, pitch: 0.75, yaw: 0.6, fov: 45 } }],
    t0: -4 * HOUR, t1: 30 * DAYS, tStart: -4 * HOUR, speed0: 600, speedRange: [0.05, 2 * DAYS], speeds: [0.1, 1, 10, 60, 600, HOUR, 6 * HOUR, DAYS, 2 * DAYS],
    prog: (t) => t < 0 ? 0.35 * (1 - Math.log(1 - t) / Math.log(1 + 4 * HOUR)) : 0.35 + 0.65 * Math.log(1 + t) / Math.log(1 + 30 * DAYS),
    autoRate: (t) => t < -6 ? clamp(-t * 0.22, 1, 1500) : t < 4 ? 0.4 : t < 400 ? clamp(1 + (t - 4) * 0.25, 1, 40) : Math.min(0.5 * DAYS, t * 0.18),
    moments: [{ label: T('Pilotage automatique (T − 4 h)'), t: -4 * HOUR, view: 'dart' }, { label: T('Dimorphos apparaît (T − 1 h)'), t: -HOUR, view: 'dart' }, { label: T('Les deux astéroïdes dans le champ'), t: -150, view: 'dart' }, { label: T('Les dix dernières secondes'), t: -10, view: 'dart' },
      { label: T('L’impact, vu de côté'), t: -3, view: 'near', cam: { dist: 900, yaw: 2.2, pitch: 0.25 } }, { label: T('Le cône de débris'), t: 150, view: 'near', cam: { dist: 6000, yaw: 2.2, pitch: 0.25 } }, { label: T('Une nouvelle orbite'), t: 3 * DAYS, view: 'sys', cam: { dist: 5200, pitch: 0.9 } }, { label: T('La queue de poussière'), t: 6 * DAYS, view: 'sys', cam: { dist: 6e6, pitch: 0.5 } }],
    journal: [
      { t: -4 * HOUR, title: T('Seul aux commandes'), text: T('À 11 millions de km, un ordre envoyé de la Terre mettrait 36 secondes à arriver : trop long. Quatre heures avant l’impact, DART passe en pilotage automatique. Sa caméra ne distingue encore qu’un point, Didymos.') },
      { t: -HOUR, title: T('La cible apparaît'), text: T('Une heure avant l’impact, à 22 000 km, la caméra détecte enfin Dimorphos. Vingt minutes avant, DART se verrouille sur elle et cesse de viser Didymos.') },
      { t: -150, title: T('Deux mondes'), text: T('À deux minutes et demie de la fin, Didymos et Dimorphos tiennent pour la dernière fois dans la même image. DART franchit en un cinquième de seconde la distance qui les sépare.') },
      { t: -12, title: T('Un tas de gravats'), text: T('La surface se révèle : pas de roche lisse, mais un amas de blocs. Dimorphos est un tas de gravats à peine tenu par sa propre gravité. La dernière image complète est prise à 12 km, deux secondes avant le choc.') },
      { t: 0, title: T('L’impact'), text: T('Une demi-tonne lancée à 22 000 km/h frappe presque de face, contre le sens de l’orbite. L’énergie est celle d’environ trois tonnes de TNT. Pour un astéroïde de plusieurs millions de tonnes, c’est une pichenette.') },
      { t: 120, title: T('Le témoin'), text: T('Moins de trois minutes plus tard, le petit satellite italien LICIACube passe à 57 km et photographie un cône de débris qui s’ouvre en éventail : plus de mille tonnes de roche éjectées.') },
      { t: 1.5 * DAYS, title: T('Une queue de comète'), text: T('La lumière du Soleil repousse les poussières les plus fines. En quelques jours, la traînée dépasse 10 000 km ; elle atteindra au moins 30 000 km.') },
      { t: 4 * DAYS, title: T('Le verdict'), text: T('Il fallait un changement d’au moins 73 secondes pour parler de succès ; le choc seul, sans débris, en aurait donné environ sept minutes. Les télescopes en mesurent 33. Les débris projetés vers l’arrière ont poussé l’astéroïde bien plus que la sonde elle-même, comme le recul d’un canon.') },
      { t: 14 * DAYS, title: T('Ce que ça change'), text: T('Seule l’orbite de Dimorphos autour de Didymos a changé, pas la route du couple autour du Soleil. Mais un corps céleste a été déplacé de façon mesurable, et la méthode fonctionne mieux que prévu. La mission européenne Hera, partie en 2024, doit ausculter le cratère sur place.') },
    ],
    pois: POIS,
    clock: (t) => [(t < 0 ? TF('T − {0}', [fmtDur(-t)]) : TF('T + {0}', [fmtDur(t)])), t < 0 ? T('avant l’impact') : T('après l’impact')],
    data: (t, k) => {
      if (t < 0) { const d = -t * V; return TF('DART : à <b>{0}</b> de Dimorphos · 6,1 km/s', [fmtDist(d / 1000)]) + '<br>' + T('Dimorphos : 160 m, à 1,2 km de Didymos (780 m) · un tour en 11 h 55 min') + (k.view === 'dart' ? '<br>' + TF('Champ de la caméra : {0}° (la vraie : 0,29°)', [fr(fovNow, fovNow < 3 ? 2 : 0)]) : ''); }
      const lead = t * (1 - P1 / P0);
      return T('Dimorphos : un tour en <b>11 h 22 min</b>, 33 minutes de moins · vitesse réduite de 2,7 mm/s') + '<br>' + TF('Avance sur l’ancienne orbite : <b>{0}</b>', [fmtDur(lead)]) + ' · ' + TF('orbite resserrée de {0} m', [fr(A0 - A1, 0)])
        + (t > DAYS ? '<br>' + T('Débris : plus de 1 000 tonnes · queue de poussière de plus de 10 000 km') : '');
    },
    distLabel: (d) => fmtDist(d / 1000), bloom: [0.35, 0.5, 0.9], exposure: 1.05,
    onView: (id, k) => { if (id === 'dart') k.setFocus(POIS[0]); else k.cam.target.copy(id === 'near' ? pD : O); },
    onJump: (m, k) => { switched = false; },
    update(t, dt, k) {
      time += dt; dimPos(t, pD); ghostPos(t, pG); dartPos(t, pS); cubePos(t, pC);
      dim.position.copy(pD); dim.rotation.y = -Math.atan2(pD.z, pD.x); did.rotation.y = 2 * Math.PI * t / (2.26 * HOUR);
      craft.visible = t < 0 && k.view !== 'dart'; craft.position.copy(pS); cube.visible = t > -900 && t < 900; cube.position.copy(pC);
      ghost.visible = t > 600 && k.view === 'sys'; ghost.position.copy(pG); orbNew.visible = t > 0; orbits.visible = k.view === 'sys';
      const e = ej.material.uniforms; e.uT.value = Math.max(t, 0); ej.visible = t > 0; flash.visible = t > -0.02 && t < 6; flash.position.copy(IMP); flash.material.opacity = t < 0 ? 1 : Math.exp(-t / 1.2);
      if (k.view === 'dart') {
        if (t >= 0) { if (!switched) { switched = true; k.setView('near'); k.cam.dist = 900; k.cam.yaw = 2.2; k.cam.pitch = 0.25; } return; }
        const range = pS.distanceTo(pD), lock = sstep(-1200, -150, t); fovNow = clamp(2 * Math.atan(lerp(2300, 240, lock) / range) * 180 / Math.PI, 0.29, 75);
        k.cam.fov = fovNow; k.cam.pos.copy(pS); k.cam.near = Math.max(0.5, (range - 3000) * 0.4); k.cam.far = range + 2e5; flash.scale.setScalar(1);
      } else {
        if (!k.focusId) k.cam.target.copy(k.view === 'near' ? pD : O); k.cam.near = Math.max(0.5, k.cam.dist * 0.01); k.cam.far = Math.max(1e6, k.cam.dist * 40);
      }
    },
    post(t, k) {
      const cp = k.camera.position, th = Math.tan(k.camera.fov * Math.PI / 360);
      for (const [g, p, R, s] of [[gDim, pD, 80, 0.012], [gDid, O, 390, 0.016], [gCraft, pS, 5, 0.006], [gCube, pC, 1, 0.006]]) { const d = cp.distanceTo(p), ang = R / d; g.position.copy(p); g.scale.setScalar(d * s * th * 2.2); g.material.opacity = clamp(1.5 - ang / (s * th * 0.3), 0, 1) * (g === gCraft ? (t < 0 && k.view !== 'dart' ? 1 : 0) : g === gCube ? (t > -900 && t < 900 ? 1 : 0) : 1); g.visible = g.material.opacity > 0.01; }
      flash.scale.setScalar(Math.max(260, cp.distanceTo(IMP) * 0.25 * th) * (t < 0 ? 0.2 : 1)); ej.material.uniforms.uPx.value = k.renderer.getPixelRatio() * (k.view === 'dart' ? 1 : 1.6);
      ghost.scale.setScalar(cp.distanceTo(pG) * 0.02 * th * 2.2);
    },
  });
  const S = kit.scene, r = rng(2022); kit.addSky(makeStars({ n: 7000, seed: 26, band: 0.4, bright: 1 }));
  const sunL = new THREE.DirectionalLight(0xfff4e6, 3.2); sunL.position.copy(SUN).multiplyScalar(1e5); S.add(sunL, new THREE.AmbientLight(0x8090b0, 0.035));
  // deux tas de gravats : forme bosselée + blocs posés dessus
  const bump = (g, amp, f, ridge) => { const p = g.attributes.position, v = new THREE.Vector3(), q = rng(7 + amp * 100 | 0), ph = [q() * 9, q() * 9, q() * 9, q() * 9, q() * 9, q() * 9];
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).normalize(); let n = 0; for (let o = 0; o < 4; o++) { const k = f * (1 << o); n += (Math.sin(v.x * k + ph[0] + o) * Math.sin(v.y * k * 1.3 + ph[1]) + Math.sin(v.z * k * 0.9 + ph[2] + o * 2) * Math.sin(v.x * k * 1.7 + ph[3])) / (1 << o); }
      const rr = 1 + amp * n + (ridge ? ridge * Math.exp(-Math.pow(v.y / 0.22, 2)) : 0); p.setXYZ(i, v.x * rr, v.y * rr, v.z * rr); } g.computeVertexNormals(); return g; };
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8f867b, roughness: 1, metalness: 0, flatShading: true });
  const rocks = (n, ax, smin, smax, seed) => { const q = rng(seed), im = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), rockMat, n), m = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    for (let i = 0; i < n; i++) { const u = q() * 2 - 1, a = q() * 6.2832, s = Math.sqrt(1 - u * u); p.set(s * Math.cos(a) * ax[0], u * ax[1], s * Math.sin(a) * ax[2]); const size = smin * Math.pow(smax / smin, Math.pow(q(), 3)); sc.set(size * (0.7 + q() * 0.6), size * (0.5 + q() * 0.5), size * (0.7 + q() * 0.6)); qt.setFromEuler(new THREE.Euler(q() * 6, q() * 6, q() * 6)); m.compose(p, qt, sc); im.setMatrixAt(i, m); col.setHSL(0.08, 0.06 + q() * 0.06, 0.38 + q() * 0.22); im.setColorAt(i, col); }
    return im; };
  const dim = new THREE.Group(); { const b = new THREE.Mesh(bump(new THREE.IcosahedronGeometry(1, 24), 0.035, 3.2), rockMat); b.scale.set(DIM[0], DIM[1], DIM[2]); dim.add(b, rocks(2600, DIM.map(x => x * 0.99), 0.5, 7.5, 11)); } S.add(dim);
  const did = new THREE.Group(); { const b = new THREE.Mesh(bump(new THREE.IcosahedronGeometry(1, 40), 0.028, 2.6, 0.07), rockMat); b.scale.set(390, 350, 390); did.add(b, rocks(1800, [392, 352, 392], 3, 26, 5)); } S.add(did);
  // la sonde : un cube et deux panneaux déroulables de 8,5 m
  const craft = new THREE.Group(); { const m = new THREE.MeshStandardMaterial({ color: 0xcfcab8, roughness: 0.5, metalness: 0.4 }), pm = new THREE.MeshStandardMaterial({ color: 0x24305e, roughness: 0.4, metalness: 0.5 });
    craft.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.9, 2.6), m)); for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.04, 2.4), pm); p.position.x = sx * 5.2; craft.add(p); } craft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), VH); } S.add(craft);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })); S.add(cube);
  const gDim = makeGlow(0xd8cfc0, 1, 1), gDid = makeGlow(0xe6ddcc, 1, 1), gCraft = makeGlow(0x9fd0ff, 1, 1), gCube = makeGlow(0xffd27a, 1, 1), ghost = makeGlow(0x6fe0ff, 1, 0.8), flash = makeGlow(0xfff2d8, 1, 1); S.add(gDim, gDid, gCraft, gCube, ghost, flash);
  // orbites avant / après
  const orbits = new THREE.Group(); S.add(orbits); const ring = (a, col, op) => { const pts = []; for (let j = 0; j <= 256; j++) pts.push(new THREE.Vector3(Math.cos(j / 128 * Math.PI) * a, 0, Math.sin(j / 128 * Math.PI) * a)); const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); orbits.add(l); return l; };
  ring(A0, 0x9aa4c0, 0.45); const orbNew = ring(A1, 0x6fe0ff, 0.85);
  // débris : un cône creux qui repart vers l'arrière, puis les poussières fines poussées par la lumière du Soleil
  const NE = 14000, dir = new Float32Array(NE * 3), par = new Float32Array(NE * 3), ax = VH.clone().negate(), e1 = new THREE.Vector3().crossVectors(ax, new THREE.Vector3(0, 1, 0)).normalize(), e2 = new THREE.Vector3().crossVectors(ax, e1);
  for (let i = 0; i < NE; i++) { const dust = i > NE * 0.55, az = r() * 6.2832 + (r() < 0.5 ? Math.round(r() * 7) * 0.9 : 0) * 0 + Math.sin(i * 0.37) * 0.25, th = dust ? Math.acos(r()) : (0.75 + 0.5 * Math.pow(r(), 0.6)) * (r() < 0.75 ? 1 : 0.5);
    tmp.copy(ax).multiplyScalar(Math.cos(th)).addScaledVector(e1, Math.sin(th) * Math.cos(az)).addScaledVector(e2, Math.sin(th) * Math.sin(az)); dir.set([tmp.x, tmp.y, tmp.z], i * 3);
    par.set([dust ? 0.05 * Math.pow(40, r()) : 0.3 * Math.pow(2500, Math.pow(r(), 1.6)), dust ? 1e-5 * Math.pow(70, r()) : 0, r()], i * 3); }
  const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(dir, 3)); eg.setAttribute('par', new THREE.BufferAttribute(par, 3));
  const ej = new THREE.Points(eg, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: { value: 0 }, uImp: { value: IMP }, uAnti: { value: SUN.clone().negate() }, uPx: { value: 1 } },
    vertexShader: 'attribute vec3 par;uniform float uT,uPx;uniform vec3 uImp,uAnti;varying float vA;void main(){vec3 p=uImp+position*par.x*uT+uAnti*.5*par.y*uT*uT;float sp=par.x*uT+1.;vA=(par.y>0.?.5*smoothstep(600.,7200.,uT):min(1.,pow(700./sp,.6)))*(.45+.55*par.z);vec4 mv=modelViewMatrix*vec4(p,1.);gl_PointSize=uPx*(1.2+1.6*par.z);gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'precision highp float;varying float vA;void main(){vec2 c=gl_PointCoord-.5;float a=smoothstep(.5,.1,length(c))*vA;gl_FragColor=vec4(vec3(.95,.88,.78)*a,a);}' })); ej.frustumCulled = false; S.add(ej);
  kit.run();
}
