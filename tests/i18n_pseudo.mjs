// Repère les textes restés en français : assemble une pseudo-langue (⟦texte⟧), parcourt le menu et chaque scène
// (tous les moments, toutes les vues), et relève tout texte affiché qui n'est pas passé par T / TF.
//   PSEUDO=1 node tools/build.mjs && node tests/i18n_pseudo.mjs [scène…]
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const exe = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
const b = await puppeteer.launch({ executablePath: exe, headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--window-size=640,360'] });
const url = 'file://' + path.join(ROOT, 'dist/pseudo.html');
const all = ['', 'chicxulub', 'theia', 'kilonova', 'cygnus', 'tde', 'fall', 'chelyabinsk', 'sl9', 'phobos', 'sun', 'andromeda', 'betelgeuse'], evs = process.argv.length > 2 ? process.argv.slice(2) : all;
const leftovers = new Map();
for (const ev of evs) {
  const p = await b.newPage(); await p.setViewport({ width: 640, height: 360 });
  await p.goto(url + '#pr=0.5&lang=en' + (ev ? '&event=' + ev : '')); await new Promise(r => setTimeout(r, 1500));
  const found = await p.evaluate(async (ev) => {
    const out = new Set(), scan = () => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n, depth = 0;
      while ((n = w.nextNode())) { const el = n.parentElement; if (!el || el.closest('script,style,template,#err,#langbox,#credits')) continue; let cur = '';
        const flush = () => { const t = cur.trim(); cur = ''; if (/[A-Za-zÀ-ÿ]{3}/.test(t) && !/^(km|min|mois|Theia|PAUSE)$/.test(t)) out.add(t.slice(0, 90)); };
        for (const ch of n.nodeValue) { if (ch === '⟦') { if (depth === 0) flush(); depth++; } else if (ch === '⟧') depth = Math.max(0, depth - 1); else if (depth === 0) cur += ch; }
        flush(); }
      for (const el of document.querySelectorAll('[aria-label],[title]')) for (const a of ['aria-label', 'title']) { const v = el.getAttribute(a); if (v && /[A-Za-zÀ-ÿ]{3}/.test(v) && !/⟦/.test(v) && !el.closest('#langbox')) out.add(a + '=' + v.slice(0, 60)); } };
    scan(); if (!ev) return [...out];
    const s = window.__sim, go = document.getElementById('go'); window.__norender = true; if (go) go.click(); scan();
    if (s && s.kit) { const k = s.kit; for (let i = 0; i < (k.cfg.moments || []).length; i++) { k.gotoMoment(i); for (let j = 0; j < 4; j++) s.step(0.2); scan(); } for (const v of k.cfg.views) { k.setView(v.id, false); s.step(0.2); scan(); }
      let n = 0; k.sim.t = k.cfg.tStart ?? k.cfg.t0; k.sim.auto = !!k.cfg.autoRate; k.sim.paused = false; while (k.sim.t < k.cfg.t1 * 0.999 && n++ < 3000) { s.step(0.25); if (n % 12 === 0) scan(); } }
    else if (s) { for (const id of ['mOrbit2', 'mRide2', 'mGround2']) { const e = document.getElementById(id); if (e) { e.click(); for (let j = 0; j < 5; j++) s.step(0.1); scan(); } }
      const sel = document.getElementById('moment2'); if (sel) for (let i = 1; i < sel.options.length; i++) { sel.value = sel.options[i].value; sel.dispatchEvent(new Event('change')); for (let j = 0; j < 5; j++) s.step(0.05); scan(); }
      let n = 0; while (n++ < 2500) { s.step(ev === 'theia' ? 1 / 30 : 0.25); if (n % 10 === 0) scan(); } }
    return [...out];
  }, ev);
  for (const t of found) { if (!leftovers.has(t)) leftovers.set(t, ev || 'menu'); }
  console.error((ev || 'menu') + ' : ' + found.length); await p.close();
}
await b.close();
for (const [t, ev] of leftovers) console.log(ev + ' | ' + t);
console.log(leftovers.size + ' texte(s) hors traduction');
