import { T, TF, I18N, DEC } from './i18n.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { NI, SKY_VERT, SKY_FRAG, WORLD_VERT, WATER_VERT, WATER_FRAG, TERRAIN_FRAG, PART_VERT, PART_FRAG, HAIL_VERT, HAIL_FRAG } from './shaders.js';
import { createOrbit } from './orbit.js';

const V3 = THREE.Vector3;
const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
let seed = 1234567;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();

// vitesse limite de chute d'un fragment de roche de diamètre d (m), au niveau de la mer
const vTerm = d => Math.min(Math.sqrt(57900 * d), 320);
let DEP = 0;   // épaisseur d'éjectas déjà déposée (m)

// ---------------------------------------------------------------- physique, fonction de la distance choisie
const PH = { R: 6371, D: 800, V: 20, ANG: 60, DIAM: 12, T0: -60 };
PH.T_ENTRY = -(100 / Math.sin(PH.ANG * DEG)) / PH.V;   // passage à 100 km d'altitude

const azDir = (az, el = 0) => new V3(Math.sin(az * DEG) * Math.cos(el * DEG), Math.sin(el * DEG), -Math.cos(az * DEG) * Math.cos(el * DEG));
const UP = new V3(0, 1, 0);
const GZ_H = azDir(315);                 // l'impact est au nord-ouest
const GZ_R = azDir(45);                  // à droite quand on regarde l'impact : le nord-est
const TSU_DIR = new THREE.Vector2(-GZ_H.x, -GZ_H.z);   // le tsunami s'éloigne du point d'impact
const G_REL = new V3(), UP_G = new V3(), TRACK = new V3();
const SUN_DIR = azDir(62, 15);
const MOON_DIR = new V3(0, 1, 0);

function astState(t) {
  const s = PH.V * Math.max(-t, 0);
  const p = G_REL.clone().addScaledVector(TRACK, s);
  const range = Math.max(p.length(), 1e-3);
  const dir = range > 2e-3 ? p.clone().divideScalar(range) : TRACK.clone();
  return { dir, range, alt: s * Math.sin(PH.ANG * DEG), toImpact: s, ang: Math.min(Math.atan(PH.DIAM / 2 / range), 1.2), el: Math.asin(clamp(dir.y, -1, 1)) / DEG, az: Math.atan2(dir.x, -dir.z) / DEG };
}
function setDistance(D) {
  D = clamp(Math.round(D), 0, 2000);
  PH.D = D;
  const th = D / PH.R;
  G_REL.copy(UP).multiplyScalar(PH.R * (Math.cos(th) - 1)).addScaledVector(GZ_H, PH.R * Math.sin(th));
  UP_G.copy(UP).multiplyScalar(Math.cos(th)).addScaledVector(GZ_H, Math.sin(th));
  TRACK.copy(azDir(45)).multiplyScalar(Math.cos(PH.ANG * DEG)).addScaledVector(UP_G, Math.sin(PH.ANG * DEG));
  PH.drop = D * D / (2 * PH.R);            // hauteur masquée par la courbure au-dessus du point d'impact, km
  PH.inside = D < 150;                     // dans la boule de feu
  PH.crater = D < 90;                      // dans le cratère final
  PH.visible = PH.drop < 150;              // la boule de feu dépasse-t-elle l'horizon ?
  PH.fireScale = PH.inside ? 60 : clamp((800 / D) ** 2, 0.03, 40) * (PH.visible ? 1 : 0.12);
  PH.burn = PH.inside || (PH.visible && PH.fireScale > 0.3);
  PH.T_P = D / 8; PH.T_S = D / 4.5;
  PH.T_EJ = Math.sqrt(2 * D * 1000 / 9.81);           // vol balistique à 45°
  PH.T_BLAST = D / 0.34 * (D / (D + 60));             // un peu plus rapide que le son près de la source
  PH.T_TSU = PH.inside ? 2400 : 200 + D / 0.18;       // ~180 m/s en eau profonde
  PH.TSU_H = PH.inside ? 120 : clamp(100 * 800 / D, 35, 400);
  // éjectas : lois d'échelle de Collins, Melosh & Marcus (2005), cratère final 180 km, transitoire 100 km
  const De = Math.max(D, 150);
  PH.dm = 1.64 * Math.pow(90 / De, 2.65);              // taille moyenne des fragments, m
  PH.thickReal = 8.93e8 / De ** 3;                     // épaisseur de la couverture, m
  PH.thick = Math.min(PH.thickReal, 150);
  PH.tauP = 16000 / vTerm(PH.dm);                      // chute depuis ~70 km, air de plus en plus dense
  PH.T_HAIL = PH.T_EJ + 16000 / vTerm(PH.dm * 2.7);    // les plus gros touchent le sol d'abord
  PH.quakeAmp = clamp((800 / Math.max(D, 100)) ** 0.7, 0.4, 2.6);
  PH.T_END = PH.T_TSU + 1500;
  // la Lune juste à côté de l'astéroïde à T−40 s, quand ils ont la même taille apparente
  const a = astState(-40).dir, side = new V3().crossVectors(a, UP);
  if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
  MOON_DIR.copy(a).addScaledVector(side.normalize(), 0.030).addScaledVector(UP, 0.012).normalize();
}

// ---------------------------------------------------------------- relief
const ISL = [];
function seabed(x, z) {
  const r = Math.hypot(x, z);
  return -2.2 - Math.min(r, 4000) * 0.0045 + 0.35 * Math.sin(x * 0.031 + 1.3) * Math.sin(z * 0.027 + 0.4) + 0.12 * Math.sin(x * 0.11 + z * 0.07);
}
function terrainH(x, z) {
  let h = seabed(x, z);
  for (const i of ISL) {
    const qx = x - i.cx, qz = z - i.cz;
    const rx = qx * i.c + qz * i.s, rz = -qx * i.s + qz * i.c;
    h += i.amp * Math.exp(-(rx * rx * i.ix + rz * rz * i.iz));
  }
  return h + DEP;
}
[[0, 0, 170, 30, 10, 1.75], [150, 38, 90, 26, -25, 1.3], [-175, -28, 60, 20, 30, 0.9],
 [-320, -900, 420, 45, 5, 1.6], [620, -1300, 500, 50, -8, 1.5], [-1500, -1450, 600, 60, 12, 1.8],
 [1500, -500, 380, 45, 70, 1.4], [240, 820, 350, 40, -6, 1.5], [-950, 520, 300, 42, 40, 1.3]
].forEach(([cx, cz, sx, sz, rot, top]) => {
  const i = { cx, cz, c: Math.cos(rot * DEG), s: Math.sin(rot * DEG), ix: 1 / (sx * sx), iz: 1 / (sz * sz), amp: 0 };
  i.amp = top - terrainH(cx, cz);
  ISL.push(i);
});
const ILC = ISL[0].c, ILS = ISL[0].s;
const isl = (a, b) => [a * ILC - b * ILS, a * ILS + b * ILC];

// ---------------------------------------------------------------- rendu
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xf0c0b8, 0.00024);
const camera = new THREE.PerspectiveCamera(65, 1, 0.15, 60000);
camera.rotation.order = 'YXZ';

const U = {
  uTime: { value: 0 }, uT: { value: PH.T0 },
  uSunDir: { value: SUN_DIR }, uSunCol: { value: new V3(3.0, 2.45, 1.9) }, uSunVis: { value: 1 },
  uGZ: { value: GZ_H }, uGZr: { value: GZ_R },
  uDust: { value: 0 }, uGlow: { value: 0 }, uStreak: { value: 0 },
  uFire: { value: 0 }, uFireCol: { value: new V3(1, 0.95, 0.85) }, uFireDir: { value: GZ_H.clone() },
  uAstDir: { value: new V3(0, 1, 0) }, uAstEntry: { value: new V3(0, 1, 0) }, uTrail: { value: 0 }, uTrailW: { value: 0 },
  uAstGlow: { value: 0 }, uAstAng: { value: 0.004 }, uAstBody: { value: 1 },
  uMoonDir: { value: MOON_DIR },
  uWater: { value: 0 }, uChop: { value: 1 },
  uFogCol: { value: new V3(0.95, 0.74, 0.7) }, uFogDen: { value: 0.00024 },
  uAmb: { value: new V3(0.45, 0.45, 0.62) },
  uIslA: { value: ISL.map(i => new THREE.Vector4(i.cx, i.cz, i.ix, i.iz)) },
  uIslB: { value: ISL.map(i => new THREE.Vector4(i.c, i.s, i.amp, 0)) },
  uWaterLight: { value: new V3(1, 1, 1) },
  uD: { value: 800 }, uDrop: { value: 50 }, uEngulf: { value: 0 }, uInnerEm: { value: 0 }, uMelt: { value: 0 }, uAsh: { value: 0 }, uRain: { value: 0 },
  uPathA: { value: new V3(0, 1, 0) }, uPathB: { value: new V3(0, 1, 0) },
  uDep: { value: 0 }, uBead: { value: 0.005 }, uHot: { value: 0 }, uFroth: { value: 0 },
  uTsuDir: { value: TSU_DIR }, uTsuFront: { value: 0 }, uTsuH: { value: 0 },
};
if (ISL.length !== NI) throw new Error('NI');

// hauteur locale de la mer : niveau de base, puis mur du tsunami (même formule que le shader)
function waterY(x, z) {
  let y = U.uWater.value;
  const H = U.uTsuH.value;
  if (H > 0) {
    const s = x * TSU_DIR.x + z * TSU_DIR.y - U.uTsuFront.value, W = 140;
    const k = 1 - sstep(-W, W * 0.25, s), sm = Math.min(s, 0);
    const body = H * Math.exp(sm / 9000) * (0.62 + 0.38 * Math.cos(sm / 1400)) * (1 + 0.30 * Math.exp(-(((s + W * 1.4) / (W * 0.9)) ** 2)));
    y += (body - y) * k;
  }
  return y;
}

let terrainMesh = null;
const orbit = createOrbit();
let MODE = 'ground';
let RIDE = false;   // vue depuis l'astéroïde : un cas particulier de la vue spatiale
const OR = { dist: 2000 };
const veil = document.getElementById('veil');
const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 48, 24),
  new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false }));
sky.renderOrder = -10; sky.frustumCulled = false;
scene.add(sky);

{
  const N = 420, S = 5200;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((N + 1) * (N + 1) * 3), nor = new Float32Array((N + 1) * (N + 1) * 3);
  const w = u => S * Math.sign(u) * (0.11 * Math.abs(u) + 0.89 * Math.abs(u) ** 3);
  let k = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = w(i / N * 2 - 1), z = w(j / N * 2 - 1);
    const h = terrainH(x, z), e = 0.8;
    const nx = terrainH(x - e, z) - terrainH(x + e, z), nz = terrainH(x, z - e) - terrainH(x, z + e);
    const l = Math.hypot(nx, 2 * e, nz);
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    nor[k] = nx / l; nor[k + 1] = 2 * e / l; nor[k + 2] = nz / l; k += 3;
  }
  const idx = new Uint32Array(N * N * 6); k = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: U, vertexShader: WORLD_VERT, fragmentShader: TERRAIN_FRAG }));
  m.frustumCulled = false;
  scene.add(m); terrainMesh = m;
}
const waterGeo = new THREE.PlaneGeometry(2, 2, 300, 300).rotateX(-Math.PI / 2);
{
  const p = waterGeo.attributes.position.array, w = u => 30000 * Math.sign(u) * (0.02 * Math.abs(u) + 0.98 * Math.abs(u) ** 3);
  for (let i = 0; i < p.length; i += 3) { p[i] = w(p[i]); p[i + 2] = w(p[i + 2]); }
}
const water = new THREE.Mesh(waterGeo,
  new THREE.ShaderMaterial({ uniforms: U, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false }));
water.renderOrder = 1; water.frustumCulled = false;
scene.add(water);

const sunLight = new THREE.DirectionalLight(0xffd9b0, 9);
sunLight.position.copy(SUN_DIR);
const fireLight = new THREE.DirectionalLight(0xfff0d8, 0);
const hemi = new THREE.HemisphereLight(0x8f95d8, 0x8a7a60, 1.6);
scene.add(sunLight, fireLight, hemi);

// ---------------------------------------------------------------- particules
class Particles {
  constructor(n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.col = new Float32Array(n * 4); this.base = new Float32Array(n * 4);
    this.size = new Float32Array(n); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grow = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 4));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 800 }, uLight: { value: new V3(1, 1, 1) } }, vertexShader: PART_VERT, fragmentShader: PART_FRAG, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 4 : 3;
    this.g = g; this.grav = 0;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life, size, r, g, b, a, grow = 0) {
    const i = this.i; this.i = (i + 1) % this.n;
    const k = i * 3, q = i * 4;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z; this.vel[k] = vx; this.vel[k + 1] = vy; this.vel[k + 2] = vz;
    this.base[q] = r; this.base[q + 1] = g; this.base[q + 2] = b; this.base[q + 3] = a;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grow[i] = grow;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3, q = i * 4;
      this.vel[k + 1] += this.grav * dt;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] += this.grow[i] * dt;
      const f = clamp(this.life[i] / this.max[i], 0, 1);
      this.col[q] = this.base[q]; this.col[q + 1] = this.base[q + 1]; this.col[q + 2] = this.base[q + 2];
      this.col[q + 3] = this.base[q + 3] * Math.min(f * 3, 1) * Math.min((1 - f) * 8, 1);
    }
    this.g.attributes.position.needsUpdate = true; this.g.attributes.pcolor.needsUpdate = true; this.g.attributes.size.needsUpdate = true;
  }
  clear() { this.life.fill(0); this.col.fill(0); }
}
const smoke = new Particles(4200, false);
const glowP = new Particles(5200, true);
const splash = new Particles(11000, false); splash.grav = -9.8;

// grêle d'éjectas : traits lumineux
class Rain {
  constructor(n, additive) {
    this.n = n; this.i = 0; this.L = 0.03;
    this.pos = new Float32Array(n * 6); this.p = new Float32Array(n * 3); this.v = new Float32Array(n * 3); this.life = new Float32Array(n);
    const col = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) { const h = 0.5 + 0.5 * Math.random(); col.set(additive ? [3.4, 1.2 + 0.9 * h, 0.25 + 0.4 * h, 0.25, 0.05, 0] : [0.7 + 0.3 * h, 0.7 + 0.3 * h, 0.7 + 0.3 * h, 0.45, 0.45, 0.45], i * 6); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, transparent: true, opacity: additive ? 1 : 0.8, depthWrite: false, fog: !additive });
    this.mesh = new THREE.LineSegments(g, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.g = g;
    scene.add(this.mesh);
  }
  spawn(x, y, z, vx, vy, vz, life) { const i = this.i; this.i = (i + 1) % this.n; const k = i * 3; this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z; this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz; this.life[i] = life; }
  update(dt) {
    const L = this.L;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3, q = i * 6;
      if (this.life[i] <= 0) { this.pos[q + 1] = this.pos[q + 4] = -9999; continue; }
      this.life[i] -= dt;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      this.pos[q] = this.p[k]; this.pos[q + 1] = this.p[k + 1]; this.pos[q + 2] = this.p[k + 2];
      this.pos[q + 3] = this.p[k] - this.v[k] * L; this.pos[q + 4] = this.p[k + 1] - this.v[k + 1] * L; this.pos[q + 5] = this.p[k + 2] - this.v[k + 2] * L;
    }
    this.g.attributes.position.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}
const rain = new Rain(4200, false);     // grêle froide : billes et graviers
const rainHot = new Rain(1200, true);   // fragments encore incandescents

// l'averse elle-même : 200 000 traits calculés par la carte graphique dans une boîte qui suit la caméra
const HAIL_N = 200000;
const hailU = { ...U, uBox: { value: new V3(12, 9, 12) }, uOff: { value: new V3() }, uLen: { value: 0.3 }, uDens: { value: 0 }, uSl: { value: new THREE.Vector2() }, uCol: { value: new V3(0.5, 0.5, 0.5) }, uA: { value: 0.8 } };
const hail = (() => {
  const p = new Float32Array(HAIL_N * 6), e = new Float32Array(HAIL_N * 2);
  for (let i = 0; i < HAIL_N; i++) { const x = Math.random(), y = Math.random(), z = Math.random(); p.set([x, y, z, x, y, z], i * 6); e[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('end', new THREE.BufferAttribute(e, 1));
  const m = new THREE.LineSegments(g, new THREE.ShaderMaterial({ uniforms: hailU, vertexShader: HAIL_VERT, fragmentShader: HAIL_FRAG, transparent: true, depthWrite: false }));
  m.frustumCulled = false; m.renderOrder = 5; m.visible = false; scene.add(m);
  return m;
})();
const bolides = [];

// ---------------------------------------------------------------- faune
const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide, ...o });
function tri(pts) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts.flat()), 3));
  g.computeVertexNormals();
  return g;
}
function ellipsoid(sx, sy, sz, mat) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat); m.scale.set(sx, sy, sz); return m; }

function makeFlyer(kind, span) {
  const g = new THREE.Group();
  const L = span / 2, ptero = kind === 'ptero';
  const bodyM = lam(ptero ? 0xe9e2d2 : 0xf6f4ef), wingM = lam(ptero ? 0xc9a676 : 0xf2f0ea), tipM = lam(ptero ? 0xb8925f : 0x4a4a52), beakM = lam(ptero ? 0xe6b23a : 0xe8a22a);
  const bl = ptero ? span * 0.11 : span * 0.17;
  g.add(ellipsoid(bl * 0.32, bl * 0.3, bl, bodyM));
  if (ptero) {
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(bl * 0.11, bl * 0.16, bl * 1.3, 7), bodyM);
    neck.position.set(0, bl * 0.25, bl * 1.35); neck.rotation.x = 1.15; g.add(neck);
    const head = ellipsoid(bl * 0.16, bl * 0.17, bl * 0.34, bodyM); head.position.set(0, bl * 0.52, bl * 2.0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(bl * 0.11, bl * 1.7, 6), beakM);
    beak.position.set(0, bl * 0.46, bl * 3.0); beak.rotation.x = Math.PI / 2 + 0.06; g.add(beak);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(bl * 0.09, bl * 1.1, 4), beakM);
    crest.position.set(0, bl * 0.75, bl * 1.55); crest.rotation.x = -Math.PI / 2 - 0.5; crest.scale.x = 0.35; g.add(crest);
    const legs = new THREE.Mesh(new THREE.ConeGeometry(bl * 0.1, bl * 1.6, 5), bodyM);
    legs.position.set(0, -bl * 0.05, -bl * 1.6); legs.rotation.x = -Math.PI / 2; g.add(legs);
  } else {
    const head = ellipsoid(bl * 0.2, bl * 0.2, bl * 0.24, bodyM); head.position.set(0, bl * 0.12, bl * 1.05); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(bl * 0.07, bl * 0.5, 5), beakM);
    beak.position.set(0, bl * 0.1, bl * 1.45); beak.rotation.x = Math.PI / 2; g.add(beak);
    g.add(new THREE.Mesh(tri([[0, 0, -bl * 0.7], [bl * 0.3, 0, -bl * 1.6], [-bl * 0.3, 0, -bl * 1.6]]), wingM));
  }
  const L1 = L * 0.42, L2 = L * 0.58;
  const cr = ptero ? bl * 1.5 : bl * 0.75, cm = ptero ? bl * 0.8 : bl * 0.6;
  const wings = [];
  for (const sgn of [1, -1]) {
    const inner = new THREE.Group(); inner.position.set(sgn * bl * 0.2, bl * 0.1, bl * 0.15);
    inner.add(new THREE.Mesh(tri([[0, 0, bl * 0.55], [sgn * L1, 0, bl * 0.75], [0, 0, bl * 0.55 - cr],
      [sgn * L1, 0, bl * 0.75], [sgn * L1, 0, bl * 0.75 - cm], [0, 0, bl * 0.55 - cr]]), wingM));
    const outer = new THREE.Group(); outer.position.set(sgn * L1, 0, 0);
    outer.add(new THREE.Mesh(tri([[0, 0, bl * 0.75], [sgn * L2, 0, bl * 0.75 - cm * (ptero ? 1.0 : 1.25)], [0, 0, bl * 0.75 - cm],
      ...(ptero ? [] : [[sgn * L2 * 0.6, 0, bl * 0.75 - cm * 0.75], [sgn * L2, 0, bl * 0.75 - cm * 1.25], [sgn * L2 * 0.6, 0.002, bl * 0.75 - cm * 1.6]])]), ptero ? wingM : tipM));
    inner.add(outer); g.add(inner);
    wings.push({ inner, outer, sgn });
  }
  g.userData = { wings, mats: [bodyM, wingM, tipM, beakM] };
  return g;
}

const flyers = [];
function addFlyer(kind, span, cx, cz, r, y, speed, amp, rate) {
  const mesh = makeFlyer(kind, span);
  scene.add(mesh);
  flyers.push({ mesh, kind, span, cx, cz, r, y0: y, speed, amp, rate, sgn: rnd() < 0.5 ? 1 : -1, phi0: rr(0, 6.283), seed: rr(0, 100), u: rnd() });
}
{
  const [ax, az] = isl(10, -60);
  for (let i = 0; i < 9; i++) addFlyer('ptero', rr(3.2, 6.2), ax + rr(-160, 160), az + rr(-220, 60), rr(45, 150), rr(14, 70), rr(11, 15), 0.22, rr(1.6, 2.2));
  addFlyer('ptero', 10.5, ax - 40, az - 260, 230, 150, 17, 0.14, 1.1);
  addFlyer('ptero', 4.6, ax + 10, az - 25, 38, 11, 11, 0.25, 2.0);
  for (let i = 0; i < 22; i++) addFlyer('bird', rr(1.0, 1.5), ax + rr(-120, 120), az + rr(-110, 90), rr(14, 70), rr(2.5, 26), rr(8, 11), 0.55, rr(4.5, 6.5));
}
function resetFlyers() {
  for (const f of flyers) {
    f.phi = f.phi0; f.state = 0; f.flap = f.seed; f.vel = new V3(); f.spin = new V3(); f.mesh.visible = true; f.char = 0;
    // brûlés par l'éclair s'il est visible, sinon abattus par la retombée des éjectas
    f.fallAt = PH.burn ? lerp(4.5, 15, f.u) * Math.max(1, (PH.D / 800) ** 2) : PH.T_HAIL + lerp(5, 160, f.u);
    f.mesh.userData.mats.forEach(m => { if (!m.userData.c0) m.userData.c0 = m.color.clone(); m.color.copy(m.userData.c0); });
  }
}
const tmpV = new V3();
function updateFlyers(dt, t, time) {
  for (const f of flyers) {
    const m = f.mesh;
    if (!m.visible) continue;
    if (PH.inside && t > 0.05) { m.visible = false; continue; }
    if (t > f.fallAt + 400) { m.visible = false; continue; }
    if (f.state === 0 && PH.burn && t > 0.25 + (f.seed % 1) * 0.6) {
      f.state = 1;
      f.vel.set(-Math.sin(f.phi) * f.sgn, 0, Math.cos(f.phi) * f.sgn).multiplyScalar(f.speed);
    }
    if (f.state === 0 && !PH.burn && t > f.fallAt) {
      f.state = 2; f.vel.set(-Math.sin(f.phi) * f.sgn, 0, Math.cos(f.phi) * f.sgn).multiplyScalar(f.speed); f.spin.set(rr(-3, 3), rr(-2, 2), rr(-4, 4));
    }
    if (f.state === 0) {
      f.phi += f.sgn * f.speed / f.r * dt;
      const burst = sstep(0.2, 0.8, Math.sin(time * 0.23 + f.seed));
      f.flap += dt * f.rate * (0.5 + 0.8 * burst);
      m.position.set(f.cx + Math.cos(f.phi) * f.r, f.y0 + Math.sin(time * 0.17 + f.seed) * 2.5, f.cz + Math.sin(f.phi) * f.r);
      m.rotation.set(0, 0, 0); m.rotation.order = 'YXZ';
      m.rotation.y = Math.atan2(-Math.sin(f.phi) * f.sgn, Math.cos(f.phi) * f.sgn);
      m.rotation.z = f.sgn * Math.min(0.6, f.speed * f.speed / (f.r * 9.8));
      setWings(f, f.amp * (0.25 + 0.75 * burst));
    } else if (f.state === 1) {
      tmpV.copy(GZ_H).multiplyScalar(-f.speed * 1.5); tmpV.y = 1.5;
      f.vel.lerp(tmpV, Math.min(1, dt * 1.2));
      m.position.addScaledVector(f.vel, dt);
      m.rotation.y = Math.atan2(f.vel.x, f.vel.z); m.rotation.z *= 0.9;
      f.flap += dt * f.rate * 2.2; setWings(f, f.amp * 1.8 + 0.25);
      if (t > f.fallAt) { f.state = 2; f.spin.set(rr(-3, 3), rr(-2, 2), rr(-4, 4)); }
    } else {
      f.char = Math.min(1, f.char + dt * 0.9);
      m.userData.mats.forEach(mt => mt.color.copy(mt.userData.c0).multiplyScalar(1 - 0.9 * f.char));
      f.vel.y -= 9.8 * dt; f.vel.multiplyScalar(1 - 0.5 * dt);
      m.position.addScaledVector(f.vel, dt);
      m.rotation.x += f.spin.x * dt; m.rotation.y += f.spin.y * dt; m.rotation.z += f.spin.z * dt;
      setWings(f, 0.9, 1.1);
      if (rnd() < dt * 26) {
        const s = f.span * 0.35;
        smoke.spawn(m.position.x, m.position.y, m.position.z, rr(-.4, .4), rr(0.3, 1.2), rr(-.4, .4), rr(1.5, 3.2), s, 0.12, 0.10, 0.09, 0.55, s * 0.9);
        if (rnd() < 0.6) glowP.spawn(m.position.x, m.position.y, m.position.z, rr(-.5, .5), rr(0, 1), rr(-.5, .5), rr(0.25, 0.6), s * 0.8, 1.0, 0.5, 0.12, 0.8);
      }
      const wl = waterY(m.position.x, m.position.z), ground = Math.max(terrainH(m.position.x, m.position.z), wl);
      if (m.position.y < ground) {
        m.visible = false;
        if (ground === wl) burstSplash(m.position.x, ground, m.position.z, f.span * 0.5);
      }
    }
  }
}
function setWings(f, amp, hold) {
  const a = hold !== undefined ? hold : Math.sin(f.flap) * amp + 0.07;
  const b = hold !== undefined ? hold * 0.6 : Math.sin(f.flap - 0.7) * amp * 1.25 - 0.10;
  for (const w of f.mesh.userData.wings) { w.inner.rotation.z = w.sgn * a; w.outer.rotation.z = w.sgn * b; }
}
function burstSplash(x, y, z, s) {
  for (let i = 0; i < 16 * Math.min(s, 2.5) + 6; i++) {
    const a = rr(0, 6.283), v = rr(0.5, 2.6) * Math.sqrt(s);
    splash.spawn(x, y + 0.05, z, Math.cos(a) * v, rr(3, 9) * Math.sqrt(s), Math.sin(a) * v, rr(0.6, 1.5), rr(0.15, 0.4) * s, 0.95, 0.97, 1, 0.75, 0.5 * s);
  }
}

// tortue
const turtle = new THREE.Group();
{
  const shellM = lam(0x6f6a2e), skinM = lam(0x9a9a6a), lightM = lam(0xcfc79a);
  turtle.add(ellipsoid(0.52, 0.2, 0.64, shellM));
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * 6.283, s = ellipsoid(0.13, 0.03, 0.15, lightM);
    s.position.set(Math.cos(a) * 0.3, 0.15, Math.sin(a) * 0.38); turtle.add(s);
  }
  const c = ellipsoid(0.16, 0.03, 0.2, lightM); c.position.y = 0.19; turtle.add(c);
  const head = ellipsoid(0.13, 0.11, 0.2, skinM); head.position.set(0, 0.03, 0.78); turtle.add(head);
  turtle.userData.fl = [];
  for (const [sx, sz, len] of [[1, 0.42, 0.62], [-1, 0.42, 0.62], [1, -0.45, 0.34], [-1, -0.45, 0.34]]) {
    const p = new THREE.Group(); p.position.set(sx * 0.42, -0.02, sz);
    const f = ellipsoid(len * 0.5, 0.025, 0.14, skinM); f.position.x = sx * len * 0.5; p.add(f);
    p.rotation.y = sx * (sz > 0 ? -0.5 : 0.6);
    turtle.add(p); turtle.userData.fl.push({ p, sx, front: sz > 0 });
  }
  turtle.scale.setScalar(1.25);
  scene.add(turtle);
}
const TURTLE_C = isl(16, -46);

const FISH_N = 150;
const fish = new THREE.InstancedMesh(new THREE.ConeGeometry(0.035, 0.24, 5).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x47707a }), FISH_N);
fish.frustumCulled = false; scene.add(fish);
const fishData = [];
{
  const schools = [isl(-8, -38), isl(28, -42), isl(-40, -36), isl(60, -40), isl(5, 40)];
  for (let i = 0; i < FISH_N; i++) {
    const s = schools[i % schools.length];
    fishData.push({ cx: s[0], cz: s[1], r: rr(1.2, 5), ph: rr(0, 6.283), sp: rr(0.25, 0.55) * (i % 2 ? 1 : -1), y: rr(-0.75, -0.3), w: rr(0.5, 2) });
  }
}
const dummy = new THREE.Object3D();

const mosa = (() => {
  const SEG = 26, RAD = 8, LEN = 8.5;
  const g = new THREE.CylinderGeometry(1, 1, 1, RAD, SEG, false);
  const base = g.attributes.position.array.slice();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x24333d }));
  m.frustumCulled = false; scene.add(m);
  const prof = u => { const head = sstep(0, 0.16, u), tail = 1 - sstep(0.5, 1, u); return 0.52 * Math.min(head, 1) * (0.18 + 0.82 * tail) + 0.03; };
  return { m, g, base, SEG, RAD, LEN, prof, c: isl(-20, -150), r: 55, phi: 2.2 };
})();
function updateMosa(dt, time, t) {
  const M = mosa, pos = M.g.attributes.position.array;
  const dive = PH.burn ? sstep(0.5, 4, t) : 0;
  M.phi += dt * (2.6 + 3 * dive) / M.r;
  const yb = U.uWater.value - 0.38 + 0.25 * Math.sin(time * 0.31) - 2.2 * dive;
  for (let i = 0; i < pos.length; i += 3) {
    const u = 0.5 - M.base[i + 1];
    const a = M.phi - u * M.LEN / M.r;
    const R = M.r + Math.sin(time * 2.0 - u * 7) * (0.05 + 0.75 * u * u);
    const pr = M.prof(u), fin = u > 0.82 ? 1 + (u - 0.82) * 9 : 1;
    pos[i] = M.c[0] + Math.cos(a) * (R + M.base[i] * pr * 0.75);
    pos[i + 1] = yb + M.base[i + 2] * pr * fin;
    pos[i + 2] = M.c[1] + Math.sin(a) * (R + M.base[i] * pr * 0.75);
  }
  M.g.attributes.position.needsUpdate = true; M.g.computeVertexNormals();
}

// palmiers
const palms = [];
{
  for (const [a, b, hgt] of [[-78, 2, 6.5], [-44, -4, 8], [-16, 5, 5.2], [34, 3, 7.4], [62, -3, 6], [98, 2, 5]]) {
    const [x, z] = isl(a, b), g = new THREE.Group();
    const tm = lam(0x7a6248), lm = lam(0x55773f);
    const lean = rr(-0.25, 0.25), lz = rr(-0.2, 0.2);
    const pts = []; for (let i = 0; i <= 7; i++) { const u = i / 7; pts.push(new V3(lean * hgt * u * u, hgt * u, lz * hgt * u * u)); }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.17, 6), tm));
    const top = pts[7], crown = new THREE.Group(); crown.position.copy(top);
    for (let i = 0; i < 11; i++) {
      const ang = i / 11 * 6.283 + rr(-0.2, 0.2), len = rr(2.2, 3.1), tp = [], SG = 5;
      for (let s = 0; s < SG; s++) {
        const u0 = s / SG, u1 = (s + 1) / SG;
        const P = u => [u * len, 0.5 * Math.sin(u * 2.2) * len * 0.35 - u * u * len * 0.55, 0];
        const wd = u => 0.42 * Math.sin(Math.PI * Math.min(u + 0.12, 1));
        const p0 = P(u0), p1 = P(u1), w0 = wd(u0), w1 = wd(u1);
        tp.push([p0[0], p0[1], -w0], [p1[0], p1[1], -w1], [p0[0], p0[1] + 0.1, 0], [p1[0], p1[1], -w1], [p1[0], p1[1] + 0.1, 0], [p0[0], p0[1] + 0.1, 0],
          [p0[0], p0[1], w0], [p0[0], p0[1] + 0.1, 0], [p1[0], p1[1], w1], [p1[0], p1[1], w1], [p0[0], p0[1] + 0.1, 0], [p1[0], p1[1] + 0.1, 0]);
      }
      const fr = new THREE.Mesh(tri(tp), lm); fr.rotation.y = ang; fr.rotation.z = rr(0.1, 0.5); crown.add(fr);
    }
    g.add(crown);
    g.position.set(x, terrainH(x, z) - 0.15, z);
    scene.add(g);
    palms.push({ g, tm, lm, top: new V3(x + top.x, terrainH(x, z) + top.y, z + top.z), base: new V3(x, terrainH(x, z), z), hgt, u: rnd(), crown });
  }
}
const FALL_AXIS = new V3(-GZ_H.z, 0, GZ_H.x).normalize();   // couchés dos à l'impact
function updatePalms(dt, t, time) {
  for (const p of palms) {
    const gone = (PH.inside && t > 0.05) || t > PH.T_TSU - 20 || DEP > p.hgt * 0.7;
    p.g.visible = !gone;
    if (gone) continue;
    const fall = sstep(0, 0.7, t - PH.T_BLAST - p.u * 0.3) * 1.38;
    p.g.quaternion.setFromAxisAngle(FALL_AXIS, -fall);
    const ignite = PH.burn ? lerp(2.2, 7, p.u) * Math.max(1, (PH.D / 800) ** 2) : PH.T_EJ + lerp(20, 160, p.u);
    const b = t - ignite;
    if (b <= 0) { p.lm.color.setHex(0x55773f); p.tm.color.setHex(0x7a6248); p.lm.emissive.setHex(0); p.crown.rotation.z = Math.sin(time * 0.8 + p.hgt) * 0.02; continue; }
    const k = clamp(b / 25, 0, 1);
    p.lm.color.setRGB(lerp(0.33, 0.04, k), lerp(0.47, 0.03, k), lerp(0.25, 0.02, k));
    p.tm.color.setRGB(lerp(0.48, 0.07, k), lerp(0.38, 0.05, k), lerp(0.28, 0.04, k));
    const burn = sstep(0, 3, b) * (1 - sstep(70, 160, b)) * (fall > 0.1 ? 0 : 1);
    p.lm.emissive.setRGB(0.9 * burn * (0.6 + 0.4 * Math.sin(time * 17 + p.hgt)), 0.25 * burn, 0.02 * burn);
    if (burn > 0.02) {
      const n = dt * 46 * burn, ni = Math.floor(n) + (rnd() < n - Math.floor(n) ? 1 : 0);
      for (let i = 0; i < Math.min(ni, 40); i++) {
        const u = rnd() * rnd();
        const x = lerp(p.top.x, p.base.x, u) + rr(-1.6, 1.6) * (1 - u), y = lerp(p.top.y, p.base.y, u) + rr(-0.4, 0.8), z = lerp(p.top.z, p.base.z, u) + rr(-1.6, 1.6) * (1 - u);
        glowP.spawn(x, y, z, rr(-.5, .5), rr(1.6, 4), rr(-.5, .5), rr(0.4, 1.0), rr(1.0, 2.2), 1.0, rr(0.35, 0.6), 0.08, 0.75, -0.8);
        if (i % 3 === 0) smoke.spawn(x, y + 1, z, rr(-.6, .6) - GZ_H.x * 1.2, rr(2, 4), rr(-.6, .6) - GZ_H.z * 1.2, rr(4, 8), rr(1.2, 2.0), 0.13, 0.115, 0.10, 0.36, 1.5);
      }
    } else if (b > 60 && b < 500 && fall < 0.1 && rnd() < dt * 5) {
      smoke.spawn(p.top.x, p.top.y, p.top.z, rr(-.4, .4), rr(1.5, 3), rr(-.4, .4), rr(4, 8), 1.6, 0.09, 0.08, 0.075, 0.35, 1.4);
    }
  }
}

// ---------------------------------------------------------------- joueur
const player = { pos: new V3(), yaw: 0, pitch: 0, vy: 0, fly: false, onGround: true, fov: 65, fovT: 65 };
const keys = {};
function resetPlayer() {
  const [x, z] = isl(4, -21);
  player.pos.set(x, terrainH(x, z) + 1.7, z);
  const a = astState(PH.T0);
  player.yaw = -(a.az + 28) * DEG; player.pitch = clamp(a.el - 24, 4, 46) * DEG;
  player.fly = false; player.vy = 0; player.fovT = 65;
}
function updatePlayer(dt) {
  const k = c => keys[c] ? 1 : 0;
  const f = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown'), s = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft');
  const fast = keys.ShiftLeft || keys.ShiftRight;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const p = player.pos;
  if (player.fly) {
    const sp = fast ? 160 : 28, cp = Math.cos(player.pitch), spi = Math.sin(player.pitch);
    p.x += (-sy * cp * f + cy * s) * sp * dt; p.z += (-cy * cp * f - sy * s) * sp * dt;
    p.y += (spi * f + k('Space') - k('KeyC')) * sp * dt;
    p.y = clamp(p.y, Math.max(terrainH(p.x, p.z), waterY(p.x, p.z)) + 0.4, 8000);
  } else {
    const g0 = terrainH(p.x, p.z), swim = g0 + 1.25 < waterY(p.x, p.z);
    const sp = swim ? (fast ? 4.5 : 2.4) : (fast ? 13 : 4.3);
    const l = Math.hypot(f, s) || 1;
    p.x += (-sy * f + cy * s) / l * sp * dt; p.z += (-cy * f - sy * s) / l * sp * dt;
    const g = terrainH(p.x, p.z), wl = waterY(p.x, p.z);
    const floor = Math.max(g + 1.7, wl + 0.32);
    if (p.y > floor + 0.02) { player.vy -= 9.8 * dt; p.y += player.vy * dt; player.onGround = false; }
    if (p.y <= floor + 0.02) { p.y = Math.max(lerp(p.y, floor, Math.min(1, dt * 14)), floor - 0.12); player.vy = 0; player.onGround = true; }
    if (keys.Space && player.onGround) { player.vy = 4.6; p.y += 0.05; player.onGround = false; }
  }
  const lim = 4600; p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
  player.fov = lerp(player.fov, player.fovT, Math.min(1, dt * 9));
}

// ---------------------------------------------------------------- chronologie
const sim = { t: PH.T0, speed: 1, running: false, paused: false, time: 0, exposure: 1, seiche: 0, shake: 0, lastT: PH.T0 };
let EVENTS = [], JOURNAL = [];
const fmtKm = v => Math.round(v).toLocaleString(I18N.locale);
const fmtSize = d => d < 0.001 ? `${(d * 1000).toFixed(1).replace('.', DEC)} mm` : d < 0.01 ? `${Math.round(d * 1000)} mm` : d < 1 ? `${Math.round(d * 100)} cm` : d < 10 ? `${d.toFixed(1).replace('.', DEC)} m` : `${Math.round(d)} m`;
const fmtDur = s => {
  s = Math.max(0, Math.round(s));
  if (s >= 3600) { const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 60); return `${h} h ${String(m).padStart(2, '0')}`; }
  const m = Math.floor(s / 60), r = s - m * 60;
  return m ? `${m} min ${String(r).padStart(2, '0')} s` : `${r} s`;
};
function buildOrbitTimeline() {
  const I = orbit.info, d = OR.dist;
  EVENTS = [{ t: PH.T0, label: T('Début') }, { t: PH.T_ENTRY, label: T('Entrée atmosphérique') }, { t: 0, label: T('Impact') },
    { t: 452, label: T('Éjectas à 1 000 km') }, { t: 1010, label: T('Éjectas à 5 000 km') }, { t: 2020, label: T('Éjectas aux antipodes') }];
  if (I.tPlume) EVENTS.push({ t: I.tPlume, label: T('Le panache vous atteint') });
  EVENTS.sort((a, b) => a.t - b.t);
  PH.T_END = 3600;
  if (RIDE) {
    JOURNAL = [
      { t: PH.T0 + 1.5, h: T('À cheval sur l’astéroïde'), x: T('Vous êtes posé sur douze kilomètres de roche, à 1 039 km d’altitude. La Terre vient à vous à 20 km/s, soit 72 000 km/h. Dans une minute, vous y êtes. Regardez autour de vous à la souris.') },
      { t: -38, h: T('Droit devant'), x: T('La mer claire et peu profonde, c’est la plate-forme du Yucatán. Tout ce que vous voyez d’ici sera atteint par les éjectas en moins d’un quart d’heure.') },
      { t: -15, h: T('Aucune sensation de vitesse'), x: T('Dans le vide, rien ne défile et rien ne siffle. Seule la Terre grossit : elle remplit maintenant tout le champ de vision.') },
      { t: PH.T_ENTRY, h: T('L’atmosphère'), x: T('Cent kilomètres d’air traversés en 5,8 secondes. L’air n’a pas le temps de s’écarter : il est comprimé devant la roche, qui devient incandescente.') },
      { t: 0.05, h: T('Impact'), x: T('L’astéroïde est vaporisé en moins d’une seconde, et vous avec. Passez « En orbite » pour voir la suite d’en haut : le temps continue.') },
    ];
    return;
  }
  const J = [
    { t: PH.T0 + 1.5, h: T('Vu d’en haut'), x: TF('Vous êtes à {0} km du point d’impact, à {1} km d’altitude, immobile au sud-est. La mer peu profonde sous le repère est la plate-forme du Yucatán. Continents : positions d’il y a 66 millions d’années, contours inventés.', [fmtKm(d), fmtKm(I.alt)]) },
    { t: -44, h: T('Douze kilomètres de roche'), x: I.tClosest > PH.T0 ? TF('Il arrive du nord-est à 20 km/s et passera à {0} km de vous, à T−{1} s. Molette pour zoomer.', [fmtKm(I.miss), Math.round(-I.tClosest)]) : TF('Il arrive du nord-est à 20 km/s. Il ne passera pas plus près de vous que {0} km. Molette pour zoomer.', [fmtKm(Math.min(I.miss, d))]) },
    { t: PH.T_ENTRY, h: T('Entrée dans l’atmosphère'), x: T('Vue d’ici, l’atmosphère est la mince ligne bleue au bord du globe. Il la traverse en 5,8 secondes.') },
    { t: 0.05, h: T('Impact'), x: T('La boule de feu fait 300 km de large en quelques secondes. Dans le vide, aucun son ne vous parviendra jamais.') },
    { t: 30, h: T('Le panache sort de l’atmosphère'), x: I.tPlume ? TF('Roche vaporisée et fondue montent à plusieurs km/s. À cette distance, le panache vous atteindra à T+{0}.', [fmtDur(I.tPlume)]) : T('Roche vaporisée et fondue montent à plusieurs km/s. Les points lumineux sont des éjectas en vol balistique, certains plus haut que vous.') },
    { t: 130, h: T('Le cercle qui s’élargit'), x: T('C’est la zone où les éjectas retombent. L’anneau rouge est l’air chauffé par leur rentrée : en dessous, le ciel est un gril.') },
    { t: 500, h: T('Deux anneaux plus lents'), x: T('Le trait pâle qui suit loin derrière est l’onde de choc dans l’air, à la vitesse du son. Plus lent encore, sur l’océan seulement : le tsunami.') },
    { t: 1100, h: T('Un hémisphère sous le gril'), x: T('Sur les terres déjà couvertes, côté nuit, les points orange sont des incendies.') },
    { t: 2020, h: T('Les antipodes'), x: T('Les éjectas les plus rapides ont fait le demi-tour de la planète en une demi-heure. Il n’existe plus aucun endroit épargné.') },
  ];
  if (I.tPlume) J.push({ t: I.tPlume, h: T('Dans le panache'), x: T('Vous êtes à l’intérieur du nuage de roche. Reculez (S ou flèche bas, Maj pour aller vite) pour en sortir.') });
  JOURNAL = J.sort((a, b) => a.t - b.t);
}
function buildTimeline() {
  if (MODE === 'orbit') { buildOrbitTimeline(); return; }
  const D = PH.D, a0 = astState(PH.T0);
  EVENTS = [{ t: PH.T0, label: T('Début') }, { t: PH.T_ENTRY, label: T('Entrée atmosphérique') }, { t: 0, label: T('Impact') }];
  if (!PH.inside) EVENTS.push({ t: PH.T_P, label: T('Ondes sismiques') }, { t: PH.T_S, label: T('Ondes de surface') }, { t: PH.T_EJ, label: T('Rentrée des éjectas') }, { t: PH.T_HAIL, label: T('Éjectas au sol') }, { t: PH.T_BLAST, label: T('Onde de choc') }, { t: PH.T_TSU, label: T('Tsunami') });
  else EVENTS.push({ t: PH.T_TSU, label: T('Retour de la mer') });
  EVENTS.sort((a, b) => a.t - b.t);
  const J = [
    { t: PH.T0 + 1.5, h: T('L’astéroïde est déjà là'), x: TF('À {0} km de vous, encore dans l’espace, il avance à {1} km/s. À T−40 s il aura la taille apparente de la Lune, placée juste à côté pour comparer. Molette pour zoomer.', [fmtKm(a0.range), PH.V]) },
    { t: -32, h: T('Aucun bruit, aucune traînée'), x: D < 150 ? T('Tant qu’il est dans le vide, c’est un rocher éclairé par le Soleil. Il vient droit sur vous.') : T('Tant qu’il est dans le vide, c’est un rocher éclairé par le Soleil, comme la Lune à côté. Il descend vers le nord-ouest.') },
    { t: PH.T_ENTRY, h: T('Entrée dans l’atmosphère'), x: TF('Il traverse les 100 derniers kilomètres en {0} secondes. L’air n’a pas le temps de le freiner.', [Math.abs(PH.T_ENTRY).toFixed(1).replace('.', DEC)]) },
  ];
  if (PH.inside) {
    J.push({ t: 0.05, h: T('Impact'), x: PH.crater ? T('Vous êtes dans le cratère. La roche sous vos pieds est vaporisée ou fondue sur des kilomètres d’épaisseur.') : TF('Vous êtes à {0} km, à l’intérieur de la boule de feu. Rien de ce qui était ici n’existe plus.', [D]) },
      { t: 20, h: T('Le cratère transitoire'), x: T('Un trou d’environ 100 km de large et 30 km de profondeur s’ouvre en moins d’une minute, puis s’effondre sur lui-même.') },
      { t: 300, h: T('L’anneau de pics'), x: T('Le centre rebondit plus haut que l’Himalaya, puis retombe. Il en reste un anneau de montagnes et un cratère final de 180 km.') },
      { t: PH.T_TSU - 60, h: T('La mer revient'), x: T('L’océan se rue dans le cratère encore brûlant.') });
  } else {
    const suns = D < 500 ? T('des centaines de fois') : D < 1100 ? T('des dizaines de fois') : T('plusieurs fois');
    J.push({ t: 0.05, h: T('Impact'), x: TF('À {0} km d’ici{1}. Silence complet : le son mettra {2} à arriver.', [fmtKm(D), PH.drop > 1 ? T(', sous l’horizon') : '', fmtDur(PH.T_BLAST)]) });
    if (PH.visible) J.push({ t: 4, h: T('La boule de feu passe l’horizon'), x: TF('Elle rayonne ici {0} plus que le Soleil, pendant des minutes.{1}', [suns, PH.burn ? T(' Un être vivant à découvert meurt maintenant. Vous restez comme témoin.') : '']) });
    else J.push({ t: 4, h: T('L’horizon s’embrase'), x: TF('La boule de feu reste cachée par la courbure de la Terre : il lui manque {0} km de hauteur. Seule sa lueur vous atteint, et la faune survit à l’éclair.', [fmtKm(PH.drop - 150)]) });
    J.push({ t: 28, h: T('Le panache quitte l’atmosphère'), x: T('Roche vaporisée et fondue montent à plusieurs km/s. Une partie fera le tour de la planète.') },
      { t: PH.T_P, h: T('Le sol arrive avant l’air'), x: TF('Les ondes sismiques ont couvert {0} km en {1}. Séisme de magnitude 10 environ.', [fmtKm(D), fmtDur(PH.T_P)]) },
      { t: PH.T_S, h: T('Ondes de surface'), x: T('Les plus destructrices. Le lagon entier se met à osciller.') },
      { t: PH.T_EJ * 0.62, h: T('Le ciel s’allume'), x: T('Les éjectas rentrent dans l’atmosphère par milliards. Chaque traînée chauffe l’air : le ciel devient un gril.') },
      { t: PH.T_EJ, h: T('Les éjectas rentrent au-dessus de vous'), x: TF('Après {0} de vol balistique. L’air les freine vers 70 km d’altitude, puis ils tombent à leur vitesse limite : les plus gros arrivent en premier.', [fmtDur(PH.T_EJ)]) },
      PH.dm < 0.002 ? { t: PH.T_HAIL, h: T('Pluie de sable de verre'), x: TF('Des grains d’environ {0}, invisibles un par un, mais qui voilent l’air et crépitent sur l’eau. Couche finale : {1}.', [fmtSize(PH.dm), fmtSize(PH.thickReal)]) }
      : PH.dm < 0.03 ? { t: PH.T_HAIL, h: T('Grêle de billes de verre'), x: TF('Des gouttes de roche fondue figées en vol, {0} en moyenne, froides à l’arrivée. Regardez l’eau et le sable à vos pieds. Couche finale : {1}.', [fmtSize(PH.dm), fmtSize(PH.thickReal)]) }
      : PH.dm < 0.15 ? { t: PH.T_HAIL, h: T('Pluie de pierres'), x: TF('Fragments de {0} en moyenne, les plus gros encore brûlants. Couche finale : {1}, de quoi combler le lagon.', [fmtSize(PH.dm), fmtSize(PH.thickReal)]) }
      : { t: PH.T_HAIL, h: T('Une avalanche tombée du ciel'), x: TF('Blocs de {0} en moyenne, certains de plusieurs mètres, incandescents. La couverture d’éjectas atteindra {1} : l’île et le lagon sont ensevelis.', [fmtSize(PH.dm), fmtSize(PH.thickReal)]) },
      { t: PH.T_EJ + 500, h: T('La nuit en plein matin'), x: T('Poussière et suie masquent le Soleil. Il ne reste que la lueur des braises.') },
      { t: PH.T_BLAST, h: T('L’onde de choc'), x: TF('Le bruit de l’impact, avec {0} de retard, et un souffle qui couche ce qui tenait encore debout.', [fmtDur(PH.T_BLAST)]) },
      { t: PH.T_TSU - 520, h: T('La mer se retire'), x: T('Le creux qui précède la vague vide le lagon. Le fond marin apparaît.') },
      { t: PH.T_TSU - 45, h: T('Le tsunami'), x: TF('Un mur d’eau de l’ordre de {0} m, parti il y a {1}. Regardez vers le nord-ouest.', [Math.round(PH.TSU_H / 10) * 10, fmtDur(PH.T_TSU)]) },
      { t: PH.T_TSU + 420, h: T('Et après'), x: T('D’autres vagues suivent pendant des heures. Puis des mois d’obscurité et de froid : trois quarts des espèces disparaissent. Le temps continue, vous pouvez rester.') });
  }
  JOURNAL = J.sort((a, b) => a.t - b.t);
}

// Ce qui touche le sol à l'instant t : les fragments de taille d mettent 16000 / v(d) secondes à traverser l'atmosphère,
// donc les gros arrivent d'abord. F = fraction de la couche déjà déposée (distribution log-logistique autour de dm).
function ejState(t) {
  const tau = t - PH.T_EJ;
  if (PH.inside || tau <= 1) return { vi: 0, F: 0, size: PH.dm * 25, flux: 0 };
  const da = (16000 / tau) ** 2 / 57900, q = Math.pow(da / PH.dm, 1.7);
  const F = 1 / (1 + q), flux = 3.4 / tau * q / ((1 + q) ** 2);
  return { vi: clamp(flux / (0.85 / PH.tauP), 0, 1), F, flux, size: clamp(da, PH.dm / 40, PH.dm * 25) };
}
function stateAt(t) {
  const a = astState(t), s = { ast: a }, fs = PH.fireScale, D = PH.D, tp = Math.max(t, 0);
  const entry = t < 0 ? sstep(PH.T_ENTRY - 0.4, PH.T_ENTRY + 1.2, t) : 0;
  s.astBody = t < 0 ? 1 - sstep(PH.T_ENTRY, PH.T_ENTRY + 1.0, t) : 0;
  s.astGlow = t < 0 ? entry * (1 + 2.5 * sstep(-4, 0, t)) : 3.5 * Math.exp(-t / 1.6);
  if (t < 0) s.fire = 1.3 * entry * (1 + 1.5 * sstep(-3, 0, t)) * (a.el > -1 ? clamp(fs, 0.4, 4) : 0.1);
  else if (PH.inside) s.fire = 3000 * Math.exp(-t / 2.5) + 70 * Math.exp(-t / 50) + 4 * Math.exp(-t / 700) + 0.4;
  else s.fire = (320 * Math.exp(-t / 0.55) + 8.5 * sstep(0.3, 6, t) * Math.exp(-t / 170) + 1.1 * Math.exp(-t / 1600)) * fs;
  const TE = PH.inside ? 60 : PH.T_EJ;
  s.dust = 0.9 * sstep(0.35 * TE, 1.06 * TE, t) + 0.07 * sstep(TE, TE + 1100, t);
  s.glow = sstep(0.47 * TE, TE, t) * (1 - 0.93 * sstep(TE + 120, TE + 1000, t)) + 0.05 * sstep(TE, TE + 1000, t);
  s.streak = PH.inside ? 0 : sstep(0.27 * TE, 0.8 * TE, t) * (1 - sstep(TE + 500, TE + 1600, t));
  s.steam = PH.burn && !PH.inside ? sstep(2, 18, t) * (1 - 0.5 * sstep(300, 900, t)) * clamp(fs, 0, 1.5) : 0;
  let q = 0;
  if (!PH.inside) {
    if (t > PH.T_P) q += 0.3 * sstep(0, 3, t - PH.T_P) * Math.exp(-(t - PH.T_P) / 60);
    if (t > PH.T_S) q += 1.0 * sstep(0, 6, t - PH.T_S) * Math.exp(-(t - PH.T_S) / 140);
    q *= PH.quakeAmp;
  } else if (t > 0) q = 2.5 * Math.exp(-t / 120);
  s.quake = Math.min(q, 2.6);
  const e = ejState(t);
  s.ej = e.vi; s.ejSize = e.size; s.ejF = e.F;
  s.dep = PH.thick * e.F; s.depReal = PH.thickReal * e.F;
  s.ash = clamp(s.depReal / (4 * PH.dm), 0, 1);
  s.hot = sstep(0.04, 0.3, e.size);
  s.ejFog = Math.min(0.9 * PH.thickReal * e.flux / (vTerm(e.size) * e.size), 0.03);   // l'averse voile l'air
  s.ejN = 0.6 * PH.thickReal * e.flux / (0.5236 * e.size ** 3);                        // fragments par m² et par seconde
  s.ejKg = PH.thickReal * e.flux * 1600;                                               // kg par m² et par seconde
  const tb = t - PH.T_BLAST, bl = !PH.inside && tb > 0;
  s.mist = bl ? Math.exp(-tb / 14) : 0; s.wind = bl ? Math.exp(-tb / 110) : 0; s.slam = bl ? Math.exp(-tb / 2.2) : 0;
  // tsunami : retrait, puis mur d'eau
  const tt = t - PH.T_TSU;
  s.draw = sstep(PH.T_TSU - 560, PH.T_TSU - 100, t) * (1 - sstep(-10, 25, tt));
  s.tsuH = t > PH.T_TSU - 420 ? PH.TSU_H * sstep(PH.T_TSU - 420, PH.T_TSU - 380, t) * Math.exp(-Math.max(tt, 0) / 800) : 0;
  if (s.tsuH < 0.25) s.tsuH = 0;
  s.tsuFront = tt * 30;
  // panache : hauteur, largeur, puis engloutissement du ciel quand le rideau d'éjectas arrive
  const Rf = 150 * (1 - Math.exp(-tp / 2.5));
  const H = Math.min(Math.max(Rf, 20 + 5.5 * Math.pow(tp, 0.92)), 2200), w0 = Rf * 0.9 + 0.0049 * tp * tp;
  s.engulf = t <= 0 ? 0 : PH.inside ? sstep(0.2, 1.5, t) : sstep(0.72, 1.05, w0 / D);
  s.innerEm = PH.inside ? 40 * Math.exp(-t / 30) + 2 * Math.exp(-t / 500) + 0.12 : 0.35 * Math.exp(-Math.max(t - PH.T_EJ, 0) / 500) + 0.03;
  s.melt = PH.inside && t > 0 ? 0.25 + 0.75 * Math.exp(-t / 1500) : 0;
  s.fireEl = PH.inside ? 80 : clamp(Math.atan((H * 0.35 - PH.drop) / Math.max(D, 50)) / DEG, 1.5, 30);
  const c = sstep(3, 90, t), c2 = sstep(200, 900, t);
  s.fireCol = [1, lerp(lerp(0.95, 0.55, c), 0.3, c2), lerp(lerp(0.85, 0.22, c), 0.06, c2)];
  return s;
}

function applyState(S, dt) {
  const t = sim.t;
  U.uT.value = t; U.uD.value = PH.D; U.uDrop.value = PH.drop;
  U.uDust.value = S.dust; U.uGlow.value = S.glow; U.uStreak.value = S.streak;
  U.uFire.value = S.fire; U.uFireCol.value.set(...S.fireCol);
  U.uSunVis.value = 1 - 0.97 * S.dust;
  U.uEngulf.value = S.engulf; U.uInnerEm.value = S.innerEm; U.uMelt.value = S.melt; U.uAsh.value = S.ash; U.uRain.value = S.ej; U.uFroth.value = clamp(S.ejN / 4000, 0, 1); U.uDep.value = DEP = S.dep; U.uBead.value = PH.dm; U.uHot.value = Math.max(S.hot * S.ej, sstep(0.03, 0.25, PH.dm) * S.ejF * Math.exp(-Math.max(t - PH.T_EJ - PH.tauP, 0) / 900)); terrainMesh.position.y = S.dep;
  const a = S.ast;
  if (t < 0) {
    U.uAstDir.value.copy(a.dir); U.uAstAng.value = a.ang;
    const d = a.dir.clone(); if (d.y < 0.02) { d.y = 0.02; d.normalize(); }
    U.uFireDir.value.copy(d);
  } else {
    U.uFireDir.value.copy(azDir(315, S.fireEl)); U.uAstDir.value.copy(astState(0).dir);
  }
  U.uAstBody.value = S.astBody; U.uAstGlow.value = S.astGlow;
  U.uTrail.value = t < PH.T_ENTRY ? 0 : t < 0 ? sstep(PH.T_ENTRY, PH.T_ENTRY + 0.6, t) : Math.exp(-t / 9); U.uTrailW.value = Math.max(t, 0) * 0.0016;
  // exposition : l'œil s'adapte, vite vers le sombre, lentement vers le clair
  const target = 1 / (1 + 0.36 * Math.pow(S.fire, 0.9)) * (1 + 1.1 * S.dust * (1 - Math.min(S.glow * 1.2, 1)));
  const rate = target < sim.exposure ? 2.2 : 0.5;
  sim.exposure = lerp(sim.exposure, target, 1 - Math.exp(-rate * Math.min(dt * Math.max(1, Math.min(sim.speed, 8)), 1)));
  renderer.toneMappingExposure = sim.exposure * 0.80;
  const day = 1 - 0.93 * S.dust;
  U.uAmb.value.set(0.45 * day + 0.42 * S.glow + 0.035, 0.45 * day + 0.13 * S.glow + 0.022, 0.62 * day + 0.03 * S.glow + 0.02);
  const fc = S.fireCol, fg = Math.min(S.fire, 40) * 0.035, st = S.steam, mi = S.mist;
  let fr = lerp(0.98 * day, 0.9 * day + 0.25, st * 0.5) + fc[0] * fg + 0.26 * S.glow,
    fgc = lerp(0.74 * day, 0.86 * day + 0.2, st * 0.5) + fc[1] * fg + 0.08 * S.glow,
    fb = lerp(0.70 * day, 0.84 * day + 0.18, st * 0.5) + fc[2] * fg + 0.02 * S.glow;
  let den = 0.00024 + 0.00055 * st + 0.00016 * S.dust + 0.006 * mi + S.ejFog;
  if (mi > 0) { const m = Math.min(1, mi * 1.5), g = 0.20 + 0.25 * day + 0.3 * S.glow; fr = lerp(fr, g * 1.05, m); fgc = lerp(fgc, g * 0.95, m); fb = lerp(fb, g * 0.88, m); }
  if (PH.inside && t > 0) { const e = Math.min(S.innerEm, 3) * 0.45 + 0.02; fr = e; fgc = e * 0.42; fb = e * 0.1; den = 0.0005 + 0.006 * Math.exp(-t / 90); }
  U.uFogCol.value.set(fr, fgc, fb); U.uFogDen.value = den;
  scene.fog.color.setRGB(fr, fgc, fb); scene.fog.density = den;
  const fl = Math.min(S.fire, 12) * 0.18;
  U.uWaterLight.value.set(0.9 * day + fc[0] * fl + 0.30 * S.glow + 0.03, 0.9 * day + fc[1] * fl + 0.1 * S.glow + 0.025, 0.95 * day + fc[2] * fl + 0.03 * S.glow + 0.025);
  rain.mat.color.setRGB(Math.min(U.uWaterLight.value.x * 0.75 + 0.03, 1), Math.min(U.uWaterLight.value.y * 0.72 + 0.03, 1), Math.min(U.uWaterLight.value.z * 0.68 + 0.03, 1));
  { const w = U.uWaterLight.value; smoke.mat.uniforms.uLight.value.set(w.x * 1.1 + 0.02, w.y * 1.1 + 0.02, w.z * 1.1 + 0.02); splash.mat.uniforms.uLight.value.copy(smoke.mat.uniforms.uLight.value); }
  sunLight.intensity = 9.4 * U.uSunVis.value;
  fireLight.intensity = Math.min(S.fire, 400) * 3.14;
  fireLight.color.setRGB(fc[0], fc[1], fc[2]);
  fireLight.position.copy(U.uFireDir.value);
  hemi.intensity = 1.6 * day + 0.9 * S.glow + 0.08;
  hemi.color.setRGB(lerp(0.56, 1, S.glow), lerp(0.58, 0.4, S.glow), lerp(0.85, 0.15, S.glow));
  // niveau de la mer : houle sismique, retrait, tsunami
  sim.seiche += dt * (0.9 + 0.5 * S.quake);
  U.uWater.value = S.quake * 0.42 * Math.sin(sim.seiche * 1.3) + S.quake * 0.14 * Math.sin(sim.seiche * 3.1) - 6.5 * S.draw;
  U.uTsuH.value = S.tsuH; U.uTsuFront.value = S.tsuFront;
  U.uChop.value = 1 + 3.2 * S.quake + 0.8 * S.ej + 3.5 * S.wind + (S.tsuH > 0 && t > PH.T_TSU ? 2.5 * Math.exp(-(t - PH.T_TSU) / 600) : 0);
  water.visible = !(PH.inside && t > 0.05 && t < PH.T_TSU - 420);
  sim.shake = S.quake + 2.2 * S.slam;
  const sea = !PH.inside ? t < PH.T_HAIL + 120 : t < 0.05;
  turtle.visible = fish.visible = mosa.m.visible = sea;
}

// ---------------------------------------------------------------- éjectas, souffle, tsunami : particules
// un fragment suivi individuellement : gravier, pierre ou bloc
function spawnStone(size) {
  const p = player.pos, v = vTerm(size), R = clamp(900 * size, 25, 320);
  const ang = player.yaw + rr(-1.4, 1.4), r = 4 + R * Math.sqrt(rnd());
  const tx = p.x - Math.sin(ang) * r, tz = p.z - Math.cos(ang) * r, T = rr(1.6, 3);
  const vel = new V3(-GZ_H.x * v * 0.12 + rr(-2, 2), -v, -GZ_H.z * v * 0.12 + rr(-2, 2));
  const ty = Math.max(terrainH(tx, tz), waterY(tx, tz));
  bolides.push({ pos: new V3(tx, ty, tz).addScaledVector(vel, -T), vel, s: size, hot: sstep(0.05, 0.3, size) });
}
function updateEjecta(dt, S) {
  const p = player.pos;
  hail.visible = false;
  if (S.ej > 0.003) {
    const size = S.ejSize, v = vTerm(size), vi = S.ej;
    // l'averse : un grain ne se distingue qu'à courte distance, d'autant plus courte qu'il est petit
    const R = clamp(3000 * size, 12, 220), alpha = clamp(0.35 + 130 * size, 0.35, 1);
    rain.L = rainHot.L = clamp(0.022 + 0.0006 / size, 0.022, 0.05); rain.mat.opacity = 0.85 * alpha;
    // traits de l'averse : densité réelle dans l'air ~ débit / vitesse, jusqu'à 850 billes par m³ à 800 km
    hail.visible = true;
    hailU.uBox.value.set(clamp(2400 * size, 12, 300), clamp(1600 * size, 9, 120), clamp(2400 * size, 12, 300));
    hailU.uOff.value.x -= GZ_H.x * v * 0.06 * dt; hailU.uOff.value.z -= GZ_H.z * v * 0.06 * dt; hailU.uOff.value.y += v * dt;
    hailU.uLen.value = v * clamp(0.016 + 0.00002 / size, 0.016, 0.022); hailU.uSl.value.set(GZ_H.x * 0.06, GZ_H.z * 0.06);
    hailU.uDens.value = vi * clamp(Math.pow(0.006 / size, 1.1), 0.02, 1);
    hailU.uA.value = 0.5 * alpha; hailU.uCol.value.set(rain.mat.color.r * 0.8, rain.mat.color.g * 0.8, rain.mat.color.b * 0.8);
    const n = dt * 2600 * vi * S.hot, ni = Math.floor(n) + (rnd() < n % 1 ? 1 : 0), top = Math.min(v * 0.9, 70);
    for (let i = 0; i < ni; i++) {
      const r = 1.5 + R * Math.sqrt(rnd()), ang = player.yaw + rr(-1.75, 1.75);
      const x = p.x - Math.sin(ang) * r, z = p.z - Math.cos(ang) * r;
      const g = Math.max(terrainH(x, z), waterY(x, z)), y = Math.max(p.y + rr(-3, top), g + 1), vy = -v * rr(0.75, 1.3);
      if (rnd() < S.hot * 0.5) rainHot.spawn(x, y, z, -GZ_H.x * v * 0.08, vy, -GZ_H.z * v * 0.08, (y - g) / -vy);
    }
    // les fragments assez gros pour être suivis un par un
    if (size > 0.025) {
      const m = dt * 26 * vi * clamp(size / 0.08, 0.3, 1), mi = Math.floor(m) + (rnd() < m % 1 ? 1 : 0);
      for (let i = 0; i < mi && bolides.length < 90; i++) spawnStone(size * Math.exp(rr(-0.9, 1.5)));
    } else if (PH.dm > 0.003 && rnd() < dt * 0.5 * vi) spawnStone(Math.min(size * rr(4, 9), 0.08));
    // impacts de la grêle à vos pieds : couronnes sur l'eau, rebonds sur le sable
    if (size < 0.06) {
      const sc = clamp(size / 0.005, 0.25, 6), k = dt * 9000 * vi * clamp(S.ejN / 4000, 0.06, 1), ki = Math.min(420, Math.floor(k) + (rnd() < k % 1 ? 1 : 0));
      for (let i = 0; i < ki; i++) {
        const r = 0.5 + 9 * rnd() ** 0.8, ang = player.yaw + rr(-1.3, 1.3);
        const x = p.x - Math.sin(ang) * r, z = p.z - Math.cos(ang) * r, g = terrainH(x, z), wl = waterY(x, z);
        if (g < wl) {
          const h = Math.sqrt(sc);
          splash.spawn(x, wl + 0.01, z, rr(-.15, .15), rr(1.1, 2.2) * h, rr(-.15, .15), rr(0.22, 0.4), 0.035 * h, 0.95, 0.97, 1, 0.9, 0.05);
          if (i % 2 === 0) for (let j = 0; j < 3; j++) { const a = rr(0, 6.283); splash.spawn(x, wl + 0.01, z, Math.cos(a) * 0.5 * h, rr(0.5, 1.1) * h, Math.sin(a) * 0.5 * h, rr(0.18, 0.3), 0.02 * h, 0.95, 0.97, 1, 0.8); }
        } else {
          // la bille rebondit, sombre et vitreuse
          const a = rr(0, 6.283), vb = rr(0.3, 1.2);
          splash.spawn(x, g + 0.01, z, Math.cos(a) * vb, rr(0.8, 2.4) * Math.sqrt(sc), Math.sin(a) * vb, rr(0.3, 0.55), clamp(size * 2.2, 0.012, 0.09), 0.10, 0.10, 0.08, 1);
          if (i % 12 === 0) smoke.spawn(x, g + 0.03, z, rr(-.2, .2), rr(0.1, 0.4), rr(-.2, .2), rr(0.4, 0.9), 0.08 * Math.sqrt(sc), 0.6, 0.52, 0.42, 0.25, 0.3);
        }
      }
    }
  }
  for (let i = bolides.length - 1; i >= 0; i--) {
    const b = bolides[i], hs = Math.max(b.s, 0.07);
    b.pos.addScaledVector(b.vel, dt);
    splash.spawn(b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y + 9.8 * 0.06, b.vel.z, 0.06, hs * 2.2, 0.09, 0.08, 0.07, 1);
    if (b.hot > 0.05) {
      const n = Math.max(1, Math.round(dt * 70 * b.hot));
      for (let k = 0; k < n; k++) {
        const u = rnd(), x = b.pos.x - b.vel.x * dt * u, y = b.pos.y - b.vel.y * dt * u, z = b.pos.z - b.vel.z * dt * u;
        glowP.spawn(x, y, z, rr(-.4, .4), rr(-.4, .4), rr(-.4, .4), rr(0.2, 0.5), hs * rr(1.2, 2.2), 1, rr(0.4, 0.65), 0.1, 0.8 * b.hot, -1.5 * hs);
        if (k % 2 === 0) smoke.spawn(x, y, z, rr(-.5, .5), rr(0.2, 1.2), rr(-.5, .5), rr(1.5, 3.5), hs * 1.6, 0.16, 0.13, 0.11, 0.35 * b.hot, 1.4 * hs);
      }
      glowP.spawn(b.pos.x, b.pos.y, b.pos.z, b.vel.x, b.vel.y, b.vel.z, 0.07, hs * 5, 1, 0.8, 0.45, b.hot);
    }
    const g = terrainH(b.pos.x, b.pos.z), wl = waterY(b.pos.x, b.pos.z);
    if (b.pos.y <= Math.max(g, wl)) {
      const E = clamp(b.s * 9, 0.25, 12);
      if (wl > g) {
        burstSplash(b.pos.x, wl, b.pos.z, E);
        if (b.hot > 0.2) for (let k = 0; k < 8; k++) smoke.spawn(b.pos.x + rr(-1, 1) * E * 0.3, wl + rr(0, 1.5), b.pos.z + rr(-1, 1) * E * 0.3, rr(-1, 1), rr(1.5, 4), rr(-1, 1), rr(2, 4), 0.8 * E, 0.85, 0.85, 0.88, 0.3, 1.2 * E);
      } else {
        const nd = Math.round(4 + 5 * E);
        for (let k = 0; k < nd; k++) { const a = rr(0, 6.283), vv = rr(1, 4) * Math.sqrt(E); splash.spawn(b.pos.x, g + 0.05, b.pos.z, Math.cos(a) * vv, rr(2, 6) * Math.sqrt(E), Math.sin(a) * vv, rr(0.5, 1.1), 0.05 * E + 0.02, 0.2, 0.17, 0.13, 1); }
        for (let k = 0; k < nd / 2; k++) smoke.spawn(b.pos.x + rr(-1, 1) * E * 0.2, g + rr(0, 0.5), b.pos.z + rr(-1, 1) * E * 0.2, rr(-1.5, 1.5), rr(0.6, 2.5), rr(-1.5, 1.5), rr(1.5, 4), 0.5 * E, 0.5, 0.42, 0.33, 0.4, 0.9 * E);
        if (b.hot > 0.2) { for (let k = 0; k < 14; k++) { const a = rr(0, 6.283), vv = rr(2, 9); glowP.spawn(b.pos.x, g + 0.2, b.pos.z, Math.cos(a) * vv, rr(3, 12), Math.sin(a) * vv, rr(0.4, 1.1), rr(0.15, 0.4), 1, 0.55, 0.15, 1); } glowP.spawn(b.pos.x, g + 0.25, b.pos.z, 0, 0, 0, rr(15, 35), 1.5 * b.s + 0.3, 1, 0.42, 0.08, 0.9 * b.hot); }
      }
      bolides.splice(i, 1);
    }
  }
  // souffle : embruns arrachés à la mer
  if (S.wind > 0.03) {
    const n = dt * 260 * S.wind;
    for (let i = 0; i < n; i++) {
      const x = p.x + rr(-60, 60), z = p.z + rr(-60, 60), y = Math.max(terrainH(x, z), waterY(x, z)) + rr(0, 3 + 14 * S.mist);
      const v = 22 + 60 * S.wind;
      smoke.spawn(x, y, z, -GZ_H.x * v + rr(-3, 3), rr(-1, 3), -GZ_H.z * v + rr(-3, 3), rr(0.5, 1.3), rr(1.5, 5), 0.85, 0.83, 0.8, 0.10 + 0.12 * S.mist, 5);
    }
  }
  // tsunami : écume projetée par le front
  if (S.tsuH > 1) {
    const sp = p.x * TSU_DIR.x + p.z * TSU_DIR.y - S.tsuFront;
    if (sp > -700 && sp < 2200) {
      const n = dt * 420, px0 = p.x * -TSU_DIR.y + p.z * TSU_DIR.x;
      for (let i = 0; i < n; i++) {
        const along = S.tsuFront - rr(0, 190), px = px0 + rr(-420, 420);
        const x = TSU_DIR.x * along - TSU_DIR.y * px, z = TSU_DIR.y * along + TSU_DIR.x * px;
        splash.spawn(x, waterY(x, z) + rr(0, 2), z, TSU_DIR.x * rr(20, 38), rr(4, 18), TSU_DIR.y * rr(20, 38), rr(1.4, 3.0), rr(7, 18), 0.95, 0.95, 0.93, 0.22, 9);
      }
    }
  }
}

// ---------------------------------------------------------------- son
let audio = null;
function initAudio() {
  if (audio) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.35 + b * 2.4; }
    const master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const chain = (type, freq, q, gain) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain; src.connect(f); f.connect(g); g.connect(master); src.start();
      return { g, f };
    };
    audio = { ctx, master, surf: chain('lowpass', 520, 0.3, 0.05), wind: chain('bandpass', 380, 0.4, 0.03), rumble: chain('lowpass', 95, 0.7, 0), fire: chain('bandpass', 900, 0.5, 0), hiss: chain('highpass', 2500, 0.3, 0), roar: chain('lowpass', 260, 0.4, 0), muted: false };
  } catch (e) { audio = null; }
}
function updateAudio(S, time) {
  if (!audio) return;
  const T = audio.ctx.currentTime, set = (n, v) => n.g.gain.setTargetAtTime(v, T, 0.15);
  let tsu = 0;
  if (S.tsuH > 1) { const sp = player.pos.x * TSU_DIR.x + player.pos.z * TSU_DIR.y - S.tsuFront; tsu = sp > 0 ? Math.exp(-sp / 900) : Math.exp(sp / 6000); }
  set(audio.surf, 0.05 + 0.035 * Math.sin(time * 0.75) + 0.2 * Math.min(S.quake, 1.5) + 0.5 * tsu + 0.6 * S.ej * U.uFroth.value);
  set(audio.wind, 0.025 + 0.02 * Math.sin(time * 0.13) + 0.05 * S.dust + 0.9 * S.wind);
  audio.wind.f.frequency.setTargetAtTime(380 + 500 * S.wind, T, 0.3);
  set(audio.rumble, Math.min(2.2 * S.quake + 6 * S.slam + 1.5 * S.mist + 1.2 * S.ej * S.hot, 5));
  set(audio.roar, 1.6 * tsu + 0.5 * S.slam);
  const burning = palms.reduce((n, p) => n + (p.g.visible && p.lm.emissive.r > 0.1 ? 1 : 0), 0);
  set(audio.fire, 0.012 * burning + (PH.inside && sim.t > 0 ? 0.08 : 0));
  set(audio.hiss, S.ej * (0.10 + 0.5 * U.uFroth.value));

  audio.master.gain.setTargetAtTime(audio.muted || sim.paused ? 0 : 0.7, T, 0.1);
}

// ---------------------------------------------------------------- interface
const $ = id => document.getElementById(id);
const hud = { clock: $('clock'), sub: $('sub'), data: $('data'), speed: $('speed'), journal: $('journal'), marker: $('marker'), mlabel: $('mlabel'), bar: $('barfill'), ticks: $('ticks'), start: $('start'), root: $('hud'),
  spd: $('spd'), dist: $('dist'), dist2: $('dist2'), dlabel: $('dlabel'), dlabel2: $('dlabel2'), dinfo: $('dinfo') };
let journalIdx = 0;
function pushJournal(e) {
  const d = document.createElement('div'); d.className = 'entry';
  d.innerHTML = `<b>${e.h}</b><span>${e.x}</span>`;
  hud.journal.prepend(d);
  requestAnimationFrame(() => d.classList.add('on'));
  while (hud.journal.children.length > 3) hud.journal.lastChild.remove();
  [...hud.journal.children].forEach((c, i) => c.style.opacity = i === 0 ? '' : String(0.55 - 0.2 * i));
}
const tl = t => t <= 0 ? 0.16 * (t - PH.T0) / -PH.T0 : 0.16 + 0.84 * Math.log(1 + t / 12) / Math.log(1 + PH.T_END / 12);
function buildTicks() {
  hud.ticks.innerHTML = '';
  EVENTS.forEach(e => { const d = document.createElement('i'); d.style.left = (tl(e.t) * 100) + '%'; d.title = e.label; hud.ticks.appendChild(d); });
}
const SPEEDS = [1, 2, 5, 10, 30, 60, 120, 300, 600];
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600, 1000];
const fmtSpeed = v => v >= 10 ? String(Math.round(v)) : String(Math.round(v * 100) / 100).replace('.', DEC);
function setSpeed(v) { sim.speed = clamp(v, 0.1, 1000); hud.spd.value = String(Math.round(250 * Math.log10(sim.speed / 0.1))); }
function nudgeSpeed(dir) {
  if (dir > 0) setSpeed(STEPS.find(x => x > sim.speed * 1.01) ?? 1000);
  else setSpeed([...STEPS].reverse().find(x => x < sim.speed * 0.99) ?? 0.1);
}
function updateHud(S) {
  const t = sim.t, a = Math.abs(t), h = Math.floor(a / 3600), m = Math.floor(a % 3600 / 60), s = Math.floor(a % 60);
  hud.clock.textContent = `T ${t < 0 ? '−' : '+'} ${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  hud.speed.textContent = sim.paused ? T('PAUSE') : `×${fmtSpeed(sim.speed)}`;
  const A = S.ast;
  if (t < 0) {
    hud.sub.textContent = t < PH.T_ENTRY ? T('avant l’impact') : T('dans l’atmosphère');
    hud.data.innerHTML = TF('Distance <b>{0} km</b> · Altitude <b>{1} km</b><br>Taille apparente <b>{2}°</b> · Lune <b>0,52°</b>', [fmtKm(A.range), fmtKm(A.alt), (A.ang * 2 / DEG).toFixed(2).replace('.', DEC)]);
  } else {
    hud.sub.textContent = TF('après l’impact · à {0} km', [fmtKm(PH.D)]);
    const nx = EVENTS.find(e => e.t > t);
    let hh = nx ? TF('Prochain : <b>{0}</b> dans {1}', [nx.label, fmtDur(nx.t - t)]) : T('Plus d’événement programmé : le temps continue.');
    if (S.ejF > 0.002) {
      hh += TF('<br>Éjectas : il tombe du <b>{0}</b> · déposé <b>{1}</b> sur {2}', [fmtSize(S.ejSize), fmtSize(S.depReal), fmtSize(PH.thickReal)]);
      const what = S.ejSize < 0.002 ? T('grains') : S.ejSize < 0.03 ? T('billes') : S.ejSize < 0.2 ? T('pierres') : T('blocs');
      const mass = S.ejKg >= 10 ? `${Math.round(S.ejKg)} kg` : S.ejKg >= 1 ? `${S.ejKg.toFixed(1).replace('.', DEC)} kg` : S.ejKg >= 0.01 ? `${Math.round(S.ejKg * 1000)} g` : `${(S.ejKg * 1000).toFixed(1).replace('.', DEC)} g`;
      const big = S.ejN >= 1e6, cnt = big ? (S.ejN / 1e6).toFixed(1).replace('.', DEC) : fmtKm(S.ejN >= 1000 ? Math.round(S.ejN / 100) * 100 : S.ejN);
      if (S.ejKg > 0.0002) hh += TF('<br>{0} · <b>{1}</b> par m² et par seconde', [S.ejN >= 1 ? (big ? TF('<b>{0} millions de</b> {1} par m² et par seconde', [cnt, what]) : TF('<b>{0}</b> {1} par m² et par seconde', [cnt, what])) : TF('un bloc par m² toutes les <b>{0}</b>', [fmtDur(1 / S.ejN)]), mass]);
    }
    hud.data.innerHTML = hh;
  }
  hud.bar.style.width = (tl(clamp(t, PH.T0, PH.T_END)) * 100) + '%';
  while (journalIdx < JOURNAL.length && JOURNAL[journalIdx].t <= t) pushJournal(JOURNAL[journalIdx++]);
  if (t < 0 && A.el > -0.3) {
    tmpV.copy(A.dir).multiplyScalar(1000).add(camera.position).project(camera);
    const behind = tmpV.z > 1;
    let x = tmpV.x, y = tmpV.y;
    if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.94 || Math.abs(y) > 0.9;
    if (off) { const mx = Math.max(Math.abs(x), Math.abs(y), 1e-3); x = x / mx * 0.9; y = y / mx * 0.78; }
    hud.marker.style.display = 'block';
    hud.marker.style.left = ((x * 0.5 + 0.5) * 100) + '%'; hud.marker.style.top = ((-y * 0.5 + 0.5) * 100) + '%';
    hud.marker.classList.toggle('off', off);
    hud.marker.style.setProperty('--r', (off ? 4 : Math.max(16, A.ang / (camera.fov * DEG) * innerHeight * 1.9)) + 'px');
    hud.mlabel.textContent = off ? T('astéroïde par là') : TF('astéroïde · {0} km', [fmtKm(A.range)]);
    hud.marker.style.opacity = String(1 - sstep(PH.T_ENTRY - 1, PH.T_ENTRY + 0.5, t));
  } else hud.marker.style.display = 'none';
}
// curseur 0..1000 -> distance : linéaire au sol, logarithmique en orbite
const sliderToDist = v => MODE === 'orbit' ? (() => { const d = 150 * Math.pow(20000 / 150, v / 1000), p = Math.pow(10, Math.floor(Math.log10(d)) - 1); return Math.round(d / p) * p; })() : Math.round(v * 2 / 10) * 10;
const distToSlider = d => MODE === 'orbit' ? Math.round(1000 * Math.log(d / 150) / Math.log(20000 / 150)) : Math.round(d / 2);
function distText() {
  for (const id of ['mGround', 'mGround2']) $(id).classList.toggle('on', MODE === 'ground');
  for (const id of ['mOrbit', 'mOrbit2']) $(id).classList.toggle('on', MODE === 'orbit' && !RIDE);
  for (const id of ['mRide', 'mRide2']) $(id).classList.toggle('on', RIDE);
  hud.dist.disabled = hud.dist2.disabled = RIDE; hud.dist.style.opacity = hud.dist2.style.opacity = RIDE ? '0.3' : '';
  $('endL').textContent = MODE === 'orbit' ? '150 km' : T('0 km · dans le cratère'); $('endR').textContent = MODE === 'orbit' ? '20 000 km' : '2 000 km';
  if (RIDE) {
    hud.dlabel.textContent = hud.dlabel2.textContent = '\u2014';
    hud.dinfo.innerHTML = T('Vous voyagez sur l’astéroïde : <b>1 200 km</b> à parcourir en <b>60 secondes</b>, à 20 km/s.<br>La scène s’arrête à l’impact : il ne reste rien de lui, ni de vous.');
    return;
  }
  if (MODE === 'orbit') {
    const I = orbit.info, lab = `${fmtKm(OR.dist)} km`;
    hud.dlabel.textContent = lab; hud.dlabel2.textContent = lab; hud.dist.value = hud.dist2.value = String(distToSlider(OR.dist));
    hud.dinfo.innerHTML = TF('Altitude <b>{0} km</b> · la Terre occupe <b>{1}°</b> de votre ciel{2}<br>Vous êtes immobile au-dessus du globe, pas en orbite réelle : un satellite défilerait à 7 km/s.', [fmtKm(I.alt), Math.round(I.earthDeg), I.tPlume ? TF(' · le panache vous atteint à <b>T+{0}</b>', [fmtDur(I.tPlume)]) : '']);
    return;
  }
  const D = PH.D, lab = `${fmtKm(D)} km`;
  hud.dlabel.textContent = lab; hud.dlabel2.textContent = lab;
  hud.dist.value = hud.dist2.value = String(distToSlider(D));
  hud.dinfo.innerHTML = PH.inside
    ? (PH.crater ? T('Vous êtes <b>dans le cratère</b>. Tout se joue à l’instant T.') : T('Vous êtes <b>dans la boule de feu</b>. Tout se joue à l’instant T.'))
    : TF('Séisme <b>{0}</b> · Éjectas au sol <b>{1}</b> (≈ {2}, couche {3}) · Onde de choc <b>{4}</b> · Tsunami <b>{5}</b>{6}', [fmtDur(PH.T_P), fmtDur(PH.T_HAIL), fmtSize(PH.dm), fmtSize(PH.thickReal), fmtDur(PH.T_BLAST), fmtDur(PH.T_TSU), PH.visible ? '' : T('<br>Boule de feu cachée par la courbure de la Terre.')]);
}
function restart() {
  sim.t = sim.lastT = PH.T0; sim.paused = false; sim.exposure = 1; sim.seiche = 0;
  journalIdx = 0; hud.journal.innerHTML = '';
  U.uAstEntry.value.copy(astState(PH.T_ENTRY).dir);
  U.uPathA.value.copy(astState(PH.T0).dir); U.uPathB.value.copy(astState(-0.5).dir);
  if (MODE === 'orbit') { orbit.set(OR.dist); orbit.reset(); } else setDistance(PH.D);
  buildTimeline(); buildTicks(); distText();
  resetFlyers(); resetPlayer(); smoke.clear(); glowP.clear(); splash.clear(); rain.clear(); rainHot.clear(); bolides.length = 0; DEP = 0;
}
function changeDistance(D) {
  if (RIDE) return;
  if (MODE === 'orbit' && sim.running) { orbit.moveTo(clamp(D, 150, 20000)); return; }   // en orbite : simple déplacement
  if (MODE === 'orbit') OR.dist = clamp(D, 150, 20000); else setDistance(D); setSpeed(1); restart();
}
function setMode(m) {
  const cur = RIDE ? 'ride' : MODE; if (m === cur) return;
  const stay = cur !== 'ground' && m !== 'ground';   // entre l'orbite et l'astéroïde, le temps continue
  RIDE = m === 'ride'; MODE = m === 'ground' ? 'ground' : 'orbit'; orbit.setRide(RIDE);
  if (stay && sim.running) {
    if (RIDE && sim.t > -3) sim.t = sim.lastT = PH.T0;      // l'astéroïde doit encore exister
    if (!RIDE) { orbit.set(OR.dist); orbit.reset(); }
    buildTimeline(); buildTicks(); distText(); hud.journal.innerHTML = ''; journalIdx = Math.max(0, JOURNAL.filter(j => j.t <= sim.t).length - 1);
    return;
  }
  setSpeed(1); restart();
}
function jumpNext() {
  const lead = { [T('Entrée atmosphérique')]: 2, [T('Impact')]: 1.5, [T('Ondes sismiques')]: 4, [T('Ondes de surface')]: 4, [T('Rentrée des éjectas')]: 15, [T('Éjectas au sol')]: 10, [T('Onde de choc')]: 8, [T('Tsunami')]: 130, [T('Retour de la mer')]: 130 };
  const n = EVENTS.map(e => e.t - (lead[e.label] ?? 0)).filter(x => x > sim.t + 0.5).sort((a, b) => a - b)[0];
  if (n !== undefined) sim.t = n;
}
function begin() {
  if (sim.running) return;
  sim.running = true; hud.start.classList.add('gone'); hud.root.classList.remove('hidden'); initAudio();
}
const lock = () => { if (document.pointerLockElement !== canvas) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) {} } };
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') e.target.blur();
  keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (!sim.running && (e.code === 'Enter' || e.code === 'Space')) { begin(); return; }
  const dg = /^(Digit|Numpad)([1-9])$/.exec(e.code);
  if (dg) setSpeed(SPEEDS[+dg[2] - 1]);
  if (e.key === '+' || e.code === 'NumpadAdd') nudgeSpeed(1);
  if ((e.key === '-' && !dg) || e.code === 'NumpadSubtract') nudgeSpeed(-1);
  if (e.code === 'KeyP') sim.paused = !sim.paused;
  if (e.code === 'KeyR') restart();
  if (e.code === 'KeyN') jumpNext();
  if (e.code === 'KeyF') { player.fly = !player.fly; player.vy = 0; }
  if (e.code === 'KeyH') hud.root.classList.toggle('hidden');
  if (e.code === 'KeyM' && audio) audio.muted = !audio.muted;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let drag = false;
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) { if (sim.running) lock(); drag = true; }
  if (e.button === 2) { player.fovT = 9; orbit.st.fovT = 7; }
});
$('go').addEventListener('click', () => { begin(); lock(); });
addEventListener('mouseup', e => { if (e.button === 0) drag = false; if (e.button === 2) { player.fovT = 65; orbit.st.fovT = 60; } });
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('mousemove', e => {
  if (document.pointerLockElement === canvas || drag) {
    if (MODE === 'orbit') { orbit.look(e.movementX, e.movementY); return; }
    const k = 0.0022 * player.fov / 65;
    player.yaw -= e.movementX * k; player.pitch = clamp(player.pitch - e.movementY * k, -1.5, 1.5);
  }
});
addEventListener('wheel', e => { if (e.target && e.target.tagName === 'INPUT') return; const z = e.deltaY > 0 ? 1.25 : 0.8; player.fovT = clamp(player.fovT * z, 5, 65); orbit.st.fovT = clamp(orbit.st.fovT * z, 1.5, 60); }, { passive: true });
hud.spd.addEventListener('input', () => { sim.speed = clamp(0.1 * Math.pow(10, +hud.spd.value / 250), 0.1, 1000); });
$('minus').addEventListener('click', () => nudgeSpeed(-1));
$('plus').addEventListener('click', () => nudgeSpeed(1));
$('pause').addEventListener('click', () => { sim.paused = !sim.paused; });
$('next').addEventListener('click', jumpNext);
$('again').addEventListener('click', restart);
hud.dist.addEventListener('input', () => changeDistance(sliderToDist(+hud.dist.value)));
hud.dist2.addEventListener('input', () => { const d = sliderToDist(+hud.dist2.value); hud.dlabel2.textContent = `${fmtKm(d)} km`; if (MODE === 'orbit' && sim.running) orbit.moveTo(d); });
hud.dist2.addEventListener('change', () => { if (!(MODE === 'orbit' && sim.running)) changeDistance(sliderToDist(+hud.dist2.value)); });
for (const [id, m] of [['mGround', 'ground'], ['mGround2', 'ground'], ['mOrbit', 'orbit'], ['mOrbit2', 'orbit'], ['mRide', 'ride'], ['mRide2', 'ride']]) $(id).addEventListener('click', () => setMode(m));

// ---------------------------------------------------------------- composition
const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
// Garde-fou : un seul pixel invalide (NaN ou infini) est étalé par le halo lumineux en grands carrés noirs.
// On le remplace ici par la moyenne de ses voisins avant qu'il n'atteigne le halo.
composer.addPass(new ShaderPass({
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    bool bad(vec3 c){ return any(isnan(c))||any(isinf(c))||!(c.r+c.g+c.b<1e9); }
    vec3 ok(vec2 uv){ vec3 c=texture2D(tDiffuse,uv).rgb; return bad(c)?vec3(0.0):c; }
    void main(){
      vec3 c=texture2D(tDiffuse,vUv).rgb;
      if(bad(c)){ vec2 px=1.0/vec2(textureSize(tDiffuse,0)); c=0.25*(ok(vUv+vec2(px.x,0.0))+ok(vUv-vec2(px.x,0.0))+ok(vUv+vec2(0.0,px.y))+ok(vUv-vec2(0.0,px.y))); }
      gl_FragColor=vec4(clamp(c,0.0,30000.0),1.0);
    }` }));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.22, 0.5, 1.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  smoke.mat.uniforms.uScale.value = glowP.mat.uniforms.uScale.value = splash.mat.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.8;
}
addEventListener('resize', resize);

let last = performance.now();
const perf = { acc: 0, n: 0, pr: renderer.getPixelRatio() };
function frame(now) {
  const raw = (now - last) / 1000, dtReal = Math.min(raw, 0.1); last = now;
  step(dtReal);
  // résolution adaptative : on baisse la finesse si la machine peine
  if (raw < 0.5) { perf.acc += raw; perf.n++; }
  if (perf.n >= 45) {
    const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
    if (avg > 0.027 && perf.pr > 0.6) { perf.pr = Math.max(0.6, perf.pr * 0.85); renderer.setPixelRatio(perf.pr); resize(); }
  }
  requestAnimationFrame(frame);
}
function hudClock() {
  const t = sim.t, a = Math.abs(t), h = Math.floor(a / 3600), m = Math.floor(a % 3600 / 60), s = Math.floor(a % 60);
  hud.clock.textContent = `T ${t < 0 ? '\u2212' : '+'} ${h ? h + ':' : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  hud.speed.textContent = sim.paused ? T('PAUSE') : `\u00d7${fmtSpeed(sim.speed)}`;
  hud.bar.style.width = (tl(clamp(t, PH.T0, PH.T_END)) * 100) + '%';
  while (journalIdx < JOURNAL.length && JOURNAL[journalIdx].t <= t) pushJournal(JOURNAL[journalIdx++]);
}
function stepOrbit(dt) {
  renderPass.scene = orbit.scene; renderPass.camera = orbit.camera;
  const o = orbit.update(sim.t, sim.time, dt, keys, innerWidth / innerHeight, innerHeight * renderer.getPixelRatio());
  const rate = o.exposure < sim.exposure ? 3 : 0.7;
  sim.exposure = lerp(sim.exposure, o.exposure, 1 - Math.exp(-rate * Math.min(dt * Math.max(1, Math.min(sim.speed, 8)), 1)));
  renderer.toneMappingExposure = sim.exposure; bloom.strength = 0.32;
  veil.style.opacity = String(o.veil * 0.93);
  hudClock();
  // distance et altitude réelles, mises à jour pendant le déplacement
  const w = orbit.where(), here = TF('Vous : <b>{0} km</b> de l’impact · altitude <b>{1} km</b><br>', [fmtKm(w.dist), fmtKm(w.alt)]);
  if (!RIDE) hud.dlabel2.textContent = `${fmtKm(w.dist)} km`;
  if (!RIDE && document.activeElement !== hud.dist2) hud.dist2.value = String(clamp(distToSlider(clamp(w.dist, 150, 20000)), 0, 1000));
  const t = sim.t, cam = orbit.camera;
  if (RIDE) {
    hud.marker.style.display = 'none';
    if (t < 0) {
      hud.sub.textContent = t < PH.T_ENTRY ? T('avant l’impact · sur l’astéroïde') : T('dans l’atmosphère · sur l’astéroïde');
      hud.data.innerHTML = TF('Altitude <b>{0} km</b> · sol à <b>{1} km</b> le long de la trajectoire<br>Vitesse <b>20 km/s</b> · impact dans <b>{2} s</b>', [fmtKm(w.alt), fmtKm(-t * PH.V), (-t).toFixed(1).replace('.', DEC)]);
    } else {
      hud.sub.textContent = T('après l’impact');
      hud.data.innerHTML = T('L’astéroïde n’existe plus.<br>Passez <b>En orbite</b> pour voir la suite : le temps continue.');
    }
  } else if (t < 0) {
    const ang = Math.atan(6 / Math.max(o.astRange, 6));
    hud.sub.textContent = t < PH.T_ENTRY ? T('avant l’impact · vue de l’espace') : T('dans l’atmosphère');
    hud.data.innerHTML = here + TF('Astéroïde à <b>{0} km</b> de vous · Altitude <b>{1} km</b><br>Taille apparente <b>{2}°</b>', [fmtKm(o.astRange), fmtKm(-t * PH.V * Math.sin(PH.ANG * DEG)), (ang * 2 / DEG).toFixed(2).replace('.', DEC)]);
    tmpV.copy(o.astPos).project(cam);
    const behind = tmpV.z > 1; let x = tmpV.x, y = tmpV.y; if (behind) { x = -x; y = -y; }
    const off = behind || Math.abs(x) > 0.94 || Math.abs(y) > 0.9;
    if (off) { const mx = Math.max(Math.abs(x), Math.abs(y), 1e-3); x = x / mx * 0.9; y = y / mx * 0.78; }
    hud.marker.style.display = 'block'; hud.marker.style.left = ((x * 0.5 + 0.5) * 100) + '%'; hud.marker.style.top = ((-y * 0.5 + 0.5) * 100) + '%';
    hud.marker.classList.toggle('off', off);
    hud.marker.style.setProperty('--r', (off ? 4 : Math.max(16, ang / (cam.fov * DEG) * innerHeight * 1.9)) + 'px');
    hud.mlabel.textContent = off ? T('astéroïde par là') : TF('astéroïde · {0} km', [fmtKm(o.astRange)]);
    hud.marker.style.opacity = String(1 - sstep(PH.T_ENTRY - 1, PH.T_ENTRY + 0.5, t));
  } else {
    hud.marker.style.display = 'none';
    hud.sub.textContent = T('après l’impact · vue de l’espace');
    const nx = EVENTS.find(e => e.t > t);
    hud.data.innerHTML = here + TF('Front des éjectas à <b>{0} km</b> de l’impact<br>Onde de choc <b>{1} km</b> · Tsunami <b>{2} km</b>{3}', [fmtKm(o.re), fmtKm(0.34 * t), fmtKm(Math.max(0, 0.18 * (t - 200))), nx ? '<br>' + TF('Prochain : <b>{0}</b> dans {1}', [nx.label, fmtDur(nx.t - t)]) : '']);
  }
  if (audio) audio.master.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.1);
  if (!window.__norender) composer.render();
}
function step(dtReal) {
  const active = sim.running && !sim.paused;
  const dtAnim = sim.paused ? 0 : dtReal * (active ? clamp(sim.speed, 0.1, 3) : 1);
  if (active) sim.t += dtReal * sim.speed;
  sim.time += dtAnim; U.uTime.value = sim.time;
  if (MODE === 'orbit') { stepOrbit(dtReal); return; }
  renderPass.scene = scene; renderPass.camera = camera; veil.style.opacity = '0';
  const S = stateAt(sim.t);
  applyState(S, dtReal);
  // l'onde de choc vient de passer : gerbe d'embruns
  if (!PH.inside && sim.lastT < PH.T_BLAST && sim.t >= PH.T_BLAST && sim.t < PH.T_BLAST + 30) {
    for (let i = 0; i < 500; i++) {
      const x = player.pos.x + rr(-90, 90), z = player.pos.z + rr(-90, 90), y = Math.max(terrainH(x, z), waterY(x, z)) + rr(0, 10);
      smoke.spawn(x, y, z, -GZ_H.x * rr(40, 110), rr(-2, 8), -GZ_H.z * rr(40, 110), rr(0.8, 2.2), rr(4, 11), 0.85, 0.83, 0.8, 0.16, 8);
    }
  }
  sim.lastT = sim.t;
  updatePlayer(dtReal);
  updateFlyers(dtAnim, sim.t, sim.time);
  updatePalms(dtAnim, sim.t, sim.time);
  if (mosa.m.visible) updateMosa(dtAnim, sim.time, sim.t);
  updateEjecta(dtAnim, S);
  if (turtle.visible) {
    const dive = PH.burn ? sstep(0.6, 5, sim.t) : 0, a = sim.time * 0.055;
    turtle.position.set(TURTLE_C[0] + Math.cos(a) * 13, U.uWater.value - 0.07 - 0.04 * Math.sin(sim.time * 0.9) - 1.3 * dive, TURTLE_C[1] + Math.sin(a) * 9);
    turtle.rotation.y = Math.atan2(-Math.sin(a) * 13, Math.cos(a) * 9);
    turtle.position.y = Math.max(turtle.position.y, terrainH(turtle.position.x, turtle.position.z) + 0.3);
    for (const f of turtle.userData.fl) f.p.rotation.z = f.sx * Math.sin(sim.time * (f.front ? 1.6 : 1.1) * (1 + 2 * dive)) * (f.front ? 0.55 : 0.25);
  }
  if (fish.visible) {
    const sc = PH.burn ? sstep(0.4, 3, sim.t) : 0;
    for (let i = 0; i < FISH_N; i++) {
      const f = fishData[i];
      const a = f.ph + sim.time * f.sp * (1 + 4 * sc), r = f.r + Math.sin(sim.time * f.w + i) * 0.5 + 6 * sc;
      const x = f.cx + Math.cos(a) * r, z = f.cz + Math.sin(a) * r * 0.7;
      dummy.position.set(x, Math.max(U.uWater.value + f.y, terrainH(x, z) + 0.12), z);
      dummy.rotation.y = -a + (f.sp > 0 ? 0 : Math.PI);
      dummy.updateMatrix(); fish.setMatrixAt(i, dummy.matrix);
    }
    fish.instanceMatrix.needsUpdate = true;
  }
  smoke.update(dtAnim); glowP.update(dtAnim); splash.update(dtAnim); rain.update(dtAnim); rainHot.update(dtAnim);
  camera.position.copy(player.pos);
  camera.rotation.set(player.pitch, player.yaw, 0);
  if (sim.shake > 0.001) {
    const q = Math.min(sim.shake, 3), T = sim.time;
    camera.position.x += q * 0.30 * Math.sin(T * 13.1) * Math.sin(T * 2.3);
    camera.position.y += q * 0.24 * Math.sin(T * 17.3 + 1) + q * 0.12 * Math.sin(T * 5.1);
    camera.position.z += q * 0.30 * Math.sin(T * 11.7 + 2) * Math.cos(T * 1.9);
    camera.rotation.z = q * 0.035 * Math.sin(T * 7.3); camera.rotation.x += q * 0.02 * Math.sin(T * 9.1);
    camera.position.y = Math.max(camera.position.y, waterY(camera.position.x, camera.position.z) + 0.2);
  }
  if (Math.abs(camera.fov - player.fov) > 0.01) { camera.fov = player.fov; camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position);
  water.position.x = camera.position.x; water.position.z = camera.position.z;
  bloom.strength = 0.22 + 0.1 * Math.min(S.astGlow, 1);
  updateHud(S); updateAudio(S, sim.time);
  if (!window.__norender) composer.render();
}

// ---------------------------------------------------------------- démarrage
const hash = new URLSearchParams(location.hash.slice(1));
setDistance(hash.has('d') ? parseFloat(hash.get('d')) : 800);
if (hash.get('mode') === 'orbit') { MODE = 'orbit'; if (hash.has('o')) OR.dist = parseFloat(hash.get('o')); }
if (hash.get('mode') === 'ride') { MODE = 'orbit'; RIDE = true; orbit.setRide(true); }
setSpeed(1); restart(); resize(); hud.root.classList.add('hidden');
{
  const h = hash;
  if (h.has('t')) sim.t = sim.lastT = parseFloat(h.get('t'));
  if (h.has('yaw')) player.yaw = parseFloat(h.get('yaw')) * DEG;
  if (h.has('pitch')) player.pitch = parseFloat(h.get('pitch')) * DEG;
  if (h.has('fov')) player.fov = player.fovT = parseFloat(h.get('fov'));
  if (h.has('y')) { player.fly = true; player.pos.y = parseFloat(h.get('y')); }
  if (h.get('look') === 'ast') { const d = astState(sim.t).dir; player.yaw = Math.atan2(-d.x, -d.z); player.pitch = Math.asin(d.y); }
  if (h.has('auto')) begin();
  window.__sim = { orbit, setMode, OR, sim, player, step, stateAt, PH, astState, isl, terrainH, waterY, setSpeed, changeDistance, bolides };
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- centrer sur… / flèches
$('arrows').addEventListener('change', (e) => hud.root.classList.toggle('noarrows', !e.target.checked));
$('focusSel').addEventListener('change', (e) => {
  const v = e.target.value; e.target.value = ''; if (!v || MODE !== 'ground') return;
  if (v === 'moon') { player.yaw = Math.atan2(-MOON_DIR.x, -MOON_DIR.z); player.pitch = Math.asin(clamp(MOON_DIR.y, -1, 1)); return; }
  const a = astState(Math.min(sim.t, -0.2)); player.yaw = -a.az * DEG; player.pitch = (v === 'impact' ? 2 : clamp(a.el, 2, 80)) * DEG;
});
