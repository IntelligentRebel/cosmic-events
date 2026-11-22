# Langues

Le simulateur est écrit en français. Chaque texte affiché passe par `T('…')`, ou `TF('… {0} …', [valeurs])` pour une phrase à trous ; le texte fixe des pages (menu, panneaux des deux scènes d'origine) est traduit d'un bloc par `translateDom`. Tout cela vit dans `src/i18n.js`.

- `catalog.json` : tous les textes à traduire, avec l'endroit du code et ce que remplit chaque `{0}`. Refait par `node tools/i18n.mjs extract` (après un `node tools/build.mjs`).
- `<langue>.json` : texte français -> traduction. Langues livrées : en, zh, de, es, pt, ru, ja, ko, it, pl (et le français, la source).
- `work/INSTRUCTIONS.md` : les consignes des traducteurs. `work/` reçoit aussi leurs fichiers de travail (non versionnés).

Au lancement, la langue est celle choisie au menu, sinon celle du navigateur, sinon l'anglais. Un texte sans traduction s'affiche en anglais, sinon en français. `#lang=ja` dans l'adresse force une langue.

## Après une modification des textes

1. `node tools/build.mjs && node tools/i18n.mjs extract` refait le catalogue ; l'assemblage dit combien de textes manquent par langue.
2. `node tools/i18n.mjs todo en zh de es pt ru ja ko it pl` écrit `work/todo_<langue>.json`.
3. Les faire traduire selon `work/INSTRUCTIONS.md` dans `work/out/<langue>/todo_<langue>.json`, contrôler avec `node tools/i18n.mjs check <langue> <fichier>`.
4. `node tools/i18n.mjs merge en zh de es pt ru ja ko it pl`, puis `node tools/build.mjs`.

Contrôle à l'écran : `PSEUDO=1 node tools/build.mjs && node tests/i18n_pseudo.mjs` remplace l'anglais par une pseudo-langue (⟦texte⟧), parcourt toutes les scènes et relève tout texte resté hors traduction.

## Ajouter une langue

L'ajouter à `LANGS` dans `src/i18n.js`, la faire traduire (`todo`, `merge`), assembler.
