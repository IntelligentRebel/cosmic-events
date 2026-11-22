// Langues : catalogue des textes, fichiers de travail des traducteurs, contrôle et rangement des traductions.
//   node tools/i18n.mjs extract            refait i18n/catalog.json (textes du code + textes fixes des pages)
//   node tools/i18n.mjs chunks [taille]    découpe le catalogue en i18n/work/chunk-NN.json (première traduction)
//   node tools/i18n.mjs todo <langue>...   écrit i18n/work/todo_<langue>.json : ce qui manque dans cette langue
//   node tools/i18n.mjs check <langue> <fichier>   contrôle une sortie de traducteur
//   node tools/i18n.mjs merge <langue>...  range i18n/work/out/<langue>/*.json dans i18n/<langue>.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), R = (...p) => path.join(ROOT, ...p);
const readJ = (p) => JSON.parse(fs.readFileSync(R(p), 'utf8')), writeJ = (p, o) => fs.writeFileSync(R(p), JSON.stringify(o, null, 1) + '\n');
const [cmd, ...args] = process.argv.slice(2);
const ph = (s) => (s.match(/\{\d+\}/g) || []).sort().join(''), tags = (s) => (s.match(/<\/?[a-z]+[^>]*>/gi) || []).map(t => t.toLowerCase()).sort().join('');

async function extract() {
  const cat = {}, add = (k, at, ctx) => { if (!k || !/[A-Za-zÀ-ÿ]/.test(k.replace(/\{\d+\}/g, '').replace(/<[^>]+>/g, ''))) return; const e = cat[k] || (cat[k] = { at: [] }); if (e.at.length < 3 && !e.at.includes(at)) e.at.push(at); if (ctx && !e.args) e.args = ctx; };
  for (const f of fs.readdirSync(R('src')).filter(f => f.endsWith('.js')).sort()) {
    const s = fs.readFileSync(R('src', f), 'utf8'), re = /\b(TF?)\(\s*(['"`])((?:\\.|(?!\2)[^\\])*)\2/g; let m;
    while ((m = re.exec(s))) { let k; try { k = Function('return ' + m[2] + m[3] + m[2])(); } catch (e) { continue; }
      const line = s.slice(0, m.index).split('\n').length; let ctx = null;
      if (m[1] === 'TF') { const rest = s.slice(re.lastIndex, re.lastIndex + 400), a = rest.match(/^\s*,\s*\[/); if (a) { let d = 1, i = a[0].length; while (i < rest.length && d) { if (rest[i] === '[') d++; else if (rest[i] === ']') d--; i++; } ctx = rest.slice(a[0].length, i - 1).trim().slice(0, 260); } }
      add(k, f + ':' + line, ctx); }
  }
  // textes fixes des pages (menu, deux scènes d'origine) : relevés dans un navigateur, là où translateDom les lit
  const exe = process.env.CHROME || ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => fs.existsSync(p));
  if (exe && fs.existsSync(R('dist/index.html'))) {
    const puppeteer = (await import('puppeteer-core')).default;
    const b = await puppeteer.launch({ executablePath: exe, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    for (const ev of ['', 'chicxulub', 'theia']) { const p = await b.newPage(); await p.evaluateOnNewDocument(() => { window.__i18nSeen = new Set(); });
      await p.goto('file://' + R('dist/index.html') + '#lang=fr' + (ev ? '&event=' + ev : '')); await new Promise(r => setTimeout(r, 2500));
      for (const k of await p.evaluate(() => [...window.__i18nSeen])) if (!cat[k]) add(k, 'page:' + (ev || 'menu')); await p.close(); }
    await b.close();
  } else console.log('navigateur ou dist/ absent : textes fixes des pages repris du catalogue précédent');
  if (fs.existsSync(R('i18n/catalog.json'))) { const old = readJ('i18n/catalog.json'); if (!(exe && fs.existsSync(R('dist/index.html')))) for (const k in old) if (!cat[k] && old[k].at.some(a => a.startsWith('page:'))) cat[k] = old[k]; }
  writeJ('i18n/catalog.json', cat); console.log(Object.keys(cat).length + ' textes dans i18n/catalog.json');
}
const entries = (keys, cat) => keys.map(k => Object.assign({ k }, cat[k]));
function chunks() {
  const cat = readJ('i18n/catalog.json'), keys = Object.keys(cat), n = +args[0] || 120;
  for (const f of fs.readdirSync(R('i18n/work')).filter(f => /^chunk-\d+\.json$/.test(f))) fs.unlinkSync(R('i18n/work', f));
  for (let i = 0; i * n < keys.length; i++) writeJ(`i18n/work/chunk-${String(i).padStart(2, '0')}.json`, entries(keys.slice(i * n, i * n + n), cat));
  console.log(Math.ceil(keys.length / n) + ' morceaux');
}
function todo() {
  const cat = readJ('i18n/catalog.json');
  for (const lg of args) { const d = fs.existsSync(R('i18n', lg + '.json')) ? readJ(`i18n/${lg}.json`) : {}, keys = Object.keys(cat).filter(k => !d[k]); writeJ(`i18n/work/todo_${lg}.json`, entries(keys, cat)); console.log(lg + ' : ' + keys.length + ' textes à traduire'); }
}
function checkOne(lg, file, quiet) {
  const src = JSON.parse(fs.readFileSync(file, 'utf8')), cat = readJ('i18n/catalog.json'), bad = [];
  if (Array.isArray(src) || typeof src !== 'object') return ['pas un objet JSON { "texte français": "traduction" }'];
  for (const [k, v] of Object.entries(src)) {
    if (!cat[k]) { bad.push('clé inconnue (recopier le texte français à l’identique) : ' + k.slice(0, 60)); continue; }
    if (typeof v !== 'string' || !v.trim()) { bad.push('vide : ' + k.slice(0, 60)); continue; }
    if (ph(k) !== ph(v)) bad.push(`{n} différents : ${k.slice(0, 50)} -> ${v.slice(0, 50)}`);
    if (tags(k) !== tags(v)) bad.push(`balises différentes : ${k.slice(0, 50)} -> ${v.slice(0, 50)}`);
    if (/^\s/.test(k) !== /^\s/.test(v) && !['zh', 'ja'].includes(lg)) bad.push('espace de début perdu : ' + k.slice(0, 50));
  }
  const base = path.basename(file), ref = fs.existsSync(R('i18n/work', base)) ? readJ('i18n/work/' + base).map(e => e.k) : null;
  if (ref) for (const k of ref) if (!(k in src)) bad.push('manquant : ' + k.slice(0, 60));
  if (!quiet) console.log(bad.length ? bad.join('\n') + `\n${bad.length} problème(s)` : `${file} : ${Object.keys(src).length} textes, rien à signaler`);
  return bad;
}
function merge() {
  const cat = readJ('i18n/catalog.json');
  for (const lg of args) {
    const d = fs.existsSync(R('i18n', lg + '.json')) ? readJ(`i18n/${lg}.json`) : {}, dir = R('i18n/work/out', lg); let n = 0, bad = 0;
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) { const src = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')), pb = new Set(checkOne(lg, path.join(dir, f), true).map(b => b.split(' : ')[1] || '')); bad += pb.size;
      for (const [k, v] of Object.entries(src)) if (cat[k] && typeof v === 'string' && v.trim() && ph(k) === ph(v)) { d[k] = v; n++; } }
    const out = {}; for (const k of Object.keys(cat)) if (d[k]) out[k] = d[k];
    writeJ(`i18n/${lg}.json`, out); console.log(`${lg} : ${Object.keys(out).length}/${Object.keys(cat).length} textes` + (bad ? ` (${bad} à revoir : node tools/i18n.mjs check)` : ''));
  }
}
if (cmd === 'extract') await extract(); else if (cmd === 'chunks') chunks(); else if (cmd === 'todo') todo(); else if (cmd === 'merge') merge();
else if (cmd === 'check') process.exit(checkOne(args[0], args[1]).length ? 1 : 0); else console.log('extract | chunks [taille] | todo <langue>… | check <langue> <fichier> | merge <langue>…');
