// FICTION : un trou noir de quatre masses solaires passe à l'intérieur de l'orbite de Mars. C'est le Soleil qui est arraché à ses planètes.
// Point de départ inspiré de la trilogie « Black Hole » de Jason Thomson ; masse, vitesse, trajectoire et calcul sont ceux de cette scène (nbody.js).
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, YEAR, DAY, makeStars, makeGlow } from './kit.js';
import { simulate, elements, IDX, G, KMS } from './nbody.js';
import { makeBH } from './bh.js';
import { INFO, SAT_F, RING_F, BALL_F, BALL_V, AU, RS, FLAT, DEG } from './ev_saturn.js';
const MBH = 4.1, RSKM = 2.953 * MBH;
// le trou noir coupe le plan des planètes à 1,2 UA du Soleil, incliné de 30° sur ce plan
const BHP = { mbh: MBH, vbh: 118 / KMS, cross: [1.2, 0], yoff: 0, tiltX: 0, tiltZ: 1.73, T0: 2, T1: 30, sample: 1, eta: 0.02, inertial: true };
// position de la Terre sur son orbite le jour du passage : elle décide de tout
const SC = { gone: 300, stay: 270, burn: 225 };
const S = IDX.sun, E = IDX.earth, M = IDX.moon, SA = IDX.saturn, B = IDX.bh, NB = 11, N3 = 33;
const PRI = ['sun', 'earth', 'bh', 'moon', 'jupiter', 'saturn', 'mars', 'venus', 'mercury', 'uranus', 'neptune'], PLANETS = [1, 2, 3, 5, 6, 7, 8, 9];
const SPAN_I = [32, 0.25, 0.6, 3, 0, 6, 32, 32, 32, 32, 3], SPAN_S = [0, 0.24, 0.44, 1.2, 0, 2, 3, 3, 3, 3, 1];

export function start() {
  let R, tPass, sc = 'gone';
  const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]), sub = (a, b, o) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  function st(i, ty, o, vel) {
    const s = clamp((ty - R.t0) / R.step, 0, R.ns - 1.000001), k = Math.floor(s), u = s - k, a = k * N3 + i * 3, b = a + N3, h = R.step, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (let c = 0; c < 3; c++) { o[c] = h00 * R.X[a + c] + h10 * h * R.V[a + c] + h01 * R.X[b + c] + h11 * h * R.V[b + c]; if (vel) vel[c] = R.V[a + c] + (R.V[b + c] - R.V[a + c]) * u; }
    return o;
  }
  const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _d = [0, 0, 0], _va = [0, 0, 0], _vb = [0, 0, 0], _vc = [0, 0, 0];
  function build(id) {
    sc = id; R = simulate({ ...BHP, earthPh: SC[id] * DEG });
    let bd = 1e9; tPass = 0; for (let ty = -0.5; ty <= 0.5; ty += 1 / 3652.5) { const d = len(sub(st(B, ty, _a), st(S, ty, _b), _c)); if (d < bd) { bd = d; tPass = ty; } }
  }
  const Y = (y) => (tPass + y) * YEAR;
  const J = () => [
    { t: -2 * YEAR, title: T('Un rendez-vous connu d’avance'), text: T('Un trou noir de 4,1 masses solaires ne se cache pas longtemps : des années avant son arrivée, les planètes extérieures dévient déjà. On sait où il passera, et quand. On ne peut rien y faire : il pèse quatre fois le Soleil.') },
    { t: Y(-1.2), title: T('L’entrée'), text: T('Il arrive à 118 km/s, vingt-cinq fois la distance Terre-Soleil par an. De l’orbite de Neptune à celle de Jupiter, il lui faut un an. Vu de la Terre, rien : une sphère noire de 24 km.') },
    { t: Y(-0.06), title: T('Le passage'), text: T('Il coupe le plan des planètes à l’intérieur de l’orbite de Mars et passe à 138 millions de km du Soleil, moins que la distance Terre-Soleil. Pendant quelques semaines, c’est lui, et non le Soleil, l’astre le plus lourd du voisinage.') },
    { t: Y(0.05), title: T('Le Soleil arraché'), text: T('Le Soleil est tiré vers le trou noir et repart à 50 km/s, dans une direction nouvelle. Les planètes ne le suivent que si elles sont assez près de lui pour encaisser le même coup : Mercure et Vénus restent, sur des orbites déformées. Mars, frôlé de près, est chassé à 70 km/s.') },
    ...(sc === 'gone' ? [
      { t: Y(0.12), title: T('La Terre lâchée'), text: T('Le trou noir est passé à 77 millions de km de la Terre. Elle n’est plus liée au Soleil : elle s’en éloigne à près de 40 km/s, et la Lune part avec elle.') },
      { t: Y(0.45), title: T('Les géantes orphelines'), text: T('Jupiter, Saturne, Uranus et Neptune sont trop loin pour suivre. Le Soleil s’en va sans elles : elles continuent sur leur lancée, sans étoile. Quatre planètes errantes de plus dans la Galaxie.') },
      { t: Y(1), title: T('Un an plus tard'), text: T('La Terre est à la distance où se trouvait Saturne. Le Soleil n’est plus qu’une étoile très brillante, qui lui donne 1 % de sa lumière d’avant. La température d’équilibre approche −190 °C : les océans gèlent en surface et, à terme, l’air lui-même se condense.') },
      { t: Y(8), title: T('Dans le noir'), text: T('La Terre et la Lune dérivent ensemble entre les étoiles. La Lune tourne toujours autour d’elle, mais plus rien ne l’éclaire. La chaleur interne de la planète, elle, continue : sous la glace, le fond des océans reste liquide.') },
    ] : sc === 'stay' ? [
      { t: Y(0.12), title: T('La Terre suit'), text: T('Le trou noir est passé à 135 millions de km de la Terre, presque aussi près que du Soleil : les deux ont reçu à peu près le même coup. La Terre reste liée au Soleil, et la Lune à la Terre.') },
      { t: Y(0.45), title: T('Les géantes orphelines'), text: T('Jupiter, Saturne, Uranus et Neptune sont trop loin pour suivre. Le Soleil s’en va sans elles : elles continuent sur leur lancée, sans étoile. Quatre planètes errantes de plus dans la Galaxie.') },
      { t: Y(1), title: T('Une autre année'), text: T('La nouvelle orbite va de 0,77 à 1,47 UA, inclinée de 50° sur l’ancien plan, et l’année dure 433 jours. Au plus près, la Terre reçoit 70 % de lumière en plus ; au plus loin, moitié moins.') },
      { t: Y(8), title: T('Un système réduit'), text: T('Il reste trois planètes autour du Soleil : Mercure, Vénus et la Terre. Les orbites de Mercure et de Vénus se croisent désormais ; à long terme, rien ne garantit que ce trio soit stable.') },
    ] : [
      { t: Y(0.12), title: T('La Terre suit, mal'), text: T('Le trou noir est passé loin de la Terre, à 235 millions de km, mais près du Soleil. Le Soleil a été déplacé sous elle : la Terre reste liée, sur une orbite qui plonge vers lui.') },
      { t: Y(0.45), title: T('La Lune perdue'), text: T('Si près du Soleil, la Terre ne peut plus retenir un satellite aussi lointain que la Lune. Elle s’échappe et devient une planète à part entière.') },
      { t: Y(1), title: T('Une année de 237 jours'), text: T('La Terre passe maintenant de 1,27 UA à 0,23 UA du Soleil, plus près que Mercure aujourd’hui. Au plus près, elle reçoit dix-neuf fois la lumière actuelle : la température d’équilibre dépasse 250 °C.') },
      { t: Y(8), title: T('Un système réduit'), text: T('Il reste trois planètes autour du Soleil : Mercure, Vénus et la Terre. Les orbites de Mercure et de Vénus se croisent désormais ; à long terme, rien ne garantit que ce trio soit stable.') },
    ]),
    { t: Y(20), title: T('Ce que le calcul dit, et ne dit pas'), text: T('Climat, marées, séismes : rien de cela n’est simulé. Mais la gravité seule suffit à montrer que tout dépend de l’endroit où se trouve la Terre le jour du passage : changez de scénario, vous changez son sort.') },
  ];
  const MOM = [
    { label: T('Le trou noir arrive'), view: 'system', cam: { dist: 70, pitch: 0.7, yaw: 0.5 }, y: -1.9 }, { label: T('Le passage près du Soleil'), view: 'system', cam: { dist: 6, pitch: 0.8, yaw: 0.5 }, y: -0.1 },
    { label: T('Le Soleil est arraché'), view: 'system', cam: { dist: 9, pitch: 0.8, yaw: 0.5 }, y: 0.08 }, { label: T('Qui suit le Soleil ?'), view: 'sun', cam: { dist: 4.5, pitch: 0.9, yaw: 0.5 }, y: 0.6 },
    { label: T('Le Soleil vu de la Terre, un an après'), view: 'earth', cam: { fov: 30 }, y: 1 }, { label: T('Les géantes orphelines'), view: 'system', cam: { dist: 130, pitch: 0.8, yaw: 0.5 }, y: 4 },
    { label: T('Dix ans plus tard'), view: 'system', cam: { dist: 330, pitch: 0.8, yaw: 0.5 }, y: 10 }, { label: T('Autour du Soleil, trente ans plus tard'), view: 'sun', cam: { dist: 4.5, pitch: 0.9, yaw: 0.5 }, y: 29.2 },
    { label: T('Trente ans plus tard'), view: 'system', cam: { dist: 900, pitch: 0.8, yaw: 0.5 }, y: 29.9 }, { label: T('Le trou noir, de près'), view: 'bh', y: -0.03 },
  ];
  const setMoments = () => { for (const m of MOM) m.t = Y(m.y); };
  build('gone'); setMoments();

  const P = Array.from({ length: NB }, () => [0, 0, 0]), W = Array.from({ length: NB }, () => new THREE.Vector3()), O = new THREE.Vector3(), ZERO = [0, 0, 0];
  const tv = new THREE.Vector3();
  const pole = new THREE.Vector3(Math.sin(26.73 * DEG) * Math.cos(152 * DEG), Math.cos(26.73 * DEG), Math.sin(26.73 * DEG) * Math.sin(152 * DEG));
  const QS = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole), QSi = QS.clone().invert();
  const pois = INFO.slice(0, NB).map((b, i) => ({ id: b.id, label: b.label, r: Math.max(b.km / AU * 2.5, i === B ? 0.05 : 1e-5), pos: (t, k) => k.view === 'bh' ? (i === B ? O : null) : (k.view === 'earth' && i === E) ? null : W[i] }));
  const POI = Object.fromEntries(pois.map(p => [p.id, p])); pois.sort((a, b) => PRI.indexOf(a.id) - PRI.indexOf(b.id));
  const relSun = (i, ty) => { st(i, ty, _a, _va); st(S, ty, _b, _vb); sub(_a, _b, _c); sub(_va, _vb, _vc); return elements(_c[0], _c[1], _c[2], _vc[0], _vc[1], _vc[2], G); };
  const kit = createKit({
    title: T('Fiction · le Soleil arraché par un trou noir'), kicker: T('Fiction · un scénario calculé, pas une prévision'), h1: T('Et si un trou noir emportait le Soleil ?'),
    intro: T('Ceci est une fiction. Un trou noir de 4,1 masses solaires, 24 km de diamètre, traverse le système solaire à 118 km/s et passe à l’intérieur de l’orbite de Mars. Il pèse quatre fois le Soleil : c’est le Soleil qui est arraché à ses planètes. Le sort de la Terre dépend de l’endroit où elle se trouve ce jour-là. Tout est calculé : la gravité de onze corps, pas à pas.'),
    warn: T('Point de départ inspiré de la trilogie « Black Hole » de Jason Thomson (un trou noir traverse le système solaire en 2199) ; la masse, la vitesse et la trajectoire retenues ici, et tout le calcul, sont ceux de cette scène, pas ceux du roman. Aucun trou noir n’est connu près du Soleil : le plus proche repéré à ce jour est à plus de mille années-lumière. Orbites de départ simplifiées : circulaires, dans un même plan. Marées, climat et collisions ne sont pas simulés.'),
    views: [{ id: 'system', label: T('Le système solaire'), cam: { mode: 'orbit', dist: 70, min: 0.0006, max: 2500, pitch: 0.7, yaw: 0.5, fov: 45 } }, { id: 'sun', label: T('En suivant le Soleil'), cam: { mode: 'orbit', dist: 4.5, min: 0.012, max: 400, pitch: 0.9, yaw: 0.5, fov: 45 } },
      { id: 'earth', label: T('Depuis la Terre'), cam: { mode: 'look', fov: 30, yaw: 0, pitch: 0 } }, { id: 'bh', label: T('Près du trou noir'), cam: { mode: 'orbit', dist: 14, min: 2.2, max: 300, pitch: 0.2, yaw: 0, fov: 60 } }],
    options: [{ id: 'sc', type: 'select', label: T('Scénario'), value: 'gone', choices: [['gone', T('La Terre est éjectée, avec la Lune')], ['stay', T('La Terre reste, sur une année de 433 jours')], ['burn', T('La Terre reste, mais plonge vers le Soleil')]] }],
    onOpt: (id, v, k) => { if (id === 'sc') { build(v); setMoments(); k.setJournal(J()); } },
    t0: -2 * YEAR, t1: 30 * YEAR, tStart: -2 * YEAR, speed0: 20 * DAY, speedRange: [3600, 2 * YEAR], speeds: [3600 * 6, DAY, 5 * DAY, 20 * DAY, 60 * DAY, 0.25 * YEAR, 0.5 * YEAR, YEAR, 2 * YEAR],
    autoRate: (t) => Math.min(0.5 * YEAR, Math.max(4 * DAY, Math.abs(t - tPass * YEAR) * 0.35)),
    moments: MOM, journal: J(), pois,
    panelNote: T('Fiction. Tailles et distances réelles : les planètes sont des points tant qu’on ne s’en approche pas. « Depuis la Terre » : vue du centre de la Terre, sans atmosphère.'),
    distLabel: (d, k) => k.view === 'bh' ? fmtDist(d * RSKM) : fmtDist(d * AU),
    clock: (t) => { const d = t - tPass * YEAR; return [d < 0 ? TF('T − {0}', [fmtDur(-d)]) : TF('T + {0}', [fmtDur(d)]), d < 0 ? T('avant le passage du trou noir près du Soleil') : T('après le passage du trou noir · fiction')]; },
    data: (t, k) => {
      const ty = t / YEAR, su = st(S, ty, [0, 0, 0], [0, 0, 0]), bh = st(B, ty, [0, 0, 0], [0, 0, 0]), vb = [0, 0, 0], vs = [0, 0, 0]; st(B, ty, _a, vb); st(S, ty, _a, vs);
      if (k.view === 'bh') return T('Trou noir : <b>4,1 masses solaires</b> · horizon de <b>24 km</b> de diamètre') + '<br>' + TF('Vitesse : {0} km/s · à {1} du Soleil', [fr(len(vb) * KMS, 1), fmtDist(len(sub(bh, su, _c)) * AU)]) + '<br>' + T('Il n’émet rien. Seule la déformation des étoiles derrière lui le trahit.');
      const ea = st(E, ty, [0, 0, 0]), r = len(sub(ea, su, _c)), eE = relSun(E, ty), bound = eE.a > 0 && eE.Q < 300, mo = st(M, ty, _d), dm = len(sub(mo, ea, _c));
      let n = 0; for (const i of PLANETS) { const e = relSun(i, ty); if (e.a > 0 && e.Q < 300) n++; }
      const light = 100 / (r * r), teq = 255 / Math.sqrt(r) - 273.15, ang = 2 * Math.atan(695700 / AU / r) / DEG;
      return (ty < tPass + 0.5 ? TF('Trou noir : à <b>{0}</b> du Soleil · {1} km/s', [fmtDist(len(sub(bh, su, _c)) * AU), fr(len(vb) * KMS, 0)]) : TF('Soleil : emporté à <b>{0} km/s</b>, à {1} de son point de départ', [fr(len(vs) * KMS, 0), fmtDist(len(su) * AU)]))
        + '<br>' + TF('Terre : à <b>{0} UA</b> du Soleil · lumière reçue : <b>{1} %</b> de celle d’aujourd’hui', [fr(r, r < 10 ? 2 : 0), fr(light, light < 10 ? 1 : 0)])
        + '<br>' + TF('Soleil dans notre ciel : <b>{0}°</b> (aujourd’hui 0,53°) · température d’équilibre : <b>{1} °C</b> (aujourd’hui −18 °C, sans effet de serre)', [fr(ang, ang < 0.1 ? 3 : 2), fr(teq, 0)])
        + '<br>' + (bound ? TF('Orbite de la Terre : <b>{0} à {1} UA</b> · année de <b>{2} jours</b>', [fr(eE.q, 2), fr(eE.Q, 2), fr(eE.P * 365.25, 0)]) : T('La Terre n’est plus liée au Soleil'))
        + ' · ' + (dm < 0.012 ? TF('Lune : à <b>{0}</b> de la Terre', [fmtDist(dm * AU)]) : TF('Lune : à <b>{0}</b> de la Terre, arrachée', [fmtDist(dm * AU)]))
        + (ty > tPass + 0.3 ? '<br>' + TF('Planètes encore liées au Soleil : <b>{0}</b> sur 8', [n]) : '');
    },
    bloom: [0.4, 0.5, 0.95], exposure: 1.0,
    onView: (id, k) => { k.cam.target.set(0, 0, 0); if (id === 'earth') k.setFocus(POI.sun); },
    update(t, dt, k) {
      const ty = t / YEAR, v = k.view, sys = v === 'system', sunv = v === 'sun', bhv = v === 'bh';
      for (let i = 0; i < NB; i++) st(i, ty, P[i]);
      const o = sys ? ZERO : v === 'earth' ? P[E] : P[S];
      root.visible = !bhv; stars.visible = !bhv; bh.mesh.visible = bhv; trails.visible = sys || sunv; ghosts.visible = sys;
      if (bhv) { bh.u.uTime.value += dt; if (!k.focusId) k.cam.target.set(0, 0, 0); return; }
      for (let i = 0; i < NB; i++) {
        const w = W[i]; w.set(P[i][0] - o[0], P[i][1] - o[1], P[i][2] - o[2]); let s = 1;
        if (v === 'earth') { const d = w.length(); if (d > 0) { const D = 1 + 0.15 * Math.log10(d); s = D / d; w.multiplyScalar(s); } }
        if (ball[i]) { ball[i].position.copy(w); ball[i].scale.setScalar(s); ball[i].userData.sc = s; if (i !== S && i !== SA) ball[i].material.uniforms.uSun.value.set(P[S][0] - P[i][0], P[S][1] - P[i][1], P[S][2] - P[i][2]).normalize(); }
        if (glow[i]) glow[i].position.copy(w);
      }
      ball[E].visible = v !== 'earth';
      satU.uSunO.value.set(P[S][0] - P[SA][0], P[S][1] - P[SA][1], P[S][2] - P[SA][2]).normalize().applyQuaternion(QSi);
      if (!k.focusId && k.cam.mode === 'orbit') k.cam.target.set(0, 0, 0);
      if (v === 'earth') { k.cam.pos.set(0, 0, 0); k.cam.near = 0.05; k.cam.far = 20; }
      else if (sunv) { k.cam.near = k.cam.dist * 0.02; k.cam.far = 5000; }
      if (sys || sunv) for (const tr of TR) {
        const span = (sunv ? SPAN_S : SPAN_I)[tr.i]; tr.line.visible = span > 0; if (!span) continue;
        const a = tr.geo.attributes.position, t0 = Math.max(R.t0, ty - span);
        for (let j = 0; j < NT; j++) { const tt = t0 + (ty - t0) * j / (NT - 1); st(tr.i, tt, _a); if (sunv) { st(S, tt, _b); a.setXYZ(j, _a[0] - _b[0], _a[1] - _b[1], _a[2] - _b[2]); } else a.setXYZ(j, _a[0], _a[1], _a[2]); } a.needsUpdate = true;
      }
    },
    post(t, k) {
      if (k.view === 'bh') { bh.sync(); return; }
      const cp = k.camera.position, th = Math.tan(k.camera.fov * DEG / 2);
      for (let i = 0; i < NB; i++) { const g = glow[i]; if (!g) continue; const d = cp.distanceTo(W[i]), gs = i === B ? 0.016 : INFO[i].g, ang = i === B ? 0 : INFO[i].km / AU * (ball[i] ? ball[i].userData.sc || 1 : 1) / d;
        g.scale.setScalar(d * gs * th * 2.2); g.material.opacity = i === S ? 1 : clamp(1.6 - ang / (gs * th * 0.25), 0, 1); g.visible = g.material.opacity > 0.01; }
      ringU.uCamY.value = tv.copy(cp).sub(W[SA]).applyQuaternion(QSi).y;
    },
  });
  if (kit.opt.sc !== 'gone') { build(kit.opt.sc); setMoments(); kit.setJournal(J()); }
  const Sc = kit.scene, root = new THREE.Group(); Sc.add(root);
  const stars = kit.addSky(makeStars({ n: 7000, seed: 51, band: 0.45, bright: 1 }));
  const ball = [], glow = [];
  ball[S] = new THREE.Mesh(new THREE.SphereGeometry(695700 / AU, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 5.6, 3.6) })); root.add(ball[S]);
  for (let i = 1; i < NB; i++) {
    const b = INFO[i]; if (i === B || i === SA) continue;
    ball[i] = new THREE.Mesh(new THREE.SphereGeometry(b.km / AU, 48, 32), new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uCol: { value: new THREE.Color(b.col) }, uKind: { value: b.kind || 0 } }, vertexShader: BALL_V, fragmentShader: BALL_F })); root.add(ball[i]);
  }
  const satU = { uSunO: { value: new THREE.Vector3(1, 0, 0) } }, ringU = { uSunO: satU.uSunO, uCamY: { value: 1 } };
  const sat = new THREE.Group(); sat.quaternion.copy(QS);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms: satU, vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: SAT_F })); globe.scale.set(RS, RS * FLAT, RS); sat.add(globe);
  const rings = new THREE.Mesh(new THREE.RingGeometry(1.1, 2.36, 256, 1), new THREE.ShaderMaterial({ uniforms: ringU, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: 'varying vec2 vXY;void main(){vXY=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: RING_F }));
  rings.rotation.x = -Math.PI / 2; rings.scale.setScalar(RS); sat.add(rings);
  const satHolder = new THREE.Group(); satHolder.add(sat); root.add(satHolder); ball[SA] = satHolder;
  for (let i = 0; i < NB; i++) { if (i === B) continue; const g = makeGlow(INFO[i].col, 1, i === S ? 1 : 0.9); root.add(g); glow[i] = g; }
  { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = 'rgba(190,130,255,1)'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 22, 0, 7); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(32, 32, 9, 0, 7); x.fill();
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false })); root.add(g); glow[B] = g; }
  // orbites de départ (fantômes, là où étaient les planètes) et traînées
  const trails = new THREE.Group(), ghosts = new THREE.Group(); root.add(trails, ghosts); const NT = 600, TR = [];
  for (const a of [0.3871, 0.7233, 1, 1.5237, 5.2028, 9.5388, 19.191, 30.069]) { const pts = []; for (let j = 0; j <= 180; j++) pts.push(new THREE.Vector3(Math.cos(j / 90 * Math.PI) * a, 0, Math.sin(j / 90 * Math.PI) * a));
    ghosts.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6a7aa0, transparent: true, opacity: 0.2, depthWrite: false }))); }
  for (let i = 0; i <= B; i++) { if (i === M) continue; const geo = new THREE.BufferGeometry(), col = new Float32Array(NT * 3), c = new THREE.Color(i === S ? 0xffd890 : INFO[i].col);
    for (let j = 0; j < NT; j++) { const k = (0.12 + 0.88 * Math.pow(j / (NT - 1), 1.3)) * (i === S || i === B || i === E ? 1.2 : 0.75); col.set([c.r * k, c.g * k, c.b * k], j * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NT * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); line.frustumCulled = false; trails.add(line); TR.push({ i, geo, line }); }
  const bh = makeBH(kit, { uDiskB: 0, uStarsB: 1.3, uMW: 1 }); bh.mesh.visible = false; Sc.add(bh.mesh);
  kit.run();
}
