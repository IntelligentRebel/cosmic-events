<p align="center"><img src="docs/screenshots/01_menu.jpg" alt="Cosmic Events" width="100%"></p>

<h1 align="center">Cosmic Events</h1>
<p align="center"><b>Seventeen cosmic events you can walk into.</b><br>
Collisions, collapses and ends of worlds, simulated in 3D in your browser, from a single file.</p>

<p align="center"><a href="https://intelligentrebel.github.io/cosmic-events/"><b>▶ Open it in your browser</b></a> · <a href="README.fr.md">Version française</a></p>

---

Stand on a sandbank in the Yucatán sixty seconds before the asteroid lands. Watch Theia fill the sky of the early Earth, then follow the debris until it becomes the Moon. Ride a fragment of comet Shoemaker-Levy 9 into Jupiter. Fall through the horizon of a black hole with every light ray bent the way general relativity says it is.

Each scene has a clock you can slow down ten thousand times or speed up to a hundred million years per second, several viewpoints (the ground, space, the incoming body itself), a data panel, and a journal that explains what you are looking at as it happens.

<p align="center"><img src="docs/screenshots/02_fall.jpg" width="49%"> <img src="docs/screenshots/03_kilonova.jpg" width="49%"></p>

## The seventeen events

| When | Event | What you see |
|---|---|---|
| 4.5 billion years ago | **Theia, the birth of the Moon** | A Mars-sized planet hits the proto-Earth; the Earth melts, a debris disc forms, the Moon assembles and recedes, up to today. |
| From 4.5 billion years ago to today | **The young Moon** | Just after the impact the Moon is fifteen times closer: a huge glowing disc over an Earth that spins in five hours. Tides push it away and lengthen the day, epoch by epoch. |
| 66 million years ago | **Last morning of the Cretaceous** | The Chicxulub impact at the distance you choose: fireball, earthquake, ejecta rain, blast wave, tsunami. |
| 1945 to 1962 | **A nuclear explosion, at the distance you choose** | Pick the yield (1 kiloton to 100 megatons) and where you stand: flash, heat, then the blast wave, from the published scaling laws. A small town around you and a city around ground zero take the damage building by building: windows, roofs, walls, trees. The 1953 Annie test houses, Hiroshima, Tsar Bomba, and Starfish Prime, detonated in space above the Pacific. |
| July 1994 | **The comet against Jupiter** | The fragments of Shoemaker-Levy 9, at their real impact times, plumes and scars. |
| 15 February 2013 | **The morning of Chelyabinsk** | An 18-metre asteroid brighter than the Sun, shadows sweeping the streets, and the blast wave two and a half minutes later. |
| 17 August 2017 | **The forge of gold** | The neutron-star merger GW170817: the last hundred seconds, the gravitational wave you can hear, the jet, the kilonova. |
| 26 September 2022 | **DART: deflecting an asteroid** | A half-tonne probe hits the moon of an asteroid at 22,000 km/h and shortens its orbit by 33 minutes. Seen from the probe, from close by and from the whole system. |
| 7,200 light-years away | **Cygnus X-1** | A massive star collapses into a black hole, then feeds on its companion; from the whole system down to the horizon. |
| In a galaxy's core | **The star torn apart** | A tidal disruption event: 52,000 fragments on their orbits, the stream, the return after 41 days. |
| General relativity | **Falling into a black hole** | Free fall to the singularity, before, at and below the horizon. |
| Some day within 100,000 years | **The night Betelgeuse explodes** | Orion with a supernova on its shoulder, shadows at night, then a thousand years of nebula. |
| In 30 million years | **The ring of Mars** | Phobos spirals in, breaks up at the Roche limit and becomes a ring. |
| In 4 billion years | **Milky Way against Andromeda** | 27,000 test stars integrated live; head-on collision or near miss, both scenarios. |
| In 7.6 billion years | **The death of the Sun** | Oceans gone, red giant filling the sky, planets engulfed, helium flash, white dwarf. |
| Fiction | **What if a black hole dislodged Saturn?** | A 300-metre black hole brakes Saturn, which falls sunward and brushes past Earth. Eleven bodies integrated step by step; two scenarios, one where the Moon is torn away. Clearly labelled as fiction. |
| Fiction | **What if a black hole carried off the Sun?** | A black hole of four solar masses passes inside the orbit of Mars: the Sun is torn away at 50 km/s and the giant planets are left starless. Three scenarios for Earth, depending on where it is that day. The starting point comes from Jason Thomson's *Black Hole* trilogy (*The Approach*, *The Reconfiguration*, *The Reckoning*), in which a black hole passes inside the orbit of Mars in 2199. Only that premise is borrowed; the parameters, the calculation and what happens to the planets are this project's. |

<p align="center"><img src="docs/screenshots/04_chicxulub.jpg" width="49%"> <img src="docs/screenshots/05_betelgeuse.jpg" width="49%"></p>
<p align="center"><img src="docs/screenshots/06_andromeda.jpg" width="49%"> <img src="docs/screenshots/07_sun.jpg" width="49%"></p>
<p align="center"><img src="docs/screenshots/08_saturn.jpg" width="70%"></p>

## What is in it

- **Free viewpoints**: from the ground, from space, and from the body that is about to hit. Change at any time, the scene does not restart.
- **Points of interest**: a “Center on…” list in every scene (the comet, the impact site, a planet…) and arrows at the edge of the screen that show where they are; one tick hides them.
- **Time under control**: keys 1 to 9, a slider, and an automatic tempo that slows down at the key moments. A list of moments jumps straight to them.
- **Honest about what is known**: each scene says what is measured or computed (trajectories, timings, orders of magnitude, the bending of light around the black holes) and what is an artistic rendering. Key figures come from published sources, listed below.
- **One file, offline**: the whole simulator is a single HTML file of about 3.7 MB, with no server, no account and no network access. Almost everything is procedural: the only image files are NASA's maps of Mars and Phobos and a NASA photograph of the Moon.
- **11 languages**: English, 简体中文, Deutsch, Español, Português, Русский, Français, 日本語, 한국어, Italiano, Polski. It follows your browser's language (English otherwise); you can change it from the menu.

## Use it

- **Online**: [intelligentrebel.github.io/cosmic-events](https://intelligentrebel.github.io/cosmic-events/), nothing to install.
- **Offline**: download `cosmic-events-<version>.html` from the [Releases](https://github.com/IntelligentRebel/cosmic-events/releases) page and double-click it. A local copy checks GitHub for a newer version when it opens (one click turns that off).

Drag to look around, mouse wheel to move closer or zoom, **1 to 9** for the speed of time, **P** or **Space** to pause, **N** for the next moment, **V** to change viewpoint, **H** to hide the panels. A graphics card helps: the black-hole scenes trace curved light rays for every pixel.

## Build from source

You need Node.js 20 or later.

```
npm ci
node tools/build.mjs        # -> dist/index.html and dist/cosmic-events.html
node tests/smoke.mjs        # end-to-end test of the scenes (needs Chrome or Chromium)
```

The source is written in French (variables, comments, texts). Every displayed text goes through `T('…')` or `TF('… {0} …', […])`; translations live in `i18n/<language>.json`, see [i18n/README.md](i18n/README.md). A new event is one module in `src/` built on the shared kit (`src/kit.js`: time, cameras, panels, journal), one line in `src/app.js` and one card in `src/index.html`.

## Sources of the key figures

- GW170817: [LIGO/Virgo discovery paper](https://arxiv.org/abs/1710.05832)
- Cygnus X-1: [Miller-Jones et al. 2021](https://arxiv.org/abs/2102.09091)
- Chelyabinsk: [Wikipedia summary of the published measurements](https://en.wikipedia.org/wiki/Chelyabinsk_meteor)
- Shoemaker-Levy 9: [NASA NSSDC impact times](https://nssdc.gsfc.nasa.gov/planetary/impact.html)
- Phobos: Black & Mittal 2015, [summary](https://www.sciencedaily.com/releases/2015/11/151124143506.htm); maps of Mars and Phobos: [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources)
- Nuclear explosion: scaling laws of Glasstone & Dolan, *The Effects of Nuclear Weapons* (1977), as summarised in Carey Sublette's Nuclear Weapons FAQ, section 5; the two test houses of [Upshot-Knothole Annie](https://en.wikipedia.org/wiki/Upshot-Knothole_Annie) (1953); [Starfish Prime](https://en.wikipedia.org/wiki/Starfish_Prime)
- DART: [Thomas et al. 2023](https://doi.org/10.1038/s41586-023-05805-2) (period change), Cheng et al. 2023 (momentum transfer), Dotto et al. 2024 (LICIACube)
- The young Moon: lunar laser ranging (3.8 cm per year), tidal rhythmites (Williams 2000 for 620 million years ago; a 3.2-billion-year-old deposit for the 13-hour day); the Moon photograph comes from [NASA 3D Resources](https://github.com/nasa/NASA-3D-Resources)
- The two black-hole flyby scenes are fiction: no published source describes them. The starting points are chosen, the rest is a Newtonian N-body integration (`src/nbody.js`)
- The Sun: [Schröder & Smith 2008](https://arxiv.org/abs/0801.4031)
- Andromeda: [Sawala et al. 2025](https://arxiv.org/abs/2408.00064)
- Betelgeuse: [Astronomy.com on the Goldberg & Bauer estimates](https://www.astronomy.com/science/when-betelgeuse-goes-supernova-what-will-it-look-like-from-earth/)

Between published milestones the scenes interpolate, and several looks (gas, plumes, city, nebulae) are staged. Found a mistake? Please open an issue.

## Credits

- Idea and direction: **Olivier Roland**. Code written with **Claude** (Anthropic).
- 3D engine: [three.js](https://threejs.org/) (MIT), see [THIRD_PARTY.md](THIRD_PARTY.md).

## License

Free software under the [GNU General Public License v3.0](LICENSE). Fork it, modify it, share it, as long as your version stays open under the same license.
