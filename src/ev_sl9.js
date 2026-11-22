// Shoemaker-Levy 9 : vingt et un fragments de comète frappent Jupiter, 16 au 22 juillet 1994.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, NOISE, makeStars, makeGlow } from './kit.js';
const RJ = 69911, OMEGA = 2 * Math.PI / (9.925 * 3600), V = 60;
const hms = (d, h, m, s = 0) => ((d - 16) * 24 + h) * 3600 + m * 60 + s - (20 * 3600 + 11 * 60);
// heures d'impact acceptées (NASA/NSSDC), taille relative de la cicatrice (mise en scène d'après les images Hubble)
const F = [['A', hms(16, 20, 11), .5], ['B', hms(17, 2, 50), .2], ['C', hms(17, 7, 12), .45], ['D', hms(17, 11, 54), .4], ['E', hms(17, 15, 11), .7], ['F', hms(18, 0, 33), .2], ['G', hms(18, 7, 32), 1], ['H', hms(18, 19, 31, 59), .7],
  ['K', hms(19, 10, 21), 1], ['L', hms(19, 22, 16, 48), 1], ['N', hms(20, 10, 31), .2], ['P2', hms(20, 15, 23), .2], ['Q2', hms(20, 19, 44), .25], ['Q1', hms(20, 20, 12), .7], ['R', hms(21, 5, 33), .6], ['S', hms(21, 15, 15), .6],
  ['T', hms(21, 18, 10), .15], ['U', hms(21, 21, 55), .15], ['V', hms(22, 4, 22), .2], ['W', hms(22, 8, 5, 30), .6]].map(([n, t, s]) => ({ n, t, s }));
const LAT = -44 * Math.PI / 180, PHI0 = -96.5 * Math.PI / 180;
const SITE = new THREE.Vector3(Math.cos(LAT) * Math.sin(PHI0), Math.sin(LAT) * 0.935, Math.cos(LAT) * Math.cos(PHI0)).multiplyScalar(RJ);
const NRM = SITE.clone().normalize(), NORTH = new THREE.Vector3(0, 1, 0).addScaledVector(NRM, -NRM.y).normalize();
const VIN = NRM.clone().multiplyScalar(-0.72).addScaledVector(NORTH, 0.69).normalize();   // arrivée par le sud, à ~45° de la surface
const JUP = /* glsl */`precision highp float;varying vec3 vP,vN,vW;uniform vec3 uSun;uniform float uRot,uT;uniform vec4 uScar[20];uniform vec3 uFlash;uniform vec3 uSitePos;
${NOISE}
void main(){vec3 n=normalize(vP);float lat=asin(n.y),lon=atan(n.x,n.z)-uRot;
  vec3 q=vec3(cos(lon),sin(lon),0.);
  float w=fbm(vec3(q.xy*2.2,lat*7.))*.5+fbm3(vec3(q.xy*7.,lat*26.+4.))*.16;
  float b=lat*8.5+w*1.6+.12*sin(lon*3.+lat*20.);
  float band=.5+.5*sin(b*2.);float fine=.5+.5*sin(b*7.+w*9.);
  vec3 c=mix(vec3(.66,.47,.33),vec3(.93,.87,.76),smoothstep(.2,.85,band));
  c=mix(c,vec3(.84,.70,.55),fine*.35);c=mix(c,vec3(.55,.36,.27),smoothstep(.75,1.,.5+.5*sin(b*1.+.9))*.45);
  c=mix(c,vec3(.52,.55,.6),smoothstep(.95,1.4,abs(lat)));
  float dl=mod(lon-1.1+3.14159,6.28318)-3.14159;float g=dl*dl/.05+pow(lat+.38,2.)/.007;c=mix(c,vec3(.72,.33,.22),smoothstep(1.2,.5,g));
  for(int i=0;i<20;i++){vec4 s=uScar[i];if(s.z<=0.)continue;float d2=mod(lon-s.x+3.14159,6.28318)-3.14159;float d=length(vec2(d2*cos(lat),lat-(${LAT.toFixed(4)})));
    float core=smoothstep(s.y*.55,s.y*.2,d);float ring=exp(-pow((d-s.y*1.15)/(s.y*.35),2.))*smoothstep(-.3,.4,d2/s.y+.3+.6*fbm3(vec3(d2*40.,lat*40.,s.x)));
    c=mix(c,vec3(.07,.05,.045),clamp(core+ring*.75,0.,.93)*s.z);}
  vec3 N=normalize(vN);float mu=dot(N,uSun);float day=smoothstep(-.06,.25,mu);
  c=pow(c,vec3(1.35));vec3 col=c*pow(max(mu,0.),.75)*day*.9;
  float fd=length(vW-uSitePos);col+=uFlash*c*exp(-fd/9000.);
  float rim=pow(1.-max(dot(N,normalize(cameraPosition-vW)),0.),3.);col+=vec3(.5,.42,.35)*rim*day*.25;
  gl_FragColor=vec4(col,1.);}`;
export function start() {
  const T0 = -6 * 3600, T1 = F[F.length - 1].t + 4 * 86400, lastOf = (t) => { let k = -1; for (let i = 0; i < F.length; i++) if (F[i].t <= t) k = i; return k; };
  const nextOf = (t) => F.findIndex(f => f.t > t), base = Date.UTC(1994, 6, 16, 20, 11, 0), fpos = new THREE.Vector3(), tmp = new THREE.Vector3();
  const fragPos = (f, t, out) => out.copy(SITE).addScaledVector(VIN, -V * Math.max(f.t - t, 0));
  let time = 0;
  const kit = createKit({
    title: T('Shoemaker-Levy 9 · la comète contre Jupiter'), kicker: T('16 au 22 juillet 1994 · à 770 millions de km de la Terre'), h1: T('La comète contre Jupiter'),
    intro: T('Deux ans plus tôt, Jupiter a brisé en un chapelet de fragments une comète qu’il retenait en orbite depuis des décennies. Une vingtaine reviennent, l’un après l’autre, à 60 kilomètres par seconde. C’est la première collision entre deux corps du système solaire que l’humanité observe en direct.'),
    warn: T('Les heures d’impact sont celles retenues par la NASA. Les fragments tombent juste derrière le bord de Jupiter vu de la Terre ; seule la sonde Galileo les a vus directement. Taille des cicatrices et allure des panaches : mise en scène d’après les images de Hubble.'),
    views: [{ id: 'orbit', label: T('Depuis la Terre (libre)'), cam: { mode: 'orbit', dist: 5.2e5, min: 9e4, max: 6e7, pitch: -0.2, yaw: -0.25, fov: 40 } }, { id: 'site', label: T('Au-dessus du point d’impact'), cam: { mode: 'orbit', dist: 6e4, min: 4e3, max: 6e5, pitch: 0.5, yaw: 0, fov: 50 } }, { id: 'ride', label: T('Sur le prochain fragment'), cam: { mode: 'look', fov: 60, pitch: 0 } }],
    t0: T0, t1: T1, tStart: -1800, speed0: 60, speedRange: [1, 86400], speeds: [1, 10, 60, 300, 1200, 3600, 10800, 43200, 86400],
    autoRate: (t) => { let d = 1e9; for (const f of F) { const x = t - f.t, w = f.s < 0.3 ? 4 : 1; d = Math.min(d, (x < 0 ? -x : x * 0.6) * w); } return clamp(d / 1.2, 20, 7200); },
    moments: [{ label: T('Le chapelet approche'), t: -1800 }, ...['A', 'E', 'G', 'H', 'K', 'L', 'Q1', 'R', 'W'].map(n => { const f = F.find(x => x.n === n); return { label: n === 'G' ? TF('Impact du fragment {0} (le plus violent)', [n]) : TF('Impact du fragment {0}', [n]), t: f.t - 50 }; }),
      { label: T('Les cicatrices, deux jours après'), t: F[F.length - 1].t + 2 * 86400, view: 'orbit' }],
    journal: [
      { t: T0, title: T('Un collier de perles'), text: T('En juillet 1992, la comète est passée si près de Jupiter que la marée l’a rompue. Découverte en mars 1993 par Carolyn et Eugene Shoemaker et David Levy, elle forme un train de fragments, dont les plus gros font jusqu’à 2 km.') },
      { t: F[0].t, title: T('Fragment A'), text: T('Premier impact, côté nuit, juste derrière le bord visible depuis la Terre. Boule de feu à 24 000 K. Quelques minutes plus tard, un panache dépasse du limbe : il monte à 3 000 km.') },
      { t: F[0].t + 1500, title: T('La tache'), text: T('La rotation de Jupiter amène le site face à la Terre. Surprise générale : une tache sombre, nette, visible dans un télescope d’amateur. Personne n’avait prédit de marque durable.') },
      { t: F[6].t, title: T('Fragment G'), text: T('Le plus violent : environ 6 millions de mégatonnes de TNT, 600 fois l’arsenal nucléaire mondial. La cicatrice dépasse 12 000 km, presque le diamètre de la Terre.') },
      { t: F[8].t, title: T('K, puis L'), text: T('Deux autres géants à douze heures d’écart. Jupiter fait un tour en moins de dix heures : chaque fragment tombe au même endroit du ciel, mais sur une longitude différente de la planète.') },
      { t: F[13].t, title: T('Q2 et Q1'), text: T('Vingt-huit minutes entre les deux. Le chapelet touche à sa fin, la bande de latitude 44° sud est constellée de taches sombres.') },
      { t: F[19].t, title: T('Fragment W'), text: T('Dernier impact, le 22 juillet. Les cicatrices resteront visibles des mois. L’épisode a rappelé que les impacts ne sont pas une affaire du passé, et que Jupiter en reçoit beaucoup à notre place.') },
    ],
    clock: (t) => { const d = new Date(base + t * 1000); return [TF('{0} juillet 1994 · {1} h {2}', [d.getUTCDate(), String(d.getUTCHours()).padStart(2, '0'), String(d.getUTCMinutes()).padStart(2, '0')]), T('temps universel')]; },
    data: (t) => {
      const i = nextOf(t), l = lastOf(t); let s = '';
      if (i >= 0) { const f = F[i]; s += TF('Prochain : fragment <b>{0}</b>, dans <b>{1}</b>, à {2} de Jupiter', [f.n, fmtDur(f.t - t), fmtDist(V * (f.t - t))]) + '<br>'; } else s += T('Tous les fragments sont tombés') + '<br>';
      s += T('Vitesse d’impact : <b>60 km/s</b> (216 000 km/h)') + '<br>' + TF('Impacts : <b>{0}</b> sur {1} observés', [l + 1, F.length]);
      if (l >= 0 && t - F[l].t < 1200) s += '<br>' + TF('Fragment {0} : panache à <b>{1} km</b> au-dessus des nuages', [F[l].n, fr(plumeH(t - F[l].t), 0)]);
      return s;
    },
    bloom: [0.35, 0.5, 1.0], exposure: 1.0,
    update(t, dt, k) {
      time += dt; const rot = OMEGA * t; ju.uRot.value = rot; jup.rotation.y = 0;
      const l = lastOf(t); let flash = 0;
      for (let i = 0; i < 20; i++) { const f = F[i], age = t - f.t, s = ju.uScar.value[i]; s.set(PHI0 - OMEGA * f.t, f.s * 6000 / RJ * (0.35 + 0.65 * sstep(200, 1500, age)), age > 0 ? sstep(120, 900, age) * (0.55 + 0.45 * f.s) : 0, 0); }
      if (l >= 0) { const f = F[l], age = t - f.t; flash = f.s * (6 * Math.exp(-age / 14) + 1.2 * Math.exp(-age / 400));
        const h = plumeH(age) * (0.5 + 0.5 * f.s); plume.visible = age < 1500; plume.position.copy(SITE).addScaledVector(NRM, h * 0.55 + 200); const w = (700 + h * 0.9) * (0.6 + f.s);
        plume.scale.set(w * 1.5, w * 1.5, 1); plume.material.opacity = clamp(1.4 * Math.exp(-age / 500), 0, 1); plume.material.color.setRGB(1, 0.5 + 0.5 * Math.exp(-age / 60), 0.25 + 0.75 * Math.exp(-age / 30));
        fire.visible = age < 90; fire.position.copy(SITE).addScaledVector(NRM, 300); fire.scale.setScalar((2500 + 9000 * f.s) * Math.exp(-age / 40) + 800); fire.material.opacity = Math.exp(-age / 30);
      } else { plume.visible = fire.visible = false; }
      ju.uFlash.value.setRGB(flash, flash * 0.75, flash * 0.5);
      // fragments : têtes et queues
      const cd = k.camera.position.length(); const ni = nextOf(t);
      for (let i = 0; i < F.length; i++) { const f = F[i], g = heads[i]; g.visible = f.t > t; if (!g.visible) continue; fragPos(f, t, g.position); const d = k.camera.position.distanceTo(g.position);
        const sz = clamp(d * 0.02 * (0.6 + 0.6 * f.s), 30, 1e9); g.scale.set(sz, sz, 1); g.material.opacity = 0.9;
        const tl = tails[i]; tl.visible = true; tl.position.copy(g.position).addScaledVector(tailDir, sz * 2.2); tl.scale.set(sz * 1.3, sz * 5, 1); tl.material.rotation = tailRot(k.camera, g.position); }
      for (let i = 0; i < F.length; i++) if (F[i].t <= t) tails[i].visible = false;
      // entrée atmosphérique : traînée lumineuse des 3 dernières secondes
      if (ni >= 0 && F[ni].t - t < 6) { const g = heads[ni]; g.material.opacity = 1; g.scale.multiplyScalar(1 + 3 * sstep(6, 0, F[ni].t - t)); }
      if (k.view === 'orbit') k.cam.target.set(0, 0, 0);
      else if (k.view === 'site') { k.cam.target.copy(SITE); k.cam.basis.copy(siteQ); k.cam.near = k.cam.dist * 0.02; k.cam.far = 1e9; }
      else if (ni >= 0) { fragPos(F[ni], t, fpos); const z = tmp.copy(VIN).negate(), x = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
        k.cam.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); k.cam.pos.copy(fpos).addScaledVector(z, 170).addScaledVector(y, 55); k.cam.near = 5; k.cam.far = 1e9; heads[ni].visible = false; tails[ni].visible = false; rock.visible = true; rock.position.copy(fpos); rock.rotation.set(time * 0.2, time * 0.13, 0); }
      else { k.setView('orbit', true); }
      if (k.view !== 'ride') rock.visible = false;
      sunL.position.copy(SUN).multiplyScalar(1e6);
    },
  });
  function plumeH(age) { return age < 0 ? 0 : age < 900 ? 3200 * Math.sin(Math.PI * Math.min(age, 900) / 900) ** 0.8 : 0; }
  const S = kit.scene, SUN = new THREE.Vector3(Math.sin(0.17), 0.03, Math.cos(0.17)).normalize();
  kit.addSky(makeStars({ n: 6000, seed: 9, band: 0.45, bright: 0.9 }));
  const ju = { uSun: { value: SUN }, uRot: { value: 0 }, uT: { value: 0 }, uScar: { value: Array.from({ length: 20 }, () => new THREE.Vector4()) }, uFlash: { value: new THREE.Color(0, 0, 0) }, uSitePos: { value: SITE } };
  const jup = new THREE.Mesh(new THREE.SphereGeometry(RJ, 160, 96), new THREE.ShaderMaterial({ uniforms: ju, fragmentShader: JUP,
    vertexShader: 'varying vec3 vP,vN,vW;void main(){vP=position;vec3 p=position*vec3(1.,.935,1.);vN=normalize(mat3(modelMatrix)*(normal*vec3(1.,1.07,1.)));vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}' }));
  S.add(jup);
  const halo = new THREE.Mesh(new THREE.SphereGeometry(RJ * 1.012, 96, 64), new THREE.ShaderMaterial({ uniforms: { uSun: { value: SUN } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vN,vW;void main(){vec3 p=position*vec3(1.,.935,1.);vN=normalize(mat3(modelMatrix)*normal);vec4 w=modelMatrix*vec4(p,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}',
    fragmentShader: 'varying vec3 vN,vW;uniform vec3 uSun;void main(){float f=pow(max(dot(normalize(vN),normalize(vW-cameraPosition)),0.),6.);float d=smoothstep(-.2,.3,dot(normalize(vW),uSun));gl_FragColor=vec4(vec3(.8,.65,.5)*f*d*.5,1.);}' })); S.add(halo);
  const sunL = new THREE.DirectionalLight(0xffffff, 3); S.add(sunL); S.add(new THREE.AmbientLight(0x707070));
  const heads = F.map(f => { const g = makeGlow(0xcfe6ff, 1, 0.9); S.add(g); return g; });
  const tailDir = SUN.clone().negate();
  const tails = F.map(() => { const g = makeGlow(0x9fc4ff, 1, 0.3); S.add(g); return g; });
  const tailRot = (cam, p) => { const a = p.clone().project(cam), b = p.clone().add(tailDir.clone().multiplyScalar(p.distanceTo(cam.position) * 0.05)).project(cam); return Math.atan2((b.y - a.y), (b.x - a.x) * cam.aspect) - Math.PI / 2; };
  const plume = makeGlow(0xffffff, 1, 1), fire = makeGlow(0xfff0d0, 1, 1); S.add(plume, fire);
  const rg = new THREE.IcosahedronGeometry(40, 3), rp = rg.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); v.multiplyScalar(1 + 0.2 * Math.sin(v.x * 0.11 + 1) * Math.cos(v.y * 0.13) + 0.1 * Math.sin(v.z * 0.3)); rp.setXYZ(i, v.x, v.y * 0.7, v.z); } rg.computeVertexNormals();
  const rock = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1, flatShading: true })); rock.visible = false; S.add(rock);
  const sx = new THREE.Vector3().crossVectors(NORTH, NRM).normalize(), siteQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, NRM, new THREE.Vector3().crossVectors(sx, NRM)));
  kit.run();
}
