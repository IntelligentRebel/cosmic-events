import { T, TF, I18N, DEC } from './i18n.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NMF, THEIA, EARTH, HALO, MOON, DISK, DEBRIS, DOME, GROUND } from './theia_gl.js';

const V3 = THREE.Vector3, DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const $ = id => document.getElementById(id);

// ---------------------------------------------------------------- physique (scénario canonique, Canup 2004)
const MU = 398600;            // G × (0,9 + 0,1 masse terrestre), km³/s²
const RE0 = 6150, RE1 = 6371; // proto-Terre, puis Terre après fusion
const RT = 3400;              // Theia : la taille de Mars
const RMOON = 1737, A_MOON0 = 24000, A_NOW = 384400;
const YEAR = 3.156e7, T_END = 4.5e9 * YEAR;
// trajectoire parabolique (vitesse nulle à l'infini), impact à 45° : péricentre q, contact à l'anomalie −90°
const Q_PERI = (RE0 + RT) / 2, P_SEMI = 2 * Q_PERI, K_B = Math.sqrt(P_SEMI ** 3 / MU), T_PERI = K_B * (1 + 1 / 3) / 2;
const V_DIR = new V3(Math.SQRT1_2, Math.SQRT1_2, 0), V_IMP = Math.sqrt(2 * MU / (RE0 + RT));
const C_DIR = new V3(0, -1, 0);                          // direction du point de contact, vue du centre de la Terre
const P_CONTACT = new V3(0, -(RE0 + RT), 0);
function theiaPos(t, out = new V3()) {
  if (t > 0) return out.copy(P_CONTACT).addScaledVector(V_DIR, V_IMP * 420 * (1 - Math.exp(-t / 420)));   // elle s'enfonce en freinant
  const A = 1.5 * 2 * (t - T_PERI) / K_B, B = Math.cbrt(A + Math.sqrt(A * A + 1)), D = B - 1 / B;          // équation de Barker
  return out.set(Q_PERI * (1 - D * D), 2 * Q_PERI * D, 0);
}
let T0 = -4.6e5;
{ let a = -2e6, b = -1e3; for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (theiaPos(m).length() > RT / Math.tan(0.26 * DEG)) a = m; else b = m; } T0 = Math.round(a / 600) * 600; }
const T1 = 21600;                                          // au-delà de 6 h, les orbites défilent en temps logarithmique
const tau = t => t <= T1 ? t : T1 * (1 + Math.log(t / T1));
const lgY = t => Math.log10(Math.max(t, 1) / YEAR);
const SUN = new V3(0, -0.5, 0.87).normalize();

function stage(t) {
  const lg = lgY(t), l10 = Math.log10(Math.max(t, 1)), p = t > 0;
  const s = {};
  s.shock = p ? Math.min(t * 8 / RE0, 3.4) : 0;
  s.heat = p ? (1.25 + 2.2 * Math.exp(-t / 2500)) * (1 - 0.55 * ss(-1, 3, lg)) : 0;
  s.raft = clamp(0.12 + 0.8 * ss(0, 5.5, lg), 0, 1.2);
  s.cool = p ? ss(3, 6.7, lg) : 0;
  s.water = p ? ss(7.3, 8.3, lg) : 0;
  s.life = p ? ss(9.48, 9.64, lg) : 0;
  s.vapor = p ? ss(0, 1800, t) * (1 - ss(1, 3.5, lg)) : 0;
  s.oblate = 1 - 0.11 * (p ? ss(1800, 14400, t) * (1 - ss(6, 9.6, lg)) : 0);
  s.rE = RE0 + (RE1 - RE0) * (p ? ss(0, 3600, t) : 0);
  s.disk = p ? ss(4.3, 5.4, l10) * (1 - ss(0, 2, lg)) : 0;
  s.circ = p ? ss(4.5, 5.7, l10) : 0;
  s.moonM = p ? Math.pow(ss(-1.25, 1.5, lg), 1.5) : 0;
  s.infall = p ? ss(-0.5, 2, lg) : 0;
  s.moonHot = 1 - ss(1.5, 7, lg);
  s.maria = ss(8.75, 9.15, lg);                                   // mers lunaires : de 0,6 à 1,4 milliard d'années après le choc
  s.mariaHot = p ? Math.min(1, 4 * s.maria * (1 - s.maria) + 0.16 * ss(8.75, 8.85, lg) * (1 - ss(9.50, 9.56, lg))) : 0;   // puis des éruptions de plus en plus rares
  s.aMoon = Math.max(A_MOON0, A_NOW * Math.pow(Math.max(t, 1) / T_END, 2 / 13));
  s.day = 24 / (1 + 5.07 * (1 - Math.sqrt(s.aMoon / A_NOW)));
  // marée lunaire : force en 1/d³, rapportée à aujourd'hui ; bourrelet d'équilibre (0,54 m aujourd'hui) ; éloignement tiré de la loi a ∝ t^(2/13)
  s.tide = s.moonM * Math.pow(A_NOW / s.aMoon, 3);
  s.tideH = 0.00054 * s.tide;                                                        // km
  s.recede = p && A_NOW * Math.pow(t / T_END, 2 / 13) > A_MOON0 ? (2 / 13) * s.aMoon / (t / YEAR) : 0;   // km par an
  s.thScale = p ? 1 - ss(500, 2400, t) : 1;
  s.thMelt = p ? ss(0, 420, t) : 0;
  s.flash = p ? 12 * Math.exp(-t / 120) + 1.3 * Math.exp(-t / 900) : 0;
  return s;
}

// ---------------------------------------------------------------- rendu
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const space = new THREE.Scene(); space.background = new THREE.Color(0x000003);
const local = new THREE.Scene();
const camS = new THREE.PerspectiveCamera(60, 1, 1, 6e7), camL = new THREE.PerspectiveCamera(60, 1, 0.1, 6e5);

const glowTex = (() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(cv);
})();
let stars = null;
const sprite = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.renderOrder = 6; space.add(s); return s; };
{
  const n = 6000, p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const v = new V3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(3e7); p.set([v.x, v.y, v.z], i * 3); const b = 0.25 + 0.9 * Math.random() ** 3; c.set([b, b, b * (0.85 + 0.3 * Math.random())], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false, depthTest: true, transparent: true })); stars.frustumCulled = false; stars.renderOrder = -2; space.add(stars);
}
const sun = sprite(); sun.position.copy(SUN).multiplyScalar(2.5e7); sun.scale.setScalar(2.5e7 * 0.05); sun.material.color.setRGB(40, 36, 30); sun.material.depthTest = false; sun.renderOrder = -1;

const mk = (sh, uniforms, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: sh.vertexShader, fragmentShader: sh.fragmentShader, ...extra });
const uE = { uTideDir: { value: new V3(1, 0, 0) }, uTideAmp: { value: 0 }, uSun: { value: SUN }, uC: { value: new V3(0, -1, 0) }, uShock: { value: 0 }, uHeat: { value: 0 }, uRaft: { value: 0 }, uCool: { value: 0 }, uWater: { value: 0 }, uLife: { value: 0 }, uFlow: { value: 0 }, uVapor: { value: 0 } };
const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128).rotateX(Math.PI / 2), mk(EARTH, uE)); space.add(earth);
const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mk(HALO, uE, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); halo.renderOrder = 2; space.add(halo);

const uT = { uSun: { value: SUN }, uSeed: { value: new V3() }, uColA: { value: new V3() }, uColB: { value: new V3() }, uColC: { value: new V3() }, uEarthDir: { value: new V3(1, 0, 0) },
  uMars: { value: 0 }, uCap: { value: 2 }, uCrat: { value: 1 }, uSea: { value: 0 }, uMelt: { value: 0 }, uEarthShine: { value: 0 }, uMF: { value: [] } };
{
  const ll = (la, lo) => new V3(Math.cos(la * DEG) * Math.cos(lo * DEG), Math.cos(la * DEG) * Math.sin(lo * DEG), Math.sin(la * DEG));
  uT.uMF.value = [[8, 69], [45, 330], [0, 0], [-25, 320], [-22, 140], [-32, 205], [-15, 105], [-42, 70], [-50, 318], [0, 250], [18.6, 226], [11, 256], [1, 247], [-9, 239], [-5, 268], [-14, 318]].map(([a, b]) => ll(a, b));
  if (uT.uMF.value.length !== NMF) throw new Error('NMF');
}
const theia = new THREE.Mesh(new THREE.SphereGeometry(RT, 160, 110).rotateX(Math.PI / 2), mk(THEIA, uT)); space.add(theia);
const PALETTES = [
  { n: T('grise et criblée de cratères'), a: [0.42, 0.40, 0.38], b: [0.20, 0.19, 0.19], c: [0.10, 0.10, 0.11], crat: 1.2, sea: 0.7 },
  { n: T('ocre et poussiéreuse'), a: [0.66, 0.45, 0.26], b: [0.40, 0.25, 0.15], c: [0.22, 0.14, 0.10], crat: 0.8, sea: 0.5 },
  { n: T('basaltique, presque noire'), a: [0.22, 0.20, 0.19], b: [0.09, 0.085, 0.085], c: [0.30, 0.10, 0.04], crat: 0.9, sea: 0.8 },
  { n: T('claire, soufrée'), a: [0.78, 0.70, 0.42], b: [0.52, 0.40, 0.22], c: [0.30, 0.22, 0.12], crat: 0.5, sea: 0.6 },
  { n: T('couverte d’océans sombres'), a: [0.45, 0.38, 0.30], b: [0.05, 0.10, 0.17], c: [0.03, 0.06, 0.12], crat: 0.35, sea: 0.2 },
  { n: T('rouge sombre'), a: [0.50, 0.22, 0.14], b: [0.26, 0.11, 0.08], c: [0.12, 0.07, 0.07], crat: 1.0, sea: 0.6 },
];
let surfName = '';
function rollSurface() {
  const p = PALETTES[Math.floor(Math.random() * PALETTES.length)];
  uT.uSeed.value.set(Math.random() * 50, Math.random() * 50, Math.random() * 50);
  uT.uColA.value.set(...p.a); uT.uColB.value.set(...p.b); uT.uColC.value.set(...p.c);
  uT.uCrat.value = p.crat * (0.7 + 0.6 * Math.random()); uT.uSea.value = p.sea;
  uT.uCap.value = Math.random() < 0.55 ? 0.84 + 0.12 * Math.random() : 2;
  surfName = p.n + (uT.uCap.value < 1.5 ? T(', avec des calottes polaires') : '');
}

const uM = { uSun: { value: SUN }, uEarthDir: { value: new V3(1, 0, 0) }, uHot: { value: 1 }, uMaria: { value: 0 }, uEarthShine: { value: 0.1 }, uMariaHot: { value: 0 }, uFlow: { value: 0 } };
const moon = new THREE.Mesh(new THREE.SphereGeometry(RMOON, 96, 64).rotateX(Math.PI / 2), mk(MOON, uM)); space.add(moon);
const uD = { uDisk: { value: 0 }, uPhase: { value: 0 }, uRin: { value: 1.06 * RE1 }, uRout: { value: 4.4 * RE1 }, uGap: { value: 0 } };
const disk = new THREE.Mesh(new THREE.RingGeometry(1.06 * RE1, 4.4 * RE1, 160, 12), mk(DISK, uD, { transparent: true, depthWrite: false, side: THREE.DoubleSide })); disk.renderOrder = 3; space.add(disk);
const flash = sprite();

// débris : conditions initiales tirées au hasard près de la zone de contact, converties en éléments orbitaux
const uP = { uTau: { value: 0 }, uCirc: { value: 0 }, uPx: { value: 800 }, uMoonM: { value: 0 }, uInfall: { value: 0 }, uRoche: { value: 2.9 * RE1 }, uRmin: { value: 1.15 * RE1 }, uCool: { value: 0 } };
{
  const N = 70000, el = new Float32Array(N * 4), P = new Float32Array(N * 3), Q = new Float32Array(N * 3), tt = new Float32Array(N * 4), pos = new Float32Array(N * 3);
  const quota = [0.55, 0.33, 0.12], count = [0, 0, 0];
  const r = new V3(), v = new V3(), h = new V3(), e = new V3(), q = new V3(), rh = new V3(), th = new V3(), Z = new V3(0, 0, 1);
  let i = 0, guard = 0;
  while (i < N && guard++ < N * 60) {
    const al = Math.random() * 1.0, de = (Math.random() - 0.5) * 0.6, r0 = RE0 + 200 + 3000 * Math.random() ** 2;
    rh.set(Math.sin(al) * Math.cos(de), -Math.cos(al) * Math.cos(de), Math.sin(de)); r.copy(rh).multiplyScalar(r0);
    th.crossVectors(Z, rh).normalize();
    const f = 0.7 + 0.78 * Math.random(), g = (1 + 42 * Math.random() ** 1.5) * DEG, vc = Math.sqrt(MU / r0) * f;
    v.copy(th).multiplyScalar(Math.cos(g)).addScaledVector(rh, Math.sin(g)).addScaledVector(Z, (Math.random() - 0.5) * 0.25).normalize().multiplyScalar(vc);
    const en = v.lengthSq() / 2 - MU / r0, t0 = 1500 * Math.random() ** 1.5, rnd = Math.random();
    if (en >= -0.5) {                                   // s'échappe (ou presque)
      if (count[2] >= quota[2] * N) continue; count[2]++;
      P.set([r.x, r.y, r.z], i * 3); Q.set([v.x * 0.45, v.y * 0.45, v.z * 0.45], i * 3); tt.set([t0, 1e30, rnd, 1], i * 4); i++; continue;
    }
    const a = -MU / (2 * en);
    h.crossVectors(r, v); e.crossVectors(v, h).multiplyScalar(1 / MU).sub(rh); const ec = e.length();
    if (ec < 1e-3 || ec > 0.985) continue;
    const peri = a * (1 - ec), cls = peri > RE1 * 1.03 ? 0 : 1;
    if (count[cls] >= quota[cls] * N) continue; count[cls]++;
    e.divideScalar(ec); q.crossVectors(h.normalize(), e);
    const x = r.dot(e), y = r.dot(q), E0 = Math.atan2(y / (a * Math.sqrt(1 - ec * ec)), x / a + ec), M0 = E0 - ec * Math.sin(E0), n = Math.sqrt(MU / a ** 3);
    let tHit = 1e30;
    if (cls === 1) { const Eh = 2 * Math.PI - Math.acos(clamp((1 - RE1 / a) / ec, -1, 1)), Mh = Eh - ec * Math.sin(Eh); let dM = Mh - M0; while (dM < 0) dM += 2 * Math.PI; tHit = t0 + dM / n; }
    el.set([a, ec, M0, n], i * 4); P.set([e.x, e.y, e.z], i * 3); Q.set([q.x, q.y, q.z], i * 3); tt.set([t0, tHit, rnd, 0], i * 4); i++;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('el', new THREE.BufferAttribute(el, 4));
  g.setAttribute('P', new THREE.BufferAttribute(P, 3)); g.setAttribute('Q', new THREE.BufferAttribute(Q, 3)); g.setAttribute('tt', new THREE.BufferAttribute(tt, 4));
  g.setDrawRange(0, i);
  const m = new THREE.Points(g, mk(DEBRIS, uP, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); m.frustumCulled = false; m.renderOrder = 4; space.add(m);
}

// au sol
const uL = { uSunL: { value: new V3(0, 1, 0) }, uZen: { value: new V3() }, uHor: { value: new V3() }, uGlowDir: { value: new V3(1, 0, 0) }, uHazeCol: { value: new V3() }, uFog: { value: new V3() },
  uDay: { value: 1 }, uAlpha: { value: 0.55 }, uGlow: { value: 0 }, uHaze: { value: 0 }, uTime: { value: 0 },
  uSunCol: { value: new V3(2.6, 2.3, 1.9) }, uAmb: { value: new V3(0.3, 0.3, 0.35) }, uFire: { value: new V3() },
  uMolten: { value: 0 }, uHeat: { value: 0 }, uWater: { value: 0 }, uCrack: { value: 1 }, uFogDen: { value: 0.000022 }, uShore: { value: 0.6 } };
const dome = new THREE.Mesh(new THREE.SphereGeometry(4e5, 48, 24), mk(DOME, uL, { side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor })); dome.renderOrder = -5; dome.frustumCulled = false; local.add(dome);
const groundGeo = new THREE.PlaneGeometry(2, 2, 160, 160).rotateX(-Math.PI / 2);
{ const p = groundGeo.attributes.position.array, w = u => 3e5 * Math.sign(u) * (0.004 * Math.abs(u) + 0.996 * Math.abs(u) ** 4); for (let i = 0; i < p.length; i += 3) { p[i] = w(p[i]); p[i + 2] = w(p[i + 2]); } }
const ground = new THREE.Mesh(groundGeo, mk(GROUND, uL)); ground.frustumCulled = false; local.add(ground);

// ---------------------------------------------------------------- observateur
const view = { mode: 'ground', D: 5000, orbD: 60000, fov: 60, fovT: 60 };
const obs = { dir: new V3(), E: new V3(), U: new V3(), S: new V3(), qB: new THREE.Quaternion(), arc: 0, tWall: 1e30, tSeis: 0, sunL: new V3(), glowDir: new V3() };
const pl = { pos: new V3(0, 1.7, 0), yaw: 0, pitch: 0.2, fly: false, vy: 0 };
const oc = { pos: new V3(), yaw: 0, pitch: 0, basis: new THREE.Quaternion() };
const keys = {};
function setObserver(D) {
  view.D = clamp(D, 0, 19300);
  const th = view.D / RE0, phi = 30 * DEG;
  // du point de contact vers le côté d'où vient Theia, en s'écartant du plan de l'orbite pour voir le disque en arche
  obs.dir.set(0, -1, 0).multiplyScalar(Math.cos(th)).addScaledVector(new V3(-Math.cos(phi), 0, Math.sin(phi)), Math.sin(th)).normalize();
  obs.arc = view.D;
  obs.U.copy(obs.dir);
  const N = new V3(0, 0, 1).addScaledVector(obs.U, -obs.U.z); if (N.lengthSq() < 1e-6) N.set(1, 0, 0); N.normalize();
  obs.S.copy(N).negate(); obs.E.crossVectors(obs.U, obs.S).normalize();
  obs.qB.setFromRotationMatrix(new THREE.Matrix4().makeBasis(obs.E, obs.U, obs.S));
  const toL = w => new V3(w.dot(obs.E), w.dot(obs.U), w.dot(obs.S));
  obs.toL = toL; obs.sunL.copy(toL(SUN));
  const g = toL(C_DIR.clone().multiplyScalar(RE0).sub(obs.dir.clone().multiplyScalar(RE0))); g.y = 0; if (g.lengthSq() < 1e-6) g.set(1, 0, 0); obs.glowDir.copy(g.normalize());
  // quand êtes-vous atteint ? soit Theia vous tombe dessus, soit le mur de roche vaporisée arrive (≈ 7 km/s)
  let tw = 20 + view.D / 7; const o = obs.dir.clone().multiplyScalar(RE0), p = new V3();
  for (let t = -900; t < 900; t += 5) if (theiaPos(t, p).distanceTo(o) < RT * 1.01) { tw = Math.min(tw, Math.max(t, 0)); break; }
  obs.tWall = tw; obs.tSeis = view.D / 10;
}
let moonOff = 0;
const tide = { show: false, ex: 1 };
let tideInfo = '';
const fmtRecede = v => v >= 1 ? TF('{0} km par an', [dec(v, v < 10 ? 1 : 0)]) : v >= 0.001 ? TF('{0} m par an', [dec(v * 1000, v < 0.01 ? 1 : 0)]) : TF('{0} cm par an', [dec(v * 1e5, 1)]);
const fmtH = h => h >= 1 ? `${dec(h, 1)} km` : h >= 0.001 ? `${fmtN(h * 1000)} m` : `${Math.round(h * 1e5)} cm`;
// Mouvement réel une fois la Lune formée : son orbite et la rotation de la Terre avancent au vrai rythme
// (plafonné quand le temps défile trop vite pour être suivi). Au sol, vous tournez avec la Terre :
// la Lune se déplace donc dans votre ciel au rythme synodique, celui des marées.
const kin = { m: 1.1, spin: 0, e: 0, prevT: null };
const moonAngle = () => kin.m + moonOff - (view.mode === 'ground' ? kin.e : 0);
const orbLook = (pos, target) => {
  oc.pos.copy(pos); const d = target.clone().sub(pos).normalize(), up = new V3(0, 0, 1), r = new V3().crossVectors(d, up).normalize(), u2 = new V3().crossVectors(r, d);
  oc.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u2, d.clone().negate())); oc.yaw = oc.pitch = 0;
};
const groundLook = (world, rE, dPitch = 0) => { const d = obs.toL(world.clone().sub(obs.dir.clone().multiplyScalar(rE)).normalize()); pl.yaw = Math.atan2(-d.x, -d.z); pl.pitch = clamp(Math.asin(clamp(d.y, -1, 1)) + dPitch, -1.4, 1.4); };
function lookAtTheia() {
  if (view.mode === 'ground') {
    const d = obs.toL(theiaPos(Math.min(sim.t, -1)).sub(obs.dir.clone().multiplyScalar(RE0)).normalize());
    pl.yaw = Math.atan2(-d.x, -d.z) + 0.18; pl.pitch = clamp(Math.asin(clamp(d.y, -1, 1)) - 0.12, -0.2, 1.4);
  } else {
    const dir = new V3(0.15, -0.62, 0.77).normalize(); oc.pos.copy(dir).multiplyScalar(view.orbD);
    const tgt = oc.pos.clone().negate().normalize(), up = new V3(0, 0, 1), right = new V3().crossVectors(tgt, up).normalize(), u2 = new V3().crossVectors(right, tgt);
    oc.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, u2, tgt.clone().negate())); oc.yaw = 0; oc.pitch = 0;
  }
}

// ---------------------------------------------------------------- temps
const sim = { t: T0, cap: 1e16, auto: true, paused: false, running: false, real: 0, eff: 1, exposure: 1 };
const fmtN = v => Math.round(v).toLocaleString(I18N.locale);
const dec = (v, d = 1) => v.toFixed(d).replace('.', DEC);
function fmtClock(t) {
  const a = Math.abs(t), s = t < 0 ? '−' : '+', p2 = n => String(Math.floor(n)).padStart(2, '0');
  if (a < 3600) return `T ${s} ${p2(a / 60)}:${p2(a % 60)}`;
  if (a < 172800) return `T ${s} ` + TF('{0} h {1}', [Math.floor(a / 3600), p2(a % 3600 / 60)]);
  if (a < 60 * 86400) return `T ${s} ` + TF('{0} j {1} h', [Math.floor(a / 86400), p2(a % 86400 / 3600)]);
  const y = a / YEAR;
  if (y < 2) return `T ${s} ` + TF('{0} mois', [Math.round(a / 2.63e6)]);
  if (y < 1e4) return `T ${s} ` + TF('{0} ans', [fmtN(y)]);
  if (y < 1e6) return `T ${s} ` + TF('{0} ans', [fmtN(Math.round(y / 1000) * 1000)]);
  if (y < 1e9) return `T ${s} ` + TF('{0} Ma', [dec(y / 1e6, y < 1e7 ? 1 : 0)]);
  return `T ${s} ` + TF('{0} Ga', [dec(y / 1e9, 2)]);
}
function fmtRate(v) {
  if (v < 60) return `×${v < 10 ? dec(v) : Math.round(v)}`;
  if (v < 3600) return TF('{0} min/s', [Math.round(v / 60)]);
  if (v < 86400) return TF('{0} h/s', [dec(v / 3600, v < 36000 ? 1 : 0)]);
  if (v < 2.63e6) return TF('{0} j/s', [dec(v / 86400, v < 864000 ? 1 : 0)]);
  if (v < YEAR) return TF('{0} mois/s', [dec(v / 2.63e6, 1)]);
  const y = v / YEAR;
  if (y < 1e4) return TF('{0} ans/s', [fmtN(y)]);
  if (y < 1e6) return TF('{0} ans/s', [fmtN(Math.round(y / 1000) * 1000)]);
  return TF('{0} M ans/s', [fmtN(y / 1e6)]);
}
const fmtDur = s => s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : s < 172800 ? `${dec(s / 3600)} h` : s < 60 * 86400 ? TF('{0} jours', [Math.round(s / 86400)]) : fmtClock(s).slice(4);
const EVENTS = [
  { t: T0, label: T('Début') }, { t: -86400, label: T('T−1 jour') }, { t: -3600, label: T('T−1 heure') }, { t: 0, label: T('Contact') },
  { t: 720, label: T('Theia engloutie') }, { t: 2400, label: T('Terre entièrement fondue') }, { t: 21600, label: T('Les débris retombent') }, { t: 3 * 86400, label: T('Le disque') },
  { t: 0.3 * YEAR, label: T('Premiers agrégats') }, { t: 30 * YEAR, label: T('La Lune') }, { t: 5e6 * YEAR, label: T('Croûte solide') }, { t: 2e8 * YEAR, label: T('Océans') },
  { t: 3.5e9 * YEAR, label: T('Continents et vie') }, { t: T_END, label: T('Aujourd’hui') }];
const JOURNAL = [
  { t: T0 + 1, h: T('Une seconde Lune'), x: TF('Theia a exactement la taille apparente de notre Lune, à {0} km. Elle tombe vers la Terre depuis {1} jours et accélère. Le temps défile vite, puis ralentira de lui-même à l’approche du choc.', [fmtN(theiaPos(T0).length()), Math.round(-T0 / 86400)]) },
  { t: -86400, h: T('Un jour avant'), x: T('Elle couvre déjà plusieurs fois la Lune. Sa face nocturne s’éclaire : c’est la lumière de la Terre qui s’y reflète.') },
  { t: -3600, h: T('Une heure avant'), x: T('Les deux planètes se déforment sous leurs marées mutuelles. Le sol se fissure, la roche est soulevée de plusieurs kilomètres.') },
  { t: -600, h: T('Dix minutes'), x: TF('Elle arrive à {0} km/s, de biais, à 45°. C’est lent pour un impact cosmique : sa taille fait tout.', [dec(V_IMP)]) },
  { t: 0.5, h: T('Contact'), x: T('Les deux surfaces se touchent. Il faudra douze minutes à Theia pour s’enfoncer : elle fait 6 800 km de large.') },
  { t: 200, h: T('Un choc de biais'), x: T('Le côté de Theia qui n’a pas heurté la Terre continue sur sa lancée et s’étire en un bras de roche fondue projeté en orbite.') },
  { t: 720, h: T('Theia n’existe plus'), x: T('Son noyau de fer plonge vers celui de la Terre et fusionne avec lui. Son manteau est en partie en orbite.') },
  { t: 2400, h: T('Toute la Terre a fondu'), x: T('Le front de choc a fait le tour de la planète en quarante minutes. Il n’y a plus de surface, seulement un océan de magma sous une atmosphère de roche vaporisée.') },
  { t: 4200, h: T('Une Terre plus grosse'), x: T('Avant le choc, la Terre pesait environ 90 % de sa masse actuelle et mesurait 6 150 km de rayon. Elle vient d’avaler les neuf dixièmes de Theia, noyau de fer compris : elle passe à 6 371 km.') },
  { t: 14400, h: T('Une Terre aplatie'), x: T('Le choc lui a donné un tour sur elle-même toutes les cinq heures. Elle s’aplatit aux pôles et s’élargit à l’équateur.') },
  { t: 30000, h: T('Ce qui monte redescend'), x: T('La plupart des débris sont sur des orbites qui recoupent la Terre : ils retombent en pluie. Seul le reste formera le disque.') },
  { t: 3 * 86400, h: T('Le disque'), x: T('Un anneau de magma et de vapeur, d’environ deux masses lunaires, épais et brûlant. Il s’étend jusqu’à quatre rayons terrestres.') },
  { t: 0.3 * YEAR, h: T('Au-delà de la limite de Roche'), x: T('En deçà de 18 500 km, les marées terrestres empêchent tout agrégat de tenir. Au-delà, les grumeaux grossissent et se mangent entre eux.') },
  { t: 30 * YEAR, h: T('La Lune'), x: T('Elle s’est formée à 24 000 km : une vingtaine de fois plus large dans le ciel qu’aujourd’hui. La durée exacte est débattue : de quelques heures à un siècle selon les modèles.') },
  { t: 300 * YEAR, h: T('Un huitième de Theia'), x: T('Theia pesait huit fois la Lune. Le reste est dans la Terre. La Lune n’a presque pas de fer : elle est faite de manteau rocheux, celui de Theia mêlé à celui de la Terre, dans des proportions encore débattues (ses roches sont chimiquement presque identiques aux nôtres).') },
  { t: 1e4 * YEAR, h: T('Elle s’éloigne déjà'), x: T('Les marées qu’elle soulève freinent la Terre et la repoussent. Les jours s’allongent. Sa surface était un océan de magma, elle se fige.') },
  { t: 5e6 * YEAR, h: T('Une croûte'), x: T('L’océan de magma terrestre s’est solidifié en quelques millions d’années. L’atmosphère est épaisse, faite de vapeur d’eau et de gaz carbonique.') },
  { t: 2e8 * YEAR, h: T('Il pleut'), x: T('La vapeur se condense. Les océans sont en place moins de 200 millions d’années après le choc (des zircons vieux de 4,4 milliards d’années en témoignent).') },
  { t: 1.2e9 * YEAR, h: T('Les mers lunaires'), x: T('Les taches sombres de la Lune sont des épanchements de lave qui ont rempli les grands bassins d’impact, il y a 3 à 3,8 milliards d’années.') },
  { t: 3.5e9 * YEAR, h: T('Continents, puis verdure'), x: T('Les plantes n’ont conquis les terres que dans les 500 derniers millions d’années : le dernier dixième de l’histoire.') },
  { t: T_END * 0.999, h: T('Aujourd’hui'), x: T('La Lune est à 384 400 km et s’éloigne encore de 3,8 cm par an. Les jours durent 24 heures. Tout ce que vous voyez est fait, en partie, de Theia.') },
];
let jIdx = 0;
const hud = { clock: $('clock'), sub: $('sub'), data: $('data'), speed: $('speed'), journal: $('journal'), marker: $('marker'), mlabel: $('mlabel'), bar: $('barfill'), ticks: $('ticks'), root: $('hud'), veil: $('veil') };
function pushJournal(e) {
  const d = document.createElement('div'); d.className = 'entry'; d.innerHTML = `<b>${e.h}</b><span>${e.x}</span>`;
  hud.journal.prepend(d); requestAnimationFrame(() => d.classList.add('on'));
  while (hud.journal.children.length > 3) hud.journal.lastChild.remove();
  [...hud.journal.children].forEach((c, i) => c.style.opacity = i === 0 ? '' : String(0.55 - 0.2 * i));
}
const tl = t => t <= 0 ? 0.2 * (1 - Math.log(1 + -t / 30) / Math.log(1 + -T0 / 30)) : 0.2 + 0.8 * Math.log(1 + t / 30) / Math.log(1 + T_END / 30);
EVENTS.forEach(e => { const d = document.createElement('i'); d.style.left = (tl(e.t) * 100) + '%'; d.title = e.label; hud.ticks.appendChild(d); });

// ---------------------------------------------------------------- interface
const CAPS = [1, 60, 3600, 86400, 2.63e6, YEAR, 1e3 * YEAR, 1e6 * YEAR, 1e8 * YEAR];
const spdToV = c => Math.round(1000 * Math.log10(c) / 16), vToSpd = v => Math.pow(10, v / 1000 * 16);
function setCap(c) { sim.cap = clamp(c, 1, 1e16); $('spd').value = String(spdToV(sim.cap)); }
const nudge = d => setCap(sim.cap * (d > 0 ? 10 : 0.1));
const sliderToD = v => view.mode === 'ground' ? Math.round(v * 19.3 / 10) * 10 : (() => { const d = 12000 * Math.pow(2e6 / 12000, v / 1000), p = Math.pow(10, Math.floor(Math.log10(d)) - 1); return Math.round(d / p) * p; })();
const dToSlider = d => view.mode === 'ground' ? Math.round(d / 19.3) : Math.round(1000 * Math.log(clamp(d, 12000, 2e6) / 12000) / Math.log(2e6 / 12000));
function uiSync() {
  const g = view.mode === 'ground';
  for (const id of ['mGround', 'mGround2']) $(id).classList.toggle('on', g);
  const rd = view.mode === 'ride';
  for (const id of ['mOrbit', 'mOrbit2']) $(id).classList.toggle('on', view.mode === 'orbit');
  for (const id of ['mRide', 'mRide2']) $(id).classList.toggle('on', rd);
  $('dist').disabled = $('dist2').disabled = rd; $('dist').style.opacity = $('dist2').style.opacity = rd ? '0.3' : '';
  const mars = uT.uMars.value > 0.5;
  for (const id of ['sRand', 'sRand2']) $(id).classList.toggle('on', !mars);
  for (const id of ['sMars', 'sMars2']) $(id).classList.toggle('on', mars);
  $('reroll2').style.display = mars ? 'none' : '';
  $('swarn').innerHTML = mars
    ? T('<b>Attention, c’est de la fiction.</b> Personne ne sait à quoi ressemblait Theia. Mars a simplement la même taille : cela montre ce qu’on verrait si elle arrivait de la même façon. Ce Mars est lui-même approximatif (grands reliefs placés à la main).')
    : TF('Surface inventée, tirée au hasard : {0}. Personne ne sait à quoi ressemblait Theia.', [surfName]);
  $('dcap').textContent = $('dcap2').textContent = g ? T('Distance au point d’impact') : T('Distance à la Terre');
  $('endL').textContent = g ? T('0 km · sous Theia') : fmtN(12000) + ' km'; $('endR').textContent = g ? T('19 300 km · antipodes') : fmtN(2000000) + ' km';
  const d = g ? view.D : view.orbD;
  $('dlabel').textContent = $('dlabel2').textContent = `${fmtN(d)} km`; $('dist').value = $('dist2').value = String(dToSlider(d));
  if (rd) { $('dlabel').textContent = $('dlabel2').textContent = '\u2014'; $('dinfo').innerHTML = T('Vous voyagez avec Theia, 140 km au-dessus de sa surface, face à la Terre. Après le choc, quand il ne reste plus rien d’elle, vous êtes libéré dans l’espace.'); return; }
  $('dinfo').innerHTML = g
    ? (obs.sunL.y < -0.05 ? T('Vous êtes du côté nuit. ') : '') + (view.D < 400 ? T('Theia vous tombe dessus à l’instant du contact.') : TF('Le sol tremble <b>{0}</b> après le contact ; le mur de roche vaporisée vous atteint après <b>{1}</b>.', [fmtDur(obs.tSeis), fmtDur(obs.tWall)])) + (view.D > 16500 ? T(' D’ici, Theia disparaît derrière l’horizon avant le choc.') : '')
    : T('Vous flottez, immobile, au-dessus du plan de la collision. Déplacez-vous librement ; la Lune finira à 384 400 km.');
}
function setMode(m) {
  if (m === 'ride') {
    if (view.mode === 'ride') return;
    view.mode = 'ride'; oc.yaw = oc.pitch = 0; view.fovT = 60;
    if (sim.t > -30) { sim.t = -600; hud.journal.innerHTML = ''; jIdx = JOURNAL.filter(j => j.t <= sim.t).length; setCap(1e16); }   // Theia doit encore exister
    pushJournal({ h: T('À bord de Theia'), x: T('Vous êtes 140 km au-dessus de sa surface, du côté qui regarde la Terre. Vous tombez avec elle : aucune sensation de mouvement, c’est la Terre qui grossit. Au contact, elle occupera tout votre ciel.') });
    uiSync(); return;
  }
  setMode0(m);
}
function setMode0(m) { if (m === view.mode) return; view.mode = m; if (lastMoment >= 0 && Math.abs(sim.t - MOMENTS[lastMoment].t) < Math.abs(MOMENTS[lastMoment].t) * 0.02 + 30) gotoMoment(lastMoment); else lookAtTheia(); uiSync(); }
let lastMoment = -1;
function setDist(d) {
  if (view.mode === 'ground') { setObserver(d); if (!sim.running) lookAtTheia(); }
  else { view.orbD = clamp(d, 12000, 2e6); if (!sim.running) lookAtTheia(); else { const dir = oc.pos.clone().normalize(); oc.pos.copy(dir).multiplyScalar(view.orbD); } }
  uiSync();
}
function restart() { sim.t = T0; sim.paused = false; jIdx = 0; hud.journal.innerHTML = ''; pl.pos.set(0, 1.7, 0); pl.fly = false; moonOff = 0; setCap(1e16); view.fovT = 60; lookAtTheia(); }
// ---------------------------------------------------------------- moments choisis
const MOMENTS = [
  { n: T('Le début : Theia a la taille de la Lune'), t: T0, look: 'theia', orb: 60000 },
  { n: T('Dix minutes avant : Theia emplit le ciel'), t: -600, look: 'theia', orb: 45000 },
  { n: T('Le contact'), t: -20, look: 'theia', orb: 45000 },
  { n: T('Theia engloutie (T + 12 min)'), t: 720, look: 'impact', orb: 45000 },
  { n: T('Le bras de débris (T + 3 h)'), t: 10800, look: 'up', orb: 80000 },
  { n: T('Le disque (T + 3 jours)'), t: 3 * 86400, look: 'up', orb: 90000 },
  { n: T('La Lune s’assemble (T + 2 ans)'), t: 2 * YEAR, look: 'moon', frame: 'wide', hold: true,
    x: S => TF('Au-delà de la limite de Roche, les agrégats fusionnent. La Lune a {0} % de sa masse ; le disque intérieur, lui, retombe peu à peu sur la Terre.', [Math.round(S.moonM * 100)]) },
  { n: T('La Lune toute neuve, en fusion (T + 100 ans)'), t: 100 * YEAR, look: 'moon', frame: 'behind', hold: true, tide: true,
    x: (S, a) => TF('Elle vient de s’assembler, à {0} km. Vue du sol : {1}° de large, {2} fois la Lune d’aujourd’hui. Sa surface est un océan de magma, et la Terre en dessous aussi.', [fmtN(S.aMoon), dec(a), Math.round(a / 0.52)]) },
  { n: T('La Lune se fige (T + 1 million d’années)'), t: 1e6 * YEAR, look: 'moon', frame: 'behind', hold: true, tide: true,
    x: (S, a) => TF('Une croûte claire se forme : de la roche légère (l’anorthosite) qui flotte sur le magma. Ce sont les hautes terres d’aujourd’hui. Elle est déjà à {0} km et fait encore {1}°, {2} fois sa taille actuelle.', [fmtN(S.aMoon), dec(a), dec(a / 0.52)]) },
  { n: T('Les mers de lave (T + 1 milliard d’années)'), t: 0.95e9 * YEAR, look: 'moon', frame: 'front', hold: true,
    x: S => TF('Les taches sombres ne sont pas un reste de l’océan de magma. Des centaines de millions d’années après, de la lave remonte des profondeurs et noie les grands bassins d’impact. Ces mers couvrent 31 % de la face visible, 17 % de la Lune entière. Distance : {0} km.', [fmtN(S.aMoon)]) },
  { n: T('Les dernières grandes éruptions (il y a 1,2 milliard d’années)'), t: 3.3e9 * YEAR, look: 'moon', frame: 'front', hold: true,
    x: (S, a) => TF('Les dernières grandes coulées, dans l’océan des Tempêtes. La Lune est à {0} km ({1}° dans le ciel) et le jour dure {2} h. Un volcanisme plus récent, à petite échelle, est discuté.', [fmtN(S.aMoon), dec(a, 2), dec(S.day)]) },
  { n: T('Aujourd’hui'), t: T_END, look: 'moon', frame: 'front', hold: true,
    x: () => T('La Lune que vous connaissez : 384 400 km, un demi-degré dans le ciel, et toujours la même face tournée vers nous.') },
];
function gotoMoment(i) {
  const m = MOMENTS[i]; if (!m) return; lastMoment = i;
  sim.t = m.t; sim.paused = false; moonOff = 0; view.fovT = 60; tide.show = !!m.tide; $('tide').checked = tide.show;
  if (view.mode === 'ride' && m.t >= 0) view.mode = 'orbit';   // après le contact, Theia ne peut plus vous porter longtemps
  const S = stage(m.t), g = view.mode === 'ground';
  setCap(m.hold ? 1 : 1e16);
  hud.journal.innerHTML = ''; jIdx = JOURNAL.filter(j => j.t <= m.t).length; if (jIdx > 0 && !m.x) pushJournal(JOURNAL[jIdx - 1]);
  kin.e = 0; kin.prevT = m.t; kin.m = 1.1 + 2 * Math.PI * (tau(m.t) / 37000 % 1);
  const base = moonAngle(), mp = a => new V3(S.aMoon * Math.cos(a), S.aMoon * Math.sin(a), 0);
  if (g) {
    pl.pos.set(0, 1.7, 0); pl.fly = false;
    if (m.look === 'theia') groundLook(theiaPos(Math.min(m.t, -1)), RE0, -0.12);
    else if (m.look === 'impact') { pl.yaw = Math.atan2(-obs.glowDir.x, -obs.glowDir.z); pl.pitch = 0.12; }
    else if (m.look === 'up') { pl.pitch = 0.75; }
    else if (m.look === 'moon') {
      // on place la Lune dans votre ciel, à une trentaine de degrés au-dessus de l'horizon
      const O = obs.dir.clone().multiplyScalar(S.rE); let best = 0, bestErr = 1e9, mx = -9;
      const el = a => Math.asin(clamp(mp(a).sub(O).normalize().dot(obs.U), -1, 1));
      for (let k = 0; k < 360; k++) mx = Math.max(mx, el(k * DEG));
      const want = Math.min(30 * DEG, mx - 2 * DEG);
      for (let k = 0; k < 360; k++) { const e = Math.abs(el(k * DEG) - want); if (e < bestErr) { bestErr = e; best = k * DEG; } }
      moonOff = best - base;
      const ang = 2 * Math.asin(Math.min(1, RMOON * Math.cbrt(Math.max(S.moonM, 0.05)) / (S.aMoon - RE1))) / DEG;
      view.fovT = clamp(ang * 7, 5, 60);           // zoom automatique quand la Lune est petite
      groundLook(mp(best), S.rE, view.fovT > 40 ? -0.10 : 0);
    }
  } else {
    const n = new V3(0.2, -0.5, 0.84).normalize();
    if (m.look !== 'moon') orbLook(new V3(0.15, -0.62, 0.77).normalize().multiplyScalar(m.orb), new V3());
    else {
      // face éclairée vers la caméra : derrière la Lune avec la Terre en fond, ou devant sa face visible
      const a = m.frame === 'front' ? Math.PI / 2 : -Math.PI / 2; moonOff = a - base;
      const M = mp(a), mh = M.clone().normalize(), rm = RMOON * Math.cbrt(Math.max(S.moonM, 0.05));
      if (m.frame === 'wide') orbLook(M.clone().multiplyScalar(0.5).addScaledVector(n, Math.max(50000, 1.5 * S.aMoon)), M.clone().multiplyScalar(0.5));
      else if (m.frame === 'behind') orbLook(M.clone().addScaledVector(mh, 4.4 * rm).addScaledVector(new V3(1, 0, 0), 1.9 * rm).addScaledVector(new V3(0, 0, 1), 1.3 * rm), M.clone().addScaledVector(mh, -2.2 * rm).addScaledVector(new V3(1, 0, 0), -0.6 * rm));
      else orbLook(M.clone().addScaledVector(mh, -4.6 * rm).addScaledVector(new V3(0, 0, 1), 0.8 * rm), M);
    }
  }
  const tideNote = !m.tide ? '' : TF(' Sa marée est {0} fois celle d’aujourd’hui : un bourrelet de {1} qui fait le tour de la Terre.', [fmtN(S.tide >= 100 ? Math.round(S.tide / 100) * 100 : S.tide), fmtH(S.tideH)]) + (g
    ? T(' D’ici vous ne verrez pas de vague : il fait 20 000 km de large, c’est tout le sol qui monte et redescend en quelques heures. La jauge en haut donne sa hauteur sous vos pieds : touche 3 (une heure par seconde) pour voir la Lune traverser le ciel et la jauge monter quand elle passe au plus haut.')
    : T(' Il est dessiné très exagéré (voir en haut), sinon il serait invisible à cette échelle.'));
  if (m.x) { const a = 2 * Math.asin(Math.min(1, RMOON * Math.cbrt(Math.max(S.moonM, 1e-6)) / (S.aMoon - RE1))) / DEG; pushJournal({ h: m.n.replace(/ ?[(（].*[)）]$/, ''), x: m.x(S, a) + tideNote + (m.hold ? T(' Le temps est remis à ×1 pour regarder : touches 1 à 9 pour repartir.') : '') + (view.mode === 'ground' && view.fovT < 40 ? T(' Vue zoomée : molette pour élargir.') : '') }); }
  uiSync();
}
function jumpNext() { const lead = e => e.t === 0 ? 20 : e.t < 0 ? 0 : 0; const n = EVENTS.map(e => e.t - lead(e)).filter(x => x > sim.t * (sim.t > 0 ? 1.0001 : 0.9999) + 1)[0]; if (n !== undefined) sim.t = n; }
function begin() { if (sim.running) return; sim.running = true; $('start').classList.add('gone'); hud.root.classList.remove('hidden'); }
const lock = () => { if (document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} } };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') e.target.blur();
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (!sim.running && (e.code === 'Enter' || e.code === 'Space')) { begin(); return; }
  const dg = /^(Digit|Numpad)([1-9])$/.exec(e.code);
  if (dg) setCap(CAPS[+dg[2] - 1]);
  if (e.key === '+' || e.code === 'NumpadAdd') nudge(1);
  if ((e.key === '-' && !dg) || e.code === 'NumpadSubtract') nudge(-1);
  if (e.code === 'KeyP') sim.paused = !sim.paused;
  if (e.code === 'KeyR') restart();
  if (e.code === 'KeyN') jumpNext();
  if (e.code === 'KeyF') { pl.fly = !pl.fly; pl.vy = 0; }
  if (e.code === 'KeyH') hud.root.classList.toggle('hidden');
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let drag = false;
canvas.addEventListener('mousedown', e => { if (e.button === 0) { if (sim.running) lock(); drag = true; } if (e.button === 2) view.fovT = 8; });
addEventListener('mouseup', e => { if (e.button === 0) drag = false; if (e.button === 2) view.fovT = 60; });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (document.pointerLockElement !== canvas && !drag) return;
  const k = 0.0022 * view.fov / 60, o = view.mode === 'ground' ? pl : oc;
  o.yaw -= e.movementX * k; o.pitch = clamp(o.pitch - e.movementY * k, -1.55, 1.55);
});
addEventListener('wheel', e => { if (e.target && e.target.tagName === 'INPUT') return; view.fovT = clamp(view.fovT * (e.deltaY > 0 ? 1.25 : 0.8), 1.5, 60); }, { passive: true });
$('go').addEventListener('click', () => { begin(); lock(); });
$('spd').addEventListener('input', () => { sim.cap = vToSpd(+$('spd').value); });
$('minus').addEventListener('click', () => nudge(-1)); $('plus').addEventListener('click', () => nudge(1));
$('tide').addEventListener('change', () => { tide.show = $('tide').checked; });
$('auto').addEventListener('change', () => { sim.auto = $('auto').checked; if (!sim.auto && sim.cap > 1e6) setCap(Math.max(1, Math.abs(sim.t) / 12)); });
$('pause').addEventListener('click', () => { sim.paused = !sim.paused; }); $('next').addEventListener('click', jumpNext); $('again').addEventListener('click', restart);
for (const [id, m] of [['mGround', 'ground'], ['mGround2', 'ground'], ['mOrbit', 'orbit'], ['mOrbit2', 'orbit'], ['mRide', 'ride'], ['mRide2', 'ride']]) $(id).addEventListener('click', () => setMode(m));
for (const id of ['dist', 'dist2']) $(id).addEventListener('input', () => setDist(sliderToD(+$(id).value)));
for (const id of ['sRand', 'sRand2']) $(id).addEventListener('click', () => { uT.uMars.value = 0; uiSync(); });
for (const id of ['sMars', 'sMars2']) $(id).addEventListener('click', () => { uT.uMars.value = 1; uiSync(); });
$('reroll2').addEventListener('click', () => { rollSurface(); uiSync(); });
for (const id of ['moment', 'moment2']) {
  const sel = $(id);
  if (id === 'moment2') sel.add(new Option(T('Aller à un moment…'), ''));
  MOMENTS.forEach((m, i) => sel.add(new Option(m.n, String(i))));
  sel.addEventListener('change', () => { if (sel.value !== '') gotoMoment(+sel.value); if (id === 'moment2') sel.value = ''; sel.blur(); });
}

// ---------------------------------------------------------------- composition
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const passS = new RenderPass(space, camS), passL = new RenderPass(local, camL); passL.clear = false; passL.clearDepth = true;
composer.addPass(passS); composer.addPass(passL);
// garde-fou : un pixel invalide serait étalé en carrés noirs par le halo
composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    bool bad(vec3 c){ return any(isnan(c))||any(isinf(c))||!(c.r+c.g+c.b<1e9); }
    vec3 ok(vec2 uv){ vec3 c=texture2D(tDiffuse,uv).rgb; return bad(c)?vec3(0.0):c; }
    void main(){ vec3 c=texture2D(tDiffuse,vUv).rgb;
      if(bad(c)){ vec2 px=1.0/vec2(textureSize(tDiffuse,0)); c=0.25*(ok(vUv+vec2(px.x,0.0))+ok(vUv-vec2(px.x,0.0))+ok(vUv+vec2(0.0,px.y))+ok(vUv-vec2(0.0,px.y))); }
      gl_FragColor=vec4(clamp(c,0.0,30000.0),1.0); }` }));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.3, 0.5, 1.7);
composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camS.aspect = camL.aspect = w / h; uP.uPx.value = h * renderer.getPixelRatio();
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- une image
const Z_AX = new V3(0, 0, 1), rideQ = new THREE.Quaternion(), rideM = new THREE.Matrix4();
const tmp = new V3(), tmp2 = new V3(), thP = new V3(), qa = new THREE.Quaternion(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
const TILT = new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), 25 * DEG);
function step(dt) {
  if (sim.running && !sim.paused) {
    sim.eff = sim.auto ? Math.min(sim.cap, Math.max(1, Math.abs(sim.t) / 12)) : sim.cap;
    let nt = sim.t + dt * sim.eff;
    if (sim.t < 0 && nt > 0) nt = 0.001;
    sim.t = Math.min(nt, T_END);
  }
  if (!sim.paused) sim.real += dt;
  const t = sim.t, S = stage(t), ta = tau(t), g = view.mode === 'ground';
  view.fov += (view.fovT - view.fov) * Math.min(1, dt * 9);

  // --- Terre
  // bourrelet de marée, tourné vers la Lune (avec 3° d'avance : la Terre tourne plus vite que la Lune ne passe, c'est ce qui la repousse)
  {
    const oldM = 1.1 + 2 * Math.PI * (ta / 37000 % 1), oldSpin = t < 0 ? 2 * Math.PI * (t / 36000 % 1) : 2 * Math.PI * (ta / 18000 % 1);
    if (S.moonM < 0.003 || kin.prevT === null) { kin.m = oldM; kin.spin = oldSpin; kin.e = 0; }
    else {
      const Torb = 2 * Math.PI * Math.sqrt(S.aMoon ** 3 / MU), Tday = S.day * 3600, syn = 1 / Math.abs(1 / Tday - 1 / Torb);
      const dk = clamp(t - kin.prevT, 0, dt * Math.min(Torb, Tday, syn) / 6);
      kin.m += 2 * Math.PI * dk / Torb; kin.spin += 2 * Math.PI * dk / Tday; kin.e += 2 * Math.PI * dk / Tday;
    }
    kin.prevT = t;
  }
  { const a = moonAngle() + 3 * DEG; uE.uTideDir.value.set(Math.cos(a), Math.sin(a), 0);
    const real = S.tideH / S.rE; let ex = 0;
    if (tide.show && S.tideH > 0) { ex = 0.14 / real; const p10 = Math.pow(10, Math.floor(Math.log10(ex)) - 1); ex = Math.max(1, Math.round(ex / p10) * p10); }
    tide.ex = ex; uE.uTideAmp.value = g ? 0 : real * ex; }
  earth.scale.set(S.rE, S.rE, S.rE * S.oblate); halo.scale.copy(earth.scale).multiplyScalar(1.03 + 0.05 * S.vapor);
  const spin = kin.spin;
  earth.rotation.z = spin;
  uE.uC.value.set(-Math.sin(spin), -Math.cos(spin), 0);          // direction du contact ramenée dans le repère tournant
  uE.uShock.value = S.shock; uE.uHeat.value = S.heat; uE.uRaft.value = S.raft; uE.uCool.value = S.cool; uE.uWater.value = S.water; uE.uLife.value = S.life; uE.uVapor.value = S.vapor;
  uE.uFlow.value = sim.real * 0.004 + ta * 0.00002;
  earth.visible = halo.visible = !g;
  // --- Theia
  theiaPos(t, thP);
  theia.visible = S.thScale > 0.02; theia.position.copy(thP);
  const dC = thP.length();
  theia.scale.setScalar(S.thScale);
  theia.quaternion.copy(TILT).multiply(qa.setFromAxisAngle(tmp.set(0, 0, 1), -280 * DEG + 2 * Math.PI * (Math.min(t, 0) / 88600 % 1)));
  uT.uEarthDir.value.copy(thP).negate().normalize(); uT.uEarthShine.value = 0.9 * Math.min(1, (RE0 / Math.max(dC - RT, RE0)) ** 2) + 0.01; uT.uMelt.value = S.thMelt;
  // --- éclair du contact
  flash.visible = S.flash > 0.02;
  if (flash.visible) { flash.position.copy(C_DIR).multiplyScalar(RE0 + 300).addScaledVector(V_DIR, Math.min(t, 600) * 3); flash.scale.setScalar(5000 + 3500 * ss(0, 600, t)); flash.material.color.setRGB(S.flash, S.flash * 0.85, S.flash * 0.6); }
  // --- débris, disque, Lune
  uP.uTau.value = ta; uP.uCirc.value = S.circ; uP.uMoonM.value = S.moonM; uP.uInfall.value = S.infall; uP.uCool.value = ss(-1, 2, lgY(t));
  uD.uDisk.value = S.disk; uD.uPhase.value = ta * Math.sqrt(MU / uD.uRin.value ** 3); uD.uGap.value = S.moonM; disk.visible = S.disk > 0.003;
  const mph = moonAngle();
  moon.visible = S.moonM > 0.002; moon.position.set(S.aMoon * Math.cos(mph), S.aMoon * Math.sin(mph), 0); moon.scale.setScalar(Math.cbrt(Math.max(S.moonM, 1e-6))); moon.rotation.z = mph + Math.PI;
  uM.uHot.value = S.moonHot; uM.uMaria.value = S.maria; uM.uMariaHot.value = S.mariaHot; uM.uFlow.value = sim.real * 0.03; uM.uEarthDir.value.copy(moon.position).negate().normalize(); uM.uEarthShine.value = 0.5 * (RE1 / S.aMoon) ** 2 * 40 * (S.heat > 0.1 && S.cool < 0.5 ? 1.5 : 0.4);

  // --- caméras
  let camPos, shake = 0, veil = 0, exposure = 1;
  if (g) {
    const k = c => keys[c] ? 1 : 0, f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), s = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'), fast = keys.ShiftLeft || keys.ShiftRight;
    const sy = Math.sin(pl.yaw), cy = Math.cos(pl.yaw);
    if (pl.fly) { const sp = (fast ? 600 : 40) * (1 + pl.pos.y / 200) * dt, cp = Math.cos(pl.pitch); pl.pos.x += (-sy * cp * f + cy * s) * sp; pl.pos.z += (-cy * cp * f - sy * s) * sp; pl.pos.y = clamp(pl.pos.y + (Math.sin(pl.pitch) * f + k('Space') - k('KeyC')) * sp, 1.7, 12000); }
    else { const sp = (fast ? 14 : 4.5) * dt, l = Math.hypot(f, s) || 1; pl.pos.x += (-sy * f + cy * s) / l * sp; pl.pos.z += (-cy * f - sy * s) / l * sp; if (pl.pos.y > 1.7) { pl.vy -= 9.8 * dt; pl.pos.y = Math.max(1.7, pl.pos.y + pl.vy * dt); } else { pl.vy = 0; if (keys.Space) { pl.vy = 4.6; pl.pos.y += 0.05; } } }
    const tw = obs.tWall, after = t - tw;
    shake = 0.25 * ss(-2400, 0, t) * (t < 0 ? 1 : Math.exp(-t / 300)) + (t > obs.tSeis ? 1.6 * Math.exp(-(t - obs.tSeis) / 500) : 0);
    veil = ss(tw - 12, tw, t) * (1 - ss(tw + 60, tw + 1500, t));
    camL.position.copy(pl.pos); eu.set(pl.pitch, pl.yaw, 0); camL.quaternion.setFromEuler(eu);
    if (shake > 0.002) { const T = sim.real, q = Math.min(shake, 2); camL.position.x += q * 0.3 * Math.sin(T * 13.1) * Math.sin(T * 2.3); camL.position.y += q * 0.25 * Math.abs(Math.sin(T * 17.3)); camL.rotateZ(q * 0.03 * Math.sin(T * 7.3)); }
    camL.fov = view.fov; camL.updateProjectionMatrix();
    dome.position.copy(camL.position); ground.position.set(camL.position.x, 0, camL.position.z);
    camPos = tmp2.copy(obs.dir).multiplyScalar(S.rE + 0.002 + pl.pos.y / 1000);
    camS.position.copy(camPos); camS.quaternion.copy(obs.qB).multiply(camL.quaternion);
    // ciel selon l'époque
    const lg = lgY(t), day = ss(-0.08, 0.25, obs.sunL.y), post = ss(tw - 5, tw + 20, t);
    const co2 = post * ss(2.5, 4.5, lg), w = S.water;
    const zen = [lerp(lerp(0.045, 0.16, co2), 0.07, w), lerp(lerp(0.065, 0.11, co2), 0.19, w), lerp(lerp(0.13, 0.07, co2), 0.52, w)];
    const hor = [lerp(lerp(0.42, 0.50, co2), 0.55, w), lerp(lerp(0.33, 0.34, co2), 0.70, w), lerp(lerp(0.25, 0.20, co2), 0.90, w)];
    uL.uZen.value.set(...zen); uL.uHor.value.set(...hor); uL.uDay.value = day; uL.uAlpha.value = 0.55 + 0.1 * w; uL.uSunL.value.copy(obs.sunL); uL.uGlowDir.value.copy(obs.glowDir); uL.uTime.value = sim.real;
    const haze = post * (1 - 0.55 * ss(4.3, 5.6, Math.log10(Math.max(t, 1)))) * (1 - ss(2, 4, lg));
    const hz = (0.30 + 1.0 * Math.exp(-Math.max(after, 0) / 3000)) * (1 - 0.6 * ss(-2, 3, lg));
    uL.uHaze.value = haze; uL.uHazeCol.value.set(1.0 * hz, 0.42 * hz, 0.11 * hz);
    const glow = t > 0 && t < tw + 30 ? (5 * Math.exp(-t / 200) + 1.6) * (1 - post) : 0;
    uL.uGlow.value = glow + (t < 0 ? 0 : 0);
    uL.uFog.value.set(lerp(hor[0] * day, uL.uHazeCol.value.x * 0.8, haze), lerp(hor[1] * day, uL.uHazeCol.value.y * 0.8, haze), lerp(hor[2] * day, uL.uHazeCol.value.z * 0.8, haze));
    uL.uMolten.value = post * (1 - S.cool); uL.uHeat.value = 0.75 + 1.2 * Math.exp(-Math.max(after, 0) / 4000) - 0.4 * ss(-1, 3, lg);
    uL.uWater.value = w; uL.uCrack.value = (1 - post) * (1 + 1.5 * ss(-3600, 0, t)) + 0.25 * post * S.cool * (1 - w);
    uL.uSunCol.value.set(2.6 * day * (1 - 0.8 * haze), 2.3 * day * (1 - 0.8 * haze), 1.9 * day * (1 - 0.8 * haze));
    uL.uAmb.value.set(0.30 * day + 0.5 * haze * hz + 0.02, 0.30 * day + 0.2 * haze * hz + 0.02, 0.36 * day + 0.05 * haze * hz + 0.03);
    uL.uFire.value.set(glow * 0.5, glow * 0.3, glow * 0.15);
    exposure = 0.95 / (1 + 0.22 * glow);
    stars.material.opacity = clamp(1 - 1.15 * day - haze, 0, 1);
  } else if (view.mode === 'ride') {
    // sur Theia : 140 km au-dessus de sa surface, la Terre à une vingtaine de degrés au-dessus de l'horizon
    const toE = tmp.copy(thP).negate().normalize(), dS = tmp2.copy(toE).multiplyScalar(Math.cos(70 * DEG)).addScaledVector(Z_AX, Math.sin(70 * DEG)).normalize();
    const f = toE.clone().addScaledVector(dS, -0.25).normalize(), r = new V3().crossVectors(f, dS).normalize(), u = new V3().crossVectors(r, f);
    rideQ.setFromRotationMatrix(rideM.makeBasis(r, u, f.negate()));
    eu.set(oc.pitch, oc.yaw, 0); qa.copy(rideQ).multiply(new THREE.Quaternion().setFromEuler(eu));
    camS.position.copy(thP).addScaledVector(dS, RT * S.thScale + 140); camS.quaternion.copy(qa); camPos = camS.position;
    stars.material.opacity = 1;
    exposure = 1 / (1 + 0.05 * S.flash);
    if (t >= 2400) {   // Theia a disparu : on vous relâche là où vous êtes
      view.mode = 'orbit'; oc.pos.copy(camS.position); oc.basis.copy(qa); oc.yaw = oc.pitch = 0;
      pushJournal({ h: T('Libéré dans l’espace'), x: T('Il ne reste rien de Theia. Vous flottez à un millier de kilomètres au-dessus de l’océan de magma : déplacez-vous au clavier, reculez pour voir le disque se former.') });
      uiSync();
    }
  } else {
    eu.set(oc.pitch, oc.yaw, 0); qa.copy(oc.basis).multiply(new THREE.Quaternion().setFromEuler(eu));
    const k = c => keys[c] ? 1 : 0, f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), s = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft'), v = k('Space') - k('KeyC');
    const alt = Math.max(oc.pos.length() - S.rE, 200), sp = alt * ((keys.ShiftLeft || keys.ShiftRight) ? 0.6 : 0.18) * dt;
    oc.pos.addScaledVector(tmp.set(0, 0, -1).applyQuaternion(qa), f * sp).addScaledVector(tmp.set(1, 0, 0).applyQuaternion(qa), s * sp).addScaledVector(tmp.set(0, 1, 0).applyQuaternion(qa), v * sp);
    if (oc.pos.length() < S.rE + 150) oc.pos.setLength(S.rE + 150);
    if (oc.pos.length() > 5e6) oc.pos.setLength(5e6);
    camS.position.copy(oc.pos); camS.quaternion.copy(qa); camPos = oc.pos;
    stars.material.opacity = 1;
    exposure = 1 / (1 + 0.02 * S.flash * Math.min(1, (40000 / oc.pos.length()) ** 2));
  }
  if (!g && t > 0) {   // près de la Terre en fusion (ou sur Theia qui fond), l'œil se ferme
    const alt = camS.position.length() - S.rE, hot = (S.heat / 1.25) * (1 - S.cool) * ss(0, 0.8, S.shock), nearF = clamp(1.3 - alt / 15000, 0, 1);
    exposure /= 1 + 1.3 * hot * nearF + (view.mode === 'ride' ? 4 * S.thMelt * S.thScale : 0);
  }
  let near = Math.max(camS.position.length() - S.rE, 5);
  if (theia.visible) near = Math.min(near, Math.max(camS.position.distanceTo(thP) - RT, 5));
  if (moon.visible) near = Math.min(near, Math.max(camS.position.distanceTo(moon.position) - RMOON, 5));
  camS.near = clamp(near * 0.2, 2, 20000); camS.far = 6e7; camS.fov = view.fov; camS.updateProjectionMatrix();
  passL.enabled = g;
  sim.exposure = lerp(sim.exposure, exposure, 1 - Math.exp(-3 * Math.min(dt, 0.1)));
  renderer.toneMappingExposure = sim.exposure;
  hud.veil.style.opacity = String(veil * 0.97);

  // --- affichage
  hud.clock.textContent = fmtClock(t);
  hud.speed.textContent = sim.paused ? T('PAUSE') : fmtRate(sim.eff);
  hud.bar.style.width = (tl(clamp(t, T0, T_END)) * 100) + '%';
  while (jIdx < JOURNAL.length && JOURNAL[jIdx].t <= t) pushJournal(JOURNAL[jIdx++]);
  const where = view.mode === 'ride' ? T('à bord de Theia') : g ? TF('au sol, à {0} km du point d’impact', [fmtN(view.D)]) : TF('dans l’espace, à {0} km du centre de la Terre', [fmtN(oc.pos.length())]);
  if (view.mode === 'orbit' && document.activeElement !== $('dist2')) { $('dlabel2').textContent = `${fmtN(oc.pos.length())} km`; $('dist2').value = String(dToSlider(oc.pos.length())); }
  const nx = EVENTS.find(e => e.t > t);
  if (t < 0 && view.mode === 'ride') {
    const dE = camS.position.length(), angE = 2 * Math.asin(Math.min(1, RE0 / dE)) / DEG, sp = theiaPos(t + 1, tmp).distanceTo(thP);
    hud.marker.style.display = 'none';
    hud.sub.textContent = TF('avant le contact · {0}', [where]);
    hud.data.innerHTML = TF('La Terre à <b>{0} km</b> · vous tombez à <b>{1} km/s</b><br>Elle occupe <b>{2}°</b> de votre ciel, soit <b>{3} fois</b> la Lune d’aujourd’hui', [fmtN(Math.max(dE - RE0, 0)), dec(sp), dec(angE, angE < 10 ? 2 : 0), angE / 0.52 < 10 ? dec(angE / 0.52) : fmtN(angE / 0.52)]);
  } else if (t < 0) {
    const d = camS.position.distanceTo(thP), ang = 2 * Math.asin(Math.min(1, RT / d)) / DEG, sp = theiaPos(t + 1, tmp).distanceTo(thP);
    hud.sub.textContent = TF('avant le contact · {0}', [where]);
    hud.data.innerHTML = TF('Theia à <b>{0} km</b> de vous · vitesse <b>{1} km/s</b><br>Taille apparente <b>{2}°</b>, soit <b>{3} fois</b> la Lune d’aujourd’hui', [fmtN(Math.max(d - RT, 0)), dec(sp), dec(ang, ang < 10 ? 2 : 0), ang / 0.52 < 10 ? dec(ang / 0.52) : fmtN(ang / 0.52)]);
    tmp.copy(thP).project(camS);
    const behind = tmp.z > 1; let x = tmp.x, y = tmp.y; if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.94 || Math.abs(y) > 0.9, rpx = ang / 2 / view.fov * innerHeight * 1.05;
    if (off) { const mx = Math.max(Math.abs(x), Math.abs(y), 1e-3); x = x / mx * 0.9; y = y / mx * 0.78; }
    hud.marker.style.display = (!off && rpx > 60) ? 'none' : 'block';
    hud.marker.style.left = ((x * 0.5 + 0.5) * 100) + '%'; hud.marker.style.top = ((-y * 0.5 + 0.5) * 100) + '%';
    hud.marker.classList.toggle('off', off); hud.marker.style.setProperty('--r', (off ? 4 : Math.max(14, rpx)) + 'px');
    hud.mlabel.textContent = off ? T('Theia par là') : 'Theia';
  } else {
    hud.marker.style.display = 'none';
    hud.sub.textContent = TF('après le contact · {0}', [where]);
    let h = '';
    if (t < 2400) h = TF('Front de fusion : <b>{0} km</b> sur 19 300 · Rayon de la Terre : <b>{1} km</b>', [fmtN(Math.min(t * 8, 19300)), fmtN(S.rE)]);
    else if (S.moonM < 0.003) h = TF('Disque de débris : environ deux masses lunaires en orbite · Jour : <b>{0} h</b>', [dec(S.day)]);
    else {
      const rm = RMOON * Math.cbrt(S.moonM), ang = 2 * Math.asin(rm / (S.aMoon - RE1)) / DEG;
      h = TF('Lune : <b>{0} %</b> de sa masse · à <b>{1} km</b><br>Dans le ciel : <b>{2}°</b>, soit <b>{3} fois</b> aujourd’hui · Jour : <b>{4} h</b>', [Math.round(S.moonM * 100), fmtN(S.aMoon), dec(ang, 2), dec(ang / 0.52), dec(S.day)]);
    }
    if (S.moonM >= 0.003) {
      h += TF('<br>Marée lunaire : <b>{0} fois</b> aujourd’hui · bourrelet de <b>{1}</b>', [S.tide >= 10 ? fmtN(S.tide >= 1000 ? Math.round(S.tide / 100) * 100 : S.tide) : dec(S.tide), fmtH(S.tideH)]);
      if (g) {   // vrai rythme : la Terre tourne sous le bourrelet, une marée haute toutes les demi-périodes synodiques
        const Torb = 2 * Math.PI * Math.sqrt(S.aMoon ** 3 / MU), Tday = S.day * 3600, syn = 1 / Math.abs(1 / Tday - 1 / Torb);
        const c = Math.cos(mph) * obs.dir.x + Math.sin(mph) * obs.dir.y, here = S.tideH * (1.5 * c * c - 0.5);   // même géométrie que la Lune affichée
        tideInfo = TF('une marée haute toutes les {0} h', [dec(syn / 7200, 1)]); h += TF(' · sous vos pieds : <b>{0}{1}</b> ({2})', [here >= 0 ? '+' : '\u2212', fmtH(Math.abs(here)), tideInfo]); }
      else if (tide.show) h += TF(' · dessiné <b>×{0}</b>', [fmtN(tide.ex)]);
      if (S.recede > 0) h += TF('<br>Elle s’éloigne de <b>{0}</b>', [fmtRecede(S.recede)]) + (t > T_END * 0.97 ? T(' selon cette loi (mesure réelle : 3,8 cm)') : '');
    }
    hud.data.innerHTML = h + (nx ? '<br>' + TF('Prochain : <b>{0}</b>', [nx.label]) : '');
  }
  if (!window.__norender) composer.render();
}
let last = performance.now();
const perf = { acc: 0, n: 0, pr: renderer.getPixelRatio() };
function frame(now) {
  const raw = (now - last) / 1000; last = now; step(Math.min(raw, 0.1));
  if (raw < 0.5) { perf.acc += raw; perf.n++; }
  if (perf.n >= 45) { const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0; if (avg > 0.027 && perf.pr > 0.6) { perf.pr = Math.max(0.6, perf.pr * 0.85); renderer.setPixelRatio(perf.pr); resize(); } }
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- démarrage
rollSurface(); setObserver(5000); setCap(1e16); resize(); hud.root.classList.add('hidden');
{
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('mode') === 'orbit') view.mode = 'orbit';
  if (h.get('mode') === 'ride') view.mode = 'ride';
  if (h.has('d')) setObserver(parseFloat(h.get('d')));
  if (h.has('o')) view.orbD = parseFloat(h.get('o'));
  if (h.has('mars')) uT.uMars.value = 1;
  if (h.has('t')) sim.t = parseFloat(h.get('t'));
  lookAtTheia();
  if (h.has('yaw')) (view.mode === 'ground' ? pl : oc).yaw = parseFloat(h.get('yaw')) * DEG;
  if (h.has('pitch')) (view.mode === 'ground' ? pl : oc).pitch = parseFloat(h.get('pitch')) * DEG;
  if (h.has('fov')) view.fov = view.fovT = parseFloat(h.get('fov'));
  if (h.has('y')) { pl.fly = true; pl.pos.y = parseFloat(h.get('y')); }
  if (h.has('look')) {      // tests : viser Theia, la Terre ou la Lune
    const tgt = h.get('look') === 'theia' ? theiaPos(sim.t) : h.get('look') === 'moon' ? (() => { const S = stage(sim.t), a = 1.1 + 2 * Math.PI * (tau(sim.t) / 37000 % 1); return new V3(S.aMoon * Math.cos(a), S.aMoon * Math.sin(a), 0); })() : new V3();
    if (view.mode === 'ground') { const d = obs.toL(tgt.sub(obs.dir.clone().multiplyScalar(RE0)).normalize()); pl.yaw = Math.atan2(-d.x, -d.z); pl.pitch = Math.asin(clamp(d.y, -1, 1)); }
    else { const d = tgt.sub(oc.pos).normalize(), up = new V3(0, 0, 1), r = new V3().crossVectors(d, up).normalize(), u2 = new V3().crossVectors(r, d); oc.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u2, d.clone().negate())); oc.yaw = oc.pitch = 0; }
  }
  if (h.has('m')) gotoMoment(parseInt(h.get('m')));
  if (h.has('tide')) { tide.show = true; $('tide').checked = true; }
  if (h.has('auto')) begin();
  window.__sim = { kin, moonAngle, gotoMoment, MOMENTS, sim, view, step, stage, theiaPos, setMode, setDist, T0, T_END, YEAR, obs, pl, oc };
}
uiSync();
requestAnimationFrame(frame);

// ---------------------------------------------------------------- centrer sur… / flèches
$('arrows').addEventListener('change', (e) => hud.root.classList.toggle('noarrows', !e.target.checked));
$('focusSel').addEventListener('change', (e) => {
  const v = e.target.value; e.target.value = ''; if (!v) return;
  if (v === 'impact' && view.mode === 'ground') { pl.yaw = Math.atan2(-obs.glowDir.x, -obs.glowDir.z); pl.pitch = 0.12; } else lookAtTheia();
});
