# Submission pack — Space Mission Design Game (Project Bobr)

Everything the form asks for, in English and ready to paste. The last section is a
checklist of the fields that still need a human decision (links, video, team line-up).

* form field → §1
* short description → §2
* project details (the five "tell us about the project" questions) → §3
* NASA data → §4
* additional tools and resources → §5
* use of generative AI → §6
* demo deck → §7
* demo video script → §8
* what is left to submit → §9

## 1. Fields

| Field | Value |
|-------|-------|
| Project title | Space Mission Design Game |
| Team name | Project Bobr |
| Challenge | Space Mission Design Game |
| Short description | §2 (≈180 words) |
| Project details | §3 |
| NASA data and resources | §4 |
| Other tools / libraries / data | §5 |
| Generative AI disclosure | §6 |
| Demo / slides | `demo/slides.html` — `https://bobrovicmihail86-hub.github.io/NASA_Challenge_2026/demo/slides.html` |
| Live project | `https://bobrovicmihail86-hub.github.io/NASA_Challenge_2026/` |
| Source code | `https://github.com/bobrovicmihail86-hub/NASA_Challenge_2026` |
| Rulebook | `https://github.com/bobrovicmihail86-hub/NASA_Challenge_2026/blob/main/docs/RULES_V15.md` |

## 2. Short description

> Space Mission Design Game turns mission design into a playable fifteen-step campaign. You take an
> objective — a target point, a science goal, a deadline and a treasury — and have to return a spacecraft
> that can be built, launched and operated: launcher, attitude control, power, thermal, onboard recorder,
> instruments, antennas, ground stations. Every card immediately recalculates the whole chain: mass against
> the launcher's payload, power against the operating mode, data against the downlink, money against the
> deadline. The output is not a grade but a probability: success chance, science, points, rating at risk.
> A mission is not a single dice roll — after acceptance it flies for one to four steps, each a
> communication session with incidents, data recovery and science. Four roles (manager, engineer,
> scientist, flight controller) split the decisions, so a team has to negotiate. The same rulebook exists
> as a printable tabletop edition — 90 cards, an A3 board, tokens — for classrooms without computers.
> Balance is calibrated by Monte Carlo: 150 games × 10 missions, average rating 81.4, failure share 32.6%.

## 3. Project details

### 3.1 What the project does

The game puts a student in the seat of a mission designer and keeps them there for fifteen steps.

An objective is a target point (low Earth orbit, geostationary, the Moon, Mars, the asteroid belt, deep
space), a science goal, a deadline and a treasury. The answer has to be a spacecraft that can actually be
built, launched and operated: launcher, attitude control, structure and modules, redundant units, power
sources, thermal control, onboard recorder, instruments, antennas, buffer and ground facilities.
A build is described by six numbers that fight over the same margin — launch mass, power, data volume,
downlink, money and time — plus a failure probability and a deterministic science value.

There is no "correct" build. The reference builds for the same objective range from a cheap low-risk
design with a poor science return to an ambitious one that is one subsystem away from failure, and both
are legitimate answers to the same contract.

### 3.2 How it works

One engine, `data/engine.js`, is a set of pure functions with no dependencies. Every screen — browser,
command-line validator, Monte Carlo — calls the same functions, so a rule can never mean two different
things in two places.

* **Role HQ** (`app/index.html`) — four roles with separate signatures (manager, engineer, scientist,
  flight controller), SVG build graphs, a consultant that lists blockers and risks, chat and notes.
* **Calculator** (`calc/index.html`) — mission → trajectory → build → checks → success probability,
  science, rating delta. This is the teaching screen: every number is visible and explained by a tooltip.
* **Campaign v1.5** (`calc/campaign.html`) — fifteen steps (12 or 18 optional) over MCC levels, the
  factory, the school, R&D and competence levels, tests and stand runs, ground contracts, flights and
  acceptance, then the final score.
* **Team room** (`server/` + `app/lobby.html` + `app/play.html`) — up to four players, live updates over
  server-sent events, archive and leaderboard. Node 24, no dependencies, no keys.
* **Tabletop edition** (`print/`) — 90 cards at 63×88 mm, an A3 board, tokens and A4 sheets, generated
  from the same data files, so paper and screen cannot drift apart.

The flight phase is the part that matters most. Acceptance rolls the channel probability **once**; after
that the mission flies — two steps for the Moon, three for Mars and the belt, four for deep space — and
each step is a communication session: channel load against MCC capacity, incidents, data recovery
(75% floor from the onboard recorder), science. Flying longer is not a second chance at the dice; it costs
time, and time is the treasury. Flight events are checked against the build rather than chosen by the
player: the onboard recorder answers a solar flare, a duplicated attitude-control unit answers a
micrometeorite, a trained school answers a software error.

### 3.3 Who benefits

* **Students and teachers** — a full mission-design loop that fits a lesson. The campaign length switches
  between 12, 15 and 18 steps; the calculator alone is a ten-minute exercise.
* **Clubs, museums, science circles** — the tabletop edition needs no computers, no accounts and no
  network: print, cut, play. One facilitator can run a room with the chat-GM tool.
* **Small teams that want a design-review warm-up** — the consultant and the checks work like a review:
  they name the blocker and the risk instead of giving a score.
* **Anyone who wants to look inside the model** — the engine, the numbers and the balance report are in the
  repository; `node tools/check.mjs 150` reproduces the calibration in a couple of minutes.

### 3.4 How NASA data is used

The 27 mission cards are real missions, and each one carries its launch year, agency, target point, data
type, required equipment, historical outcome and a note explaining which rule the real outcome
demonstrates. The full annotated list of sources is in §4. The design constraints — payload against
target point, power per operating mode, data volume against downlink, session windows against MCC
capacity — follow the challenge brief and the public mission descriptions. No NASA imagery, logo or flag
is redistributed; the art is original and generated locally.

### 3.5 Tools, languages and libraries

* HTML, CSS and vanilla JavaScript. No framework, no bundler, no runtime dependencies — the game runs from
  `file://` and from GitHub Pages.
* Node 24 (ESM, built-in modules only) for the network server, the validators and the Monte Carlo.
* Server-sent events for the live team room; SVG for the build graphs; `localStorage` plus JSON
  export/import for saves and for shareable campaign seeds.
* ComfyUI with the Z-Image Turbo model and a Qwen3-4B text encoder for the illustrations; the prompts are
  in `art/prompts.json` (cards) and `demo/prompts.json` (deck backgrounds).
* Git and GitHub Pages for versioning and hosting; the repository ships validators (`check`, `dom-check`,
  `lang-check`, `app-smoke`, `play-smoke`, `server-smoke`, `session selftest`) instead of a CI service.

### 3.6 What is creative about it

* **The card is the calculation.** There is no spreadsheet next to the game: playing a card recalculates
  mass, power, data, money, success probability, science, points and rating in one pass.
* **Failure is a property of the build, not a dice throw.** The interface shows which missing subsystem
  caused which incident, so a failed flight still teaches something.
* **A flight is a phase, not an instant.** One acceptance roll, then sessions that cost time and recover
  data — the trade-off moves from luck to scheduling.
* **Two editions from one source of truth.** The printed deck and the browser read the same data files,
  so a rule change cannot drift between paper and screen.
* **Public balance.** Targets, reference builds and the Monte Carlo are part of the repository: anyone can
  re-run the calibration and argue with the numbers.
* **History as a rules test.** Each real mission outcome is annotated with the rule it demonstrates —
  Luna 3 lost frames are `D_ratio < 1`, Hubble's data stream needs a wide channel and a buffer.

### 3.7 Obstacles and what we changed

* *A design loop that fits fifteen steps without becoming a spreadsheet.* Every card states its effect on
  the resource chain; the arithmetic lives in the engine, the explanations live in tooltips.
* *Balance.* Early builds were either trivial or impossible. We set the targets first — average rating
  above 40, failure share 15–35%, launcher duplication below 40%, success probability 0.68–0.72 — and then
  tuned until the simulation sat in the corridor (now 81.4 / 32.6% / 30.1% / 0.687 over 150 games × 10
  missions).
* *A flight that is not another dice roll.* This became the v1.5 redesign: one acceptance roll, sessions
  with channel load, a data-recovery floor, events checked against the build.
* *Paper and screen telling the same story.* The print sheets are generated from `data/cards.js`; the
  validators fail the build if a deck renders empty or shows `undefined`.
* *Honest limits.* The Monte Carlo does not model hiring, salaries or facility upgrades, and the art
  pipeline needs a local ComfyUI — without it the cards print with blueprint placeholders. Both are
  stated in `README.md` rather than hidden.

### 3.8 What comes next

Scenario packs built from further mission records, a teacher dashboard for a classroom of teams, a
translated rulebook, and a printable campaign log so a tabletop group can carry a programme across
several sessions.

## 4. NASA data

### 4.1 Paste-ready paragraph for the "NASA data" field

> The public NASA mission record is the factual layer of the game. Each of the 27 mission cards is a real
> mission — Apollo 11, Hubble, James Webb, Cassini–Huygens, Viking 1, Mars Global Surveyor, Mars Pathfinder,
> InSight, Perseverance with Ingenuity, OSIRIS-REx, New Horizons, Voyager 2, Galileo, GRACE, GOES-R — plus
> the partner and non-NASA missions that make the deck honest about failure (Luna 3, Luna 9, Mars 3, Mars 96,
> Phobos-Grunt, Beagle 2, Chang'e 4/5, Hayabusa 2, BepiColombo, Spektr-RG). For every card we took the launch
> year, the operating agency, the target point, the type of data returned, the equipment the payload implies
> and the historical outcome, and annotated the outcome with the rule it demonstrates: Luna 3's lost frames
> became a data-ratio loss, Hubble's data stream became a channel-and-buffer requirement, Phobos-Grunt became
> a failure that no amount of science can pay for. The published mission descriptions and NASA's *Basics of
> Space Flight* supplied the constraint logic — payload against target point, power per operating mode, data
> volume against downlink. No NASA imagery, logo or flag is redistributed; all artwork is original.

### 4.2 Mission records used for the 27 cards

| Mission on the card | Agency (as printed) | Source page |
|---------------------|---------------------|-------------|
| Apollo 11 | USA | <https://www.nasa.gov/mission/apollo-11/> |
| Hubble | USA/ESA | <https://science.nasa.gov/mission/hubble/> |
| James Webb | USA/ESA/CSA | <https://science.nasa.gov/mission/webb/> |
| Cassini–Huygens | USA/ESA | <https://science.nasa.gov/mission/cassini/> |
| Viking 1 | USA | <https://science.nasa.gov/mission/viking/> |
| Mars Global Surveyor | USA | <https://science.nasa.gov/mission/mars-global-surveyor/> |
| Mars Pathfinder | USA | <https://science.nasa.gov/mission/mars-pathfinder/> |
| InSight | USA | <https://science.nasa.gov/mission/insight/> |
| Perseverance + Ingenuity | USA | <https://science.nasa.gov/mission/mars-2020-perseverance/> |
| OSIRIS-REx | USA | <https://science.nasa.gov/mission/osiris-rex/> |
| New Horizons | USA | <https://science.nasa.gov/mission/new-horizons/> |
| Voyager 2 | USA | <https://science.nasa.gov/mission/voyager/> |
| Galileo | USA | <https://science.nasa.gov/mission/galileo/> |
| GRACE | USA/Germany | <https://science.nasa.gov/mission/grace/> |
| GOES-R | USA (NOAA-operated) | <https://science.nasa.gov/mission/goes/> |

Also useful as the entry points to the same record, and the honest way to broaden the answer:

* NASA Science mission directory — <https://science.nasa.gov/missions/>
* NSSDC planetary data (mission-by-mission fact sheets) — <https://nssdc.gsfc.nasa.gov/planetary/>
* NSSDC master catalog (launch dates, orbits, spacecraft) — <https://nssdc.gsfc.nasa.gov/nmc/>
* *Basics of Space Flight* (trajectories, environments, operations) — <https://science.nasa.gov/learn/basics-of-space-flight/>

### 4.3 The challenge brief itself

* Challenge page — <https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/>
* Space Apps resources — <https://www.spaceappschallenge.org/resources/>

### 4.4 Partner agency pages for the non-NASA missions

* Cassini–Huygens (ESA) — <https://www.esa.int/Science_Exploration/Space_Science/Cassini-Huygens>
* BepiColombo (ESA/JAXA) — <https://www.esa.int/Science_Exploration/Space_Science/BepiColombo>
* Hayabusa 2 (JAXA) — <https://global.jaxa.jp/projects/sat/hayabusa2/>

The Soviet, Russian and Chinese cards (Luna 3/9/16, Mars 3, Mars 96, Phobos-Grunt, Spektr-RG, Chang'e 4/5)
are cited by launch year and agency only: stable English-language mission pages for those programmes change
too often to be linked from a submission that has to stay valid.

### 4.5 What we deliberately did not use

* No NASA image, logo, patch or flag is used in the game, the deck or the print sheets — the rules forbid
  it and the art is original.
* No NASA dataset is processed at run time: the game is a design simulator, not a data pipeline. The
  mission record is used as the factual layer of the cards, which is what the brief asks for.
* The CSA games list and the "Webb — Build It Yourself" page from our first draft are not part of the
  project; they belong to the "other resources" field at most, not to the NASA-data answer.

## 5. Other tools and resources

* Node.js 24 — runtime for the server, the validators and the Monte Carlo — <https://nodejs.org/>
* ComfyUI — the local image pipeline for the card and slide art — <https://www.comfy.org/>
* Z-Image Turbo (model card) — <https://huggingface.co/Tongyi-MAI/Z-Image-Turbo>
* GitHub Pages — hosting — <https://pages.github.com/>

The game itself uses no third-party library at run time: no framework, no web fonts, no CDN, no analytics.
Everything except the generated artwork is hand-written and in the repository.

## 6. Use of generative AI

Paste-ready:

> Generative AI was used for illustrations only, and it is labelled everywhere it appears. The 99 card
> images and the 7 slide backgrounds were produced locally with ComfyUI (Z-Image Turbo model, Qwen3-4B text
> encoder) from prompts written by the team and stored in `art/prompts.json` and `demo/prompts.json`; every
> generated image carries a visible AI mark, and the demo deck states it on each slide. Nothing else is
> AI-generated: the game code (`data/engine.js`, `data/cards.js`, `data/missions.js`, the pages, the server,
> the validators), the rulebook `docs/RULES_V15.md`, all card texts and every word of this submission were
> written by the team. No model is called at run time — given a seed, a campaign is deterministic. No NASA
> image, logo, patch or flag is used; the artwork is original and depicts no real insignia.

If the form wants a shorter version:

> AI (ComfyUI + Z-Image Turbo, local) generated the 99 card illustrations and 7 slide backgrounds from our
> own prompts; each is marked as AI-generated. All code, rules, card texts and submission texts are
> human-written, and the game calls no model at run time.

## 7. Demo deck

`demo/slides.html` — seven 16:9 slides: title, problem, two editions, how a flight plays, the four screens a
judge can click, the calibration table, and data/stack/disclosure. English, printable to PDF.

```bash
node tools/gen-slides.mjs            # regenerates the seven backgrounds (needs ComfyUI)
node tools/gen-slides.mjs --dry-run  # prints the workflow and the prompt without rendering
```

Print to PDF: browser → Print → layout landscape, margins **none**, background graphics **on**, one slide per
page. The deck is the fallback if the video is not ready; it also works as the submission attachments.

## 8. Demo video script (2:40)

Screen recording of the browser at 1280×720, voice-over optional but recommended; every beat names what the
viewer should look at, so a silent cut still works with captions.

| Time | Beat | On screen |
|------|------|-----------|
| 0:00–0:15 | Hook: "A mission starts as one sentence. It ends as a thousand trade-offs." | slide 1, then cut to the calculator |
| 0:15–0:45 | The chain: pick a mission, pick a trajectory, show mass / power / data / downlink changing together | `calc/index.html` |
| 0:45–1:25 | The trade-off: swap the launcher for a cheaper one → payload shortfall → the consultant names the blocker; add the buffer instead of the second antenna → the data ratio drops but the money holds | build panel + checks + verdict |
| 1:25–2:00 | Flight: launch, two sessions, an incident that the build absorbs, acceptance, the score | `calc/campaign.html` |
| 2:00–2:20 | Team: two roles sign the same build, the room updates live | `app/lobby.html` → `app/play.html` |
| 2:20–2:35 | Tabletop: the same cards on paper | `print/cards.html` |
| 2:35–2:50 | Close: 150 games × 10 missions — 81.4 rating, 32.6% failures, 0.687 success probability; repository and live link | slide 6 + slide 7 |

Do not read the UI aloud; say what the number *means*. One cut per beat, no zooming during text entry.

## 9. What is left to submit

* [ ] Project URL — point it at the live Pages site `https://bobrovicmihail86-hub.github.io/NASA_Challenge_2026/`,
      not at `…/tree/main`; keep the repository in the source-code field (§1).
* [ ] Demo field — `demo/slides.html` on Pages, or the video if it is recorded first.
* [ ] Short description — §2, trim to the field limit if it is counted in characters rather than words.
* [ ] NASA data — §4.1 paragraph plus the mission links of §4.2; drop the CSA games page and
      "Webb — Build It Yourself" from this field (they are not NASA data used by the project).
* [ ] Generative AI — §6, long or short version.
* [ ] Rotate the passwords that leaked into the local notes file outside the repository, and keep 2FA on the
      GitHub and Space Apps accounts.
* [ ] Last check before the deadline: `node tools/check.mjs 30`, `node tools/dom-check.mjs`,
      `node tools/lang-check.mjs`, then open the five Pages URLs once more.
