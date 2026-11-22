// Bételgeuse en supernova : vue du ciel terrestre, et vue rapprochée de l'étoile.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, rng, YEAR, DAY, makeStars, makeGlow, skyBackdrop, makeGround, glowTexture } from './kit.js';
import { makeStar } from './bodies.js';
const R0 = 764 * 0.6957, AU = 149.6, TB = 1 * DAY, VEJ = 5000 * 86400 / 1e6;   // Gm ; percée du choc un jour après l'effondrement ; éjectas à 5 000 km/s (Gm par jour)
const mag = (t) => { const d = (t - TB) / DAY; if (d < 0) return 0.5; if (d < 8) return 0.5 - 10.5 * (1 - Math.exp(-d / 1.9)) / (1 - Math.exp(-8 / 1.9)); if (d < 100) return -10 + 0.5 * (d - 8) / 92; if (d < 120) return -9.5 + 2 * (d - 100) / 20; return -7.5 + 0.0098 * (d - 120); };
const teff = (t) => { const d = (t - TB) / DAY; if (d < 0) return 3600; if (d < 0.08) return lerp(3600, 60000, d / 0.08); if (d < 20) return 6000 + 54000 * Math.exp(-d / 1.6); if (d < 110) return 6000 - 600 * (d - 20) / 90; return Math.max(3200, 5400 - 12 * (d - 110)); };
// étoiles brillantes autour d'Orion : ascension droite (h, min), déclinaison (°, ′), magnitude, teinte
const CAT = [['Bételgeuse', 5, 55.2, 7, 24, 0.5, 0], ['Rigel', 5, 14.5, -8, -12, 0.13, 2], ['Bellatrix', 5, 25.1, 6, 21, 1.64, 2], ['Mintaka', 5, 32.0, 0, -18, 2.23, 2], ['Alnilam', 5, 36.2, -1, -12, 1.69, 2], ['Alnitak', 5, 40.8, -1, -57, 1.77, 2], ['Saiph', 5, 47.8, -9, -40, 2.09, 2], ['Meissa', 5, 35.1, 9, 56, 3.5, 2],
  ['Sirius', 6, 45.1, -16, -43, -1.46, 2], ['Procyon', 7, 39.3, 5, 13, 0.34, 1], ['Aldébaran', 4, 35.9, 16, 31, 0.85, 0], ['Capella', 5, 16.7, 46, 0, 0.08, 1], ['Pollux', 7, 45.3, 28, 2, 1.14, 0], ['Castor', 7, 34.6, 31, 53, 1.58, 2], ['Elnath', 5, 26.3, 28, 36, 1.65, 2], ['Alhena', 6, 37.7, 16, 24, 1.9, 2],
  ['Alcyone', 3, 47.5, 24, 6, 2.9, 2], ['Mirzam', 6, 22.7, -17, -57, 2.0, 2], ['Adhara', 6, 58.6, -28, -58, 1.5, 2], ['Wezen', 7, 8.4, -26, -24, 1.8, 1], ['M42', 5, 35.3, -5, -23, 4.0, 3]];
const LINES = [[0, 2], [2, 3], [0, 5], [3, 4], [4, 5], [3, 1], [5, 6], [1, 6], [0, 7], [7, 2]];
const LAT = 45 * Math.PI / 180, LST = 5.75;
function dirOf(c, out) { const ra = c[1] + c[2] / 60, dec = (c[3] + c[4] / 60) * Math.PI / 180, H = (LST - ra) * 15 * Math.PI / 180;
  const alt = Math.asin(Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(LAT) * Math.cos(H)), az = Math.atan2(-Math.cos(dec) * Math.sin(H), Math.sin(dec) * Math.cos(LAT) - Math.cos(dec) * Math.sin(LAT) * Math.cos(H));
  return out.set(-Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az)); }
export function start() {
  const T0 = -3 * DAY, T1 = 1500 * YEAR, lt = (t) => Math.sign(t) * Math.log10(1 + Math.abs(t) / 3600), D = 900, bDir = dirOf(CAT[0], new THREE.Vector3());
  let time = 0, lastDist = 0;
  const radius = (t) => t < TB ? R0 : R0 + VEJ * (t - TB) / DAY;
  const kit = createKit({
    title: T('Bételgeuse en supernova'), kicker: T('Constellation d’Orion · à environ 700 années-lumière · un jour, d’ici 100 000 ans'), h1: T('La nuit où Bételgeuse explose'),
    intro: T('L’épaule d’Orion est une supergéante rouge en fin de vie. Quand son cœur s’effondrera, elle brillera pendant des mois autant qu’une demi-Lune, concentrée en un seul point : assez pour porter des ombres la nuit et se voir en plein jour. À cette distance, elle est sans danger.'),
    warn: T('La courbe de lumière est un modèle calé sur les estimations publiées : plateau de trois mois à l’éclat d’une demi-Lune, visible de jour environ un an, à l’œil nu plusieurs années. Délai de percée du choc, vitesse des éjectas et aspect du reste sont des ordres de grandeur. Positions des étoiles : valeurs de catalogue arrondies.'),
    views: [{ id: 'earth', label: T('Depuis la Terre'), cam: { mode: 'look', fov: 72, yaw: 0, pitch: 0.62 } }, { id: 'star', label: T('Près de l’étoile'), cam: { mode: 'orbit', dist: 1900, min: 40, max: 6e8, pitch: 0.25, yaw: 0.5, fov: 50 } }],
    options: [{ id: 'lines', label: T('Tracer Orion'), value: true }, { id: 'day', label: T('Voir en plein jour'), value: false }, { id: 'autocam', label: T('Caméra qui suit l’explosion (vue rapprochée)'), value: true }],
    onOpt: () => { lastDist = 0; }, onJump: () => { lastDist = 0; },
    t0: T0, t1: T1, tStart: -1.5 * DAY, speed0: 7200, speedRange: [10, 200 * YEAR], speeds: [60, 3600, 6 * 3600, DAY, 5 * DAY, 30 * DAY, YEAR, 20 * YEAR, 100 * YEAR],
    autoRate: (t) => t < -3600 ? 4 * 3600 : t < 600 ? 300 : t < TB - 1800 ? 3 * 3600 : t < TB + 3 * 3600 ? 600 : Math.max(2400, (t - TB) / 7),
    moments: [{ label: T('La veille'), t: -1.5 * DAY }, { label: T('L’effondrement du cœur'), t: -120 }, { label: T('Le choc perce la surface'), t: TB - 900 }, { label: T('Trois jours après'), t: TB + 3 * DAY }, { label: T('Un mois : le plateau'), t: TB + 30 * DAY, view: 'earth' }, { label: T('Quatre mois : la chute'), t: TB + 112 * DAY }, { label: T('Un an après'), t: TB + 365 * DAY }, { label: T('Quatre ans : elle quitte l’œil nu'), t: TB + 1450 * DAY, view: 'earth' }, { label: T('Mille ans : la nébuleuse'), t: 1000 * YEAR, view: 'star' }],
    prog: (t) => (lt(t) - lt(T0)) / (lt(T1) - lt(T0)),
    journal: [
      { t: T0, title: T('Une géante à bout de souffle'), text: T('Bételgeuse a moins de dix millions d’années et déjà plus de combustible. Elle est si enflée qu’à la place du Soleil elle engloberait Mars et la ceinture d’astéroïdes. Rien, en surface, n’annonce la suite.') },
      { t: 0, title: T('Le cœur cède'), text: T('Le cœur de fer, large comme la Terre, s’effondre en moins d’une seconde en une étoile à neutrons de vingt kilomètres. L’énergie part presque toute en neutrinos, qui traversent l’étoile sans s’arrêter. Vue de dehors, elle n’a pas changé.') },
      { t: 3 * 3600, title: T('L’alerte'), text: T('Sur Terre, les détecteurs de neutrinos sont saturés en quelques secondes. Les astronomes ont plusieurs heures, peut-être un jour, pour pointer leurs télescopes : l’onde de choc doit encore traverser toute l’enveloppe.') },
      { t: TB, title: T('La percée'), text: T('Le choc atteint la surface. Elle passe de 3 600 à des dizaines de milliers de degrés : un éclair d’ultraviolets, puis l’étoile enfle de plusieurs milliers de kilomètres par seconde.') },
      { t: TB + 4 * DAY, title: T('Une demi-Lune en un point'), text: T('En quelques jours, elle surpasse Sirius, puis Vénus, puis tout sauf la Lune. La nuit, elle porte des ombres nettes. Le jour, on la trouve sans chercher.') },
      { t: TB + 40 * DAY, title: T('Le plateau'), text: T('Pendant trois mois, l’éclat tient : l’hydrogène de l’enveloppe se recombine couche après couche et libère la chaleur du choc. Des milliards de gens voient la même étoile nouvelle.') },
      { t: TB + 125 * DAY, title: T('La cendre radioactive'), text: T('L’enveloppe est devenue transparente. Ce qui brille encore, c’est le cobalt radioactif forgé dans l’explosion, qui s’éteint de moitié tous les 77 jours.') },
      { t: TB + 3 * YEAR, title: T('Orion sans épaule'), text: T('Elle s’efface du ciel à l’œil nu au bout de quelques années. La constellation a changé de forme, pour la première fois depuis qu’on la dessine.') },
      { t: 300 * YEAR, title: T('Le reste'), text: T('Une coquille de gaz en expansion, riche en oxygène, silicium et fer tout neufs, qui ensemencera d’autres étoiles. Au centre, sans doute, une étoile à neutrons.') },
    ],
    clock: (t) => [(t < 0 ? TF('T − {0}', [fmtDur(Math.abs(t))]) : TF('T + {0}', [fmtDur(Math.abs(t))])), t < 0 ? T('avant l’effondrement du cœur') : T('après l’effondrement du cœur')],
    data: (t, k) => {
      const m = mag(t), venus = Math.pow(10, -0.4 * (m + 4.6)), R = radius(t);
      const cmp = m > 0.3 ? T('la 10ᵉ étoile du ciel') : m > -1.46 ? T('entre Rigel et Sirius') : m > -4.6 ? T('plus que Sirius') : m > -8 ? TF('<b>{0} fois</b> Vénus', [fr(venus, 0)]) : TF('<b>{0} fois</b> Vénus : l’éclat d’une demi-Lune', [fr(venus, 0)]);
      const lines = [m > 6 ? T('Éclat vu de la Terre : <b>invisible à l’œil nu</b>') : TF('Éclat vu de la Terre : {0}', [cmp]), TF('En plein jour : <b>{0}</b> · ombres la nuit : <b>{1}</b>', [m < -4 ? T('visible') : T('invisible'), m < -6.5 ? T('nettes') : m < -4 ? T('faibles') : T('aucune')])];
      lines.push(t < TB + 110 * DAY ? TF('Surface : <b>{0} K</b> · rayon : <b>{1} UA</b>', [fr(teff(t), 0), fr(R / AU, R / AU < 100 ? 1 : 0)]) : TF('Nuage de débris : <b>{0}</b> de rayon, à 5 000 km/s', [fmtDist(R * 1e6)]));
      return lines.join('<br>');
    },
    distLabel: (d) => fmtDist(d * 1e6), bloom: [0.5, 0.6, 0.95], exposure: 1,
    update(t, dt, k) {
      time += dt; const m = mag(t), T = teff(t), day = k.opt.day ? 1 : 0, onEarth = k.view === 'earth';
      const flux = Math.pow(10, -0.4 * (m + 10)), d = (t - TB) / DAY;       // 1 = demi-Lune
      const tc = T > 9000 ? [0.72, 0.82, 1] : T > 5200 ? [1, 0.95, 0.85] : T > 4200 ? [1, 0.75, 0.5] : [1, 0.5, 0.26];
      gE.visible = onEarth; gS.visible = !onEarth; sky.mesh.visible = onEarth; bg.material.uniforms.uB.value = onEarth ? 0.75 * (1 - day) : 0.9;
      if (onEarth) {
        k.cam.pos.set(0, 1.7, 0); k.cam.near = 0.2; k.cam.far = 5000;
        const vis = m < 6.5 ? 1 : 0, s = D * 0.0042 * Math.pow(10, -0.105 * Math.min(m, 3)) * (day ? 0.55 : 1);
        bet.visible = vis && (!day || m < -4); bet.scale.setScalar(s); bet.material.color.setRGB(...tc); bet.material.opacity = day ? clamp((-4 - m) / 3, 0, 1) : 1;
        halo.visible = bet.visible && m < -2; halo.scale.setScalar(s * 5); halo.material.color.setRGB(...tc); halo.material.opacity = clamp((-2 - m) / 8, 0, 1) * (day ? 0.25 : 0.5);
        cat.material.uniforms.uB.value = 1 - day; lines.visible = k.opt.lines && !day; lines.material.opacity = 0.22;
        const lit = Math.min(Math.pow(flux, 0.5), 1.15) * (m < -3 ? 1 : 0) * 0.62, gu = ground.u;
        gu.uSun.value.copy(day ? sunDir : bDir); gu.uSunCol.value.setRGB(day ? 1.3 : lit * tc[0], day ? 1.25 : lit * tc[1], day ? 1.15 : lit * tc[2]);
        const a = day ? 0.42 : 0.022 + 0.06 * lit; gu.uAmb.value.setRGB(a * 0.8, a * 0.9, a * 1.25); gu.uHaze.value.setRGB(day ? 0.62 : 0.012 + 0.03 * lit, day ? 0.74 : 0.014 + 0.035 * lit, day ? 0.9 : 0.024 + 0.05 * lit);
        sky.u.uDay.value = day; sky.u.uLit.value = lit; sky.u.uB.value.copy(bDir); sky.u.uSunD.value.copy(sunDir);
        const sh = day ? 0.5 : clamp(lit * 1.4, 0, 0.85); for (const s2 of shadows) { s2.material.opacity = sh; s2.visible = sh > 0.02; }
        treeMat.color.setRGB(0.002 + a * 0.12 + 0.02 * lit, 0.003 + a * 0.15 + 0.024 * lit, 0.003 + a * 0.12 + 0.02 * lit);
      } else {
        const R = radius(t), neb = sstep(60, 130, d), su = star.material.uniforms;
        star.visible = neb < 0.98; star.scale.setScalar(R); su.uT.value = T; su.uTime.value = time * (t < TB ? 0.5 : 2); su.uB.value = (0.95 + 3.5 * sstep(-0.02, 0.05, d) * Math.exp(-Math.max(d, 0) / 30)) * (1 - neb); su.uCells.value = t < TB ? 2.6 : 2.6 + 8 * sstep(0, 5, d); su.uContrast.value = t < TB ? 0.85 : 0.5; su.uOp.value = 1 - neb;
        const cd = k.camera.position.length(); sg.scale.setScalar(Math.max(R * (3.4 + 3 * Math.exp(-Math.abs(d) * 4)), cd * 0.04)); sg.material.color.setRGB(...tc); sg.material.opacity = (0.22 + 0.6 * Math.exp(-Math.abs(d - 0.05) * 6)) * (1 - 0.8 * neb);
        shell.visible = neb > 0.01; shell.scale.setScalar(R); shell.material.uniforms.uOp.value = neb * (0.9 - 0.4 * sstep(1, 1500, t / YEAR)); shell.material.uniforms.uT.value = time;
        ns.visible = neb > 0.5; ns.scale.setScalar(cd * 0.02);
        for (const o of orbits) o.visible = t < TB + 40 * DAY;
        k.cam.target.set(0, 0, 0);
        if (k.opt.autocam) {
          if (lastDist && Math.abs(k.cam.dist - lastDist) > 1e-6 * lastDist) { k.opt.autocam = false; const e = document.querySelector('[data-opt="autocam"]'); if (e) e.checked = false; }
          else { const want = Math.max(1900, 3.4 * R); k.cam.dist = dt > 0 ? lerp(k.cam.dist, want, Math.min(1, dt * 3)) : want; lastDist = k.cam.dist; }
        } else lastDist = 0;
      }
    },
    post: (t, k) => sky.sync(k.camera),
  });
  const S = kit.scene, r = rng(42), gE = new THREE.Group(), gS = new THREE.Group(); S.add(gE, gS);
  const bg = kit.addSky(makeStars({ n: 5200, seed: 77, band: 0.4, bright: 0.75 }));
  const sunDir = new THREE.Vector3(0.55, 0.6, -0.58).normalize();
  // ---- ciel terrestre
  const sky = skyBackdrop('uniform float uDay,uLit;uniform vec3 uB,uSunD;', `float h=d.y;vec3 night=mix(vec3(.006,.008,.016),vec3(.0015,.002,.005),clamp(h,0.,1.));
  night+=vec3(.5,.6,.9)*uLit*(.06+.25*pow(max(dot(d,uB),0.),6.))*smoothstep(-.05,.2,h);
  vec3 dayc=mix(vec3(.62,.76,.94),vec3(.16,.36,.78),pow(clamp(h,0.,1.),.5))+vec3(1.,.95,.85)*(pow(max(dot(d,uSunD),0.),900.)*8.+pow(max(dot(d,uSunD),0.),30.)*.25);
  col=mix(night,dayc,uDay);if(h<0.)col=mix(col,mix(vec3(.012,.014,.024),vec3(.62,.74,.9),uDay),smoothstep(0.,-.02,h));`,
    { uDay: { value: 0 }, uLit: { value: 0 }, uB: { value: new THREE.Vector3() }, uSunD: { value: new THREE.Vector3() } }); S.add(sky.mesh);
  const cp = [], cc = [], cs = [], v = new THREE.Vector3(), tints = [[1, 0.6, 0.35], [1, 0.95, 0.8], [0.8, 0.88, 1], [1, 0.6, 0.75]];
  CAT.forEach((c, i) => { if (i === 0) return; dirOf(c, v).multiplyScalar(D); cp.push(v.x, v.y, v.z); cc.push(...tints[c[6]]); cs.push(clamp(7.5 - 1.7 * c[5], 2, 11)); });
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3)); cg.setAttribute('size', new THREE.Float32BufferAttribute(cs, 1));
  const cat = new THREE.Points(cg, new THREE.ShaderMaterial({ uniforms: { uB: { value: 1 }, uTex: { value: glowTexture() } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'attribute float size;attribute vec3 color;varying vec3 vC;void main(){vC=color;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_PointSize=size*2.2;}',
    fragmentShader: 'uniform sampler2D uTex;uniform float uB;varying vec3 vC;void main(){gl_FragColor=vec4(vC*texture2D(uTex,gl_PointCoord).a*uB*1.6,1.);}' })); gE.add(cat);
  const lp = []; for (const [a, b] of LINES) { dirOf(CAT[a], v).multiplyScalar(D); lp.push(v.x, v.y, v.z); dirOf(CAT[b], v).multiplyScalar(D); lp.push(v.x, v.y, v.z); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x9fb4e0, transparent: true, opacity: 0.22, depthWrite: false })); gE.add(lines);
  const bet = makeGlow(0xffffff, 1, 1), halo = makeGlow(0xffffff, 1, 0.5); bet.position.copy(bDir).multiplyScalar(D); halo.position.copy(bet.position); gE.add(halo, bet);
  const ground = makeGround({ a: 0x8a8f96, b: 0x6c7078, scale: 1, fade: 0.0022 }); ground.setSize(1400); ground.u.uSnow.value = 1; ground.u.uCamL.value.set(0, 1.7, 0); gE.add(ground.mesh);
  // sapins et leurs ombres, portées à l'opposé de Bételgeuse
  const treeMat = new THREE.MeshBasicMaterial({ color: 0x060809 }), shMat = () => new THREE.MeshBasicMaterial({ color: 0x000208, transparent: true, opacity: 0, depthWrite: false, map: glowTexture() }), shadows = [];
  const away = new THREE.Vector3(-bDir.x, 0, -bDir.z).normalize(), stretch = 1 / Math.tan(Math.asin(bDir.y));
  for (let i = 0; i < 46; i++) { const a = r() * 6.283, dist = 9 + r() * r() * 120, x = Math.cos(a) * dist, z = Math.sin(a) * dist; if (z < -4 && Math.abs(x) < 9 + -z * 0.45) continue; const h = 5 + r() * 9;
    for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(new THREE.ConeGeometry(h * (0.3 - j * 0.065), h * 0.5, 7), treeMat); c.position.set(x, h * (0.3 + j * 0.25), z); gE.add(c); }
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shMat()); s.rotation.x = -Math.PI / 2; s.rotation.z = Math.atan2(away.x, away.z) + Math.PI; const L = h * stretch * 1.1; s.scale.set(h * 0.6, L, 1); s.position.set(x + away.x * L * 0.45, 0.06 + i * 0.002, z + away.z * L * 0.45); gE.add(s); shadows.push(s); }
  // ---- vue rapprochée
  const star = makeStar(1, { T: 3600, bright: 1.5, cells: 2.6, contrast: 0.85, transparent: true }); gS.add(star);
  const sg = makeGlow(0xff8a50, 1, 0.5); gS.add(sg);
  const circ = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 193 }, (_, i) => new THREE.Vector3(Math.cos(i / 192 * 6.28319), 0, Math.sin(i / 192 * 6.28319))));
  const orbits = [[1, 0x5b8fd8], [5.2, 0xd9b48a], [30, 0x6f8fe0]].map(([a, c]) => { const o = new THREE.Line(circ, new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.5 })); o.scale.setScalar(a * AU); gS.add(o); return o; });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80), new THREE.ShaderMaterial({ uniforms: { uOp: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vP;varying float vF;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.);vF=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float uOp,uT;varying vec3 vP;varying float vF;float h(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){float fil=pow(1.-abs(n3(vP*7.)*2.-1.),6.)+.6*pow(1.-abs(n3(vP*17.+5.)*2.-1.),8.);float rim=pow(1.-vF,3.);vec3 c=mix(vec3(1.,.42,.16),vec3(.3,.75,.95),n3(vP*3.+9.));gl_FragColor=vec4((c*fil*1.1+vec3(.9,.3,.2)*rim*.5)*uOp,1.);}` })); shell.visible = false; gS.add(shell);
  const ns = makeGlow(0xbfd4ff, 1, 1); ns.visible = false; gS.add(ns);
  kit.run();
}
