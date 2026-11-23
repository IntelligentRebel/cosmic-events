// Andromède : en lecture au tempo automatique, le calcul ne doit jamais revenir à un point de reprise, quelle que soit la cadence d'affichage.
// (Un calcul en avance sur l'horloge était pris pour un retour en arrière : la scène rejouait sans cesse le même passage à 60 images par seconde et plus.)
import puppeteer from 'puppeteer-core';
import path from 'path';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'] });
const p = await b.newPage(); await p.setViewport({ width: 640, height: 360 });
await p.goto('file://' + path.resolve(process.env.FILE || 'dist/index.html') + '#pr=0.5&lang=fr&event=andromeda&m=0'); await p.waitForFunction(() => window.__sim && window.__sim.kit, { timeout: 120000 }); await new Promise(r => setTimeout(r, 1500));
const out = await p.evaluate(() => {
  const s = window.__sim, k = s.kit, G = 3.15576e16, go = document.getElementById('go'); if (go) go.click(); k.sim.paused = false; window.__norender = true; const o = [];
  for (const fps of [30, 60, 144, 240]) {
    k.sim.t = 3.3 * G; for (let i = 0; i < 4000; i++) { s.step(1 / fps); if (!k.hold && i > 5) break; }
    k.sim.auto = true; window.__rw = 0; let n = 0; while (k.sim.t < 6.5 * G && n++ < 80000) s.step(1 / fps);
    o.push({ fps, retours: window.__rw, images: n, fini: k.sim.t >= 6.5 * G });
  }
  return o;
});
let bad = 0; for (const r of out) { const ok = r.retours === 0 && r.fini; if (!ok) bad++; console.log((ok ? 'OK  ' : 'FAIL') + ` ${r.fps} images/s : ${r.retours} retour(s) en arrière, ${r.images} images`); }
await b.close(); process.exit(bad ? 1 : 0);
