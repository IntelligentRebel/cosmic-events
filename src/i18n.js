// Langues. Le code est écrit en français : chaque texte affiché passe par T('…') ou TF('… {0} …', [valeurs]).
// Les traductions (i18n/<langue>.json, texte français -> traduction) sont glissées dans la page à l'assemblage
// (window.I18N_DICT). Langue : celle choisie au menu, sinon celle du navigateur, sinon l'anglais.
export const LANGS = [
  { id: 'en', name: 'English', locale: 'en-US' }, { id: 'zh', name: '简体中文', locale: 'zh-CN' }, { id: 'de', name: 'Deutsch', locale: 'de-DE' },
  { id: 'es', name: 'Español', locale: 'es-ES' }, { id: 'pt', name: 'Português', locale: 'pt-BR' }, { id: 'ru', name: 'Русский', locale: 'ru-RU' },
  { id: 'fr', name: 'Français', locale: 'fr-FR' }, { id: 'ja', name: '日本語', locale: 'ja-JP' }, { id: 'ko', name: '한국어', locale: 'ko-KR' },
  { id: 'it', name: 'Italiano', locale: 'it-IT' }, { id: 'pl', name: 'Polski', locale: 'pl-PL' },
];
const KEY = 'cosmic:lang', W = typeof window !== 'undefined' ? window : {}, DICT = W.I18N_DICT || null;
const ok = (id) => id === 'fr' || !!(DICT && DICT[id]);
function detect() {
  if (!DICT) return 'fr';
  const h = new URLSearchParams((W.location ? W.location.hash : '').slice(1)).get('lang'); if (h && LANGS.some(l => l.id === h) && ok(h)) return h;
  try { const s = W.localStorage && W.localStorage.getItem(KEY); if (s && LANGS.some(l => l.id === s) && ok(s)) return s; } catch (e) { /* stockage indisponible */ }
  const nav = W.navigator ? (W.navigator.languages && W.navigator.languages.length ? W.navigator.languages : [W.navigator.language]) : [];
  for (const n of nav) { const id = String(n || '').toLowerCase().split(/[-_]/)[0]; if (LANGS.some(l => l.id === id) && ok(id)) return id; }
  return ok('en') ? 'en' : 'fr';
}
const lang = detect();
export const I18N = { lang, locale: LANGS.find(l => l.id === lang).locale, dict: lang !== 'fr' && DICT ? DICT[lang] || null : null, alt: lang !== 'en' && lang !== 'fr' && DICT ? DICT.en || null : null,
  myriad: ['zh', 'ja', 'ko'].includes(lang),   // langues qui comptent par 10 000 (万) et 100 millions (億)
  available: () => LANGS.filter(l => ok(l.id)), seen: W.__i18nSeen || null,
  switchTo(id) { try { localStorage.setItem(KEY, id); } catch (e) { /* stockage indisponible */ } location.reload(); } };
if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
const look = (s) => { if (I18N.seen) I18N.seen.add(s); const d = I18N.dict; if (!d) return null; return d[s] != null ? d[s] : I18N.alt && I18N.alt[s] != null ? I18N.alt[s] : null; };
export function T(s) { const t = look(s); return t == null ? s : t; }
export function TF(s, a) { const t = look(s); return (t == null ? s : t).replace(/\{(\d+)\}/g, (m, i) => String(a[+i])); }
export const DEC = (() => { try { return (1.5).toLocaleString(I18N.locale).charAt(1) || ','; } catch (e) { return ','; } })();
// nombre écrit selon la langue
export const num = (x, d = 0) => x.toLocaleString(I18N.locale, { maximumFractionDigits: d, minimumFractionDigits: d });
// Traduit le texte fixe d'un morceau de page : un élément qui ne contient que du texte et des balises de mise en forme
// est traduit d'un bloc (son HTML est la clé), sinon on descend dans ses enfants. Les infobulles et libellés aussi.
const INLINE = new Set(['B', 'I', 'BR', 'EM', 'STRONG']);
export function translateDom(root) {
  if (!I18N.dict && !I18N.seen) return;
  const walk = (el) => {
    for (const a of ['aria-label', 'title', 'placeholder']) if (el.hasAttribute && el.hasAttribute(a)) { const v = el.getAttribute(a); if (/[A-Za-zÀ-ÿ]{2}/.test(v)) el.setAttribute(a, T(v)); }
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEMPLATE' || el.tagName === 'SVG') return;
    const kids = [...el.childNodes];
    if (kids.length && kids.every(k => k.nodeType === 3 || (k.nodeType === 1 && INLINE.has(k.tagName) && !k.id))) {
      const key = el.innerHTML.replace(/\s+/g, ' ').trim(); if (/[A-Za-zÀ-ÿ]{2}/.test(key.replace(/<[^>]+>/g, ''))) { const t = T(key); if (t !== key) el.innerHTML = t; } return;
    }
    for (const k of kids) { if (k.nodeType === 1) walk(k); else if (k.nodeType === 3) { const key = k.nodeValue.replace(/\s+/g, ' ').trim(); if (/[A-Za-zÀ-ÿ]{2}/.test(key)) { const t = T(key); if (t !== key) k.nodeValue = k.nodeValue.replace(k.nodeValue.trim(), t); } } }
  };
  walk(root);
}
