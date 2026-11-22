# Translating Cosmic Events

Cosmic Events (« Événements cosmiques ») is a free, browser-based simulator: fourteen explorable 3D scenes of cosmic events (the Moon-forming impact of Theia, the Chicxulub asteroid, comet Shoemaker-Levy 9 hitting Jupiter, the Chelyabinsk meteor, the neutron-star merger GW170817, the black hole Cygnus X-1, a star torn apart by a black hole, falling into a black hole, Betelgeuse going supernova, Phobos becoming a ring around Mars, the Milky Way–Andromeda encounter, the death of the Sun, and two clearly labelled fictions: a small black hole dislodging Saturn, a heavier one carrying off the Sun). Each scene has a clock, a data panel, a journal that explains what is happening, and several viewpoints. The audience is the curious general public. The source language is **French**. You translate into one target language.

## Input

`chunk-NN.json` (or `todo_<lang>.json`) is an array of entries:

- `k`: the French source text. It is also the dictionary key: **copy it unchanged** as the key of your output.
- `at`: where it appears (`file:line`, or `page:menu` / `page:theia` / `page:chicxulub` for fixed page text). The file name tells you the scene: `main.js` = Chicxulub, `theia.js` = Theia, `ev_kilonova.js` = neutron stars, `ev_cygnus.js` = Cygnus X-1, `ev_tde.js` = star torn apart, `ev_fall.js` = falling into a black hole, `ev_chelyabinsk.js`, `ev_sl9.js` = Shoemaker-Levy 9, `ev_phobos.js`, `ev_sun.js`, `ev_andromeda.js`, `ev_betelgeuse.js`, `ev_saturn.js` = the Saturn fiction, `ev_rogue.js` = the Sun carried off, `kit.js` = shared interface.
- `args`: present when `k` has placeholders `{0}`, `{1}`… : the code expressions that fill them, in order. Use it to understand what goes there (a number, a duration such as "3.5 days", a distance, a name, another translated phrase).

## Output

Write `out/<lang>/chunk-NN.json` (same file name as the input): one JSON object `{ "French source": "translation", … }` with **every** key of the chunk, keys copied byte for byte (including typographic apostrophes `’`, non-breaking characters and leading/trailing spaces). Valid JSON (escape `"` and `\`), UTF-8, no comments.

After each file, run the checker and fix what it reports until it says "rien à signaler":

```
node tools/i18n.mjs check <lang> i18n/work/out/<lang>/chunk-NN.json
```

## Rules

1. **Placeholders** `{0}`, `{1}`… must all appear in the translation, each exactly as often as in the source. Reorder them freely to fit your grammar.
2. **HTML**: keep every tag (`<b>`, `</b>`, `<br>`, `<i>`) exactly, around the equivalent words. Keep symbols (`·`, `×`, `÷`, `−`, `→`, `%`, `°`, `′`, `+`).
3. **Fragments**: some entries are pieces glued together by the code (they start or end with a space, a comma or `<br>`): keep the leading and trailing spaces and punctuation so the pieces still join. In Chinese and Japanese, drop spaces that would be wrong between words.
4. **Numbers written inside the text** are facts: never change their value. Adapt only their notation to your language (French `384 400 km`, `0,53°`, `3,8 cm` → English `384,400 km`, `0.53°`, `3.8 cm`; German `384.400 km`, `0,53°`…). French puts a space before `%`, `:`, `;`, `?`, `!`: use your language's typography. Numbers that arrive through placeholders are already formatted for your language.
5. **Units and abbreviations**: French `UA` = astronomical unit (English `AU`, German `AE`, Spanish/Italian/Portuguese `UA`, Russian `а. е.`, Chinese `天文单位`, Japanese `au`/`天文単位`, Korean `AU`, Polish `au`/`j.a.`); `a.-l.` / `années-lumière` = light-years (`ly`, `Lj`…); `Ma` = million years, `Ga` = billion years (use your language's usual short form, e.g. English `Myr` / `Gyr`); `j` = days, `h`, `min`, `s`, `ans` = years, `mois` = months, `tours par seconde` = revolutions per second. Unit entries such as `{0} jours`, `{0} ans`, `{0} millions d’années` receive any number (often a decimal like 3.5): pick the form that reads correctly after a decimal number (in Russian and Polish, the genitive form used after fractions, or an abbreviation such as `сут`, `лет`, `dni`, `lat`). `km`, `m`, `cm`, `kg`, `K`, `Hz`, `km/s` stay as they are (use your script's usual form if it differs, e.g. Russian `км`).
6. **"Milliard"** is 10⁹: English "billion", German "Milliarde", Spanish "mil millones", Portuguese (Brazil) "bilhão", Italian "miliardo", Russian "миллиард", Polish "miliard", Chinese "十亿" (so 4,5 milliards d’années = 45亿年), Japanese 45億年, Korean 45억 년. Convert carefully in Chinese, Japanese and Korean, which count in 万/億 (10⁴/10⁸): `66 millions d’années` = 6600万年, `{0} millions de km` must stay a multiple of a million (`{0}百万km` / `{0} 百万千米` / `{0}백만 km`), never silently change the magnitude.
7. **Proper nouns**: use the names your language uses in astronomy (Theia, Chicxulub, Yucatán, Shoemaker-Levy 9, Chelyabinsk/Tcheliabinsk → your transliteration, Betelgeuse, Cygnus X-1, Sagittarius A*, M87*, Phobos, Andromeda, Milky Way, Orion, Rigel, Sirius, GW170817, LIGO, Virgo, Fermi, Hubble, Galileo, NASA…). People's names stay in Latin script except where your language has a fixed transliteration. `TU` / `temps universel` = Universal Time (UT).
8. **Keyboard and mouse**: the game reads physical keys, so French `ZQSD` is **`WASD`** in every other language. `Maj` = Shift, `Espace` = Space, `Échap` = Esc, `molette` = mouse wheel, `clic droit` = right click, `glisser` = drag. The single letters `N`, `P`, `R`, `H`, `V`, `F`, `C`, `M` and the digits are key names: leave them.
9. **Tone**: clear popular science, concrete, calm, never sensational, no exclamation marks that are not in the source. The French speaks to the reader with "vous": use the address most natural for a science app in your language (German "du" or neutral forms are fine, Spanish "tú", Italian "tu", Portuguese "você", Russian "вы", Polish neutral/"ty" forms, Japanese です/ます, Korean 합니다/해요 style, Chinese 你). Keep sentences as short as the source: these texts sit in small panels. Do not add explanations, do not drop caveats ("mise en scène" = an artistic rendering / staged for illustration, as opposed to measured or computed).
10. **Short labels** (buttons, view names, moments in a list) must stay short.
11. **The title** « Événements cosmiques » is the app's name: English "Cosmic Events"; translate it naturally in your language. Scene titles are evocative: keep them evocative ("La forge de l’or" = the forge where gold is made; "Dernier matin du Crétacé" = last morning of the Cretaceous).
12. `T − {0}` / `T + {0}` is a countdown clock (time before/after the event): keep the letter T and the signs. `Dans {0}` = "In {0}" (time from now, e.g. "In 3.5 billion years"). `Aujourd’hui + {0}` = "Today + {0}".
13. Do not leave French words, do not add notes, do not skip entries.

Keep a glossary `out/<lang>/glossary.md` of your choices for recurring terms (event names, "onde de choc", "éjectas", "disque d’accrétion", "horizon", "rayon de marée", "étoile à neutrons", "naine blanche", "géante rouge", view names…) and re-read it before each chunk, so the same term is always translated the same way.

Process the chunks in order, one at a time. Work only inside `i18n/work/out/<lang>/`; do not modify any other file.
