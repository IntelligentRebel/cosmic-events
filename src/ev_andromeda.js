// La Voie lactée et Andromède : 27 000 étoiles-tests dans le champ de deux halos, intégrées en direct.
import { createKit, T, TF, THREE, fmtDur, fr, clamp, sstep, lerp, YEAR, makeStars, makeGlow, glowTexture } from './kit.js';
import { createSim } from './galsim.js';
const G = 1e9 * YEAR, KLY = 3.2616;
export function start() {
  let sim = null, held = false, oldK = 0, lastDist = 0;
  const pA = new THREE.Vector3(), pB = new THREE.Vector3(), sunP = new THREE.Vector3(), tmp = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
  const J_MERGE = [
    { t: 0, title: T('Notre voisine'), text: T('Andromède est à 2,5 millions d’années-lumière et fonce vers nous à 110 km/s. À l’œil nu, c’est une tache pâle, mais large comme six pleines lunes. Le scénario joué ici est le choc frontal ; une étude de 2025 ne lui donne plus qu’une chance sur deux.') },
    { t: 2.2 * G, title: T('Elle grandit'), text: T('Son disque couvre maintenant une belle part du ciel. Le Soleil, lui, a continué de tourner : dix fois le tour de la Voie lactée depuis le début. La Terre a déjà perdu ses océans.') },
    { t: 3.55 * G, title: T('Le ciel se remplit'), text: T('Andromède est plus large que la Voie lactée elle-même vue de l’intérieur. Les deux disques commencent à se déformer : chacun soulève une marée dans l’autre.') },
    { t: 3.9 * G, title: T('Premier passage'), text: T('Les galaxies se traversent à plus de 500 km/s. Presque aucune étoile n’en heurte une autre : si le Soleil était une balle de ping-pong, sa plus proche voisine serait à plus de mille kilomètres. Les nuages de gaz, eux, se percutent et s’embrasent en nouvelles étoiles.') },
    { t: 4.4 * G, title: T('Les queues de marée'), text: T('Deux longs bras d’étoiles sont arrachés et projetés au loin. Les cœurs, freinés par leurs halos de matière noire, ralentissent, s’arrêtent et retombent l’un vers l’autre.') },
    { t: 5.3 * G, title: T('Second passage'), text: T('Les orbites des étoiles sont brouillées. Le Soleil a probablement été rejeté loin du centre ; la scène en suit un exemplaire, marqué en jaune.') },
    { t: 6.6 * G, title: T('Une seule galaxie'), text: T('Plus de disque, plus de bras : une grande galaxie elliptique, vieillissante, où les étoiles tournent en tous sens. Le ciel nocturne n’a plus de bande lumineuse, seulement une lueur diffuse vers le centre.') },
  ];
  const J_MISS = [
    { t: 0, title: T('Notre voisine'), text: T('Andromède est à 2,5 millions d’années-lumière et se rapproche à 110 km/s. Mais sa vitesse de côté est mal connue. Ce scénario lui en donne assez pour manquer la Voie lactée : selon une étude de 2025, c’est aussi probable que la collision.') },
    { t: 2.2 * G, title: T('Elle grandit quand même'), text: T('Elle s’approche, et son disque s’étale dans le ciel. La gravité du Grand Nuage de Magellan et de la galaxie du Triangle, non simulée ici, pèse dans la balance : l’une rend la fusion moins probable, l’autre plus.') },
    { t: 4.5 * G, title: T('Le frôlement'), text: T('Au plus près, elle passe à environ 580 000 années-lumière. Trop loin pour que les halos se freinent. Les deux disques restent intacts.') },
    { t: 6 * G, title: T('Elle repart'), text: T('Andromède s’éloigne. Elle reviendra peut-être, dans plus de dix milliards d’années. D’ici là, le Soleil sera devenu une naine blanche.') },
  ];
  const kit = createKit({
    title: T('La Voie lactée et Andromède'), kicker: T('Les dix prochains milliards d’années'), h1: T('Voie lactée contre Andromède'),
    intro: T('Deux galaxies de plusieurs centaines de milliards d’étoiles tombent l’une vers l’autre. Chaque point de la scène est une étoile-test dont l’orbite est calculée en direct dans la gravité des deux galaxies. Regardez de loin, ou depuis le Soleil, le ciel nocturne changer.'),
    warn: T('Distance et vitesse d’approche sont mesurées. La vitesse latérale d’Andromède ne l’est pas assez : collision ou frôlement, les deux se valent à ce jour (Sawala et al., 2025). Masses des halos et frottement sont réglés pour retrouver le calendrier classique : premier passage vers 3,9 milliards d’années, fusion vers 6.'),
    views: [{ id: 'far', label: T('Les deux galaxies'), cam: { mode: 'orbit', dist: 1000, min: 6, max: 6000, pitch: 0.5, yaw: 0.4, fov: 45 } }, { id: 'sky', label: T('Le ciel depuis le Soleil'), cam: { mode: 'look', fov: 75, pitch: 0.12 } }],
    options: [{ id: 'sc', type: 'select', label: T('Scénario'), value: 'merge', choices: [['merge', T('Collision frontale (scénario classique)')], ['miss', T('Frôlement sans fusion')]] }, { id: 'autocam', label: T('Caméra qui suit les galaxies'), value: true }],
    onOpt: (id, v, k) => { if (id === 'sc') { build(v === 'miss' ? 75 : 17); k.setJournal(v === 'miss' ? J_MISS : J_MERGE); k.sim.t = 0; } lastDist = 0; },
    onJump() { lastDist = 0; },
    t0: 0, t1: 10 * G, tStart: 0, speed0: 2.5e8 * YEAR, speedRange: [1e5 * YEAR, 1.5e9 * YEAR], speeds: [1e6, 5e6, 2e7, 5e7, 1e8, 2.5e8, 5e8, 1e9, 1.5e9].map(x => x * YEAR),
    autoRate: () => clamp((sim ? sim.sep() : 700) / 900 + 0.03, 0.05, 0.4) * G,
    moments: [{ label: T('Aujourd’hui'), t: 0 }, { label: T('Dans 2 milliards d’années'), t: 2 * G }, { label: T('Andromède emplit le ciel'), t: 3.6 * G, view: 'sky' }, { label: T('Premier passage'), t: 3.85 * G, view: 'far' }, { label: T('Les queues de marée'), t: 4.5 * G, view: 'far' }, { label: T('Second passage'), t: 5.2 * G, view: 'far' }, { label: T('Après : une elliptique'), t: 7.5 * G, view: 'far' }, { label: T('Le ciel dans 8 milliards d’années'), t: 8 * G, view: 'sky' }],
    journal: J_MERGE,
    pois: [{ id: 'mw', label: T('Voie lactée'), pos: () => pA, r: 30 }, { id: 'm31', label: T('Andromède'), pos: () => pB, r: 40 }, { id: 'sun', label: T('Soleil'), pos: (t, k) => k.view === 'sky' ? null : sunP, r: 3 }],
    clock: (t) => [(held ? sim.t * G : t) < 1e6 * YEAR ? T('Aujourd’hui') : TF('Dans {0}', [fmtDur(held ? sim.t * G : t)]), held ? T('calcul des orbites en cours…') : T('chaque point : une étoile-test')],
    data: () => {
      if (!sim) return ''; const d = sim.sep(), ds = sunP.distanceTo(pB), ang = 2 * Math.atan(22 / Math.max(ds, 22)) * 180 / Math.PI, rs = sunP.distanceTo(pA);
      return (d > 3 ? TF('Distance entre les deux cœurs : <b>{0} millions d’a.-l.</b>', [fr(d * KLY / 1000, d > 300 ? 2 : 3)]) + '<br>' + TF('Vitesse relative : <b>{0} km/s</b>', [fr(sim.relv(), 0)]) : T('Distance entre les deux cœurs : <b>confondus</b>')) + '<br>' +
        (d > 12 ? TF('Andromède dans notre ciel : <b>{0}°</b> de large (pleine Lune : 0,5°)', [fr(ang, ang < 10 ? 1 : 0)]) : T('Les deux galaxies n’en font plus qu’une')) + '<br>' + TF('Soleil : à <b>{0} a.-l.</b> du cœur de la Voie lactée (aujourd’hui 27 000)', [fr(Math.round(rs * KLY) * 1000, 0)]);
    },
    distLabel: (d) => TF('{0} millions d’a.-l.', [fr(d * KLY / 1000, d < 300 ? 2 : 1)]), bloom: [0.4, 0.5, 0.9], exposure: 1.05,
    update(t, dt, k) {
      const target = t / G; if (target < sim.t - 1e-6) sim.rewind(target);
      let n = 0; while (sim.t < target - sim.DT * 0.5 && n < 9) { sim.step(); n++; }
      held = sim.t < target - sim.DT * 2; k.hold = held;
      if (n) geo.attributes.position.needsUpdate = true;
      pA.fromArray(sim.c[0].p); pB.fromArray(sim.c[1].p); sunP.fromArray(sim.pos, sim.sunIdx * 3);
      const sep = sim.sep(); oldK = sstep(4.2, 8.5, sim.t) * (k.opt.sc === 'miss' ? 0 : 1);
      for (const m of [mat, mat2]) { m.uniforms.uOld.value = oldK; m.uniforms.uPx.value = k.renderer.getPixelRatio() * k.renderer.domElement.clientHeight / 800; }
      const sky = k.view === 'sky';
      if (sky) {
        const to = tmp.copy(sep > 6 ? pB : pA).sub(sunP).normalize(), z = to.clone().negate(), x = new THREE.Vector3().crossVectors(Z, z).normalize(), y = new THREE.Vector3().crossVectors(z, x);
        k.cam.basis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); k.cam.pos.copy(sunP).addScaledVector(Z, 0.03); k.cam.near = 0.01; k.cam.far = 1e5;
        mat.uniforms.uRef.value = 7; mat.uniforms.uLo.value = 0.3; mat.uniforms.uGain.value = 0.5; mat2.uniforms.uRef.value = 7; mat2.uniforms.uLo.value = 0.3; mat2.uniforms.uGain.value = 0.035; sunG.visible = false;
        hill.style.display = 'block'; hill.style.transform = `translateY(${clamp(k.cam.pitch * 130, -30, 400)}px)`;
      } else {
        hill.style.display = 'none'; k.cam.basis.copy(zUp);
        if (k.opt.autocam) {
          if (lastDist && Math.abs(k.cam.dist - lastDist) > 1e-6 * lastDist) { k.opt.autocam = false; const e = document.querySelector('[data-opt="autocam"]'); if (e) e.checked = false; }
          else { const want = clamp(1.25 * sep, 130, 1100); k.cam.dist = dt > 0 ? lerp(k.cam.dist, want, Math.min(1, dt * 2)) : want; lastDist = k.cam.dist; }
        } else lastDist = 0;
        k.cam.target.copy(pA).lerp(pB, 0.5); mat.uniforms.uRef.value = k.cam.dist * 0.7; mat.uniforms.uLo.value = 0.25; mat.uniforms.uGain.value = 0.26; mat2.uniforms.uRef.value = k.cam.dist * 0.7; mat2.uniforms.uLo.value = 0.25; mat2.uniforms.uGain.value = 0.009;
        sunG.visible = true; sunG.position.copy(sunP); sunG.scale.setScalar(k.cam.dist * 0.018);
      }
    },
  });
  const S = kit.scene, zUp = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), Z);
  kit.addSky(makeStars({ n: 2600, seed: 31, band: 0, bright: 0.55 }));
  const geo = new THREE.BufferGeometry();
  const mk = (size, gain) => new THREE.ShaderMaterial({ uniforms: { uRef: { value: 900 }, uLo: { value: 0.2 }, uPx: { value: 1 }, uOld: { value: 0 }, uTex: { value: glowTexture() }, uSize: { value: size }, uGain: { value: gain } }, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec3 color;uniform float uRef,uLo,uPx,uSize;varying vec3 vC;varying float vB;void main(){vC=color;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float d=max(-mv.z,1e-3);float k=uRef/d;gl_PointSize=clamp(uSize*k,uSize*.75,uSize*3.2)*uPx;vB=clamp(k*k,uLo,1.4);}`,
    fragmentShader: `uniform sampler2D uTex;uniform float uOld,uGain;varying vec3 vC;varying float vB;void main(){float a=texture2D(uTex,gl_PointCoord).a;vec3 c=mix(vC,vec3(1.,.72,.45),uOld*.75);gl_FragColor=vec4(c*a*vB*uGain,1.);}` });
  const mat = mk(2.4, 0.26), mat2 = mk(14, 0.009);
  const pts = new THREE.Points(geo, mat), pts2 = new THREE.Points(geo, mat2); pts.frustumCulled = pts2.frustumCulled = false; S.add(pts2, pts);
  const sunG = makeGlow(0xffe24a, 1, 1); sunG.material.depthTest = false; S.add(sunG);
  function build(vt) { sim = createSim(vt, 5, 1.6, 40); geo.setAttribute('position', new THREE.BufferAttribute(sim.pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(sim.col, 3)); }
  build(17);
  // silhouette d'horizon pour la vue du ciel
  const hill = document.createElement('div'); hill.style.cssText = 'position:fixed;left:0;right:0;bottom:0;height:26vh;pointer-events:none;display:none';
  hill.innerHTML = '<svg viewBox="0 0 1000 200" preserveAspectRatio="none" style="width:100%;height:100%;display:block"><path d="M0,200 L0,120 L60,96 L120,118 L190,70 L250,104 L300,92 L380,40 L440,84 L520,66 L590,108 L660,88 L720,50 L800,98 L870,80 L940,112 L1000,90 L1000,200 Z" fill="#0b0d15"/><path d="M0,200 L0,160 L140,138 L300,156 L470,128 L640,152 L820,134 L1000,150 L1000,200 Z" fill="#06070c"/></svg>';
  document.getElementById('stage').insertBefore(hill, document.getElementById('hud'));
  kit.run();
}
