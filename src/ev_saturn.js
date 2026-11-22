// FICTION : un trou noir de passage freine Saturne, qui tombe vers le Soleil et vient frôler la Terre.
// Tout ce qui suit le choix de départ est calculé (nbody.js) : onze corps, gravité newtonienne.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, NOISE, YEAR, DAY, makeStars, makeGlow } from './kit.js';
import { simulate, elements, IDX, G, KMS } from './nbody.js';
import { makeBH } from './bh.js';
export const AU = 149597870.7, RS = 60268 / AU, FLAT = 0.902, DEG = Math.PI / 180;
const MBH = 0.05, RSKM = 2.953 * MBH;
// trajectoire du trou noir : réglée pour que le coup de frein laisse Saturne dans le plan des planètes, avec un périhélie à 0,94 UA
const BHP = { mbh: MBH, vbh: 40 / KMS, back: 0.6066, side: 0.248, yoff: -0.3205, tiltX: -1.715, tiltZ: 0.3755, T0: 3, T1: 40, sample: 1, eta: 0.02 };
// position de la Terre sur son orbite au moment du passage du trou noir : c'est elle qui décide de la distance de la rencontre, huit ans plus tard
const SC = { far: 245, near: 246.4 };
const S = IDX.sun, E = IDX.earth, M = IDX.moon, SA = IDX.saturn, B = IDX.bh, TI = 11, NB = 12, N3 = 33;
export const INFO = [
  { id: 'sun', label: T('Soleil'), km: 695700, col: 0xfff0d0, g: 0.05 }, { id: 'mercury', label: T('Mercure'), km: 2440, col: 0xb0a8a0, g: 0.009, span: 0.22 }, { id: 'venus', label: T('Vénus'), km: 6052, col: 0xf4e2b4, g: 0.013, span: 0.56 },
  { id: 'earth', label: T('Terre'), km: 6371, col: 0x78b0ff, g: 0.014, span: 0.9, kind: 1 }, { id: 'moon', label: T('Lune'), km: 1737, col: 0xc8c8c8, g: 0.006, kind: 2 }, { id: 'mars', label: T('Mars'), km: 3390, col: 0xe88050, g: 0.011, span: 1.7 },
  { id: 'jupiter', label: T('Jupiter'), km: 69911, col: 0xecc8a0, g: 0.017, span: 10, kind: 3 }, { id: 'saturn', label: T('Saturne'), km: 60268, col: 0xf2dca4, g: 0.018, span: 12 }, { id: 'uranus', label: T('Uranus'), km: 25362, col: 0xa8e4ec, g: 0.012, span: 43, kind: 3 },
  { id: 'neptune', label: T('Neptune'), km: 24622, col: 0x7090ff, g: 0.012, span: 43, kind: 3 }, { id: 'bh', label: T('Trou noir'), km: 0, col: 0xb070ff, g: 0, span: 3.2 }, { id: 'titan', label: T('Titan'), km: 2575, col: 0xe0b060, g: 0.005 },
];
const PRI = ['saturn', 'bh', 'earth', 'moon', 'sun', 'jupiter', 'mars', 'venus', 'mercury', 'uranus', 'neptune', 'titan'];
export const RING = /* glsl */`
float ringTau(float r,float k){
  float n=mix(1.,.75+.5*vnoise(vec3(r*160.,1.3,.7)),k),n2=mix(1.,.8+.4*vnoise(vec3(r*45.,4.,2.)),k);
  float c=smoothstep(1.235,1.30,r)*(1.-smoothstep(1.52,1.53,r))*(.10+.12*smoothstep(1.24,1.52,r))*n;
  float b=smoothstep(1.525,1.535,r)*(1.-smoothstep(1.945,1.952,r))*(.72+.28*smoothstep(1.53,1.75,r))*mix(1.,n2,.35);
  float cd=smoothstep(1.95,1.955,r)*(1.-smoothstep(2.02,2.027,r))*.07;
  float a=smoothstep(2.025,2.032,r)*(1.-smoothstep(2.262,2.27,r))*.52*mix(1.,n,.3)*(1.-.9*k*(smoothstep(2.209,2.212,r)-smoothstep(2.217,2.22,r)));
  float f=exp(-pow((r-2.326)/.004,2.))*.25*k;
  return clamp(c+b+cd+a+f,0.,1.);}`;
export const SAT_F = /* glsl */`precision highp float;varying vec3 vP;uniform vec3 uSunO;${NOISE}${RING}
void main(){vec3 p=normalize(vP);vec3 N=normalize(vec3(p.x,p.y/${FLAT},p.z));vec3 P=vec3(p.x,p.y*${FLAT},p.z);
  float lat=asin(clamp(p.y,-1.,1.));float w=fbm3(vec3(p.x*3.,p.y*14.,p.z*3.))-.5;
  float b=sin(lat*22.+w*2.2)*.5+.5,b2=sin(lat*7.+1.)*.5+.5;
  vec3 c=mix(vec3(.84,.71,.49),vec3(.97,.90,.72),b);c=mix(c,vec3(.78,.63,.42),.35*b2*smoothstep(.2,.9,abs(p.y)));
  c=mix(c,vec3(.60,.60,.52),smoothstep(.8,.98,abs(p.y))*.6);
  float mu=dot(N,uSunO);float lit=pow(max(mu,0.),.75)*smoothstep(-.02,.1,mu);
  float sh=0.;if(uSunO.y*P.y<0.){float t=-P.y/uSunO.y;sh=ringTau(length(P.xz+uSunO.xz*t),1.);}
  gl_FragColor=vec4(c*lit*(1.-.88*sh)*1.02,1.);}`;
export const RING_F = /* glsl */`precision highp float;varying vec2 vXY;uniform vec3 uSunO;uniform float uCamY;${NOISE}${RING}
void main(){float r=length(vXY);float k=clamp(1.-fwidth(r)*110.,0.,1.);float tau=ringTau(r,k);if(tau<.004)discard;
  vec3 alb=mix(vec3(.56,.49,.41),vec3(.99,.94,.83),smoothstep(.1,.8,tau));
  vec3 P=vec3(vXY.x,0.,-vXY.y);vec3 Sq=normalize(vec3(uSunO.x,uSunO.y/${FLAT},uSunO.z));float bq=dot(P,Sq),disc=bq*bq-(dot(P,P)-1.);
  float shadow=smoothstep(0.,.006,disc)*step(bq,0.);
  bool lit=uSunO.y*uCamY>0.;
  vec3 col=lit?alb*(.35+.65*tau)*.95:alb*(4.*tau*(1.-tau)*.32+.02);
  gl_FragColor=vec4(col*(1.-.97*shadow),tau);}`;
export const BALL_F = /* glsl */`precision highp float;varying vec3 vN,vP;uniform vec3 uSun,uCol;uniform float uKind;${NOISE}
void main(){vec3 N=normalize(vN);float mu=dot(N,uSun);vec3 p=normalize(vP);vec3 c=uCol;
  if(uKind>.5&&uKind<1.5){float land=smoothstep(.5,.56,fbm(p*2.2+4.));c=mix(vec3(.05,.16,.42),vec3(.25,.33,.16),land);c=mix(c,vec3(.9),smoothstep(.8,.95,abs(p.y)));c=mix(c,vec3(.95),smoothstep(.5,.75,fbm(p*4.+9.))*.8);}
  else if(uKind>1.5&&uKind<2.5){c*=.75+.5*fbm(p*5.);c*=1.-.35*smoothstep(.52,.6,fbm3(p*1.7+2.));}
  else if(uKind>2.5){c*=.82+.25*sin(p.y*18.+fbm3(p*4.)*2.);}
  gl_FragColor=vec4(c*pow(max(mu,0.),.8)*smoothstep(-.02,.08,mu)*1.2,1.);}`;
export const BALL_V = 'varying vec3 vN,vP;void main(){vP=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

export function start() {
  let R, tE, tPass, dE, moonLost;
  const len = (a) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]), sub = (a, b, o) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; };
  // position (et vitesse) d'un corps à l'instant ty (années), par rapport au Soleil : interpolation d'Hermite entre deux échantillons
  function st(i, ty, o, vel) {
    const s = clamp((ty - R.t0) / R.step, 0, R.ns - 1.000001), k = Math.floor(s), u = s - k, a = k * N3 + i * 3, b = a + N3, h = R.step, u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    for (let c = 0; c < 3; c++) { o[c] = h00 * R.X[a + c] + h10 * h * R.V[a + c] + h01 * R.X[b + c] + h11 * h * R.V[b + c]; if (vel) vel[c] = R.V[a + c] + (R.V[b + c] - R.V[a + c]) * u; }
    return o;
  }
  const _a = [0, 0, 0], _b = [0, 0, 0], _c = [0, 0, 0], _va = [0, 0, 0], _vb = [0, 0, 0];
  const dist = (i, j, ty) => len(sub(st(i, ty, _a), st(j, ty, _b), _c));
  const closest = (i, j, y0, y1) => { let bt = y0, bd = 1e9; for (let ty = y0; ty <= y1; ty += 1 / 365.25) { const d = dist(i, j, ty); if (d < bd) { bd = d; bt = ty; } } for (let ty = bt - 1 / 365.25; ty <= bt + 1 / 365.25; ty += 1 / 36525) { const d = dist(i, j, ty); if (d < bd) { bd = d; bt = ty; } } return [bt, bd]; };
  function build(sc) {
    R = simulate({ ...BHP, earthPh: SC[sc] * DEG });
    [tPass] = closest(B, SA, -1, 1); [tE, dE] = closest(E, SA, 2, 12); moonLost = dist(E, M, 12) > 0.02;
  }
  const Y = (y) => (tPass + y) * YEAR; // secondes de simulation pour « y années après le passage »
  const J = () => {
    const near = dE * AU < 3.5e6, j = [
      { t: -3 * YEAR, title: T('Un visiteur invisible'), text: T('Un trou noir ne brille pas. Celui-ci pèse cinquante fois Jupiter dans une sphère de 300 mètres : aucun télescope ne le verrait arriver. On ne le détecterait que par ses effets, des planètes lointaines qui dévient de leur route.') },
      { t: Y(-0.35), title: T('Le passage'), text: T('Il traverse le plan des planètes juste derrière Saturne, à 44 millions de km. Pendant quelques semaines, sa gravité tire la planète en arrière, contre le sens de sa course.') },
      { t: Y(0.2), title: T('Saturne freinée'), text: T('Saturne avançait à 9,6 km/s, la vitesse qui la maintenait à 9,5 UA du Soleil. Il lui en reste moins de la moitié. Trop lente pour tenir son orbite, elle commence à tomber vers le Soleil.') },
      { t: Y(1.1), title: T('Le trou noir repart'), text: T('Il passe à 4,9 UA du Soleil et ressort par le sud du système solaire, sans rien toucher. Il a aussi bousculé Uranus et Neptune ; Jupiter et les planètes intérieures n’ont presque rien senti.') },
      { t: Y(3.5), title: T('La chute'), text: T('La nouvelle orbite de Saturne est une ellipse très allongée : 10 UA au plus loin, 0,94 UA au plus près, un tour en 12,8 ans. Elle coupe désormais les orbites de Jupiter, de Mars et de la Terre.') },
      { t: (tE - 0.2) * YEAR, title: T('Une nouvelle lumière'), text: T('Saturne approche à 15 km/s. Elle dépasse Vénus en éclat, puis montre à l’œil nu un disque et des anneaux. Si près du Soleil, la glace de ses anneaux commence à se sublimer.') },
      near ? { t: (tE - 0.012) * YEAR, title: T('Au plus près'), text: T('Saturne passe à 2,2 millions de km, moins de six fois la distance de la Lune. Son disque couvre six fois la largeur de la pleine Lune, ses anneaux quatorze. Sa marée sur la Terre vaut plus de quarante fois celle de la Lune.') }
        : { t: (tE - 0.012) * YEAR, title: T('Au plus près'), text: T('Saturne passe à 5 millions de km, treize fois la distance de la Lune. Son disque est deux fois et demie plus large que la pleine Lune, ses anneaux six fois. Sa marée sur la Terre dépasse trois fois celle de la Lune.') },
      near ? { t: (tE + 0.02) * YEAR, title: T('La Lune arrachée'), text: T('Avec Saturne si proche, la zone où la Terre peut retenir un satellite se réduit à 330 000 km. La Lune, à 384 000 km, se retrouve dehors : elle quitte notre orbite et devient une petite planète qui tourne seule autour du Soleil.') }
        : { t: (tE + 0.02) * YEAR, title: T('La Lune reste'), text: T('À cette distance, la Terre peut encore retenir un satellite jusqu’à 770 000 km : la Lune, à 384 000 km, reste avec nous, sur une orbite plus allongée qu’avant.') },
      near ? { t: (tE + 0.12) * YEAR, title: T('La Terre déviée'), text: T('Saturne pèse 95 Terres : en quelques jours, elle a changé notre orbite. La Terre s’éloigne maintenant jusqu’à 1,34 UA du Soleil, où elle reçoit 45 % de lumière en moins, et l’année dure 464 jours.') }
        : { t: (tE + 0.12) * YEAR, title: T('La Terre déviée'), text: T('Saturne pèse 95 Terres : en quelques jours, elle a changé notre orbite. La Terre s’éloigne maintenant jusqu’à 1,14 UA du Soleil, où elle reçoit 24 % de lumière en moins, et l’année dure 407 jours.') },
      { t: (tE + 1.2) * YEAR, title: T('Ce que le calcul ne dit pas'), text: T('Marées géantes, séismes, climat : rien de cela n’est simulé. La scène ne calcule que la gravité entre onze points, et c’est déjà elle qui décide de la longueur de l’année et du sort de la Lune.') },
      { t: Y(19.5), title: T('Saturne revient'), text: T('Saturne repasse au plus près du Soleil à peu près tous les treize ans. La Terre n’est pas au rendez-vous à chaque fois, mais les deux orbites continuent de se croiser.') },
      { t: Y(31), title: T('Jupiter s’en mêle'), text: T('Saturne passe près de Jupiter, qui dévie sa route. Chaque rencontre modifie les orbites, et une différence infime au départ donne une suite tout autre : au-delà de quelques décennies, ce calcul n’est plus qu’une histoire possible parmi d’autres.') },
    ]; return j;
  };
  const MOM = [
    { label: T('Le trou noir arrive'), view: 'system', cam: { dist: 34, pitch: 0.75, yaw: 0.5 }, y: -2.9 }, { label: T('Le passage près de Saturne'), view: 'system', focus: 'saturn', cam: { dist: 3.2, pitch: 0.6, yaw: 0.4 }, y: -0.3 },
    { label: T('Saturne commence à tomber'), view: 'system', cam: { dist: 30, pitch: 1.0, yaw: 0.3 }, y: 0.6 }, { label: T('Saturne croise l’orbite de Jupiter'), view: 'system', cam: { dist: 18, pitch: 1.0, yaw: 0.3 }, y: 6.55 },
    { label: T('Saturne grandit dans notre ciel'), view: 'earth', cam: { fov: 9 }, e: -30 / 365.25 }, { label: T('Au plus près, vu de la Terre'), view: 'earth', cam: { fov: 16 }, e: -2.5 / 365.25 },
    { label: T('La Terre vue de Saturne'), view: 'saturn', cam: { dist: 0.0034, fov: 55 }, e: 2.5 / 365.25, face: true }, { label: T('La nouvelle orbite de la Terre'), view: 'system', cam: { dist: 5.5, pitch: 1.15, yaw: 0.3 }, e: 0.5 },
    { label: T('Saturne revient'), view: 'system', cam: { dist: 16, pitch: 1.0, yaw: 0.3 }, y: 19.6 }, { label: T('Quarante ans plus tard'), view: 'system', cam: { dist: 34, pitch: 0.9, yaw: 0.3 }, y: 39.5 }, { label: T('Le trou noir, de près'), view: 'bh', y: -0.02 },
  ];
  const setMoments = () => { for (const m of MOM) m.t = m.e !== undefined ? (tE + m.e) * YEAR : Y(m.y); };
  build('near'); setMoments();

  const P = Array.from({ length: NB }, () => [0, 0, 0]), W = Array.from({ length: NB }, () => new THREE.Vector3()), O = new THREE.Vector3();
  const tv = new THREE.Vector3(), tq = new THREE.Quaternion();
  const pole = new THREE.Vector3(Math.sin(26.73 * DEG) * Math.cos(152 * DEG), Math.cos(26.73 * DEG), Math.sin(26.73 * DEG) * Math.sin(152 * DEG));
  const QS = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pole), QSi = QS.clone().invert();
  const pois = INFO.map((b, i) => ({ id: b.id, label: b.label, r: Math.max(b.km / AU * 2.5, i === B ? 0.05 : 1e-5), pos: (t, k) => k.view === 'bh' ? (i === B ? O : null) : (k.view === 'earth' && i === E) || (i === TI && k.view === 'system' && k.cam.dist > 0.5) ? null : W[i] }));
  const POI = Object.fromEntries(pois.map(p => [p.id, p]));
  pois.sort((a, b) => PRI.indexOf(a.id) - PRI.indexOf(b.id));
  const elE = { q: 1, Q: 1, P: 1 }; let elT = -1e30;
  const kit = createKit({
    title: T('Fiction · Saturne délogée par un trou noir'), kicker: T('Fiction · un scénario calculé, pas une prévision'), h1: T('Et si un trou noir délogeait Saturne ?'),
    intro: T('Ceci est une fiction. Un trou noir de 0,05 masse solaire, moins de 300 mètres de diamètre, traverse le système solaire à 40 km/s et frôle Saturne. La planète perd plus de la moitié de sa vitesse, tombe vers le Soleil et vient croiser l’orbite de la Terre. À partir de ce point de départ, tout est calculé : la gravité de onze corps, pas à pas.'),
    warn: T('Aucun trou noir de cette masse n’a jamais été observé (il devrait être « primordial », né juste après le Big Bang : une hypothèse), et aucun objet de ce genre n’est connu près du Soleil. Sa trajectoire et la position de la Terre ont été choisies pour que Saturne passe près de nous. Orbites de départ simplifiées : circulaires, dans un même plan. Les anneaux et Titan sont supposés intacts ; marées, climat et collisions ne sont pas simulés.'),
    views: [{ id: 'system', label: T('Le système solaire'), cam: { mode: 'orbit', dist: 34, min: 0.0006, max: 140, pitch: 0.75, yaw: 0.5, fov: 45 } }, { id: 'earth', label: T('Depuis la Terre'), cam: { mode: 'look', fov: 32, yaw: 0, pitch: 0 } },
      { id: 'saturn', label: T('Près de Saturne'), cam: { mode: 'orbit', dist: 0.0034, min: 0.0007, max: 0.6, pitch: 0.2, yaw: 0.6, fov: 40 } }, { id: 'bh', label: T('Près du trou noir'), cam: { mode: 'orbit', dist: 14, min: 2.2, max: 300, pitch: 0.2, yaw: 0, fov: 60 } }],
    options: [{ id: 'sc', type: 'select', label: T('Scénario'), value: 'near', choices: [['near', T('Saturne passe à 2 millions de km : la Lune est arrachée')], ['far', T('Saturne passe à 5 millions de km : la Lune reste')]] }],
    onOpt: (id, v, k) => { if (id === 'sc') { build(v); setMoments(); k.setJournal(J()); elT = -1e30; } },
    t0: -3 * YEAR, t1: 40 * YEAR, tStart: -3 * YEAR, speed0: 30 * DAY, speedRange: [3600, 2 * YEAR], speeds: [3600 * 6, DAY, 5 * DAY, 20 * DAY, 60 * DAY, 0.25 * YEAR, 0.5 * YEAR, YEAR, 2 * YEAR],
    autoRate: (t) => Math.min(0.45 * YEAR, Math.max(10 * DAY, Math.abs(t - tPass * YEAR) * 0.3), Math.max(0.25 * DAY, Math.abs(t - tE * YEAR) * 0.3)),
    moments: MOM, journal: J(), pois,
    panelNote: T('Fiction. Tailles et distances réelles : les planètes sont des points tant qu’on ne s’en approche pas. « Depuis la Terre » : vue du centre de la Terre, sans atmosphère.'),
    distLabel: (d, k) => k.view === 'bh' ? fmtDist(d * RSKM) : fmtDist(d * AU),
    clock: (t) => { const d = t - tPass * YEAR; return [d < 0 ? TF('T − {0}', [fmtDur(-d)]) : TF('T + {0}', [fmtDur(d)]), d < 0 ? T('avant le passage du trou noir près de Saturne') : T('après le passage du trou noir · fiction')]; },
    data: (t, k) => {
      const ty = t / YEAR, sa = st(SA, ty, _a, _va), ea = st(E, ty, _b, _vb), rs = len(sa), vs = len(_va) * KMS, d = len(sub(sa, ea, _c)), re = len(ea);
      if (ty > elT + 0.02 || ty < elT) { elT = ty; const e = elements(ea[0], ea[1], ea[2], _vb[0], _vb[1], _vb[2], G * (1 + 3.003e-6)); elE.q = e.q; elE.Q = e.Q; elE.P = e.P; }
      const bh = st(B, ty, [0, 0, 0], [0, 0, 0]);
      if (k.view === 'bh') { const vb = [0, 0, 0]; st(B, ty, _c, vb); return T('Trou noir : <b>0,05 masse solaire</b>, 52 fois Jupiter · horizon de <b>295 m</b> de diamètre') + '<br>' + TF('Vitesse : {0} km/s · à {1} du Soleil', [fr(len(vb) * KMS, 1), fmtDist(len(bh) * AU)]) + '<br>' + T('Il n’émet rien. Seule la déformation des étoiles derrière lui le trahit.'); }
      const cosA = -(sa[0] * (ea[0] - sa[0]) + sa[1] * (ea[1] - sa[1]) + sa[2] * (ea[2] - sa[2])) / (rs * d), al = Math.acos(clamp(cosA, -1, 1)), phi = (Math.sin(al) + (Math.PI - al) * Math.cos(al)) / Math.PI;
      const mag = -8.88 + 5 * Math.log10(rs * d) - 2.5 * Math.log10(Math.max(phi, 1e-3)), ang = 2 * Math.atan(RS / d) / DEG, tide = 7741 * Math.pow(384400 / (d * AU), 3);
      const mo = st(M, ty, [0, 0, 0], [0, 0, 0]), dm = len(sub(mo, ea, _c));
      const l1 = ty < tPass + 1 ? TF('Trou noir : à <b>{0}</b> de Saturne', [fmtDist(len(sub(bh, sa, _c)) * AU)]) + ' · ' + TF('Saturne : {0} km/s', [fr(vs, 1)]) : TF('Saturne : à <b>{0} UA</b> du Soleil · {1} km/s', [fr(rs, 2), fr(vs, 1)]);
      return l1 + '<br>' + TF('Saturne vue de la Terre : à <b>{0}</b> · disque de <b>{1}°</b> (Lune : 0,52°)', [fmtDist(d * AU), fr(ang, ang < 0.1 ? 3 : 2)])
        + '<br>' + TF('Éclat : magnitude <b>{0}</b> (pleine Lune : −12,7 ; ordre de grandeur, sans les anneaux)', [fr(mag, 1)]) + (tide > 0.05 ? ' · ' + TF('marée : <b>{0} ×</b> celle de la Lune', [fr(tide, tide < 10 ? 1 : 0)]) : '')
        + '<br>' + TF('Orbite de la Terre : <b>{0} à {1} UA</b> · année de <b>{2} jours</b>', [fr(elE.q, 2), fr(elE.Q, 2), fr(elE.P * 365.25, 0)])
        + '<br>' + (dm < 0.012 ? TF('Lune : à <b>{0}</b> de la Terre', [fmtDist(dm * AU)]) : TF('Lune : à <b>{0}</b> de la Terre, arrachée', [fmtDist(dm * AU)]));
    },
    bloom: [0.4, 0.5, 0.95], exposure: 1.0,
    onView: (id, k) => { k.cam.target.set(0, 0, 0); if (id === 'earth') k.setFocus(POI.saturn); },
    onJump: (m, k) => { if (!m) return; if (m.focus) { k.setFocus(POI[m.focus]); Object.assign(k.cam, m.cam); } if (m.face) faceEarth = true; },
    update(t, dt, k) {
      const ty = t / YEAR, v = k.view, sys = v === 'system', bhv = v === 'bh';
      for (let i = 0; i <= B; i++) st(i, ty, P[i]);
      // Titan : orbite de 15,95 jours dans le plan des anneaux (mise en scène : il n'est pas dans le calcul)
      const ta = ty * 365.25 / 15.945 * 2 * Math.PI; tv.set(Math.cos(ta), 0, Math.sin(ta)).multiplyScalar(1221870 / AU).applyQuaternion(QS); P[TI][0] = P[SA][0] + tv.x; P[TI][1] = P[SA][1] + tv.y; P[TI][2] = P[SA][2] + tv.z;
      const o = P[sys ? S : v === 'earth' ? E : SA];
      root.visible = !bhv; stars.visible = !bhv; bh.mesh.visible = bhv; trails.visible = sys;
      if (bhv) { bh.u.uTime.value += dt; if (!k.focusId) k.cam.target.set(0, 0, 0); return; }
      for (let i = 0; i < NB; i++) {
        const w = W[i]; w.set(P[i][0] - o[0], P[i][1] - o[1], P[i][2] - o[2]); let sc = 1;
        if (v === 'earth') { const d = w.length(); if (d > 0) { const D = 1 + 0.15 * Math.log10(d); sc = D / d; w.multiplyScalar(sc); } }
        if (ball[i]) { ball[i].position.copy(w); ball[i].scale.setScalar(sc); ball[i].userData.sc = sc; if (i !== S && i !== SA) ball[i].material.uniforms.uSun.value.set(P[S][0] - P[i][0], P[S][1] - P[i][1], P[S][2] - P[i][2]).normalize(); }
        if (glow[i]) glow[i].position.copy(w);
      }
      ball[E].visible = v !== 'earth';
      satU.uSunO.value.set(-P[SA][0], -P[SA][1], -P[SA][2]).normalize().applyQuaternion(QSi);
      if (!k.focusId && k.cam.mode === 'orbit') k.cam.target.set(0, 0, 0);
      if (v === 'earth') { k.cam.pos.set(0, 0, 0); k.cam.near = 0.05; k.cam.far = 20; }
      else if (v === 'saturn' && faceEarth) { faceEarth = false; tv.copy(W[E]).normalize().multiplyScalar(-1).addScaledVector(W[S].clone().normalize(), 0.55).normalize(); k.cam.yaw = Math.atan2(tv.x, tv.z); k.cam.pitch = 0.16; }
      if (sys) {
        for (const tr of TR) { const a = tr.geo.attributes.position, t1 = ty, t0 = Math.max(R.t0, ty - tr.span); for (let j = 0; j < NT; j++) { st(tr.i, t0 + (t1 - t0) * j / (NT - 1), _a); a.setXYZ(j, _a[0], _a[1], _a[2]); } a.needsUpdate = true; }
      }
    },
    post(t, k) {
      if (k.view === 'bh') { bh.sync(); return; }
      const cp = k.camera.position, th = Math.tan(k.camera.fov * DEG / 2);
      for (let i = 0; i < NB; i++) { const g = glow[i]; if (!g) continue; const d = cp.distanceTo(W[i]), size = d * INFO[i].g * th * 2.2, ang = i === B ? 0 : INFO[i].km / AU * (ball[i] ? ball[i].userData.sc || 1 : 1) / d;
        g.scale.setScalar(size); g.material.opacity = i === S ? 1 : clamp(1.6 - ang / (INFO[i].g * th * 0.25), 0, 1); g.visible = g.material.opacity > 0.01; }
      ringU.uCamY.value = tv.copy(cp).sub(W[SA]).applyQuaternion(QSi).y;
    },
  });
  let faceEarth = false;
  if (kit.opt.sc !== 'near') { build(kit.opt.sc); setMoments(); kit.setJournal(J()); }
  const Sc = kit.scene, root = new THREE.Group(); Sc.add(root);
  const stars = kit.addSky(makeStars({ n: 7000, seed: 33, band: 0.45, bright: 1 }));
  const ball = [], glow = [];
  // Soleil
  ball[S] = new THREE.Mesh(new THREE.SphereGeometry(695700 / AU, 48, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 5.6, 3.6) })); root.add(ball[S]);
  for (let i = 1; i < NB; i++) {
    const b = INFO[i]; if (i === B || i === SA) continue;
    ball[i] = new THREE.Mesh(new THREE.SphereGeometry(b.km / AU, 48, 32), new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uCol: { value: new THREE.Color(b.col) }, uKind: { value: b.kind || 0 } }, vertexShader: BALL_V, fragmentShader: BALL_F })); root.add(ball[i]);
  }
  // Saturne : globe aplati et anneaux, axe incliné de 26,7°
  const satU = { uSunO: { value: new THREE.Vector3(1, 0, 0) } }, ringU = { uSunO: satU.uSunO, uCamY: { value: 1 } };
  const sat = new THREE.Group(); sat.quaternion.copy(QS);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 80), new THREE.ShaderMaterial({ uniforms: satU, vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: SAT_F })); globe.scale.set(RS, RS * FLAT, RS); sat.add(globe);
  const rings = new THREE.Mesh(new THREE.RingGeometry(1.1, 2.36, 256, 1), new THREE.ShaderMaterial({ uniforms: ringU, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: 'varying vec2 vXY;void main(){vXY=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: RING_F }));
  rings.rotation.x = -Math.PI / 2; rings.scale.setScalar(RS); sat.add(rings);
  const satHolder = new THREE.Group(); satHolder.add(sat); root.add(satHolder); ball[SA] = satHolder;
  for (let i = 0; i < NB; i++) { if (i === B) continue; const g = makeGlow(INFO[i].col, 1, i === S ? 1 : 0.9); root.add(g); glow[i] = g; }
  // repère du trou noir dans la vue d'ensemble : un anneau violet, pas l'objet (il est invisible)
  { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.strokeStyle = 'rgba(190,130,255,1)'; x.lineWidth = 5; x.beginPath(); x.arc(32, 32, 22, 0, 7); x.stroke(); x.fillStyle = '#000'; x.beginPath(); x.arc(32, 32, 9, 0, 7); x.fill();
    const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false })); root.add(g); glow[B] = g; INFO[B].g = 0.016; }
  // orbites de départ et traînées
  const trails = new THREE.Group(); root.add(trails); const NT = 420, TR = [];
  for (const i of [1, 2, 3, 5, 6, 7, 8, 9]) { const a = [0.3871, 0.7233, 1, 0, 1.5237, 5.2028, 9.5388, 19.191, 30.069][i - 1], pts = []; for (let j = 0; j <= 180; j++) pts.push(new THREE.Vector3(Math.cos(j / 90 * Math.PI) * a, 0, Math.sin(j / 90 * Math.PI) * a));
    trails.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x6a7aa0, transparent: true, opacity: 0.22, depthWrite: false }))); }
  for (let i = 1; i <= B; i++) { if (i === M) continue; const geo = new THREE.BufferGeometry(), col = new Float32Array(NT * 3), c = new THREE.Color(INFO[i].col);
    for (let j = 0; j < NT; j++) { const k = Math.pow(j / (NT - 1), 1.6) * (i === SA || i === B ? 1.3 : 0.75); col.set([c.r * k, c.g * k, c.b * k], j * 3); }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NT * 3), 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); l.frustumCulled = false; trails.add(l); TR.push({ i, geo, span: INFO[i].span }); }
  // le trou noir vu de près : lumière des étoiles déviée, calculée rayon par rayon
  const bh = makeBH(kit, { uDiskB: 0, uStarsB: 1.3, uMW: 1 }); bh.mesh.visible = false; Sc.add(bh.mesh);
  kit.run();
}
