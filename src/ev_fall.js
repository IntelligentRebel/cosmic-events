// Tomber dans un trou noir : chute libre radiale depuis l'infini (observateur « pluie »).
import { createKit, T, TF, THREE, fmtDur, fmtDist, fr, clamp, makeGlow } from './kit.js';
import { makeBH } from './bh.js';
const C = 299792.458;
const HOLES = { sgr: { name: 'Sagittarius A*', M: 4.3e6 }, m87: { name: 'M87*', M: 6.5e9 }, st: { name: T('trou noir stellaire'), M: 10 } };
const rOf = (t) => Math.pow(1.5 * Math.max(-t, 1e-9), 2 / 3);     // r en rs, t en rs/c (temps propre avant la singularité)
const tOf = (r) => -(2 / 3) * Math.pow(r, 1.5);
export function start() {
  let H = HOLES.sgr, rsKm = 2.953 * H.M, tu = rsKm / C;
  const setHole = (id) => { H = HOLES[id]; rsKm = 2.953 * H.M; tu = rsKm / C; };
  const lat = 0.2, dirOut = new THREE.Vector3(Math.cos(lat), Math.sin(lat), 0);
  const O = new THREE.Vector3(), FAR = dirOut.clone().multiplyScalar(1e6);
  const kit = createKit({
    title: T('Tomber dans un trou noir'), kicker: T('Chute libre · relativité générale'), h1: T('Tomber dans un trou noir'),
    intro: T('Vous tombez en chute libre, tout droit, vers un trou noir. Les rayons lumineux sont calculés un par un dans l’espace-temps courbe : ce que vous voyez est ce qu’un observateur verrait, y compris après l’horizon.'),
    warn: T('Le disque de gaz est une mise en scène (celui de Sagittarius A* est en réalité ténu et épais). La géométrie de la lumière, elle, est exacte pour un trou noir sans rotation.'),
    views: [{ id: 'ride', label: T('En chute libre'), cam: { mode: 'look', fov: 80, pitch: 0, yaw: 0 } }, { id: 'far', label: T('Immobile, à distance'), cam: { mode: 'orbit', dist: 22, min: 2.2, max: 400, pitch: 0.16, yaw: 0.6, fov: 55 } }],
    options: [{ id: 'hole', type: 'select', label: T('Trou noir'), value: 'sgr', choices: [['sgr', T('Sagittarius A* (4,3 millions de Soleils)')], ['m87', T('M87* (6,5 milliards de Soleils)')], ['st', T('Trou noir stellaire (10 Soleils)')]] },
      { id: 'disk', label: T('Disque de gaz (mise en scène)'), value: true }],
    onOpt: (id, v) => { if (id === 'hole') setHole(v); },
    t0: tOf(40), t1: -0.0006, tStart: tOf(40), speed0: 2, speedRange: [0.002, 60], speeds: [0.01, 0.03, 0.1, 0.3, 1, 2, 5, 15, 40],
    autoRate: (t) => clamp(-t * 0.09, 0.02, 30),
    fmtRate: (s) => TF('{0} / s', [fmtDur(s * tu)]),
    moments: [{ label: T('Départ, à 40 rayons de l’horizon'), t: tOf(40) }, { label: T('À 10 rayons'), t: tOf(10) }, { label: T('Dernière orbite stable (3 rayons)'), t: tOf(3) }, { label: T('Sphère de photons (1,5 rayon)'), t: tOf(1.5) },
      { label: T('Franchissement de l’horizon'), t: tOf(1.0) }, { label: T('Sous l’horizon, à mi-chemin'), t: tOf(0.5) }, { label: T('Derniers instants'), t: tOf(0.08) }],
    prog: (t) => 1 - Math.pow(rOf(t) / 40, 0.5),
    journal: [
      { t: tOf(40), title: T('Chute libre'), text: T('Vous ne sentez rien : en chute libre, on ne pèse rien. Devant vous, un disque noir déforme le ciel. L’image du disque de gaz passe par-dessus et par-dessous : c’est sa face arrière, ramenée par la lumière courbée.') },
      { t: tOf(10), title: T('Le ciel se referme'), text: T('Le trou noir grandit plus vite que votre distance ne diminue. Autour de lui, les étoiles sont repoussées et dédoublées : chaque étoile a une seconde image de l’autre côté.') },
      { t: tOf(3), title: T('Dernière orbite stable'), text: T('À trois rayons, plus aucune orbite circulaire ne tient. Le gaz du disque plonge à partir d’ici : c’est son bord intérieur.') },
      { t: tOf(1.5), title: T('Sphère de photons'), text: T('À un rayon et demi, la lumière elle-même peut tourner en rond. Un observateur immobile ici verrait sa propre nuque. Vous, vous passez.') },
      { t: tOf(1.0), title: T('Horizon franchi'), text: T('Rien ne marque le passage : ni mur, ni éclair. Le noir ne vous entoure pas, il reste devant. Mais plus aucun chemin ne ramène dehors, même pour la lumière.') },
      { t: tOf(0.5), title: T('Sous l’horizon'), text: T('Vous voyez toujours l’univers extérieur, derrière vous, de plus en plus sombre et rougi. L’espace vous emporte vers le centre plus vite que la lumière ne peut remonter.') },
      { t: tOf(0.1), title: T('La marée'), text: T('La gravité tire plus fort sur vos pieds que sur votre tête. Le ciel s’écrase en un anneau autour de vous. Dans un petit trou noir, cette marée vous aurait tué bien avant l’horizon.') },
    ],
    pois: [{ id: 'bh', label: T('Trou noir'), pos: () => O, r: 4 }, { id: 'back', label: T('L’univers derrière vous'), far: true, pos: (t, k) => k.view === 'ride' ? FAR : null }, { id: 'probe', label: T('La sonde'), pos: (t, k) => k.view === 'far' ? probe.position : null, r: 1.5 }],
    clock: (t) => [TF('T − {0}', [fmtDur(-t * tu)]), TF('de temps propre avant la singularité · {0}', [H.name])],
    data: (t, k) => {
      const r = rOf(t), km = r * rsKm, v = Math.sqrt(1 / r), tide = rsKm * 1000 * C * C * 1e6 * 2 / Math.pow(km * 1000, 3) / 9.81;
      const tideTxt = tide < 0.01 ? T('imperceptible') : tide < 5 ? TF('{0} g : supportable', [fr(tide, 2)]) : tide < 50 ? TF('{0} g : dangereuse', [fr(tide, 0)]) : TF('{0} g : mortelle, le corps est étiré', [fr(tide, 0)]);
      return TF('Distance au centre : <b>{0}</b> ({1} rayons de l’horizon)', [fmtDist(km), fr(r, 2)]) + '<br>' +
        (r > 1 ? TF('Vitesse face à un observateur immobile : <b>{0} %</b> de la lumière', [fr(v * 100, 1)]) : T('<b>Sous l’horizon</b> : aucun observateur immobile n’existe ici')) + '<br>' +
        TF('Marée entre la tête et les pieds (2 m) : <b>{0}</b>', [tideTxt]) +
        (k.view === 'far' ? '<br><i>' + T('Vue de loin, la sonde ne franchit jamais l’horizon : sa lumière rougit et s’éteint.') + '</i>' : '');
    },
    unitKm: 1, distLabel: (d) => TF('{0} rayons · {1}', [fr(d, 1), fmtDist(d * rsKm)]),
    bloom: [0.7, 0.7, 0.9], exposure: 1.0, minPr: 0.45,
    update(t, dt, k) {
      const r = rOf(t); time += dt;
      bh.u.uTime.value = time * 8; bh.u.uDiskB.value = k.opt.disk ? 0.9 : 0;
      if (k.view === 'ride') {
        k.cam.pos.copy(dirOut).multiplyScalar(r); bh.u.uFall.value = 1; k.cam.near = 1e-4; k.cam.far = 10; probe.visible = false;
      } else {
        bh.u.uFall.value = 0; k.cam.target.set(0, 0, 0); probe.visible = true; const rp = Math.max(r, 1.004);
        probe.position.copy(dirOut).multiplyScalar(rp); const red = Math.pow(clamp(1 - 1 / rp, 0, 1), 1.2);
        probe.material.opacity = red; probe.material.color.setRGB(1, 0.35 + 0.65 * red, 0.2 + 0.8 * red); probe.scale.setScalar(0.03 * k.cam.dist);
      }
    },
    post: () => bh.sync(),
    onView(id, k) { if (id === 'ride') { const z = dirOut.clone(), x = new THREE.Vector3(0, 0, 1), y = new THREE.Vector3().crossVectors(z, x); k.cam.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); } },
  });
  let time = 0;
  const bh = makeBH(kit, { uDiskIn: 3, uDiskOut: 16, uDiskB: 0.9, uDiskFall: 1.0, uDiskHot: 7500, uDiskCool: 1500, uStarsB: 1.2, uMW: 1.0 });
  kit.scene.add(bh.mesh);
  const probe = makeGlow(0xffffff, 1); probe.material.depthTest = false; kit.scene.add(probe);
  kit.run();
}
