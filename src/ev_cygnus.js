// Cygnus X-1 : une étoile massive s'effondre en trou noir, puis se nourrit du vent de sa compagne.
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, sstep, DAY } from './kit.js';
import { makeBH } from './bh.js';
import { makeStar } from './bodies.js';
const RS = 62.6;                       // km, pour 21,2 masses solaires
const A = 0.244 * 1.495979e8 / RS;     // séparation, en rs
const RSTAR = 22.3 * 695700 / RS;      // rayon de la supergéante
const P = 5.599829 * DAY, DISK = 60000, RPRO = 6 * 695700 / RS, T_PRO = -90;
export function start() {
  let time = 0;
  const kit = createKit({
    title: T('Cygnus X-1 · le trou noir et la supergéante'), kicker: T('Constellation du Cygne · à 7 200 années-lumière'), h1: T('Cygnus X-1'),
    intro: T('Deux étoiles massives tournent l’une autour de l’autre. L’une s’effondre en trou noir, presque sans bruit. Depuis, elle avale le vent de sa compagne : le gaz s’enroule en disque, chauffe à des millions de degrés et repart en jets.'),
    warn: T('Masses, tailles et orbite sont celles mesurées en 2021 (Miller-Jones et al.). L’étoile d’avant l’effondrement, la taille du disque et l’aspect du gaz sont une mise en scène : le vrai système brille surtout en rayons X.'),
    views: [{ id: 'orbit', label: T('Autour du trou noir'), cam: { mode: 'orbit', dist: 1.6e6, min: 3, max: 4e6, pitch: 0.32, yaw: 0.9 } }, { id: 'ride', label: T('Depuis l’étoile compagne'), cam: { mode: 'look', fov: 62, pitch: -0.02 } }],
    t0: T_PRO, t1: 400 * P, tStart: T_PRO, speed0: 4, speedRange: [0.25, 4e5], speeds: [1, 4, 60, 600, 3600, 4 * 3600, 43200, DAY, 2 * DAY],
    autoRate: (t) => t < 12 ? 4 : t < 40 ? 4 + (t - 12) * 300 : 4 * 3600,
    moments: [
      { label: T('Avant : deux étoiles massives'), t: T_PRO, view: 'orbit', cam: { dist: 1.6e6, pitch: 0.32, yaw: 0.9 } },
      { label: T('L’effondrement'), t: -8, view: 'orbit', cam: { dist: 4e5, pitch: 0.25, yaw: 0.9 } },
      { label: T('Aujourd’hui : le système entier'), t: 3600, view: 'orbit', cam: { dist: 1.7e6, pitch: 0.45, yaw: 0.6 } },
      { label: T('Le disque de gaz'), t: 3600, view: 'orbit', cam: { dist: 1.2e5, pitch: 0.3, yaw: 0.6 } },
      { label: T('Le cœur : 2 000 km'), t: 3600, view: 'orbit', cam: { dist: 32, pitch: 0.12, yaw: 0.6 } },
      { label: T('Au ras de l’horizon'), t: 3600, view: 'orbit', cam: { dist: 7, pitch: 0.07, yaw: 0.6 } },
      { label: T('Vu depuis la supergéante'), t: 3600, view: 'ride' },
    ],
    prog: (t) => t < 0 ? 0.25 * (1 - t / T_PRO) : 0.25 + 0.75 * ((t / P) % 1),
    journal: [
      { t: T_PRO, title: T('Deux géantes'), text: T('À droite, une supergéante bleue de 40 masses solaires. Au centre, sa compagne, plus évoluée, a brûlé tout son combustible. Son cœur de fer ne tient plus.') },
      { t: -6, title: T('Effondrement'), text: T('Le cœur s’écroule en moins d’une seconde. Pas de supernova : l’étoile tombe sur elle-même et s’éteint. C’est le scénario retenu pour Cygnus X-1, dont l’orbite n’a presque pas été bousculée.') },
      { t: 6, title: T('Un trou de 125 km'), t2: 0, text: T('Il reste 21 masses solaires dans une sphère plus petite que l’Île-de-France. Elle n’émet rien. Sa présence se lit sur le ciel qu’elle déforme.') },
      { t: 40, title: T('Le festin'), text: T('La supergéante souffle un vent puissant. Le trou noir en capte une partie, qui s’enroule en disque. Plus le gaz descend, plus il tourne vite et chauffe : au bord intérieur, des millions de degrés.') },
      { t: 0.5 * P, title: T('Les jets'), text: T('Une partie du gaz n’entre jamais. Elle est éjectée le long de l’axe en deux jets fins, à une fraction notable de la vitesse de la lumière.') },
      { t: 1.2 * P, title: T('Cinq ordres de grandeur'), text: T('La supergéante mesure 31 millions de kilomètres. Le trou noir, 125. Descendez avec la molette : chaque cran divise la distance, et il en faut beaucoup.') },
    ],
    clock: (t) => t < 0 ? [TF('T − {0}', [fmtDur(-t)]), T('avant l’effondrement (scénario)')] : [t < 3 * DAY ? TF('T + {0}', [fmtDur(t)]) : TF('Jour {0}', [fr(t / DAY, 1)]), T('de l’orbite · une révolution en 5,6 jours')],
    data: (t, k) => {
      const d = k.view === 'orbit' ? k.cam.dist : A - RSTAR;
      return T('Trou noir : <b>21,2 masses solaires</b>, horizon de <b>125 km</b> de diamètre') + '<br>' + T('Compagne : 40,6 masses solaires, <b>31 millions de km</b> de diamètre') + '<br>' + T('Séparation : 0,244 UA (36,5 millions de km)') + '<br>' + TF('Vous êtes à <b>{0}</b> du trou noir', [fmtDist(d * RS)]);
    },
    distLabel: (d) => fmtDist(d * RS),
    bloom: [0.45, 0.6, 0.95], minPr: 0.45,
    update(t, dt, k) {
      time += dt;
      const th = 2 * Math.PI * Math.max(t, 0) / P + 0.4;
      bh.u.uStar.value.set(A * Math.cos(th), 0, A * Math.sin(th));
      const born = t > 0, feed = sstep(8, 60, t);
      bh.u.uTime.value = time * 3; bh.u.uDiskB.value = clamp(0.5 * Math.pow(k.camera.position.length() / 3, 0.3), 0.5, 12) * feed; bh.u.uStream.value = 0.5 * feed; bh.u.uJet.value = 0.7 * sstep(30, 90, t);
      bh.u.uDiskOut.value = 20 + (DISK - 20) * feed; bh.u.uStreamR.value = bh.u.uDiskOut.value;
      const cd = k.camera.position.length(); bh.u.uGlow.value = 5 * feed * sstep(60, 3000, cd); bh.u.uGlowS.value = cd * 0.0035;
      // l'étoile d'avant : elle pâlit, rétrécit, disparaît
      const col = sstep(-6, 0, t); pro.visible = !born; pro.scale.setScalar(1 - 0.985 * col * col);
      pro.material.uniforms.uTime.value = time; pro.material.uniforms.uB.value = 1.3 * (1 - col) + 6 * Math.exp(-Math.pow((t + 0.4) / 0.5, 2)); pro.material.uniforms.uT.value = 30000 - 22000 * col;
      if (k.view === 'orbit') k.cam.target.set(0, 0, 0);
      else { const s = bh.u.uStar.value, out = s.clone().normalize(); k.cam.pos.copy(s).addScaledVector(out, -RSTAR * 1.03).add(new THREE.Vector3(0, RSTAR * 0.12, 0));
        const z = out, x = new THREE.Vector3(0, 1, 0).cross(z).normalize(), y = new THREE.Vector3().crossVectors(z, x); k.cam.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); k.cam.near = 100; k.cam.far = 1e8; }
    },
    post: () => bh.sync(),
  });
  const bh = makeBH(kit, { uDiskIn: 3, uDiskOut: DISK, uDiskB: 0, uDiskFall: 0.42, uDiskHot: 16000, uDiskCool: 1500, uStarR: RSTAR, uStarCol: [0.62, 0.74, 1.0], uStarGlow: 0.3, uJetLen: 3e4, uStarsB: 1.1, uMW: 0.8, uStreamR: DISK });
  kit.scene.add(bh.mesh);
  const pro = makeStar(RPRO, { T: 30000, bright: 2.2, cells: 9, contrast: 0.35 }); kit.scene.add(pro);
  kit.run();
}
