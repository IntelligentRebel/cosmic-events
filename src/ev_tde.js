// Une étoile déchiquetée par un trou noir géant (événement de rupture par effet de marée).
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, rng, DAY, glowTexture } from './kit.js';
import { makeBH, BH_OCCL } from './bh.js';
const RSKM = 2.953e6, TU = RSKM / 299792.458;       // trou noir d'un million de masses solaires ; unité de temps rs/c
const GM = 0.5, RST = 695700 / RSKM, RT = RST * 100, RP = 15;
const EMAX = GM * RST / (RT * RT);                   // dispersion d'énergie figée au rayon de marée
const TFB = 2 * Math.PI * Math.sqrt(Math.pow(GM / (2 * EMAX), 3) / GM); // retour des débris les plus liés
function kepler(rp, e, dt, out) {
  if (Math.abs(e - 1) < 1e-6) { const W = 1.5 * Math.sqrt(GM / (2 * rp * rp * rp)) * dt, y = Math.cbrt(W + Math.sqrt(W * W + 1)), D = y - 1 / y; out[0] = rp * (1 - D * D); out[1] = 2 * rp * D; return; }
  if (e < 1) { const a = rp / (1 - e), n = Math.sqrt(GM / (a * a * a)); let M = n * dt; M -= 2 * Math.PI * Math.round(M / (2 * Math.PI));
    let E = Math.abs(M) < 0.4 ? Math.cbrt(6 * M) : M + e * Math.sin(M); for (let i = 0; i < 9; i++) { const f = E - e * Math.sin(E) - M, fp = 1 - e * Math.cos(E) + 1e-9; E -= clamp(f / fp, -1, 1); }
    out[0] = a * (Math.cos(E) - e); out[1] = a * Math.sqrt(1 - e * e) * Math.sin(E); return; }
  const a = rp / (e - 1), n = Math.sqrt(GM / (a * a * a)), M = n * dt; let H = Math.abs(M) < 0.4 ? Math.cbrt(6 * M) : Math.sign(M) * Math.log(2 * Math.abs(M) / e + 1.8);
  for (let i = 0; i < 9; i++) { const f = e * Math.sinh(H) - H - M, fp = e * Math.cosh(H) - 1 + 1e-9; H -= clamp(f / fp, -1, 1); }
  out[0] = a * (e - Math.cosh(H)); out[1] = a * Math.sqrt(e * e - 1) * Math.sinh(H);
}
export function start() {
  const N = 52000, r = rng(11), P0 = new Float32Array(N * 3), X = new Float32Array(N), TH0 = new Float32Array(N), RC = new Float32Array(N);
  for (let i = 0; i < N; i++) { let x, y, z; do { x = r() * 2 - 1; y = r() * 2 - 1; z = r() * 2 - 1; } while (x * x + y * y + z * z > 1); const c = Math.pow(r(), 0.6); P0.set([x * c, y * c, z * c], i * 3); X[i] = x * c; TH0[i] = r() * 6.283; RC[i] = 6 + 26 * Math.pow(r(), 1.3); }
  const pos = new Float32Array(N * 3), heat = new Float32Array(N), o2 = [0, 0];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('heat', new THREE.BufferAttribute(heat, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: glowTexture() }, uSize: { value: 1 }, uB: { value: 1 } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float heat;varying float vH,vA;uniform float uSize;${BH_OCCL}
void main(){vH=heat;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float d=-mv.z;float ps=clamp(uSize/d,2.,26.);gl_PointSize=ps;vA=bhVis(position)*min(1.,9./(ps*ps));}`,
    fragmentShader: `uniform sampler2D uTex;uniform float uB;varying float vH,vA;void main(){float a=texture2D(uTex,gl_PointCoord).a;
  vec3 c=mix(vec3(1.,.4,.14),vec3(1.,.72,.35),smoothstep(0.,.5,vH));c=mix(c,vec3(.75,.85,1.),smoothstep(.5,1.,vH));gl_FragColor=vec4(c*a*vA*uB*(.7+vH),1.);}`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  const center = new THREE.Vector3(); let returned = 0, time = 0;
  function simulate(t) {
    kepler(RP, 1, t, o2); center.set(o2[0], 0, o2[1]);
    const vp = Math.sqrt(2 * GM / RP); let ret = 0;
    const melt = sstep(RT * 1.6, RP, center.length()) * (t < 0 ? 1 : 1);
    for (let i = 0; i < N; i++) {
      const ox = P0[i * 3] * RST, oy = P0[i * 3 + 1] * RST, oz = P0[i * 3 + 2] * RST, x = X[i];
      const rp = RP + ox, dti = t - oz / vp, e = dti > 0 ? 1 + 2 * x * EMAX * rp / GM : 1;
      let px, pz, h = 0.3, py = oy;
      const Ti = e < 1 ? 2 * Math.PI * Math.sqrt(Math.pow(rp / (1 - e), 3) / GM) : Infinity;
      if (dti > Ti * 0.985) { // revenu : il rejoint le disque
        ret++; const age = dti - Ti * 0.985, rc = Math.max(3.2, RC[i] * Math.exp(-age / (TFB * 1.5))), th = TH0[i] + Math.sqrt(GM / (rc * rc * rc)) * age;
        px = rc * Math.cos(th); pz = rc * Math.sin(th); py = oy * 6 * (rc / 30); h = clamp(1.25 - rc / 30, 0.3, 1);
      } else {
        kepler(rp, e, dti, o2); px = o2[0]; pz = o2[1]; const rr = Math.hypot(px, pz);
        h = clamp(0.2 + 0.8 * Math.pow(RP / rr, 0.8), 0.25, 1) * (t < 0 ? 0.55 + 0.45 * melt : 1);
        py = oy * clamp(rr / RP, 0.25, 1) ** (dti > 0 ? 0.5 : 0);
      }
      pos[i * 3] = px; pos[i * 3 + 1] = py; pos[i * 3 + 2] = pz; heat[i] = h;
    }
    returned = ret / N; g.attributes.position.needsUpdate = true; g.attributes.heat.needsUpdate = true;
  }
  const T0 = -Math.sqrt(2 * Math.pow(400, 3) / GM) / 3, T1 = 400 * DAY / TU, lt = (t) => Math.sign(t) * Math.log10(1 + Math.abs(t) / 30);
  const fall = (t) => t < TFB ? 0 : Math.pow(t / TFB, -5 / 3);
  const kit = createKit({
    title: T('Une étoile déchiquetée par un trou noir'), kicker: T('Rupture par effet de marée · au centre d’une galaxie'), h1: T('L’étoile déchiquetée'),
    intro: T('Une étoile comme le Soleil passe trop près d’un trou noir d’un million de masses solaires. La gravité tire plus fort sur sa face proche que sur sa face éloignée : en quelques heures, elle est étirée en un filament. La moitié s’échappe, l’autre revient nourrir le trou noir pendant des mois.'),
    warn: T('Orbites et calendrier sont calculés (dispersion d’énergie figée au rayon de marée, retour en 41 jours, déclin en t puissance −5/3). L’aspect du gaz et la formation du disque sont une mise en scène.'),
    views: [{ id: 'bh', label: T('Autour du trou noir'), cam: { mode: 'orbit', dist: 110, min: 4, max: 9000, pitch: 0.55, yaw: -0.5 } }, { id: 'star', label: T('Suivre l’étoile'), cam: { mode: 'orbit', dist: 3.2, min: 0.5, max: 400, pitch: 0.35, yaw: 2.4 } }],
    t0: T0, t1: T1, tStart: T0, speed0: 60, speedRange: [0.5, 4e5], speeds: [1, 5, 20, 100, 500, 3000, 2e4, 1e5, 3e5],
    autoRate: (t) => clamp(Math.abs(t) / 14, 4, t > TFB * 0.8 ? 5e4 : 2e5),
    fmtRate: (s) => TF('{0} / s', [fmtDur(s * TU)]),
    moments: [{ label: T('Approche, 15 heures avant'), t: T0 }, { label: T('Rayon de marée : l’étoile cède'), t: -Math.sqrt(2 * RT ** 3 / GM) / 3 * 0.8, view: 'star' }, { label: T('Passage au plus près'), t: 0, view: 'star', cam: { dist: 6 } },
      { label: T('Deux heures après : elle s’allonge'), t: 7200 / TU, view: 'star', cam: { dist: 30 } }, { label: T('Trois jours après'), t: 3 * DAY / TU, view: 'bh', cam: { dist: 3500 } }, { label: T('Retour des premiers débris (41 jours)'), t: TFB * 1.02, view: 'bh', cam: { dist: 900 } },
      { label: T('Le pic de luminosité'), t: TFB * 1.5, view: 'bh', cam: { dist: 160 } }, { label: T('Six mois après'), t: 180 * DAY / TU, view: 'bh', cam: { dist: 120 } }],
    prog: (t) => (lt(t) - lt(T0)) / (lt(T1) - lt(T0)),
    journal: [
      { t: T0, title: T('Une étoile égarée'), text: T('Une rencontre avec une autre étoile l’a déviée vers le centre de la galaxie. Elle tombe sur une orbite presque parabolique vers un trou noir qu’elle ne voit pas : il n’y a pas encore de disque.') },
      { t: -Math.sqrt(2 * RT ** 3 / GM) / 3, title: T('Rayon de marée'), text: T('À 70 millions de kilomètres, la marée du trou noir dépasse la gravité qui tient l’étoile. Elle commence à s’allonger. Plus rien ne peut la sauver.') },
      { t: -4, title: T('Au plus près'), text: T('Elle passe à 44 millions de kilomètres du centre, à 26 % de la vitesse de la lumière. Chaque morceau part sur sa propre orbite, selon qu’il était du côté proche ou éloigné.') },
      { t: 3600 / TU, title: T('Spaghettification'), text: T('L’étoile n’existe plus. C’est un filament de gaz qui s’étire et se refroidit. La moitié proche du trou noir a perdu de l’énergie : elle est capturée. L’autre moitié s’échappe à plus de 6 000 km/s.') },
      { t: 5 * DAY / TU, title: T('Le silence'), text: T('Pendant des semaines, rien. Les débris capturés montent sur de longues ellipses avant de retomber. Vu de loin, le centre de la galaxie est toujours noir.') },
      { t: TFB, title: T('Le retour'), text: T('Quarante et un jours après, les débris les plus liés reviennent. Le filament se percute lui-même, chauffe, et s’enroule en disque. Le trou noir s’allume : il peut briller plus que toute sa galaxie.') },
      { t: TFB * 2.2, title: T('Le déclin'), text: T('Les débris suivants reviennent de plus loin, donc de moins en moins vite. Le flux décroît comme le temps à la puissance −5/3 : c’est cette courbe, vue au télescope, qui signe une étoile déchiquetée.') },
    ],
    clock: (t) => [(t < 0 ? TF('T − {0}', [fmtDur(Math.abs(t) * TU)]) : TF('T + {0}', [fmtDur(Math.abs(t) * TU)])), t < 0 ? T('avant le passage au plus près') : T('après le passage au plus près')],
    data: (t) => {
      const d = center.length(), v = Math.sqrt(2 * GM / d);
      return (t < TFB * 0.3 ? TF('Étoile : à <b>{0}</b> du trou noir, <b>{1} %</b> de la vitesse de la lumière', [fmtDist(d * RSKM), fr(v * 100, 1)]) + '<br>' : '') +
        T('Trou noir : 1 million de masses solaires, horizon de 5,9 millions de km de diamètre') + '<br>' + TF('Débris revenus : <b>{0} %</b> de l’étoile (au plus la moitié)', [fr(returned * 100, 1)]) + '<br>' +
        TF('Flux de matière qui retombe : <b>{0}</b>', [t < TFB ? T('nul') : TF('{0} % du pic', [fr(fall(t) * 100, t > TFB * 4 ? 1 : 0)])]);
    },
    distLabel: (d) => fmtDist(d * RSKM), bloom: [0.9, 0.7, 0.7], minPr: 0.45,
    update(t, dt, k) {
      time += dt; simulate(t);
      const d = center.length(), whole = t < 0 ? 1 - sstep(RT * 1.15, RT * 0.75, d) : 0;
      bh.u.uStar.value.copy(center); bh.u.uStarR.value = whole > 0.02 ? RST * whole : 0;
      mat.uniforms.uB.value = (1 - whole) * 0.8 * clamp(k.camera.position.distanceTo(center) / 60, 0.12, 1); pts.visible = whole < 0.98;
      mat.uniforms.uSize.value = 0.5 * k.renderer.domElement.height;
      const f = fall(t), lum = t < TFB ? 0 : Math.min(1, (t - TFB) / (TFB * 0.35)) * Math.pow(f, 0.6);
      bh.u.uTime.value = time * 4; bh.u.uDiskB.value = 2.6 * lum; bh.u.uDiskOut.value = 2 * RP; bh.u.uJet.value = 0.35 * lum;
      const cd = k.camera.position.length(); bh.u.uGlow.value = 6 * lum * sstep(80, 800, cd); bh.u.uGlowS.value = cd * 0.004;
      if (k.view === 'bh') k.cam.target.set(0, 0, 0); else k.cam.target.copy(center);
    },
    post: () => bh.sync(),
  });
  const bh = makeBH(kit, { uDiskIn: 3, uDiskOut: 30, uDiskB: 0, uDiskFall: 0.9, uDiskHot: 15000, uDiskCool: 2500, uStarR: RST, uStarCol: [1.0, 0.86, 0.6], uStarGlow: 0.3, uJetLen: 300, uStarsB: 1.2, uMW: 1.0 });
  kit.scene.add(bh.mesh); kit.scene.add(pts);
  kit.run();
}
