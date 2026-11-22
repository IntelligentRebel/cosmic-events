// Socle commun des scènes : rendu, temps, caméras, HUD, journal, son.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { T, TF, num, I18N } from './i18n.js';
export { THREE, T, TF };
export const hash = new URLSearchParams(location.hash.slice(1));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
export const fr = num;
const sig = (x) => { const a = Math.abs(x); return fr(x, a >= 100 ? 0 : a >= 10 ? 1 : 2); };
export const YEAR = 31557600, DAY = 86400;
export function fmtDur(s) {
  const a = Math.abs(s);
  if (a < 1e-3) return TF('{0} µs', [sig(s * 1e6)]); if (a < 1) return TF('{0} ms', [sig(s * 1e3)]); if (a < 120) return TF('{0} s', [sig(s)]);
  if (a < 7200) return TF('{0} min', [sig(s / 60)]); if (a < 2 * DAY) return TF('{0} h', [sig(s / 3600)]); if (a < 2 * YEAR) return TF('{0} jours', [sig(s / DAY)]);
  const y = s / YEAR, ay = Math.abs(y);
  if (I18N.myriad && ay >= 1e4) return ay < 1e8 ? TF('{0} × 10 000 ans', [sig(y / 1e4)]) : TF('{0} × 100 millions d’années', [sig(y / 1e8)]);
  if (ay < 1e4) return TF('{0} ans', [sig(y)]); if (ay < 1e6) return TF('{0} milliers d’années', [sig(y / 1e3)]); if (ay < 1e9) return TF('{0} millions d’années', [sig(y / 1e6)]);
  return TF('{0} milliards d’années', [sig(y / 1e9)]);
}
export function fmtDist(km) {
  const a = Math.abs(km);
  if (a < 1) return TF('{0} m', [sig(km * 1000)]); if (a < 1e4) return TF('{0} km', [sig(km)]); if (a < 1e6 && !I18N.myriad) return TF('{0} km', [fr(Math.round(km / 1000) * 1000, 0)]);
  if (I18N.myriad && a >= 1e4 && a < 3e7) return TF('{0} × 10 000 km', [sig(km / 1e4)]);
  if (a < 3e7) return TF('{0} millions de km', [sig(km / 1e6)]); if (a < 9.46e11) return TF('{0} UA', [sig(km / 1.496e8)]);
  const al = km / 9.461e12, b = Math.abs(al);
  if (b < 1e4) return TF('{0} années-lumière', [sig(al)]); if (I18N.myriad) return b < 1e8 ? TF('{0} × 10 000 années-lumière', [sig(al / 1e4)]) : TF('{0} × 100 millions d’années-lumière', [sig(al / 1e8)]); if (b < 1e6) return TF('{0} milliers d’a.-l.', [sig(al / 1e3)]); return TF('{0} millions d’a.-l.', [sig(al / 1e6)]);
}
export function fmtRate(s) {
  if (!(s > 0)) return '×0';
  if (s < 0.999) { const inv = 1 / s; return inv >= 1e6 ? TF('ralenti ÷{0} M', [sig(inv / 1e6)]) : TF('ralenti ÷{0}', [fr(Math.round(inv))]); }
  if (s < 3600) return '×' + sig(s); return TF('{0} / s', [fmtDur(s)]);
}
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export const NOISE = /* glsl */`
float hash11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float hash31(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
vec3 hash33(vec3 p){p=fract(p*vec3(.1031,.1030,.0973));p+=dot(p,p.yxz+33.33);return fract((p.xxy+p.yxx)*p.zyx);}
float vnoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+vec3(11.7,3.1,7.9);a*=.5;}return s;}
float fbm3(vec3 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*vnoise(p);p=p*2.03+vec3(11.7,3.1,7.9);a*=.5;}return s;}
vec3 blackbody(float T){ // approximation visuelle, T en kelvins
  float t=clamp(T,1000.,40000.)/100.;vec3 c;
  c.r=t<=66.?1.:clamp(1.292936*pow(t-60.,-.1332),0.,1.);
  c.g=t<=66.?clamp(.39008*log(t)-.63184,0.,1.):clamp(1.129891*pow(t-60.,-.0755),0.,1.);
  c.b=t>=66.?1.:(t<=19.?0.:clamp(.54321*log(t-10.)-1.19625,0.,1.));
  return c;}
`;
// Étoiles procédurales par direction (utilisable dans n'importe quel fragment shader)
export const STARS_GLSL = /* glsl */`
vec3 starLayer(vec3 d,float sc,float thr,float sz){vec3 q=d*sc,id=floor(q),f=fract(q)-.5;float h=hash31(id);
  if(h<thr)return vec3(0.);vec3 o=(hash33(id+7.)-.5)*.7;float dd=length(f-o);float m=(h-thr)/(1.-thr);
  vec3 col=mix(vec3(1.,.72,.5),vec3(.65,.78,1.),hash11(h*91.7));col=mix(col,vec3(1.),.45);
  return col*smoothstep(sz*(.5+m),0.,dd)*(.25+2.2*m*m);}
vec3 skyStars(vec3 d,vec3 mwAxis,float mw){
  vec3 c=starLayer(d,90.,.90,.11)+starLayer(d,170.,.86,.13)*.6+starLayer(d,38.,.965,.07)*2.2;
  float b=dot(d,mwAxis);float band=exp(-b*b*22.);
  float n=fbm(d*5.+3.)*fbm3(d*13.);
  c+=mw*band*(vec3(.5,.46,.6)*n*n*1.1+starLayer(d,330.,.55,.2)*.3+vec3(.02,.018,.026));
  float dust=smoothstep(.25,.6,fbm(d*9.+20.))*exp(-b*b*160.);c*=1.-.75*dust*mw;
  return c;}
`;

export function makeStars({ n = 5000, seed = 7, band = 0.5, bright = 1 } = {}) {
  const r = rng(seed), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n);
  const ax = new THREE.Vector3(0.45, 0.35, 0.82).normalize(), v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    do { v.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1); } while (v.lengthSq() > 1 || v.lengthSq() < 0.01); v.normalize();
    if (r() < band) { v.addScaledVector(ax, -v.dot(ax) * (0.75 + 0.25 * r())).normalize(); }
    pos.set([v.x, v.y, v.z], i * 3);
    const m = Math.pow(r(), 6), tc = r();
    col.set([lerp(1, 0.7, tc) * (0.35 + m * 2.5), 0.86 * (0.35 + m * 2.5), lerp(0.7, 1, tc) * (0.35 + m * 2.5)], i * 3);
    siz[i] = 1.1 + m * 3.2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uB: { value: bright }, uPx: { value: 1 } }, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float size;attribute vec3 color;varying vec3 vC;uniform float uPx;void main(){vC=color;vec4 mv=viewMatrix*vec4(position,0.);gl_Position=projectionMatrix*vec4(mv.xyz,1.);gl_Position.z=gl_Position.w*.99995;gl_PointSize=size*uPx;}`,
    fragmentShader: `varying vec3 vC;uniform float uB;void main(){float d=length(gl_PointCoord-.5);gl_FragColor=vec4(vC*uB*smoothstep(.5,.05,d),1.);}`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -10; return p;
}
let _glowTex;
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,255,255,.75)'); g.addColorStop(0.35, 'rgba(255,255,255,.2)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128); _glowTex = new THREE.CanvasTexture(c); return _glowTex;
}
export function makeGlow(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.setScalar(size); return s;
}
// Plan plein écran dessiné derrière tout le reste (ciel calculé, trou noir…)
export function makeBackdrop(material) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material); m.frustumCulled = false; m.renderOrder = -100;
  material.depthTest = false; material.depthWrite = false; return m;
}
export const BACKDROP_VERT = `varying vec2 vUv;void main(){vUv=uv*2.-1.;gl_Position=vec4(position.xy,0.999,1.);}`;

// Ciel calculé par direction de visée : le corps reçoit « d » (direction monde) et écrit « col ».
export function skyBackdrop(decl, body, uniforms = {}) {
  const u = { uBasis: { value: new THREE.Matrix3() }, uTan: { value: 1 }, uAspect: { value: 1 }, ...uniforms };
  const mesh = makeBackdrop(new THREE.ShaderMaterial({ uniforms: u, vertexShader: BACKDROP_VERT,
    fragmentShader: `precision highp float;varying vec2 vUv;uniform mat3 uBasis;uniform float uTan,uAspect;${NOISE}${STARS_GLSL}${decl}
void main(){vec3 d=normalize(uBasis*vec3(vUv.x*uTan*uAspect,vUv.y*uTan,-1.));vec3 col=vec3(0.);${body}gl_FragColor=vec4(col,1.);}` }));
  return { mesh, u, sync(c) { u.uBasis.value.setFromMatrix4(c.matrixWorld); u.uTan.value = Math.tan(c.fov * Math.PI / 360); u.uAspect.value = c.aspect; } };
}
// Sol local : disque plat sous la caméra, relief suggéré par le bruit, eau et lave optionnelles.
export function makeGround(o = {}) {
  const u = { uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uAmb: { value: new THREE.Color(0.1, 0.1, 0.12) }, uA: { value: new THREE.Color(o.a || 0x8a6a4a) }, uB: { value: new THREE.Color(o.b || 0x5a4030) },
    uHaze: { value: new THREE.Color(0.5, 0.5, 0.5) }, uLava: { value: 0 }, uWater: { value: 0 }, uWaterCol: { value: new THREE.Color(0.05, 0.12, 0.2) }, uTime: { value: 0 }, uScale: { value: o.scale || 1 }, uFade: { value: o.fade || 0.02 }, uSnow: { value: 0 }, uCamL: { value: new THREE.Vector3(0, 0.002, 0) }, uSize: { value: 1 } };
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: 'varying vec3 vW;uniform float uSize;void main(){vW=vec3(position.x,0.,-position.y)*uSize;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `precision highp float;varying vec3 vW;uniform vec3 uSun,uSunCol,uAmb,uA,uB,uHaze,uWaterCol,uCamL;uniform float uLava,uWater,uTime,uScale,uFade,uSnow;${NOISE}
float hgt(vec2 p){return fbm(vec3(p*.06,1.))*1.+fbm3(vec3(p*.5,4.))*.12;}
void main(){vec2 p=vW.xz*uScale;float dist=length(vW-uCamL)*uScale;float h=hgt(p);float e=.35;
  vec3 n=normalize(vec3(-(hgt(p+vec2(e,0.))-h)/e*5.,1.,-(hgt(p+vec2(0.,e))-h)/e*5.));
  vec3 alb=mix(uB,uA,smoothstep(.3,.7,fbm3(vec3(p*.21,9.))));alb*=.75+.5*vnoise(vec3(p*3.,2.));
  alb=mix(alb,vec3(.9,.92,.97),uSnow*smoothstep(.35,.6,n.y+vnoise(vec3(p*.7,3.))*.3));
  vec3 col=alb*(uAmb+uSunCol*max(dot(n,uSun),0.));
  if(uWater>0.&&h<uWater){vec3 v=normalize(uCamL-vW);vec3 wn=normalize(vec3(vnoise(vec3(p*2.+uTime*.6,1.))-.5,6.,vnoise(vec3(p*2.-uTime*.5,7.))-.5));
    float fr=pow(1.-max(dot(wn,v),0.),4.);vec3 r=reflect(-v,wn);float gl=pow(max(dot(r,uSun),0.),300.);
    vec3 wc=mix(uWaterCol*(uAmb*3.+uSunCol*.25),uHaze,fr*.75)+uSunCol*gl*3.;col=mix(col,wc,smoothstep(uWater,uWater-.03,h));}
  if(uLava>0.){float l=smoothstep(.62-.5*uLava,.25-.3*uLava,fbm(vec3(p*.12,uTime*.02+5.)))*uLava;col=mix(col*(1.-.6*uLava),vec3(2.4,.55,.08)*(.6+.8*vnoise(vec3(p*.6,uTime*.1))),clamp(l,0.,1.));}
  col=mix(col,uHaze,1.-exp(-dist*uFade));gl_FragColor=vec4(col,1.);}` }));
  m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); return { mesh: g, u, setSize(s) { m.scale.setScalar(s); u.uSize.value = s; } };
}
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.innerHTML = html; return e; };

export function createKit(cfg) {
  const stage = document.getElementById('stage');
  const views = cfg.views, V = Object.fromEntries(views.map(v => [v.id, v]));
  const segHtml = (suf) => views.length > 1 ? `<div class="seg"${suf ? '' : ' style="margin-top:16px"'}>${views.map(v => `<button data-view="${v.id}">${v.label}</button>`).join('')}</div>` : '';
  const opts = cfg.options || [];
  const optHtml = opts.map(o => o.type === 'select'
    ? `<select class="sel" data-opt="${o.id}" aria-label="${o.label}">${o.choices.map(c => `<option value="${c[0]}">${c[1]}</option>`).join('')}</select>`
    : `<label class="chk"><input type="checkbox" data-opt="${o.id}"${o.value ? ' checked' : ''}> ${o.label}</label>`).join('');
  stage.innerHTML = `<canvas id="c"></canvas><div id="veil"></div>
<div id="hud" class="hidden">
  <div id="top"><div class="caps">${cfg.title}</div><div id="clock"></div><div id="sub"></div><div id="data"></div></div>
  <div id="panel">
    <div class="head"><span class="caps">${T('Vitesse du temps')}</span><span id="speed"></span></div>
    <div class="row"><button class="sq" id="minus" aria-label="${T('Ralentir')}">−</button><input type="range" id="spd" min="0" max="1000" step="1" aria-label="${T('Vitesse du temps')}"><button class="sq" id="plus" aria-label="${T('Accélérer')}">+</button></div>
    ${cfg.autoRate ? `<label class="chk"><input type="checkbox" id="auto" checked> ${T('Tempo automatique (ralentit aux moments clés)')}</label>` : ''}
    ${cfg.sound ? `<label class="chk"><input type="checkbox" id="snd" checked> ${T('Son')}</label>` : ''}
    ${optHtml}
    <div class="acts"><button id="pause">${T('Pause')}</button><button id="next">${T('Suivant')}</button><button id="again">${T('Rejouer')}</button><button id="menuBtn">${T('Menu')}</button></div>
    ${cfg.moments ? `<select id="moment2" class="sel" aria-label="${T('Aller à un moment')}"></select>` : ''}
    <hr>${segHtml(1)}
    <div id="distbox"><div class="head"><span class="caps">${T('Distance')}</span><span id="dlabel2"></span></div>
    <div class="row"><input type="range" id="dist2" min="0" max="1000" step="1" aria-label="${T('Distance')}"></div></div>
    <div class="note">${cfg.panelNote || T('Glisser pour tourner le regard, molette pour s’approcher. Rien ne relance la scène.')}</div>
  </div>
  <div id="journal"></div>
  <div id="timeline"><div id="barfill"></div><div id="ticks"></div></div>
  <div id="help">${T('<b>glisser</b> regarder · <b>molette</b> distance / zoom · <b>1 à 9</b> vitesse · <b>+ −</b> ajuster · <b>P / Espace</b> pause · <b>N</b> moment suivant · <b>V</b> changer de vue · <b>R</b> rejouer · <b>H</b> masquer')}</div>
</div>
<div id="start">
  <div class="caps">${cfg.kicker || ''}</div><h1>${cfg.h1 || cfg.title}</h1>
  <p>${cfg.intro || ''}</p>${segHtml(0)}
  ${cfg.warn ? `<p style="font-size:12.5px;opacity:.8;max-width:600px">${cfg.warn}</p>` : ''}
  ${cfg.moments ? `<label class="caps" style="display:flex;align-items:center;gap:10px;margin-top:10px">${T('Commencer à')} <select id="moment" class="sel" style="width:320px;margin:0" aria-label="${T('Moment de départ')}"></select></label>` : ''}
  <button id="go">${T('Entrer')}</button>
</div>`;
  const $ = (id) => document.getElementById(id);
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const perf = { pr: Math.min(window.devicePixelRatio || 1, 1.5), acc: 0, n: 0, min: cfg.minPr || 0.55 };
  if (hash.has('pr')) perf.pr = perf.min = +hash.get('pr');
  renderer.setPixelRatio(perf.pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = cfg.exposure || 1;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(cfg.bg || 0x000003);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1e6);
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: cfg.msaa === 0 ? 0 : 2 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } }, vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D tDiffuse;varying vec2 vUv;void main(){vec4 c=texture2D(tDiffuse,vUv);if(!(c.r==c.r&&c.g==c.g&&c.b==c.b))c=vec4(0.,0.,0.,1.);gl_FragColor=vec4(clamp(c.rgb,0.,400.),1.);}' }));
  const b = cfg.bloom || [0.6, 0.6, 1.0];
  const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), b[0], b[1], b[2]);
  composer.addPass(bloom); composer.addPass(new OutputPass());
  const skies = [];
  function resize() {
    const w = window.innerWidth, h = window.innerHeight; camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.setSize(w, h, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
    for (const s of skies) if (s.material.uniforms.uPx) s.material.uniforms.uPx.value = renderer.getPixelRatio() * h / 800;
  }
  window.addEventListener('resize', resize);

  const sim = { t: cfg.tStart ?? cfg.t0, speed: cfg.speed0 || 1, paused: false, auto: !!cfg.autoRate };
  const cam = { mode: 'orbit', yaw: 0, pitch: 0.2, dist: 10, min: 1, max: 100, fov: 55, target: new THREE.Vector3(), pos: new THREE.Vector3(), basis: new THREE.Quaternion(), near: null, far: null };
  const kit = { THREE, renderer, scene, camera, composer, bloom, sim, cam, view: null, opt: {}, $, cfg, ac: null, soundOn: false, started: false,
    addSky(o) { skies.push(o); scene.add(o); resize(); return o; } };
  for (const o of opts) kit.opt[o.id] = hash.has('o_' + o.id) ? (o.type === 'select' ? hash.get('o_' + o.id) : hash.get('o_' + o.id) === '1') : o.value;

  // ---- vues
  const saved = {};
  function setView(id, keep) {
    if (!V[id]) return; if (kit.view) saved[kit.view] = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, fov: cam.fov };
    kit.view = id; const d = { mode: 'orbit', yaw: 0, pitch: 0.2, dist: 10, min: 1, max: 100, fov: 55, ...V[id].cam, ...(keep ? saved[id] : null) };
    Object.assign(cam, { mode: d.mode, yaw: d.yaw, pitch: d.pitch, dist: d.dist, min: d.min, max: d.max, fov: d.fov }); cam.near = cam.far = null; cam.basis.identity();
    for (const bt of stage.querySelectorAll('[data-view]')) bt.classList.toggle('on', bt.dataset.view === id);
    $('distbox').style.display = d.mode === 'orbit' ? '' : 'none';
    if (cfg.onView) cfg.onView(id, kit);
  }
  for (const bt of stage.querySelectorAll('[data-view]')) bt.addEventListener('click', () => setView(bt.dataset.view, true));
  kit.setView = setView;

  // ---- vitesse
  const [sMin, sMax] = cfg.speedRange || [0.1, 1000];
  const s2k = (s) => 1000 * Math.log(s / sMin) / Math.log(sMax / sMin), k2s = (k) => sMin * Math.pow(sMax / sMin, k / 1000);
  function setSpeed(s, manual = true) { sim.speed = clamp(s, sMin, sMax); if (manual && sim.auto) { sim.auto = false; if ($('auto')) $('auto').checked = false; } }
  $('spd').addEventListener('input', (e) => setSpeed(k2s(+e.target.value)));
  $('minus').addEventListener('click', () => setSpeed(sim.speed / 1.7783)); $('plus').addEventListener('click', () => setSpeed(sim.speed * 1.7783));
  if ($('auto')) $('auto').addEventListener('change', (e) => { sim.auto = e.target.checked; });
  const speeds = cfg.speeds || [1, 2, 5, 10, 30, 60, 120, 300, 1000];

  // ---- moments
  const moments = cfg.moments || [];
  function gotoMoment(i) {
    const m = moments[i]; if (!m) return; sim.t = m.t; if (m.view && m.view !== kit.view) setView(m.view, false);
    if (m.cam) Object.assign(cam, m.cam); lastJ = -2; if (cfg.onJump) cfg.onJump(m, kit);
  }
  for (const id of ['moment', 'moment2']) { const s = $(id); if (!s) continue; s.innerHTML = moments.map((m, i) => `<option value="${i}">${m.label}</option>`).join(''); }
  if ($('moment2')) $('moment2').addEventListener('change', (e) => { gotoMoment(+e.target.value); canvas.focus(); });
  kit.gotoMoment = gotoMoment;
  const prog = cfg.prog || ((t) => (t - cfg.t0) / (cfg.t1 - cfg.t0));
  $('ticks').innerHTML = moments.map(m => `<i style="left:${clamp(prog(m.t), 0, 1) * 100}%" title="${m.label}"></i>`).join('');

  // ---- options
  for (const e of stage.querySelectorAll('[data-opt]')) {
    const id = e.dataset.opt; if (e.tagName === 'SELECT') e.value = kit.opt[id]; else e.checked = !!kit.opt[id];
    e.addEventListener('change', () => { kit.opt[id] = e.tagName === 'SELECT' ? e.value : e.checked; if (cfg.onOpt) cfg.onOpt(id, kit.opt[id], kit); });
  }
  if ($('snd')) $('snd').addEventListener('change', (e) => { kit.soundOn = e.target.checked; });

  // ---- actions
  const restart = () => { sim.t = cfg.tStart ?? cfg.t0; sim.paused = false; lastJ = -2; if (cfg.autoRate) { sim.auto = true; $('auto').checked = true; } if (cfg.onJump) cfg.onJump(null, kit); };
  const next = () => { const i = moments.findIndex(m => m.t > sim.t + 1e-9 * Math.abs(sim.t) + 1e-12); if (i >= 0) { gotoMoment(i); if ($('moment2')) $('moment2').value = i; } };
  $('pause').addEventListener('click', () => { sim.paused = !sim.paused; });
  $('next').addEventListener('click', next); $('again').addEventListener('click', restart);
  $('menuBtn').addEventListener('click', () => { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) { location.hash = ''; } location.reload(); });
  window.addEventListener('keydown', (e) => {
    if (!kit.started || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k >= '1' && k <= '9') setSpeed(speeds[+k - 1]); else if (k === '+' || k === '=') setSpeed(sim.speed * 1.7783); else if (k === '-') setSpeed(sim.speed / 1.7783);
    else if (k === 'p' || k === ' ') { sim.paused = !sim.paused; e.preventDefault(); } else if (k === 'n') next(); else if (k === 'r') restart();
    else if (k === 'h') $('hud').classList.toggle('hidden'); else if (k === 'v') { const i = views.findIndex(v => v.id === kit.view); setView(views[(i + 1) % views.length].id, true); }
  });

  // ---- caméra : glisser / molette
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return; const k = (cam.mode === 'look' ? cam.fov / 55 : 1) * 0.0045, s = cam.mode === 'look' ? 1 : -1;
    cam.yaw += (e.clientX - drag.x) * k * s; cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * k * (cam.mode === 'look' ? -1 : 1), -1.55, 1.55); drag.x = e.clientX; drag.y = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); const f = Math.exp(e.deltaY * 0.0012);
    if (cam.mode === 'orbit') cam.dist = clamp(cam.dist * f, cam.min, cam.max); else cam.fov = clamp(cam.fov * f, 4, 95);
  }, { passive: false });
  $('dist2').addEventListener('input', (e) => { cam.dist = cam.min * Math.pow(cam.max / cam.min, +e.target.value / 1000); });
  const _d = new THREE.Vector3(), _up = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
  function applyCamera() {
    if (cam.mode === 'orbit') {
      const cp = Math.cos(cam.pitch); _d.set(cp * Math.sin(cam.yaw), Math.sin(cam.pitch), cp * Math.cos(cam.yaw)).applyQuaternion(cam.basis);
      camera.position.copy(cam.target).addScaledVector(_d, cam.dist); _up.set(0, 1, 0).applyQuaternion(cam.basis); camera.up.copy(_up); camera.lookAt(cam.target);
      camera.near = cam.near ?? cam.dist * 0.02; camera.far = cam.far ?? cam.dist * 2e4;
    } else {
      camera.position.copy(cam.pos); _e.set(cam.pitch, -cam.yaw, 0, 'YXZ'); camera.quaternion.copy(cam.basis).multiply(_q.setFromEuler(_e));
      camera.near = cam.near ?? 0.1; camera.far = cam.far ?? 1e7;
    }
    if (camera.fov !== cam.fov) camera.fov = cam.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }

  // ---- journal
  let journal = cfg.journal || []; let lastJ = -2; kit.setJournal = (j) => { journal = j; lastJ = -2; };
  function updJournal() {
    let i = -1; for (let k = 0; k < journal.length; k++) if (journal[k].t <= sim.t) i = k;
    if (i === lastJ) return; lastJ = i; const J = $('journal'); J.innerHTML = '';
    for (const k of [i, i - 1]) { if (k < 0) continue; const e = el('div', { class: 'entry on' }, `<b>${journal[k].title}</b><span>${journal[k].text}</span>`); if (k !== i) e.style.opacity = 0.55; J.appendChild(e); }
  }

  // ---- boucle
  let hudT = 0, last = performance.now();
  function step(dt, real = true) {
    if (!sim.paused && kit.started && !kit.hold) {
      if (sim.auto && cfg.autoRate) sim.speed = clamp(cfg.autoRate(sim.t), sMin, sMax);
      sim.t += dt * sim.speed; if (sim.t >= cfg.t1) { sim.t = cfg.t1; } if (sim.t < cfg.t0) sim.t = cfg.t0;
    }
    cfg.update(sim.t, sim.paused || !kit.started ? 0 : dt, kit);
    applyCamera();
    if (cfg.post) cfg.post(sim.t, kit);
    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.1; const c = cfg.clock(sim.t); $('clock').textContent = c[0]; $('sub').textContent = c[1] || '';
      $('data').innerHTML = cfg.data ? cfg.data(sim.t, kit) : ''; $('speed').textContent = (sim.auto ? T('auto') + ' · ' : '') + (cfg.fmtRate || fmtRate)(sim.speed, kit);
      if (document.activeElement !== $('spd')) $('spd').value = s2k(sim.speed);
      $('pause').textContent = sim.paused ? T('Reprendre') : T('Pause'); $('barfill').style.width = clamp(prog(sim.t), 0, 1) * 100 + '%';
      if (cam.mode === 'orbit') { $('dlabel2').textContent = cfg.distLabel ? cfg.distLabel(cam.dist, kit) : fmtDist(cam.dist * (cfg.unitKm || 1)); if (document.activeElement !== $('dist2')) $('dist2').value = 1000 * Math.log(cam.dist / cam.min) / Math.log(cam.max / cam.min); }
      updJournal();
    }
    if (!window.__norender) composer.render(dt);
    if (real && !hash.has('pr')) { perf.acc += dt; perf.n++; if (perf.n >= 40) { const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0; if (avg > 0.03 && perf.pr > perf.min) { perf.pr = Math.max(perf.min, perf.pr * 0.85); renderer.setPixelRatio(perf.pr); resize(); } } }
  }
  function loop() { const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; step(dt); requestAnimationFrame(loop); }
  kit.step = step;
  function begin() {
    if (kit.started) return; kit.started = true; $('start').classList.add('gone'); if (hash.get('hud') !== '0') $('hud').classList.remove('hidden');
    if (cfg.sound) { try { kit.ac = new (window.AudioContext || window.webkitAudioContext)(); kit.soundOn = true; } catch (_) { } }
    if ($('moment') && +$('moment').value > 0 && !hash.has('t')) { gotoMoment(+$('moment').value); $('moment2').value = $('moment').value; }
    if (cfg.onStart) cfg.onStart(kit);
  }
  $('go').addEventListener('click', begin);
  kit.run = () => {
    setView(hash.get('view') && V[hash.get('view')] ? hash.get('view') : (cfg.view0 || views[0].id), false);
    for (const k of ['yaw', 'pitch', 'dist', 'fov']) if (hash.has(k)) cam[k] = +hash.get(k);
    if (hash.has('t')) { sim.t = +hash.get('t'); sim.paused = !hash.has('play'); sim.auto = false; }
    if (hash.has('speed')) { sim.speed = +hash.get('speed'); sim.auto = false; }
    resize(); if (hash.has('auto') || hash.has('t') || hash.has('m')) begin();
    if (hash.has('m')) { gotoMoment(+hash.get('m')); sim.paused = !hash.has('play'); sim.auto = false; if ($('moment2')) $('moment2').value = hash.get('m'); }
    window.__sim = { sim, kit, step: (dt) => step(dt, false) };
    loop();
  };
  return kit;
}
