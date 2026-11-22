// La jeune Lune : de sa naissance, quinze fois plus près qu'aujourd'hui, jusqu'à nous. 4,5 milliards d'années d'éloignement.
// Kilomètres. La distance suit une loi de marée simple calée sur des repères publiés ; la durée du jour s'en déduit par conservation du moment cinétique.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, lerp, NOISE, YEAR, makeBackdrop, BACKDROP_VERT, makeGround, makeStars, makeGlow } from './kit.js';
const RE = 6371, RM = 1737.4, A_NOW = 384400, GM = 3.986e14 * 1.0123, GY = 1e9, T_NOW = 4.51 * GY;
const ANCH = [[0, 4 * RE], [1.31 * GY, 0.70 * A_NOW], [3.89 * GY, 370800], [T_NOW, A_NOW]]; // années après l'impact → distance (km)
const dist = (y) => { for (let i = 1; i < ANCH.length; i++) if (y <= ANCH[i][0] || i === ANCH.length - 1) { const [t0, a0] = ANCH[i - 1], [t1, a1] = ANCH[i], f = clamp((y - t0) / (t1 - t0), 0, 1); return Math.pow(lerp(Math.pow(a0, 6.5), Math.pow(a1, 6.5), f), 1 / 6.5); } };
const L_M = (a) => 7.342e22 * Math.sqrt(3.986e14 * a * 1000), L_TOT = 8.04e37 * 7.2921e-5 + L_M(A_NOW);
const dayLen = (a) => 2 * Math.PI / ((L_TOT - L_M(a)) / 8.04e37), monthLen = (a) => 2 * Math.PI * Math.sqrt(Math.pow(a * 1000, 3) / GM); // secondes
const lg = (y, a, b) => sstep(Math.log10(a), Math.log10(b), Math.log10(Math.max(y, 1)));
const SKY = /* glsl */`precision highp float;varying vec2 vUv;uniform mat3 uBasis;uniform float uTan,uAspect,uHeat,uOxy,uT;uniform vec3 uSun;
${NOISE}
void main(){vec3 d=normalize(uBasis*vec3(vUv.x*uTan*uAspect,vUv.y*uTan,-1.));float y=d.y;float day=smoothstep(-.12,.12,uSun.y);
  vec3 zen=mix(mix(vec3(.30,.20,.13),vec3(.20,.07,.03),uHeat),vec3(.13,.30,.66),uOxy),hor=mix(mix(vec3(.80,.60,.42),vec3(.85,.38,.14),uHeat),vec3(.66,.74,.88),uOxy);
  vec3 col=mix(hor,zen,pow(clamp(y,0.,1.),.45))*day;
  float sd=dot(d,uSun);col+=mix(vec3(1.,.6,.3),vec3(1.,.9,.7),uOxy)*(pow(max(sd,0.),1400.)*9.+pow(max(sd,0.),30.)*.25*day)*smoothstep(-.03,.02,uSun.y);
  float tw=smoothstep(.25,-.2,uSun.y)*smoothstep(-.35,-.02,uSun.y);col+=vec3(.5,.2,.1)*tw*exp(-max(y,0.)*5.)*pow(max(dot(normalize(vec3(d.x,0.,d.z)),normalize(vec3(uSun.x,0.,uSun.z)+1e-5)),0.),2.);
  col+=vec3(.9,.25,.05)*uHeat*exp(-max(y,0.)*9.)*(.35+.25*fbm3(vec3(d.xz*4.,uT*.05)));
  col+=vec3(.012,.014,.03)*(1.-day);if(y<0.)col=mix(col,hor*.5*day+vec3(.3,.08,.02)*uHeat,smoothstep(0.,-.1,y));
  gl_FragColor=vec4(col,1.);}`;
const MOON_F = /* glsl */`precision highp float;varying vec3 vN,vO;uniform vec3 uSun,uSky;uniform float uHeat,uReal,uDay,uT;uniform sampler2D uMap;${NOISE}
void main(){vec3 n=normalize(vO);float hl=fbm(n*3.+2.),cr=fbm3(n*9.);
  vec3 young=mix(vec3(.50,.49,.47),vec3(.74,.73,.70),smoothstep(.35,.7,hl))*(.8+.4*cr);young*=1.-.22*smoothstep(.66,.72,vnoise(n*13.))-.15*smoothstep(.7,.76,vnoise(n*31.));
  vec3 real=young;if(n.z>0.){vec3 ph=texture2D(uMap,.5+n.xy*.5*.985).rgb;real=mix(young,ph*1.2,smoothstep(0.,.3,n.z));}
  vec3 alb=mix(young,real,uReal);float mu=max(dot(normalize(vN),uSun),0.);vec3 col=alb*pow(mu,.7)*1.2;
  float crack=smoothstep(.3,.7,fbm(n*5.+7.+uT*.01));vec3 lava=mix(vec3(.30,.03,.01),vec3(2.4,.75,.12),crack)*uHeat;col=col*(1.-.65*uHeat)+lava;
  col=col*(1.-.35*uDay)+uSky*uDay*.75*(1.-clamp(mu*1.3,0.,1.)*.65);gl_FragColor=vec4(col,1.);}`;
const EARTH_F = /* glsl */`precision highp float;varying vec3 vN,vO;uniform vec3 uSun;uniform float uHeat,uOcean,uOxy,uLife,uT;${NOISE}
void main(){vec3 n=normalize(vO);float mu=dot(normalize(vN),uSun);float lit=pow(max(mu,0.),.8)*smoothstep(-.05,.1,mu);
  float h=fbm(n*2.1+4.),land=smoothstep(.54,.58,h);
  vec3 rock=mix(vec3(.16,.14,.13),vec3(.34,.28,.22),fbm3(n*6.));vec3 sea=mix(vec3(.10,.16,.14),vec3(.04,.13,.36),uOxy);
  vec3 ground=mix(mix(vec3(.45,.36,.26),vec3(.62,.50,.36),fbm3(n*5.+1.)),mix(vec3(.16,.30,.12),vec3(.5,.45,.3),smoothstep(.58,.7,h)),uLife);ground=mix(ground,vec3(.92),uLife*smoothstep(.8,.92,abs(n.y)));
  vec3 surf=mix(rock,mix(sea,ground,land),uOcean);
  float cl=smoothstep(.5,.78,fbm(n*3.5+vec3(uT*.01,0.,9.)))*mix(.9,.75,uOxy)*max(uOcean,.3*(1.-uHeat));surf=mix(surf,mix(vec3(.8,.7,.6),vec3(.96),uOxy),cl*uOcean+cl*(1.-uOcean)*.5);
  vec3 col=surf*lit*1.15;
  float crack=smoothstep(.25,.7,fbm(n*4.+2.+uT*.008));vec3 lava=mix(vec3(.35,.04,.01),vec3(2.6,.8,.12),crack)*uHeat;col=col*(1.-.8*uHeat)+lava;
  float rim=pow(1.-max(dot(normalize(vN),normalize(cameraPosition-vO*6371.)),0.),3.);col+=mix(vec3(.5,.3,.2),vec3(.3,.5,1.),uOxy)*rim*.35*max(lit,.05)*(1.-uHeat*.5);
  gl_FragColor=vec4(col,1.);}`;
const BALL_V = 'varying vec3 vN,vO;void main(){vO=position;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

export function start() {
  const LAT = 30 * Math.PI / 180, Z = new THREE.Vector3(0, 1, 0), N = new THREE.Vector3(0, 0, -1), EAST = new THREE.Vector3(1, 0, 0), POLE = Z.clone().multiplyScalar(Math.sin(LAT)).addScaledVector(N, Math.cos(LAT)), Q0 = Z.clone().multiplyScalar(Math.cos(LAT)).addScaledVector(N, -Math.sin(LAT));
  const eq = (H, dec, o) => o.copy(Q0).multiplyScalar(Math.cos(H) * Math.cos(dec)).addScaledVector(EAST, -Math.sin(H) * Math.cos(dec)).addScaledVector(POLE, Math.sin(dec));
  const sunD = new THREE.Vector3(), moonD = new THREE.Vector3(), moonP = new THREE.Vector3(), O = new THREE.Vector3(), tmp = new THREE.Vector3(), SUNP = new THREE.Vector3(), SUN_S = new THREE.Vector3(1, 0.12, 0.25).normalize(), skyCol = new THREE.Color();
  let phi = 0.9, time = 0, a = dist(100), MOONPOI;
  const ago = (y) => T_NOW - y;
  const kit = createKit({
    title: T('La jeune Lune · les 4,5 milliards d’années qui ont suivi l’impact'), kicker: T('Après Theia · la Lune s’éloigne, la Terre ralentit'), h1: T('La jeune Lune'),
    intro: T('La Lune est née tout près de la Terre, quinze fois plus près qu’aujourd’hui : un disque énorme dans le ciel, au-dessus d’un monde qui tournait sur lui-même en cinq heures. Depuis, les marées la repoussent et freinent la Terre. La scène parcourt ces 4,5 milliards d’années.'),
    warn: T('Repères tirés de modèles et de roches : formation vers quatre rayons terrestres, jour de 13 heures il y a 3,2 milliards d’années, de 22 heures il y a 620 millions d’années. Entre ces repères, la distance suit une loi de marée simple ; la durée du jour se déduit de la distance par conservation du moment cinétique, sans l’effet du Soleil. L’aspect de la Terre, du ciel et de la Lune ancienne est une mise en scène. La rotation est accélérée : un jour dure une minute à l’écran aujourd’hui, treize secondes au début.'),
    views: [{ id: 'ground', label: T('Depuis la Terre'), cam: { mode: 'look', fov: 55, yaw: Math.PI, pitch: 0.3 } }, { id: 'space', label: T('Depuis l’espace'), cam: { mode: 'orbit', dist: 120000, min: 9000, max: 2.5e6, pitch: 0.35, yaw: 0.7, fov: 45 } }],
    t0: 100 * YEAR, t1: T_NOW * YEAR, tStart: 100 * YEAR, speed0: 30 * YEAR, speedRange: [YEAR, 5e8 * YEAR], speeds: [10 * YEAR, 1e3 * YEAR, 1e5 * YEAR, 1e6 * YEAR, 1e7 * YEAR, 5e7 * YEAR, 1.5e8 * YEAR, 5e8 * YEAR],
    prog: (t) => Math.log(t / (100 * YEAR)) / Math.log(T_NOW / 100),
    autoRate: (t) => Math.min(t * 0.2, 1.5e8 * YEAR),
    moments: [{ label: T('Cent ans après l’impact'), t: 100 * YEAR, view: 'ground', cam: { fov: 55 } }, { label: T('Mille ans après'), t: 1000 * YEAR, view: 'ground', cam: { fov: 45 } }, { label: T('Dix mille ans après, vu de l’espace'), t: 1e4 * YEAR, view: 'space', cam: { dist: 120000 } }, { label: T('Les premiers océans'), t: 1.1e8 * YEAR, view: 'ground', cam: { fov: 20 } },
      { label: T('Il y a 3,2 milliards d’années'), t: 1.31 * GY * YEAR, view: 'ground', cam: { fov: 14 } }, { label: T('Il y a 620 millions d’années, vu de l’espace'), t: 3.89 * GY * YEAR, view: 'space', cam: { dist: 900000 } }, { label: T('Aujourd’hui'), t: T_NOW * YEAR * 0.99999, view: 'ground', cam: { fov: 10 } }],
    journal: [
      { t: 100 * YEAR, title: T('Une Lune toute neuve'), text: T('Dans les modèles, les débris de l’impact se rassemblent en quelques années au plus, juste au-delà de la distance où la marée de la Terre les aurait empêchés de s’agglomérer. La Lune naît à environ quatre rayons terrestres : quinze fois plus près qu’aujourd’hui.') },
      { t: 250 * YEAR, title: T('Un ciel occupé'), text: T('Elle occupe quinze à vingt fois sa largeur actuelle, selon sa hauteur dans le ciel, et luit d’un rouge sombre : sa surface est encore un océan de magma. Celle de la Terre aussi.') },
      { t: 1000 * YEAR, title: T('Des jours de cinq heures'), text: T('La Terre tourne sur elle-même en cinq heures. La Lune, si proche, y soulève des marées plus de mille fois plus fortes qu’aujourd’hui, d’abord dans la roche en fusion. Ce frottement freine la Terre et, en retour, pousse la Lune vers le large.') },
      { t: 1e5 * YEAR, title: T('La fuite'), text: T('L’éloignement est d’abord très rapide, puis ralentit : la force de marée chute avec le cube de la distance. En cent mille ans, dans ce calcul, la Lune a plus que doublé sa distance.') },
      { t: 5e6 * YEAR, title: T('La croûte'), text: T('La surface de la Terre se fige en quelques millions d’années. Sous une atmosphère épaisse de vapeur d’eau et de gaz carbonique, la pluie finit par tomber : les premiers océans.') },
      { t: 1.1e8 * YEAR, title: T('De l’eau, déjà'), text: T('Les plus vieux minéraux connus, des zircons d’Australie âgés de 4,4 milliards d’années, se sont formés en présence d’eau liquide. La Lune a figé sa croûte claire ; elle est encore à moins de la moitié de sa distance actuelle.') },
      { t: 0.7 * GY * YEAR, title: T('Les mers de la Lune'), text: T('Entre 3,9 et 3,1 milliards d’années avant nous, de la lave remplit les grands bassins d’impact de la face visible : ce sont les taches sombres que l’on voit encore à l’œil nu.') },
      { t: 1.31 * GY * YEAR, title: T('Des jours de treize heures'), text: T('Il y a 3,2 milliards d’années, des dépôts de marée fossiles indiquent une Lune à 70 % de sa distance actuelle et un jour d’environ 13 heures.') },
      { t: 2.15 * GY * YEAR, title: T('Le ciel devient bleu'), text: T('Des bactéries produisent de l’oxygène depuis longtemps ; vers 2,4 milliards d’années avant nous, il s’accumule enfin dans l’air. La couleur du ciel avant cette date est une supposition.') },
      { t: 3.89 * GY * YEAR, title: T('Des jours de vingt-deux heures'), text: T('Il y a 620 millions d’années, d’autres dépôts de marée donnent un jour d’environ 22 heures : l’année comptait 400 jours.') },
      { t: T_NOW * YEAR * 0.9985, title: T('Aujourd’hui'), text: T('La Lune s’éloigne encore de 3,8 cm par an, mesurés au laser grâce aux réflecteurs laissés par les missions Apollo. C’est près de deux fois le rythme moyen du passé : les océans actuels freinent la Terre particulièrement bien. Un jour dure 24 heures, pour l’instant.') },
    ],
    pois: [MOONPOI = { id: 'moon', label: T('Lune'), pos: () => moon.position, r: 2500 }, { id: 'sun', label: T('Soleil'), far: true, pos: () => SUNP }, { id: 'earth', label: T('Terre'), pos: (t, k) => k.view === 'space' ? O : null, r: 9000 },
      { id: 'now', label: T('Orbite actuelle de la Lune'), pos: (t, k) => k.view === 'space' ? NOWP : null, r: 9000 }, { id: 'roche', label: T('Limite de Roche'), pos: (t, k) => k.view === 'space' && k.cam.dist < 4e5 ? ROCHEP : null, r: 9000 }],
    clock: (t) => { const y = t / YEAR, ag = ago(y); return [ag < 2e5 ? T('Aujourd’hui') : TF('Il y a {0}', [fmtDur(ag * YEAR)]), TF('{0} après l’impact de Theia', [fmtDur(t)])]; },
    data: (t) => {
      const y = t / YEAR, ang = 2 * Math.atan(RM / a) * 180 / Math.PI, tide = Math.pow(A_NOW / a, 3), y2 = Math.min(y * 1.01, T_NOW), rate = (dist(y2) - dist(y)) / Math.max(y2 - y, 1e-9) * 1e5; // cm/an
      return TF('Lune : à <b>{0}</b> de la Terre ({1} rayons terrestres) · {2} % de la distance actuelle', [fmtDist(a), fr(a / RE, 1), fr(a / A_NOW * 100, 0)])
        + '<br>' + TF('Dans le ciel : <b>{0}°</b> de large, {1} fois la Lune d’aujourd’hui', [fr(ang, ang < 1 ? 2 : 1), fr(ang / 0.518, ang / 0.518 < 2 ? 2 : 1)])
        + '<br>' + TF('Jour : <b>{0}</b> · un tour de Lune : {1}', [fmtDur(dayLen(a)), fmtDur(monthLen(a))])
        + '<br>' + TF('Force de marée : <b>{0} fois</b> celle d’aujourd’hui', [fr(tide, tide < 10 ? 1 : 0)]) + ' · ' + (ago(y) < 2e5 ? T('éloignement mesuré : 3,8 cm par an') : rate >= 100 ? TF('éloignement moyen : {0} m par an', [fr(rate / 100, rate < 1000 ? 1 : 0)]) : TF('éloignement moyen : {0} cm par an', [fr(rate, rate < 10 ? 1 : 0)]));
    },
    distLabel: (d) => fmtDist(d), bloom: [0.4, 0.5, 0.95], exposure: 1.0,
    onView: (id, k) => { k.cam.target.set(0, 0, 0); },
    // à chaque saut : une nuit où la Lune est haute, et le regard tourné vers elle
    onJump: (m, k) => { const dl = dayLen(a = dist(k.sim.t / YEAR)), ml = monthLen(a); for (let p = phi + 0.3, i = 0; i < 40000; i++, p += 0.01) { eq(p, 0, sunD); eq(p * (1 - dl / ml) + 0.6, 9 * Math.PI / 180, moonD); if (sunD.y < -0.25 && moonD.y > 0.55 && moonD.dot(sunD) < -0.2) { phi = p; break; } } if (k.view === 'ground') k.setFocus(MOONPOI); },
    update(t, dt, k) {
      time += dt; const y = t / YEAR; a = dist(y); const dl = dayLen(a), ml = monthLen(a), gnd = k.view === 'ground';
      if (!k.sim.paused) phi += dt * 2 * Math.PI / (60 * dl / 86400);
      const heatE = 1 - lg(y, 1e3, 4e6), ocean = lg(y, 4e6, 1.2e8), oxy = sstep(2.0 * GY, 2.4 * GY, y), life = sstep(4.0 * GY, 4.2 * GY, y), heatM = 1 - lg(y, 300, 3e7), real = sstep(0.6 * GY, 1.6 * GY, y);
      const mu = moon.material.uniforms, eu = earth.material.uniforms; mu.uHeat.value = heatM; mu.uReal.value = real; mu.uT.value = time; eu.uHeat.value = heatE; eu.uOcean.value = ocean; eu.uOxy.value = oxy; eu.uLife.value = life; eu.uT.value = time;
      sky.visible = G.mesh.visible = gnd; earth.visible = rings.visible = !gnd;
      if (gnd) {
        eq(phi, 0, sunD); eq(phi * (1 - dl / ml) + 0.6, 9 * Math.PI / 180, moonD); moonP.copy(moonD).multiplyScalar(a).addScaledVector(Z, -RE); moon.position.copy(moonP); SUNP.copy(sunD).multiplyScalar(1e9);
        const day = sstep(-0.12, 0.12, sunD.y), su = sky.material.uniforms; su.uSun.value.copy(sunD); su.uHeat.value = heatE; su.uOxy.value = oxy; su.uT.value = time;
        skyCol.setRGB(lerp(lerp(0.5, 0.5, heatE), 0.35, oxy), lerp(lerp(0.38, 0.2, heatE), 0.5, oxy), lerp(lerp(0.26, 0.08, heatE), 0.78, oxy)); mu.uSky.value.copy(skyCol); mu.uDay.value = day * smoothstep01(moonP.y / a + 0.1); mu.uSun.value.copy(sunD);
        stars.visible = day < 0.5; stars.quaternion.setFromAxisAngle(POLE, -phi);
        // le sol : magma, puis roche, puis rivage ; éclairé par le Soleil ou par la Lune
        const ml2 = Math.max(moonD.y, 0) * Math.pow(A_NOW / a, 2) * 0.004 * (1 - day) * (0.5 - 0.5 * moonD.dot(sunD));
        G.u.uSun.value.copy(day > 0.02 ? sunD : moonD); G.u.uSunCol.value.setRGB((1.1 - 0.3 * heatE) * day + ml2, (1.0 - 0.45 * heatE) * day + ml2, (0.9 - 0.5 * heatE) * day + ml2 * 1.1);
        G.u.uAmb.value.setRGB(0.05 + 0.25 * day + 0.25 * heatE, 0.05 + 0.25 * day + 0.06 * heatE, 0.07 + 0.3 * day * (0.4 + 0.6 * oxy));
        G.u.uLava.value = heatE; G.u.uWater.value = 0.44 * ocean; G.u.uTime.value = time; G.u.uA.value.setRGB(lerp(0.33, 0.52, life), lerp(0.28, 0.5, life), lerp(0.24, 0.36, life)); G.u.uB.value.setRGB(0.16, 0.14, 0.13);
        G.u.uHaze.value.setRGB(lerp(lerp(0.75, 0.8, heatE), 0.64, oxy) * day + 0.02, lerp(lerp(0.56, 0.33, heatE), 0.72, oxy) * day + 0.02, lerp(lerp(0.4, 0.12, heatE), 0.86, oxy) * day + 0.03);
        k.cam.pos.set(0, 0.002, 0); k.cam.near = 0.0005; k.cam.far = 2e6; moon.quaternion.setFromUnitVectors(ZAX, tmp.copy(moonP).negate().normalize());
      } else {
        const lam = phi * dl / ml; moonP.set(Math.cos(lam) * a, 0, Math.sin(lam) * a).applyAxisAngle(XAX, 0.12); moon.position.copy(moonP); earth.rotation.y = phi; SUNP.copy(SUN_S).multiplyScalar(1e9);
        mu.uSun.value.copy(SUN_S); mu.uDay.value = 0; eu.uSun.value.copy(SUN_S); stars.visible = true; stars.quaternion.identity(); orbit.scale.setScalar(a);
        moon.quaternion.setFromUnitVectors(ZAX, tmp.copy(moonP).negate().normalize()); if (!k.focusId) k.cam.target.set(0, 0, 0); k.cam.near = k.cam.dist * 0.01; k.cam.far = 2e7;
      }
    },
    post: (t, k) => { const u = sky.material.uniforms, c = k.camera; u.uBasis.value.setFromMatrix4(c.matrixWorld); u.uTan.value = Math.tan(c.fov * Math.PI / 360); u.uAspect.value = c.aspect; G.u.uCamL.value.copy(c.position); },
  });
  function smoothstep01(x) { return sstep(0, 0.2, x); }
  const S = kit.scene, ZAX = new THREE.Vector3(0, 0, 1), XAX = new THREE.Vector3(1, 0, 0), NOWP = new THREE.Vector3(-A_NOW * 0.7, 0, A_NOW * 0.7).applyAxisAngle(XAX, 0.12), ROCHEP = new THREE.Vector3(2.9 * RE * 0.7, 0, -2.9 * RE * 0.7).applyAxisAngle(XAX, 0.12);
  const sky = makeBackdrop(new THREE.ShaderMaterial({ vertexShader: BACKDROP_VERT, fragmentShader: SKY, uniforms: { uBasis: { value: new THREE.Matrix3() }, uTan: { value: 1 }, uAspect: { value: 1 }, uHeat: { value: 1 }, uOxy: { value: 0 }, uT: { value: 0 }, uSun: { value: new THREE.Vector3(0, 1, 0) } } })); S.add(sky);
  const stars = kit.addSky(makeStars({ n: 6000, seed: 45, band: 0.4, bright: 1 }));
  const G = makeGround({ a: 0x544840, b: 0x2a2421, scale: 1000, fade: 0.00011 }); G.setSize(80); S.add(G.mesh);
  const map = new THREE.TextureLoader().load(window.ASSETS.moon); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const moon = new THREE.Mesh(new THREE.SphereGeometry(RM, 96, 64), new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uSky: { value: new THREE.Color() }, uHeat: { value: 1 }, uReal: { value: 0 }, uDay: { value: 0 }, uT: { value: 0 }, uMap: { value: map } }, vertexShader: BALL_V.replace('vO=position', 'vO=position/' + RM.toFixed(1)), fragmentShader: MOON_F })); S.add(moon);
  const earth = new THREE.Mesh(new THREE.SphereGeometry(RE, 128, 80), new THREE.ShaderMaterial({ uniforms: { uSun: { value: new THREE.Vector3(1, 0, 0) }, uHeat: { value: 1 }, uOcean: { value: 0 }, uOxy: { value: 0 }, uLife: { value: 0 }, uT: { value: 0 } }, vertexShader: BALL_V.replace('vO=position', 'vO=position/6371.'), fragmentShader: EARTH_F })); S.add(earth);
  const rings = new THREE.Group(); rings.rotation.x = 0.12; S.add(rings); const ring = (r, col, op) => { const pts = []; for (let j = 0; j <= 256; j++) pts.push(new THREE.Vector3(Math.cos(j / 128 * Math.PI) * r, 0, Math.sin(j / 128 * Math.PI) * r)); const l = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false })); rings.add(l); return l; };
  const orbit = ring(1, 0xffe2a8, 0.8); ring(A_NOW, 0x8fa0c8, 0.4); ring(2.9 * RE, 0xff6a4a, 0.6);
  kit.run();
}
