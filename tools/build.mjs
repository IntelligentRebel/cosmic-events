// Assemble le simulateur en un seul fichier : dist/index.html (GitHub Pages) et dist/cosmic-events.html (hors ligne).
//   node tools/build.mjs
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))), R = (...p) => path.join(ROOT, ...p), read = (p) => fs.readFileSync(R(p), 'utf8');
const version = read('src/version.js').match(/VERSION\s*=\s*'([^']+)'/)[1];
const r = await build({ entryPoints: [R('src/app.js')], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', alias: { 'three/addons': R('node_modules/three/examples/jsm') } });
const safe = (s) => s.replace(/<\/script/gi, '<\\/script');
// langues livrées : i18n/<langue>.json, réduites aux textes du catalogue
const dict = {}, cat = fs.existsSync(R('i18n/catalog.json')) ? JSON.parse(read('i18n/catalog.json')) : null, miss = [];
for (const f of fs.readdirSync(R('i18n')).filter(f => /^[a-z]{2}\.json$/.test(f)).sort()) {
  const lg = f.slice(0, 2), d = JSON.parse(read('i18n/' + f)), out = {};
  for (const k of cat ? Object.keys(cat) : Object.keys(d)) if (typeof d[k] === 'string' && d[k] !== '') out[k] = d[k];
  dict[lg] = out; if (cat) miss.push(lg + ' ' + (Object.keys(cat).length - Object.keys(out).length));
}
// PSEUDO=1 : une fausse langue ⟦texte⟧ à la place de l'anglais, pour repérer à l'écran ce qui échappe à la traduction (tests/i18n_pseudo.mjs)
const pseudo = !!process.env.PSEUDO; if (pseudo && cat) { dict.en = {}; for (const k of Object.keys(cat)) dict.en[k] = '⟦' + k + '⟧'; }
let html = read('src/index.html');
const put = (tag, fn) => { html = html.replace(new RegExp('\\{\\{' + tag + '(?::([^}]+))?\\}\\}', 'g'), (m, a) => fn(a)); };
put('style', () => read('src/style.css'));
put('card', (id) => 'data:image/jpeg;base64,' + fs.readFileSync(R('assets/cards', id + '.jpg')).toString('base64'));
put('tpl', (f) => read('src/' + f).trim());
put('i18n', () => 'window.I18N_DICT=' + safe(JSON.stringify(dict)) + ';');
html = html.replace('{{bundle}}', () => safe(r.outputFiles[0].text));
fs.mkdirSync(R('dist'), { recursive: true });
if (pseudo) { fs.writeFileSync(R('dist/pseudo.html'), html); console.log('dist/pseudo.html'); process.exit(0); }
fs.writeFileSync(R('dist/index.html'), html); fs.writeFileSync(R('dist/cosmic-events.html'), html);
console.log(`Cosmic Events ${version} : dist/index.html, ${(html.length / 1024 | 0)} Ko · langues : fr (source)${Object.keys(dict).length ? ', ' + Object.keys(dict).join(', ') : ''}`);
if (miss.some(m => !/ 0$/.test(m))) console.log('textes sans traduction : ' + miss.filter(m => !/ 0$/.test(m)).join(', ') + '  (node tools/i18n.mjs todo <langue>)');
