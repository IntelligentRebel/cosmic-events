// Événements cosmiques : menu d'accueil, puis chargement de la scène choisie.
import { T, TF, I18N, translateDom } from './i18n.js';
import { VERSION, REPO } from './version.js';
const kitEv = (f) => () => f().then(m => m.start());
const EVENTS = {
  chicxulub: { title: T('Dernier matin du Crétacé'), load: () => import('./main.js') },
  theia: { title: T('Theia, la naissance de la Lune'), load: () => import('./theia.js') },
  kilonova: { title: T('La forge de l’or'), load: kitEv(() => import('./ev_kilonova.js')) },
  sl9: { title: T('La comète contre Jupiter'), load: kitEv(() => import('./ev_sl9.js')) },
  chelyabinsk: { title: T('Le matin de Tcheliabinsk'), load: kitEv(() => import('./ev_chelyabinsk.js')) },
  betelgeuse: { title: T('La nuit où Bételgeuse explose'), load: kitEv(() => import('./ev_betelgeuse.js')) },
  andromeda: { title: T('Voie lactée contre Andromède'), load: kitEv(() => import('./ev_andromeda.js')) },
  sun: { title: T('La mort du Soleil'), load: kitEv(() => import('./ev_sun.js')) },
  phobos: { title: T('L’anneau de Mars'), load: kitEv(() => import('./ev_phobos.js')) },
  cygnus: { title: T('Cygnus X-1'), load: kitEv(() => import('./ev_cygnus.js')) },
  tde: { title: T('L’étoile déchiquetée'), load: kitEv(() => import('./ev_tde.js')) },
  fall: { title: T('Tomber dans un trou noir'), load: kitEv(() => import('./ev_fall.js')) },
  saturn: { title: T('Et si un trou noir délogeait Saturne ?'), load: kitEv(() => import('./ev_saturn.js')) },
  rogue: { title: T('Et si un trou noir emportait le Soleil ?'), load: kitEv(() => import('./ev_rogue.js')) },
  nuke: { title: T('Une explosion nucléaire, à votre distance'), load: kitEv(() => import('./ev_nuke.js')) },
  dart: { title: T('DART : dévier un astéroïde'), load: kitEv(() => import('./ev_dart.js')) },
  moon: { title: T('La jeune Lune'), load: kitEv(() => import('./ev_moon.js')) },
};
const params = new URLSearchParams(location.hash.slice(1)), $ = (id) => document.getElementById(id);
const APP = T('Événements cosmiques');
document.title = APP;
translateDom($('menu'));
// choix de la langue : la page se recharge
{ const s = document.createElement('select'); s.setAttribute('aria-label', 'Language');
  for (const l of I18N.available()) { const o = new Option(l.name, l.id); o.selected = l.id === I18N.lang; s.add(o); }
  s.addEventListener('change', () => I18N.switchTo(s.value)); if (s.options.length > 1) $('langbox').appendChild(s); }
$('credits').innerHTML = `${APP} ${VERSION} · <a href="https://github.com/${REPO}" target="_blank" rel="noopener">GitHub</a>`;
// Une copie locale regarde si GitHub propose une version plus récente (désactivable d'un clic).
const newer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
function checkUpdate() {
  let off = false; try { off = localStorage.getItem('cosmic:noupdate') === '1'; } catch (e) { /* stockage indisponible */ }
  if (off || navigator.webdriver || location.protocol !== 'file:' || params.has('event') || typeof fetch !== 'function') return;
  fetch(`https://api.github.com/repos/${REPO}/releases/latest`).then(r => r.ok ? r.json() : null).then(j => {
    const v = j && j.tag_name ? String(j.tag_name).replace(/^v/, '') : ''; if (!v || !newer(v, VERSION)) return;
    const u = $('update'); u.style.display = 'block';
    u.innerHTML = `${TF('La version {0} est disponible (vous avez la {1}).', [v, VERSION])} <a href="${j.html_url}" target="_blank" rel="noopener">${T('La télécharger')}</a> · <a href="#" id="noupd">${T('Ne plus vérifier')}</a>`;
    $('noupd').addEventListener('click', (e) => { e.preventDefault(); try { localStorage.setItem('cosmic:noupdate', '1'); } catch (_) { /* stockage indisponible */ } u.style.display = 'none'; });
  }).catch(() => { /* hors ligne : rien à faire */ });
}
checkUpdate();
let launched = false;
async function launch(id) {
  const ev = EVENTS[id]; if (!ev || launched) return; launched = true;
  $('menu').remove();
  const tpl = $('tpl-' + id);
  if (tpl) { $('stage').appendChild(tpl.content.cloneNode(true)); translateDom($('stage')); }
  document.title = ev.title + ' · ' + APP;
  document.body.classList.add('in-event');
  const toMenu = () => { try { if (document.exitPointerLock) document.exitPointerLock(); history.replaceState(null, '', location.pathname + location.search); } catch (_) { location.hash = ''; } location.reload(); };
  const back = $('menuBtn'); if (back) back.addEventListener('click', toMenu);
  // retour au menu, toujours visible en haut à gauche
  const bm = document.createElement('button'); bm.id = 'backMenu'; bm.textContent = '← ' + T('Menu'); bm.title = T('Retour au menu'); bm.addEventListener('click', toMenu); document.body.appendChild(bm);
  await ev.load();
  document.body.dataset.ready = id;
}
for (const card of document.querySelectorAll('[data-event]')) card.addEventListener('click', () => launch(card.dataset.event));
if (params.has('event')) launch(params.get('event'));
