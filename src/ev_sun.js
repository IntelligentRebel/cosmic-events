// La mort du Soleil : de l'étoile d'aujourd'hui à la géante rouge, puis à la naine blanche.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, YEAR, makeStars, makeGlow, skyBackdrop, makeGround } from './kit.js';
import { makeStar } from './bodies.js';
const G = 1e9 * YEAR, RS = 0.6957, AU = 149.6, T_MS = 5.42, T_TIP = 7.59, T_HB = 7.5905, T_AGB0 = 7.70, T_AGB = 7.72, T_WD = 7.7201, T_END = 8.1;
const pl = (a, b, k) => a * Math.pow(b / a, k);
// Jalons de Schröder et Smith (2008) ; entre deux jalons, interpolation.
function sun(g) {
  if (g < 2.55) { const k = g / 2.55; return { L: lerp(1, 1.26, k), R: lerp(1, 1.11, k), T: lerp(5774, 5820, k), M: 1, ph: T('séquence principale') }; }
  if (g < T_MS) { const k = (g - 2.55) / (T_MS - 2.55); return { L: lerp(1.26, 1.84, k), R: lerp(1.11, 1.37, k), T: lerp(5820, 5751, k), M: 1, ph: T('séquence principale') }; }
  if (g < T_TIP) { const s = (g - T_MS) / (T_TIP - T_MS), e = Math.pow(s, 7); return { L: pl(1.84, 2730, e), R: pl(1.37, 256, e), T: pl(5751, 2602, 0.3 * Math.min(1, s * 3) + 0.7 * e), M: 1 - 0.332 * Math.pow(e, 1.5), ph: s < 0.5 ? T('sous-géante') : T('géante rouge') }; }
  if (g < T_HB) { const k = sstep(T_TIP, T_HB, g); return { L: pl(2730, 53.7, k), R: pl(256, 11.2, k), T: lerp(2602, 4667, k), M: 0.668, ph: T('flash de l’hélium') }; }
  if (g < T_AGB0) { const k = (g - T_HB) / (T_AGB0 - T_HB); return { L: lerp(53.7, 95, k), R: lerp(11.2, 19, k), T: lerp(4667, 4500, k), M: 0.668, ph: T('fusion de l’hélium') }; }
  if (g < T_AGB) { const s = (g - T_AGB0) / (T_AGB - T_AGB0), e = s * s * s, pulse = Math.exp(-Math.pow((s - 0.97) / 0.02, 2)); return { L: pl(95, 2090, e) * (1 + pulse), R: pl(19, 149, e) * (1 + 0.2 * pulse), T: lerp(4500, 3200, e) + 267 * pulse, M: lerp(0.668, 0.544, e), ph: T('seconde géante rouge') }; }
  if (g < T_WD) { const k = (g - T_AGB) / (T_WD - T_AGB); return { L: pl(2090, 300, k), R: pl(149, 0.03, Math.pow(k, 0.6)), T: pl(3200, 110000, Math.pow(k, 0.6)), M: 0.54, ph: T('éjection de l’enveloppe') }; }
  const k = clamp((g - T_WD) / (T_END - T_WD), 0, 1); return { L: pl(300, 0.02, Math.pow(k, 0.3)), R: 0.0127, T: pl(110000, 15000, Math.pow(k, 0.5)), M: 0.54, ph: T('naine blanche') };
}
const bbRGB = (T) => { const t = clamp(T, 1000, 40000) / 100; return [t <= 66 ? 1 : clamp(1.292936 * Math.pow(t - 60, -0.1332), 0, 1), t <= 66 ? clamp(0.39008 * Math.log(t) - 0.63184, 0, 1) : clamp(1.129891 * Math.pow(t - 60, -0.0755), 0, 1), t >= 66 ? 1 : t <= 19 ? 0 : clamp(0.54321 * Math.log(t - 10) - 1.19625, 0, 1)]; };
const PL = [{ n: 'Mercure', label: T('Mercure'), a: 0.387, c: 0x9a8f85 }, { n: 'Vénus', label: T('Vénus'), a: 0.723, c: 0xe6c78a }, { n: 'la Terre', label: T('Terre'), a: 1, c: 0x5b8fd8 }, { n: 'Mars', label: T('Mars'), a: 1.524, c: 0xc8623c }, { n: 'Jupiter', label: T('Jupiter'), a: 5.203, c: 0xd9b48a }];
const aOf = (p, g, s) => p.a / s.M * (p.n === 'la Terre' ? 1 - 0.27 * sstep(7.5875, 7.5897, g) : 1);
for (const p of PL) { p.tE = Infinity; for (let g = 7; g < T_TIP; g += 2e-5) { const s = sun(g); if (s.R * RS / AU >= aOf(p, g, s)) { p.tE = g; break; } } }
const T_EARTH = PL[2].tE;
export function start() {
  const KEYS = [1.0, T_MS, 7.3, PL[0].tE, PL[1].tE, T_EARTH, T_TIP, T_HB, 7.65, T_AGB, T_WD, T_WD + 0.0003];
  const tmp = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0); let time = 0;
  const O = new THREE.Vector3();
  const kit = createKit({
    title: T('La mort du Soleil'), kicker: T('D’aujourd’hui à dans huit milliards d’années'), h1: T('La mort du Soleil'),
    intro: T('Le Soleil brûle son hydrogène depuis 4,6 milliards d’années et il lui en reste pour un peu plus de cinq. Avant cela, la Terre aura déjà perdu ses océans. Ensuite il enfle en géante rouge, 256 fois plus large qu’aujourd’hui, puis s’éteint en naine blanche.'),
    warn: T('Luminosité, rayon, température et masse suivent les jalons du modèle de Schröder et Smith (2008) ; entre deux jalons, la scène interpole. Le sort de la Terre est celui de ce modèle : engloutie de justesse. L’aspect du sol et du ciel est une mise en scène.'),
    views: [{ id: 'earth', label: T('Depuis la Terre'), cam: { mode: 'look', fov: 70, yaw: 0, pitch: 0.28 } }, { id: 'system', label: T('Le système solaire'), cam: { mode: 'orbit', dist: 620, min: 4, max: 2e5, pitch: 0.75, yaw: 0.4, fov: 50 } }],
    t0: 0, t1: T_END * G, tStart: 0, speed0: 5e7 * YEAR, speedRange: [100 * YEAR, 5e8 * YEAR], speeds: [1e3, 1e4, 1e5, 1e6, 1e7, 3e7, 1e8, 2.5e8, 5e8].map(x => x * YEAR),
    autoRate: (t) => { const g = t / G; let d = 9; for (const k of KEYS) d = Math.min(d, Math.abs(g - k) * (g < k ? 1 : 0.6)); return (g < 7.3 ? clamp(d / 2, 2e-4, 0.25) : clamp(d / 2, 2.5e-5, 0.02)) * G; },
    moments: [{ label: T('Aujourd’hui'), t: 0 }, { label: T('Dans 1 milliard d’années : les océans s’évaporent'), t: 1.05 * G }, { label: T('Dans 5,4 milliards : fin de l’hydrogène'), t: T_MS * G }, { label: T('La géante rouge enfle'), t: 7.5 * G }, { label: T('Mercure englouti'), t: (PL[0].tE - 2e-4) * G, view: 'system' },
      { label: T('Derniers instants de la Terre'), t: (T_EARTH - 6e-4) * G, view: 'earth' }, { label: T('Le sommet : 256 fois le Soleil'), t: (T_TIP - 1e-5) * G, view: 'system' }, { label: T('Après le flash de l’hélium'), t: 7.62 * G, view: 'system' }, { label: T('Seconde géante rouge'), t: (T_AGB - 2e-4) * G, view: 'system' }, { label: T('Nébuleuse et naine blanche'), t: (T_WD + 4e-5) * G, view: 'system', cam: { dist: 9000 } }],
    journal: [
      { t: 0, title: T('Une étoile stable'), text: T('Le Soleil gagne environ 1 % de luminosité tous les 100 millions d’années. C’est lent, mais suffisant pour condamner la Terre bien avant la fin de l’étoile.') },
      { t: 0.95 * G, title: T('La Terre sort de la zone habitable'), text: T('Dans environ un milliard d’années, le Soleil chauffe assez pour que la vapeur d’eau monte dans la haute atmosphère et s’échappe dans l’espace. Les océans disparaissent.') },
      { t: T_MS * G, title: T('Plus d’hydrogène au cœur'), text: T('Le cœur n’est plus que de l’hélium. Il se contracte, chauffe, et l’hydrogène brûle désormais dans une coquille autour de lui. L’étoile, paradoxalement, enfle.') },
      { t: 7.45 * G, title: T('Géante rouge'), text: T('La surface refroidit et rougit, mais elle est si vaste que l’étoile brille des centaines de fois plus. Elle perd sa matière en vent : un tiers de sa masse au total. Moins retenues, les planètes s’éloignent.') },
      { t: PL[0].tE * G, title: T('Mercure, puis Vénus'), text: T('La surface du Soleil atteint l’orbite de Mercure, puis celle de Vénus, pourtant élargies. Freinées par le gaz, les planètes spiralent et se dissolvent.') },
      { t: (T_EARTH - 4e-4) * G, title: T('La Terre'), text: T('L’orbite terrestre s’est élargie à 1,5 UA, ce qui aurait dû suffire. Mais la marée que la Terre soulève sur la géante la freine. Dans ce modèle, il lui aurait fallu partir de 1,15 UA pour survivre.') },
      { t: T_TIP * G, title: T('Flash de l’hélium'), text: T('Au sommet, 2 730 fois la luminosité actuelle. Le cœur atteint 100 millions de degrés et l’hélium s’allume d’un coup. L’étoile se dégonfle en quelques centaines de milliers d’années.') },
      { t: 7.6 * G, title: T('Cent millions d’années de répit'), text: T('Dix fois plus large qu’aujourd’hui, le Soleil brûle tranquillement son hélium en carbone et en oxygène. Mars et Jupiter, elles, sont toujours là.') },
      { t: (T_AGB - 1e-3) * G, title: T('Seconde enflure'), text: T('L’hélium s’épuise à son tour. L’étoile regonfle, pulse, et souffle ses couches externes dans l’espace.') },
      { t: T_WD * G, title: T('Naine blanche'), text: T('Il reste un cœur nu de carbone et d’oxygène : la moitié de la masse du Soleil dans le volume de la Terre, à 100 000 degrés. Il éclaire un moment le gaz éjecté, puis refroidit, sans fin. Nébuleuse brillante ou coquille à peine visible : le débat n’est pas tranché.') },
    ],
    pois: [{ id: 'sun', label: T('Soleil'), pos: () => O, r: (t) => Math.max(sun(t / G).R * RS, 20) }, ...PL.map(p => ({ id: p.n, label: p.label, pos: (t, k) => t / G < p.tE && p.m.visible && !(k.view === 'earth' && p.n === 'la Terre') ? p.m.position : null, r: 6 }))],
    clock: (t) => [t < 1e6 * YEAR ? T('Aujourd’hui') : TF('Dans {0}', [fmtDur(t)]), TF('âge du Soleil : {0} milliards d’années', [fr(4.58 + t / G, 2)])],
    data: (t) => {
      const g = t / G, s = sun(g), E = PL[2], aE = aOf(E, g, s), gone = g >= T_EARTH, teq = 255 * Math.pow(s.L / (aE * aE), 0.25), ang = 2 * Math.asin(Math.min(1, s.R * RS / (aE * AU))) * 180 / Math.PI;
      return TF('Phase : <b>{0}</b>', [s.ph]) + '<br>' + TF('Luminosité : <b>{0}</b> fois l’actuelle · rayon : <b>{1}</b> fois ({2} UA)', [fr(s.L, s.L < 10 ? 2 : 0), fr(s.R, s.R < 10 ? 2 : 0), fr(s.R * RS / AU, 2)]) + '<br>' + TF('Surface : {0} K · masse : {1} %', [fr(s.T, 0), fr(s.M * 100, 0)]) + '<br>' +
        (gone ? T('Terre : engloutie') : TF('Terre : orbite à {0} UA, équilibre thermique <b>{1} °C</b> (hors effet de serre)', [fr(aE, 2), fr(teq - 273, 0)]) + '<br>' + TF('Soleil dans le ciel : <b>{0}°</b> de large (aujourd’hui 0,53°)', [fr(ang, ang < 10 ? 2 : 0)]));
    },
    distLabel: (d) => fmtDist(d * 1e6), bloom: [0.55, 0.6, 0.95], exposure: 1,
    update(t, dt, k) {
      time += dt; const g = t / G, s = sun(g), R = s.R * RS, [cr, cg, cb] = bbRGB(s.T);
      if (k.view === 'earth' && g >= T_EARTH) k.setView('system', true);
      const onEarth = k.view === 'earth', aE = aOf(PL[2], g, s) * AU;
      star.scale.setScalar(R); occ.scale.setScalar(R * 0.985); occ.visible = !onEarth; const su = star.material.uniforms; su.uT.value = s.T; su.uTime.value = time * 0.6; su.uCells.value = clamp(60 / Math.pow(s.R, 0.55), 2.2, 26); su.uContrast.value = 0.3 + 0.5 * sstep(3, 100, s.R); su.uB.value = (onEarth ? 1.25 : 1.15) * (s.T < 4600 ? 0.8 : 1);
      const cd = k.camera.position.length(); glow.scale.setScalar(Math.max(R * 4.5, onEarth ? aE * 0.09 * Math.sqrt(Math.min(s.L, 4)) : cd * 0.06)); glow.material.color.setRGB(cr, cg, cb); glow.material.opacity = onEarth ? 0.4 : 0.3;
      // planètes, orbites, zone habitable
      for (const p of PL) { const a = aOf(p, g, s) * AU, alive = g < p.tE; p.ring.visible = alive && !onEarth; p.ring.scale.setScalar(a); p.ang += dt * 0.5 / Math.pow(p.a, 1.5);
        p.m.visible = alive && !(onEarth && p.n === 'la Terre');
        if (p.m.visible) { const cp = k.camera.position, dP = tmp.set(Math.cos(p.ang) * a, 0, Math.sin(p.ang) * a).sub(cp), dist = dP.length(), dS = cp.length(), cosA = -dP.dot(cp) / (dist * dS + 1e-9), sep = Math.acos(clamp(cosA, -1, 1)), rS = Math.asin(Math.min(1, Math.max(R, onEarth ? 0 : dS * 0.006) / dS)); if (dist > dS && sep < rS) p.m.visible = false; } p.m.position.set(Math.cos(p.ang) * a, 0, Math.sin(p.ang) * a); p.m.scale.setScalar(onEarth ? 0.4 : Math.max(0.012 * cd, 0.05));
        const burn = alive ? sstep(a * 0.75, a * 0.98, R) : 0; p.m.material.color.set(p.c).lerp(hot, burn);
        const age = g - p.tE; p.fl.visible = !onEarth && age > 0 && age < 3e-4; if (p.fl.visible) { p.fl.position.copy(p.m.position); p.fl.scale.setScalar(cd * 0.12 * Math.exp(-age / 1e-4)); } }
      if (onEarth) PL[2].ang = 0;
      hz.visible = !onEarth && g < T_AGB; hz.scale.setScalar(Math.sqrt(s.L) * AU);
      // nébuleuse et naine blanche
      const pn = g - T_AGB; neb.visible = pn > 0; if (neb.visible) { const rad = 180 * RS + pn * 1e9 * YEAR * 20 / 1e6; neb.scale.setScalar(rad); neb.material.uniforms.uOp.value = clamp(pn / 2e-5, 0, 1) * Math.exp(-pn / 2.5e-4) * (0.35 + 0.65 * sstep(T_AGB + 6e-5, T_WD, g)); neb.material.uniforms.uT.value = time; }
      // vue depuis la Terre
      ground.mesh.visible = sky.mesh.visible = onEarth; stars.material.uniforms.uB.value = onEarth ? 0 : 0.9;
      if (onEarth) {
        const E = tmp.set(aE, 0, 0), up = new THREE.Vector3(-Math.sin(0.34), Math.cos(0.34), 0), fw = new THREE.Vector3(-Math.cos(0.34), -Math.sin(0.34), 0), right = new THREE.Vector3().crossVectors(fw, up);
        fq.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, fw.clone().negate()));
        k.cam.basis.copy(fq); k.cam.pos.copy(E).addScaledVector(up, 2.2e-9); k.cam.near = 4e-10; k.cam.far = 5000; ground.mesh.position.copy(E); ground.mesh.quaternion.copy(fq);
        const teq = 255 * Math.pow(s.L / Math.pow(aE / AU, 2), 0.25), sl = new THREE.Vector3(0, Math.sin(0.34), -Math.cos(0.34));
        const wet = 1 - sstep(0.9, 1.6, g), life = 1 - sstep(0.5, 1.05, g), atm = 0.12 + 0.88 * (1 - sstep(1.2, 6.5, g)), steam = sstep(0.9, 1.3, g) * (1 - sstep(1.6, 2.6, g)), lava = sstep(1050, 1750, teq);
        const gu = ground.u; gu.uSun.value.copy(sl); gu.uTime.value = time; gu.uWater.value = 0.5 * wet; gu.uLava.value = lava;
        const I = Math.min(Math.pow(s.L / Math.pow(aE / AU, 2), 0.35), 3.2); gu.uSunCol.value.setRGB(1.5 * I * cr, 1.5 * I * cg, 1.5 * I * cb);
        gu.uA.value.setRGB(lerp(0.42, 0.3, life), lerp(0.3, 0.42, life), lerp(0.2, 0.16, life)); gu.uB.value.setRGB(lerp(0.3, 0.2, life), lerp(0.2, 0.26, life), lerp(0.15, 0.1, life));
        const skyc = [lerp(0.02, lerp(0.28, 0.75, steam), atm) * (0.6 + 0.4 * cr), lerp(0.02, lerp(0.5, 0.75, steam), atm) * (0.5 + 0.5 * cg), lerp(0.03, lerp(0.9, 0.78, steam), atm) * (0.35 + 0.65 * cb)];
        gu.uHaze.value.setRGB(skyc[0] * 0.9 + 0.5 * lava, skyc[1] * 0.9 + 0.12 * lava, skyc[2] * 0.9); gu.uAmb.value.setRGB(skyc[0] * 0.45, skyc[1] * 0.45, skyc[2] * 0.45); gu.uWaterCol.value.setRGB(0.05, 0.14, 0.24);
        sky.u.uCol.value.setRGB(...skyc); sky.u.uUp.value.copy(up); sky.u.uAtm.value = atm; sky.u.uSunD.value.set(-1, 0, 0); sky.u.uSunC.value.setRGB(cr, cg, cb); sky.u.uGl.value = Math.min(I, 2.5); sky.u.uLava.value = lava;
      } else k.cam.target.set(0, 0, 0);
    },
    post: (t, k) => sky.sync(k.camera),
  });
  const S = kit.scene, fq = new THREE.Quaternion(), hot = new THREE.Color(0xff5a20);
  const stars = kit.addSky(makeStars({ n: 6500, seed: 4, band: 0.45, bright: 0.9 }));
  const star = makeStar(1, { T: 5774, bright: 1.7, cells: 26, contrast: 0.3 }); S.add(star);
  const glow = makeGlow(0xffffff, 1, 0.5); S.add(glow);
  // sphère invisible qui n'écrit que la profondeur : orbites et planètes passent derrière le Soleil au lieu d'être dessinées par-dessus
  const occ = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), new THREE.MeshBasicMaterial({ colorWrite: false })); occ.renderOrder = -5; S.add(occ);
  const cg = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 257 }, (_, i) => new THREE.Vector3(Math.cos(i / 256 * 6.28319), 0, Math.sin(i / 256 * 6.28319))));
  PL.forEach((p, i) => { p.ring = new THREE.Line(cg, new THREE.LineBasicMaterial({ color: p.c, transparent: true, opacity: 0.55 })); p.m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: p.c })); p.fl = makeGlow(0xffa050, 1, 1); p.fl.visible = false; p.ang = 0.7 + i * 1.9; S.add(p.ring, p.m, p.fl); });
  const hz = new THREE.Mesh(new THREE.RingGeometry(0.95, 1.37, 128), new THREE.MeshBasicMaterial({ color: 0x3fae6a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); hz.rotation.x = -Math.PI / 2; S.add(hz);
  const neb = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms: { uOp: { value: 0 }, uT: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vP;varying float vF;void main(){vP=position;vec4 mv=modelViewMatrix*vec4(position,1.);vF=abs(dot(normalize(normalMatrix*normal),normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
    fragmentShader: `uniform float uOp,uT;varying vec3 vP;varying float vF;float h(vec3 p){return fract(sin(dot(p,vec3(12.9,78.2,37.7)))*43758.5);}float n3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
void main(){float rim=pow(1.-vF,2.5);float fil=n3(vP*5.)*n3(vP*13.+3.);vec3 c=mix(vec3(.15,.75,.6),vec3(.9,.25,.2),rim);gl_FragColor=vec4(c*(rim*.9+fil*.8)*uOp,1.);}` })); neb.visible = false; S.add(neb);
  const ground = makeGround({ scale: 1e9, fade: 0.00016 }); ground.setSize(8e-5); ground.u.uCamL.value.set(0, 2.2e-9, 0); S.add(ground.mesh);
  const sky = skyBackdrop('uniform vec3 uCol,uUp,uSunD,uSunC;uniform float uAtm,uGl,uLava;', `float h=dot(d,uUp);float sd=max(dot(d,uSunD),0.);
  vec3 a=mix(uCol*1.15+vec3(.25,.2,.15)*uAtm,uCol*.55,pow(clamp(h,0.,1.),.5));a+=uSunC*uGl*uAtm*(pow(sd,6.)*.35+pow(sd,60.)*.6);
  vec3 sp=skyStars(d,normalize(vec3(.45,.35,.82)),.8)*(1.-uAtm)*.6;col=a+sp+vec3(.5,.1,.02)*uLava*exp(-max(h,0.)*5.);
  if(h<0.)col=mix(col,uCol*.9+vec3(.5,.12,0.)*uLava,smoothstep(0.,-.03,h));`,
    { uCol: { value: new THREE.Color() }, uUp: { value: new THREE.Vector3(0, 1, 0) }, uSunD: { value: new THREE.Vector3() }, uSunC: { value: new THREE.Color() }, uAtm: { value: 1 }, uGl: { value: 1 }, uLava: { value: 0 } }); S.add(sky.mesh);
  kit.run();
}
