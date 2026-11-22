// Une explosion nucléaire aérienne vue à la distance de votre choix, et l'essai Starfish Prime (1962) vu d'Honolulu.
// Tout vient de lois d'échelle publiées (Glasstone & Dolan, The Effects of Nuclear Weapons, 1977 ; résumées dans la Nuclear Weapons FAQ de C. Sublette, section 5).
import { createKit, T, TF, THREE, fmtDur, fr, clamp, sstep, lerp, NOISE, makeBackdrop, BACKDROP_VERT, makeGround, makeStars, makeGlow } from './kit.js';
const C0 = 340, P0 = 14.7, KPA = 6.895, RE = 7.4e6; // son (m/s), pression normale (psi), rayon terrestre « optique » (m)
// ---- lois d'échelle (W en kilotonnes)
const PSI = [[20, 0.28], [10, 0.45], [5, 0.71], [3, 1.0], [1, 2.2]]; // surpression (psi) → distance (km) pour 1 kt, ×W^0.33
function psiAt(km, W) {
  const s = km / Math.pow(W, 0.33); if (s <= PSI[0][1]) return 20 * Math.pow(PSI[0][1] / s, 2.2); if (s >= PSI[4][1]) return Math.pow(PSI[4][1] / s, 1.2);
  for (let i = 0; i < 4; i++) if (s <= PSI[i + 1][1]) { const f = Math.log(s / PSI[i][1]) / Math.log(PSI[i + 1][1] / PSI[i][1]); return Math.exp(lerp(Math.log(PSI[i][0]), Math.log(PSI[i + 1][0]), f)); }
  return 0;
}
const rPsi = (p, W) => PSI.find(q => q[0] === p)[1] * Math.pow(W, 0.33); // km
const burnR = (W) => [0.67 * Math.pow(W, 0.41), 0.87 * Math.pow(W, 0.40), 1.20 * Math.pow(W, 0.38)]; // 3e, 2e, 1er degré (km)
const burnQ = (W) => [8 * Math.pow(W / 20, 0.0585), 5 * Math.pow(W / 20, 0.077), 2.5 * Math.pow(W / 20, 0.1)]; // cal/cm² correspondants
function fluence(km, W) { // chaleur reçue (cal/cm²) à la distance km
  const r = burnR(W), q = burnQ(W); if (km <= r[0]) return q[0] * Math.pow(r[0] / km, 2);
  const seg = (a, b) => Math.exp(lerp(Math.log(q[a]), Math.log(q[b]), Math.log(km / r[a]) / Math.log(r[b] / r[a])));
  if (km <= r[1]) return seg(0, 1); if (km <= r[2]) return seg(1, 2);
  return q[2] * Math.pow(r[2] / km, clamp(Math.log(q[1] / q[2]) / Math.log(r[2] / r[1]), 2, 3));
}
const tMax = (W) => 0.0417 * Math.pow(W, 0.44), tMin = (W) => 0.0025 * Math.sqrt(W);            // second maximum et minimum de l'éclat (s)
const fbR = (W) => 55 * Math.pow(W, 0.4), hob = (W) => 220 * Math.pow(W, 1 / 3);                   // rayon max de la boule de feu, altitude d'explosion (m)
const cloudTop = (W) => 13700 * Math.pow(W / 21, 0.204);                                            // sommet du nuage (m), calé sur Nagasaki et la Tsar Bomba
const radR = (W) => 700 * Math.pow(W, 0.19);                                                        // 1 000 rads (m)
const shockU = (p) => C0 * Math.sqrt(1 + 6 * p / (7 * P0)), windU = (p) => 5 * p / (7 * P0) * C0 / Math.sqrt(1 + 6 * p / (7 * P0));
const lum = (t, W) => { if (t <= 0) return 0; const x = t / tMax(W), m = 2 * x * x / (1 + x * x * x * x); return Math.max(Math.exp(-5 * t / tMin(W)), m); };
const PRESETS = { hiro: [15, 3], naga: [21, 3], bravo: [15000, 60], tsar: [50000, 150] };

const SHAPE = /* glsl */`uniform float uT,uL,uHot,uCloud,uCapR,uCapH,uStemR,uStemH;uniform vec3 uCam,uSun,uC;
${NOISE}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float sdBase(vec3 p){float d=(length(p/vec3(uCapR,uCapH,uCapR))-1.)*min(uCapR,uCapH);
  if(uStemR>0.){float y=p.y;float r=uStemR*(1.+1.4*smoothstep(-uStemH*.7,-uStemH,y)+.7*smoothstep(-uCapH*1.6,0.,y));float cyl=max(length(p.xz)-r,max(y,-uStemH-y));d=smin(d,cyl,uCapR*.3);}
  return d;}
float sdCloud(vec3 p){float d=sdBase(p);if(uCloud>0.&&d<uCapR*.5){float f=3./uCapR;d-=uCloud*uCapR*.2*(fbm3(p*f+vec3(0.,-uT*.02,0.))-.35);}return d;}`;
// boule de feu puis nuage : marche de rayon sur une forme analytique, dans une sphère englobante
const CLOUD = /* glsl */`precision highp float;varying vec3 vW;${SHAPE}
void main(){vec3 d=normalize(vW-uCam);vec3 col=vec3(0.);float al=0.;
  vec3 cb=uC-vec3(0.,uStemH*.5,0.);float rb=max(uCapR*1.5,uStemH*.5+uCapH*1.5)*1.25;vec3 oc=uCam-cb;float b=dot(oc,d),c=dot(oc,oc)-rb*rb,h=b*b-c;
  float tg=d.y<0.?-uCam.y/d.y:1e12;
  if(h>0.){float t=max(-b-sqrt(h),0.),te=min(-b+sqrt(h),tg);bool hit=false;float dd=0.;
    for(int i=0;i<56;i++){if(t>te)break;vec3 p=uCam+d*t-uC;dd=sdCloud(p);if(dd<uCapR*.004+t*.0006){hit=true;break;}t+=max(dd*.75,uCapR*.01);}
    if(hit){vec3 p=uCam+d*t-uC;float e=uCapR*.03;vec3 n=normalize(vec3(sdBase(p+vec3(e,0.,0.))-sdBase(p-vec3(e,0.,0.)),sdBase(p+vec3(0.,e,0.))-sdBase(p-vec3(0.,e,0.)),sdBase(p+vec3(0.,0.,e))-sdBase(p-vec3(0.,0.,e))));
      float nz=fbm3(p*(5./uCapR)+3.);n=normalize(n+(nz-.5)*.9*uCloud);
      float dif=max(dot(n,uSun),0.);vec3 smoke=mix(vec3(.42,.36,.31),vec3(.93,.91,.88),smoothstep(-uStemH*.3,uCapH*.3,p.y))*(.35+.75*dif)*(.75+.5*nz);
      smoke=mix(smoke,vec3(.36,.28,.22)*(.4+.6*dif),smoothstep(-uStemH*.75,-uStemH,p.y)*.8);
      vec3 hot=mix(vec3(1.,.97,.9)*9.,mix(vec3(1.,.5,.12)*3.,vec3(.45,.07,.02),smoothstep(.55,1.,uHot)),smoothstep(0.,.55,uHot))*(.55+.9*nz*uHot);
      float inner=smoothstep(uCapH*1.1,-uCapH*.3,abs(p.y))*step(-uCapH*1.3,p.y);
      col=mix(hot,smoke+hot*.25*(1.-uHot)*inner,uCloud*smoothstep(.15,.85,uHot+.25*(1.-inner)));al=1.;}
  }
  if(al<.5){vec3 cd=uC-uCam;float cl=length(cd);float ang=acos(clamp(dot(d,cd/cl),-1.,1.));float ar=atan(uCapR,cl);col=vec3(1.,.9,.72)*uL*.5*exp(-pow(ang/(ar*2.+.004),2.));}
  gl_FragColor=vec4(col,al);}`;
const SKY = /* glsl */`precision highp float;varying vec2 vUv;uniform mat3 uBasis;uniform float uTan,uAspect,uT,uL,uCapR,uFlash,uDust,uMode,uSfT;uniform vec3 uCam,uSun,uC,uSf;
${NOISE}
void main(){vec3 d=normalize(uBasis*vec3(vUv.x*uTan*uAspect,vUv.y*uTan,-1.));vec3 col;
  if(uMode<.5){
    vec3 sunH=normalize(vec3(uSun.x,0.,uSun.z));float sa=max(dot(normalize(vec3(d.x,0.,d.z)+1e-5),sunH),0.);float y=d.y;
    vec3 hor=mix(vec3(.66,.74,.88),vec3(1.0,.86,.7),pow(sa,3.));vec3 zen=vec3(.13,.30,.66);
    col=mix(hor,zen,pow(clamp(y,0.,1.),.45));if(y<0.)col=mix(hor*.9,vec3(.5,.52,.5),smoothstep(0.,-.2,y));
    float sd=dot(d,uSun);col+=vec3(1.,.85,.6)*(pow(max(sd,0.),700.)*6.+pow(max(sd,0.),40.)*.3);
    col+=vec3(1.,.96,.88)*uFlash*1.6;
    vec3 cd=uC-uCam;float cl=length(cd);float ang=acos(clamp(dot(d,cd/cl),-1.,1.));float ar=atan(uCapR,cl);
    col+=vec3(1.,.9,.72)*uL*(.6*exp(-pow(ang/(ar*2.2+.01),2.))+.25*exp(-ang/(ar*5.+.05)));
    col=mix(col,vec3(.62,.56,.47),uDust*.75);
  }else{
    // Starfish Prime vu d'Honolulu : mise en scène d'après les récits
    float y=d.y;col=vec3(.004,.006,.014)+vec3(.03,.035,.06)*exp(-max(y,0.)*7.);if(y<0.)col=vec3(.004,.005,.008);
    float ang=acos(clamp(dot(d,uSf),-1.,1.));float t=uSfT;
    if(t>0.){float fade=exp(-t/160.);float rho=.03+.22*(1.-exp(-t/40.));float disc=exp(-pow(ang/rho,2.));
      vec3 north=vec3(0.,0.,-1.);vec3 pn=normalize(cross(uSf,north));float band=exp(-pow(dot(d,pn)/(.03+.07*(1.-exp(-t/60.))),2.))*exp(-ang/.7)*smoothstep(-.02,.05,y);
      float mot=.6+.8*fbm3(d*9.+vec3(0.,t*.01,0.));vec3 c1=mix(vec3(.5,1.,.6),vec3(1.,.13,.08),smoothstep(3.,45.,t));
      col+=c1*disc*mot*1.3*fade+mix(vec3(1.,1.,.8),vec3(1.,.2,.12),smoothstep(4.,50.,t))*band*(.5+.5*mot)*.45*fade;
      col+=vec3(.5,.06,.04)*exp(-max(y,0.)*2.5)*.35*(1.-exp(-t/20.))*exp(-t/260.);
      col+=vec3(1.,1.,.95)*exp(-t/.35)*(4.*exp(-pow(ang/.05,2.))+1.2);}
  }
  gl_FragColor=vec4(col,1.);}`;

export function start() {
  let POIS, W = 15, D = 3000, star = false, H, TM, RFB, tArr, pObs, Q, HT, tab = [], shake = 0, prevT = -1e9, time = 0;
  const yStr = (w) => w < 1000 ? TF('{0} kt', [fr(w, w < 10 ? 1 : 0)]) : TF('{0} Mt', [fr(w / 1000, w < 10000 ? 1 : 0)]);
  const dStr = (m) => m < 10000 ? TF('{0} km', [fr(m / 1000, 1)]) : TF('{0} km', [fr(m / 1000, 0)]);
  const tArrAt = (g) => { if (g <= tab[0][0]) return tab[0][1] * g / tab[0][0]; for (let i = 1; i < tab.length; i++) if (g <= tab[i][0]) return lerp(tab[i - 1][1], tab[i][1], (g - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0])); return tab[tab.length - 1][1]; };
  const shockR = (t) => { if (t <= 0) return 0; if (t >= tab[tab.length - 1][1]) return tab[tab.length - 1][0]; for (let i = 1; i < tab.length; i++) if (t <= tab[i][1]) return lerp(tab[i - 1][0], tab[i][0], (t - tab[i - 1][1]) / (tab[i][1] - tab[i - 1][1])); return 0; };
  function recompute() {
    H = hob(W); TM = tMax(W); RFB = fbR(W); HT = cloudTop(W);
    // temps d'arrivée du choc en fonction de la distance au sol : on intègre dr / vitesse du choc le long du trajet
    tab = []; const gmax = Math.max(D * 1.5, rPsi(1, W) * 4000, 20000); let t = 0, r = RFB * 0.5, g = 0; const steps = 700, R1 = Math.hypot(gmax, H);
    for (let i = 1; i <= steps; i++) { const r2 = RFB * 0.5 * Math.pow(R1 / (RFB * 0.5), i / steps), rm = (r + r2) / 2; t += (r2 - r) / shockU(psiAt(rm / 1000, W)); r = r2; if (r > H) { g = Math.sqrt(r * r - H * H); tab.push([g, t]); } }
    const slant = Math.hypot(D, H); tArr = tArrAt(D); pObs = psiAt(slant / 1000, W); Q = fluence(slant / 1000, W);
  }
  const burnLabel = () => { const r = burnR(W), s = Math.hypot(D, H) / 1000; return s <= r[0] ? T('brûlures au troisième degré sur la peau exposée') : s <= r[1] ? T('brûlures au deuxième degré') : s <= r[2] ? T('brûlures au premier degré, comme un fort coup de soleil') : Q > 0.3 ? T('une chaleur nette sur la peau, sans brûlure') : T('une chaleur à peine perceptible'); };
  const blastLabel = () => pObs >= 20 ? T('même le béton armé est détruit') : pObs >= 10 ? T('la plupart des bâtiments sont détruits') : pObs >= 5 ? T('les maisons s’effondrent') : pObs >= 3 ? T('murs soufflés, maisons gravement endommagées') : pObs >= 1 ? T('vitres brisées, blessures par éclats de verre') : pObs >= 0.15 ? T('des vitres peuvent casser') : T('un grondement lointain, sans dégâts');
  const J = () => star ? [
    { t: -30, title: T('Une nuit d’été à Honolulu'), text: T('Des hôtels ont organisé des soirées sur les toits pour regarder l’essai. La fusée est partie de l’atoll Johnston, à 1 450 km. La bombe de 1,4 mégatonne doit exploser à 400 km d’altitude, là où vole aujourd’hui la Station spatiale.') },
    { t: 0, title: T('Le ciel s’allume'), text: T('Un éclair blanc, puis une aurore artificielle : les électrons de l’explosion suivent les lignes du champ magnétique terrestre. L’allure et les couleurs sont reconstituées d’après les récits ; à l’atoll Johnston, le spectacle a duré près de sept minutes.') },
    { t: 2, title: T('L’impulsion'), text: T('Au même instant, une impulsion électromagnétique traverse Hawaï : environ 300 lampadaires s’éteignent, des alarmes se déclenchent, une liaison téléphonique entre les îles tombe en panne.') },
    { t: 30, title: T('Pas de souffle'), text: T('Aucune onde de choc n’arrivera : à 400 km d’altitude, il n’y a presque pas d’air pour la porter. L’énergie part en rayonnement et en particules chargées.') },
    { t: 90, title: T('Jusqu’en Nouvelle-Zélande'), text: T('L’aurore est vue jusqu’en Nouvelle-Zélande, à l’autre bout du Pacifique. Aux îles Kwajalein, une lueur rouge persiste au moins 90 minutes.') },
    { t: 300, title: T('Une ceinture de radiations en plus'), text: T('Les électrons piégés forment une ceinture de radiations artificielle. Trois satellites tombent en panne presque aussitôt, au moins six autres dans les mois suivants, dont Telstar 1.') },
  ] : [
    { t: -6, title: T('Avant'), text: TF('Une bombe de {0} va exploser à {1} de vous, à {2} d’altitude. Tout ce qui suit découle de lois d’échelle publiées après les essais atmosphériques.', [yStr(W), dStr(D), dStr(H)]) },
    { t: 0, title: T('L’éclair'), text: T('La lumière arrive en même temps que l’explosion. Un premier éclair, très bref, puis une seconde impulsion bien plus longue qui porte presque toute la chaleur. Regarder dans cette direction suffit à éblouir, parfois à brûler la rétine.') },
    { t: TM, title: T('La chaleur'), text: TF('À cette distance, vous recevez {0} cal/cm² en quelques secondes : {1}.', [fr(Q, Q < 10 ? 1 : 0), burnLabel()]) },
    { t: Math.max(5 * TM, 2.5), title: T('Le silence'), text: TF('Le souffle voyage à peine plus vite que le son. Il lui faut {0} pour vous atteindre. La boule de feu monte, sans un bruit.', [fmtDur(tArr)]) },
    { t: tArr, title: T('Le souffle'), text: TF('Surpression de {0} kPa, vent à {1} km/h : {2}.', [fr(pObs * KPA, pObs * KPA < 10 ? 1 : 0), fr(windU(pObs) * 3.6, 0), blastLabel()]) + ' ' + T('Puis l’air revient en sens inverse, vers le pied du nuage.') },
    { t: Math.max(tArr + 25, 100), title: T('Le champignon'), text: TF('Le nuage monte vers {0} km d’altitude en une dizaine de minutes. L’explosion a eu lieu en l’air : la boule de feu n’a pas touché le sol, les retombées locales sont faibles et les débris radioactifs partent en haute atmosphère.', [fr(HT / 1000, 0)]) },
    { t: Math.max(tArr + 70, 240), title: T('La racine cubique'), text: T('Mille fois plus puissant ne porte que dix fois plus loin : les distances de souffle croissent comme la racine cubique de la puissance. Déplacez les deux curseurs pour le vérifier.') },
  ];
  const MOM = [{ label: T('Avant l’explosion'), t: -5, view: 'ground' }, { label: T('L’éclair'), t: -0.05, view: 'ground' }, { label: T('La boule de feu'), t: 1, view: 'ground' }, { label: T('L’onde de choc arrive'), t: 10, view: 'ground' }, { label: T('Le champignon, vu de loin'), t: 60, view: 'over' }, { label: T('Dix minutes après'), t: 600, view: 'over' }];
  const setMoments = () => { MOM[2].t = star ? 5 : 2.5 * TM; MOM[3].t = star ? 30 : Math.max(tArr - 5, 2.6 * TM); MOM[4].t = star ? 60 : Math.max(tArr + 20, 60); };
  recompute(); setMoments();
  const GZ = new THREE.Vector3(), CL = new THREE.Vector3(), YOU = new THREE.Vector3(0, 2, 0), SF = new THREE.Vector3(-0.92, 0, 0.39).normalize().multiplyScalar(Math.cos(10 * Math.PI / 180)).setY(Math.sin(10 * Math.PI / 180)), SFP = SF.clone().multiplyScalar(1e6), tmp = new THREE.Vector3();
  const ringP = [0, 1, 2, 3].map(() => new THREE.Vector3());
  const apply = (k) => { recompute(); setMoments(); k.setJournal(J()); layout(); };
  const kit = createKit({
    title: T('Explosion nucléaire · à la distance de votre choix'), kicker: T('Essais atmosphériques, 1945-1962 · lois d’échelle publiées'), h1: T('Une explosion nucléaire, à votre distance'),
    intro: T('Choisissez la puissance, de 1 kilotonne à 100 mégatonnes, et la distance à laquelle vous vous trouvez. La scène calcule ce qui vous atteint, et quand : l’éclair, la chaleur, puis le souffle, bien plus tard. Quatre bombes réelles servent de repères, ainsi que l’essai Starfish Prime, tiré dans l’espace en 1962.'),
    warn: T('Explosion en l’air, par temps clair, sur terrain plat et dégagé : dans une ville, les immeubles font écran à la chaleur et le relief change le souffle. Chaleur, surpression et délais suivent les lois d’échelle de Glasstone et Dolan (1977), fiables à dix ou vingt pour cent près jusqu’à 20 mégatonnes ; au-delà, elles sous-estiment la chaleur (pour la Tsar Bomba, des brûlures au troisième degré étaient possibles à 100 km). L’allure de la boule de feu et du nuage est une mise en scène. Hiroshima et Nagasaki ont fait à elles deux environ 200 000 morts avant la fin de 1945.'),
    views: [{ id: 'ground', label: T('À votre distance'), cam: { mode: 'look', fov: 60, yaw: 0, pitch: 0.12 } }, { id: 'over', label: T('Vue d’ensemble'), cam: { mode: 'orbit', dist: 12000, min: 300, max: 3e6, pitch: 0.28, yaw: 0.9, fov: 50 } }],
    options: [
      { id: 'preset', type: 'select', label: T('Repère'), value: 'hiro', choices: [['hiro', T('Hiroshima, 1945 · 15 kt')], ['naga', T('Nagasaki, 1945 · 21 kt')], ['bravo', T('Castle Bravo, 1954 · 15 Mt')], ['tsar', T('Tsar Bomba, 1961 · 50 Mt')], ['star', T('Starfish Prime, 1962 · 1,4 Mt à 400 km d’altitude')], ['free', T('Réglage libre')]] },
      { id: 'y', type: 'range', label: T('Puissance'), min: 0, max: 5, step: 0.01, value: Math.log10(15), fmt: (v) => yStr(Math.pow(10, v)) },
      { id: 'd', type: 'range', label: T('Votre distance'), min: -0.3, max: 2.7, step: 0.01, value: Math.log10(3), fmt: (v) => dStr(Math.pow(10, v) * 1000) },
    ],
    onOpt: (id, v, k) => {
      if (id === 'preset') { star = v === 'star'; if (star && k.view === 'ground') k.setFocus(POIS.sf); else k.setFocus(null); const p = PRESETS[v]; if (p) { W = p[0]; D = p[1] * 1000; k.setOpt('y', Math.log10(W)); k.setOpt('d', Math.log10(D / 1000)); } if (v !== 'free') { k.sim.t = -5; k.sim.paused = false; } }
      else { star = false; if (id === 'y') W = Math.pow(10, v); else D = Math.pow(10, v) * 1000; if (k.opt.preset !== 'free') k.setOpt('preset', 'free'); }
      apply(k); if (k.view === 'over') frame(k);
    },
    sound: true, bg: 0x8090b0,
    t0: -8, t1: 1500, tStart: -5, speed0: 1, speedRange: [0.01, 120], speeds: [0.02, 0.1, 0.25, 1, 2, 5, 15, 60, 120],
    prog: (t) => t < 0 ? 0.04 * (t + 8) / 8 : 0.04 + 0.96 * Math.log(1 + t) / Math.log(1501),
    autoRate: (t) => star ? (t < -0.2 ? 1 : t < 1.5 ? 0.25 : t < 20 ? 1 : 12) : t < -0.05 ? 1 : t < 3.5 * TM ? clamp(TM * 0.7, 0.02, 1) : t < Math.max(8 * TM, 6) ? 1 : t < tArr - 7 ? clamp(1 + (t - 6) * 0.8, 1, Math.max(1, (tArr - 7 - t) * 0.5 + 1), 40) : t < tArr + 12 ? 1 : 15,
    moments: MOM, journal: J(),
    pois: POIS = [{ id: 'gz', label: T('Point zéro'), pos: () => star ? null : GZ, r: 800 }, { id: 'cloud', label: T('La boule de feu, puis le nuage'), pos: (t) => star || t < 0 ? null : CL, r: 2000 }, { id: 'you', label: T('Vous'), pos: (t, k) => k.view === 'over' ? YOU : null, r: 300 },
      { id: 'sf', label: T('Starfish Prime'), far: true, pos: (t) => star && t > 0 ? SFP : null },
      { id: 'r5', label: T('Maisons détruites (34 kPa)'), pos: (t, k) => k.view === 'over' && !star ? ringP[1] : null, r: 1000 }, { id: 'r1', label: T('Vitres brisées (7 kPa)'), pos: (t, k) => k.view === 'over' && !star ? ringP[2] : null, r: 1000 }, { id: 'rb', label: T('Brûlures au 3ᵉ degré'), pos: (t, k) => k.view === 'over' && !star ? ringP[3] : null, r: 1000 }],
    clock: (t) => [(t < 0 ? TF('T − {0}', [fmtDur(-t)]) : TF('T + {0}', [fmtDur(t)])), t < 0 ? T('avant l’explosion') : T('après l’explosion')],
    data: (t) => {
      if (star) return T('Starfish Prime · 9 juillet 1962 (le 8 à 23 h, heure d’Honolulu) · <b>1,4 Mt</b> à <b>400 km</b> d’altitude') + '<br>' + T('Vous êtes à Honolulu, à 1 450 km : l’explosion est à 10° au-dessus de l’horizon') + '<br>' + T('Souffle : aucun, il n’y a presque pas d’air à cette altitude') + '<br>' + T('Impulsion électromagnétique : environ 300 lampadaires éteints à Hawaï');
      const suns = Q / (2.22 * TM) / 0.0327, kpa = pObs * KPA, dia = 2 * RFB * (1 - Math.exp(-Math.max(t, 0) / (0.8 * TM)));
      return TF('Bombe de <b>{0}</b> à <b>{1}</b> de vous · explosion à {2} d’altitude', [yStr(W), dStr(D), dStr(H)])
        + '<br>' + TF('Chaleur reçue : <b>{0} cal/cm²</b> · {1}', [fr(Q, Q < 10 ? 1 : 0), burnLabel()]) + (suns > 0.05 ? ' · ' + TF('au pic, <b>{0} fois</b> le plein soleil', [fr(suns, suns < 10 ? 1 : 0)]) : '')
        + '<br>' + (t < tArr ? TF('Souffle : arrive dans <b>{0}</b> · {1} kPa, vent à {2} km/h', [fmtDur(tArr - Math.max(t, 0)), fr(kpa, kpa < 10 ? 1 : 0), fr(windU(pObs) * 3.6, 0)]) : TF('Souffle passé : <b>{0} kPa</b>, vent à {1} km/h · {2}', [fr(kpa, kpa < 10 ? 1 : 0), fr(windU(pObs) * 3.6, 0), blastLabel()]))
        + '<br>' + TF('Boule de feu : <b>{0}</b> de diamètre · sommet du nuage vers {1} km (ordre de grandeur)', [dStr(Math.max(dia, 0)), fr(HT / 1000, 0)])
        + (D < radR(W) * 1.3 ? '<br>' + T('Rayonnement initial : dose mortelle à cette distance') : '');
    },
    distLabel: (d) => dStr(d), bloom: [0.55, 0.6, 0.9], exposure: 0.95,
    onView: (id, k) => { if (id === 'over') frame(k); },
    update(t, dt, k) {
      time += dt; const u = sky.material.uniforms, gnd = k.view === 'ground';
      u.uMode.value = star ? 1 : 0; u.uT.value = time; fire.visible = false; stars.visible = star; lamps.visible = star; rings.visible = !star && !gnd; dustRing.visible = false; mark.visible = !star && !gnd; scorch.visible = !star && t > 0;
      if (star) {
        u.uSfT.value = t; u.uFlash.value = 0; u.uDust.value = 0; const fl = t > 0 ? Math.exp(-t / 0.35) : 0, glowA = t > 0 ? Math.exp(-t / 200) * (1 - Math.exp(-t / 15)) : 0;
        G.u.uSunCol.value.setRGB(0.05 + 3 * fl + 0.5 * glowA, 0.05 + 3 * fl + 0.12 * glowA, 0.08 + 2.8 * fl + 0.1 * glowA); G.u.uAmb.value.setRGB(0.012, 0.014, 0.02); G.u.uSun.value.copy(SF); G.u.uHaze.value.setRGB(0.006, 0.008, 0.015);
        lampList.forEach((l, i) => { l.material.opacity = t > 0.05 && l.userData.dead ? 0 : 0.95; });
        k.renderer.toneMappingExposure = 1.1; if (gnd) { k.cam.pos.set(0, 1.7, 0); k.cam.near = 0.3; k.cam.far = 4e6; } else { k.cam.target.set(0, 0, 0); k.cam.near = k.cam.dist * 0.02; k.cam.far = 4e6; }
        return;
      }
      // boule de feu puis nuage
      const x = Math.max(t, 0) / TM, L = lum(t, W), rise = 1 - Math.exp(-Math.max(t - 3 * TM, 0) / 110), drop = gnd ? D * D / (2 * RE) : 0;
      const zc = H + (HT * 0.78 - H) * rise, capR = Math.max(RFB * (1 - Math.exp(-Math.max(t, 0) / (0.8 * TM))), 1) * (1 + (0.35 * HT * Math.pow(W / 21, 0.09) / RFB - 1) * (1 - Math.exp(-Math.max(t - 6 * TM, 0) / 200)));
      const cloud = sstep(5, 22, x);
      CL.set(0, zc, -D); GZ.set(0, 0, -D); u.uC.value.set(0, zc - drop, -D); u.uCapR.value = capR; u.uCapH.value = capR * lerp(1, 0.36, clamp(sstep(8, 400, x) * rise + 0.25 * cloud, 0, 1));
      u.uStemH.value = zc; u.uStemR.value = t > 4 * TM ? capR * 0.28 * sstep(4, 30, x) : 0; u.uCloud.value = cloud; u.uHot.value = sstep(1.2, 60, x); u.uL.value = t > 0 ? L * 3 + 0.4 * Math.exp(-x / 6) : 0;
      fire.visible = t > 0; { const rb = Math.max(capR * 1.5, zc * 0.5 + u.uCapH.value * 1.5) * 1.25 * 1.02; fire.position.set(0, zc - drop - zc * 0.5, -D); fire.scale.setScalar(rb); }
      // lumière reçue : éclairement relatif au plein soleil
      const suns = t > 0 ? Q / (2.22 * TM) / 0.0327 * Math.min(L, 1) : 0, flash = 1 - Math.exp(-suns / 40);
      u.uFlash.value = gnd ? flash : 0; G.u.uSun.value.copy(sunDir); G.u.uSunCol.value.setRGB(1.05 + 6 * flash, 0.98 + 5.6 * flash, 0.86 + 5 * flash); G.u.uAmb.value.setRGB(0.3, 0.33, 0.4); G.u.uHaze.value.setRGB(0.64, 0.71, 0.84);
      k.renderer.toneMappingExposure = 0.95 / (1 + (gnd ? 2.2 * flash : 0.6 * Math.min(L, 1)));
      // onde de choc au sol : anneau de poussière
      const rs = shockR(t), ps = rs > 0 ? psiAt(Math.hypot(rs, H) / 1000, W) : 0, dv = clamp(ps / 1.5, 0, 1) * (t < tab[tab.length - 1][1] ? 1 : 0);
      if (rs > 10 && dv > 0.02) { dustRing.visible = true; dustRing.position.set(0, 1 - drop, -D); dustRing.scale.setScalar(rs); dustRing.material.opacity = 0.55 * dv; }
      scorch.position.set(0, 0.6 - drop, -D); scorch.scale.setScalar(Math.min(rPsi(20, W) * 1000, Math.max(rs, 1))); 
      const since = t - tArr; if (prevT < tArr && t >= tArr && dt > 0 && pObs > 0.05) { shake = clamp(pObs / 2, 0.15, 3); boom(k, clamp(pObs / 3, 0.15, 1)); }
      prevT = t; shake *= Math.exp(-dt * 0.9); u.uDust.value = gnd && since > 0 ? clamp(pObs / 4, 0, 1) * Math.exp(-since / 25) : 0;
      if (gnd) { k.cam.pos.set(0, 1.7, 0); if (shake > 0.01) k.cam.pos.add(tmp.set(Math.sin(time * 61), Math.sin(time * 47), Math.sin(time * 53)).multiplyScalar(0.06 * shake)); k.cam.near = 0.3; k.cam.far = 4e6; }
      else { if (!k.focusId) k.cam.target.set(0, Math.min(zc * 0.45, HT * 0.4), -D); k.cam.near = Math.max(1, k.cam.dist * 0.01); k.cam.far = 6e6; }
    },
    post: (t, k) => { const u = sky.material.uniforms, c = k.camera; u.uBasis.value.setFromMatrix4(c.matrixWorld); u.uTan.value = Math.tan(c.fov * Math.PI / 360); u.uAspect.value = c.aspect; u.uCam.value.copy(c.position); G.u.uCamL.value.copy(c.position); G.u.uFade.value = k.view === 'ground' ? 0.005 : 1 / (Math.max(k.cam.dist, 2000) * 4 * 0.004); },
  });
  const frame = (k) => { k.cam.dist = clamp(star ? 3000 : Math.max(HT * 2.2, rPsi(1, W) * 2600, D * 1.6), 300, 3e6); };
  const S = kit.scene, sunDir = new THREE.Vector3(0.45, 0.6, 0.66).normalize();
  const sky = makeBackdrop(new THREE.ShaderMaterial({ vertexShader: BACKDROP_VERT, fragmentShader: SKY, uniforms: { uBasis: { value: new THREE.Matrix3() }, uTan: { value: 1 }, uAspect: { value: 1 }, uT: { value: 0 }, uL: { value: 0 }, uHot: { value: 0 }, uCloud: { value: 0 }, uCapR: { value: 1 }, uCapH: { value: 1 }, uStemR: { value: 0 }, uStemH: { value: 1 }, uFlash: { value: 0 }, uDust: { value: 0 }, uMode: { value: 0 }, uSfT: { value: -1 },
    uCam: { value: new THREE.Vector3() }, uSun: { value: sunDir }, uC: { value: new THREE.Vector3() }, uSf: { value: SF } } }));
  const U = sky.material.uniforms;
  const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), new THREE.ShaderMaterial({ uniforms: U, side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    vertexShader: 'varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}', fragmentShader: CLOUD })); fire.renderOrder = 4; fire.frustumCulled = false;
  S.add(sky, fire); const stars = kit.addSky(makeStars({ n: 5000, seed: 62, band: 0.35, bright: 0.9 })); stars.visible = false;
  const G = makeGround({ a: 0x8f9a62, b: 0x6d7748, scale: 0.004, fade: 0.00001 }); S.add(G.mesh);
  // repères de la vue d'ensemble : cercles de dégâts, position de l'observateur
  const rings = new THREE.Group(); S.add(rings); const circ = []; for (const col of [0xff5a3c, 0xffb347, 0xffe28a, 0xff3fa0]) { const pts = []; for (let j = 0; j <= 256; j++) pts.push(new THREE.Vector3(Math.cos(j / 128 * Math.PI), 0, Math.sin(j / 128 * Math.PI))); const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthTest: false })); l.renderOrder = 5; rings.add(l); circ.push(l); }
  const mark = makeGlow(0x7fd0ff, 1, 1); S.add(mark);
  const dustRing = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 160), new THREE.MeshBasicMaterial({ color: 0xcdbb98, transparent: true, opacity: 0.4, depthWrite: false, depthTest: false, side: THREE.DoubleSide })); dustRing.rotation.x = -Math.PI / 2; S.add(dustRing);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(1, 96), new THREE.MeshBasicMaterial({ color: 0x1c1712, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })); scorch.rotation.x = -Math.PI / 2; S.add(scorch);
  // Honolulu, la nuit : une rue et ses lampadaires
  const lamps = new THREE.Group(), lampList = []; S.add(lamps); for (let i = 0; i < 16; i++) { const g = makeGlow(0xffd9a0, 1, 0.95); g.position.set(-7 + (i % 2) * 14, 7, -18 - Math.floor(i / 2) * 34); g.scale.setScalar(5); g.userData.dead = [1, 2, 4, 7, 8, 11, 13].includes(i); lamps.add(g); lampList.push(g);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), new THREE.MeshBasicMaterial({ color: 0x15161a })); pole.position.set(g.position.x, 3.5, g.position.z); lamps.add(pole); }
  function layout() {
    const rr = [rPsi(20, W), rPsi(5, W), rPsi(1, W), burnR(W)[0]].map(x => x * 1000); circ.forEach((l, i) => { l.scale.setScalar(rr[i]); l.position.set(0, 2, -D); }); ringP.forEach((p, i) => { const a = 0.6 + i * 0.5; p.set(Math.cos(a) * rr[i], 2, -D + Math.sin(a) * rr[i]); });
    G.setSize(Math.max(8e4, D * 6, rr[2] * 8)); mark.position.copy(YOU); mark.scale.setScalar(Math.max(60, D * 0.03)); lamps.visible = star;
  }
  function boom(k, g0) {
    if (!k.ac || !k.soundOn) return; const ac = k.ac, now = ac.currentTime, len = ac.sampleRate * 4, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1);
    for (const [dl, g, f, dur] of [[0, 1, 110, 2.5], [0.25, 0.6, 70, 4], [1.2, 0.4, 160, 3]]) { const s = ac.createBufferSource(); s.buffer = buf; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f; const gn = ac.createGain();
      gn.gain.setValueAtTime(0, now + dl); gn.gain.linearRampToValueAtTime(g * g0 * 1.6, now + dl + 0.02); gn.gain.exponentialRampToValueAtTime(0.001, now + dl + dur); s.connect(lp).connect(gn).connect(ac.destination); s.start(now + dl); s.stop(now + dl + dur + 0.2); }
  }
  // préréglage venu de l'adresse
  { const v = kit.opt.preset; star = v === 'star'; if (PRESETS[v]) { W = PRESETS[v][0]; D = PRESETS[v][1] * 1000; kit.setOpt('y', Math.log10(W)); kit.setOpt('d', Math.log10(D / 1000)); } else if (v === 'free') { W = Math.pow(10, kit.opt.y); D = Math.pow(10, kit.opt.d) * 1000; } recompute(); setMoments(); kit.setJournal(J()); layout(); }
  POIS = Object.fromEntries(POIS.map(p => [p.id, p])); kit.run(); if (star) kit.setFocus(POIS.sf);
}
