// Essai de bout en bout des quinze scènes du socle : lecture complète au tempo automatique, tous les moments, toutes les vues,
// le clavier, le retour au menu. Aucune erreur de console, aucun nombre non fini.   node tests/smoke.mjs [scène…]   (LANG_ID=ja pour une autre langue)
import puppeteer from 'puppeteer-core';
import path from 'path';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'] });
const url = 'file://' + path.resolve(process.env.FILE || 'dist/index.html');
const evs = process.argv.length > 2 ? process.argv.slice(2) : ['kilonova', 'cygnus', 'tde', 'fall', 'chelyabinsk', 'sl9', 'phobos', 'sun', 'andromeda', 'betelgeuse', 'saturn', 'rogue', 'nuke', 'dart', 'moon'];
let bad = 0;
for (const ev of evs) {
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 360 }); const errs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text().slice(0, 300)); }); p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto(url + '#pr=0.5&lang=' + (process.env.LANG_ID || 'fr')); await new Promise(r => setTimeout(r, 400));
  await p.click(`[data-event="${ev}"]`); await new Promise(r => setTimeout(r, 1500)); await p.waitForFunction(() => window.__sim && window.__sim.kit, { timeout: 120000 }); await new Promise(r => setTimeout(r, 800));
  const out = await p.evaluate(async () => {
    const s = window.__sim, k = s.kit, $ = id => document.getElementById(id), o = []; const fin = () => { const c = k.camera.position; return isFinite(c.x + c.y + c.z) && isFinite(k.sim.t); };
    o.push('titre=' + document.title.slice(0, 30) + ' hud caché=' + $('hud').classList.contains('hidden'));
    $('go').click(); window.__norender = true; let nan = '';
    // lecture complète au tempo automatique (bornée)
    let n = 0; const t0 = k.sim.t; while (k.sim.t < k.cfg.t1 * 0.999 && n++ < 6000) { s.step(0.1); if (!fin() && !nan) nan = 'NaN@' + k.sim.t; }
    o.push(`auto: ${n} pas, fin=${k.sim.t >= k.cfg.t1 * 0.999} horloge="${$('clock').textContent}" journal="${($('journal').firstChild || {}).textContent ? $('journal').firstChild.textContent.slice(0, 28) : '-'}"`);
    // chaque moment, chaque vue, avec rendu réel
    window.__norender = false; const ms = k.cfg.moments || []; let rendered = 0;
    for (let i = 0; i < ms.length; i++) { k.gotoMoment(i); for (let j = 0; j < 3; j++) s.step(0.05); rendered++; if (!fin() && !nan) nan = 'NaN moment ' + i; }
    for (const v of k.cfg.views) { k.setView(v.id, false); for (let j = 0; j < 3; j++) s.step(0.05); if (!fin() && !nan) nan = 'NaN vue ' + v.id; }
    // clavier : vitesses, pause, vue
    for (const key of ['1', '5', '9', '+', '-', 'p', 'p', 'v', 'n', 'r', 'h', 'h']) window.dispatchEvent(new KeyboardEvent('keydown', { key })); s.step(0.05);
    o.push(`moments=${ms.length} vues=${k.cfg.views.length} vitesse="${$('speed').textContent}" ${nan || 'nombres finis'} err="${($('err').style.display === 'block' ? $('err').textContent : '')}"`);
    return o;
  });
  const menuBack = await (async () => { const nav = p.waitForNavigation({ timeout: 8000 }).catch(() => null); await p.evaluate(() => document.getElementById('menuBtn').click()); await nav; for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 500)); try { const n = await p.$$eval('[data-event]', e => e.length); if (n) return n; } catch (e) { /* la page est encore en train de se recharger */ } } return 0; })();
  const ok = !errs.length && !/NaN|err="[^"]/.test(out.join(' ')) && menuBack === 17; if (!ok) bad++;
  console.log((ok ? 'OK  ' : 'FAIL') + ' ' + ev + '\n   ' + out.join('\n   ') + '\n   retour menu: ' + menuBack + ' cartes' + (errs.length ? '\n   ERR ' + [...new Set(errs)].slice(0, 6).join('\n   ERR ') : ''));
  await p.close();
}
await b.close(); console.log(bad ? bad + ' scène(s) en échec' : 'toutes les scènes passent');
