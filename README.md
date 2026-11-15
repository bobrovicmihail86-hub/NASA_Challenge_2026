# Space Mission Design Game

**NASA Space Apps Challenge 2026 — challenge: Space Mission Design Game**

Design a mission, build the spacecraft, choose the launcher and the target point, launch, fly the
mission step by step and live with every trade-off: mass against power, science against data volume,
ambition against the budget. The repository holds two playable editions of the same game — a **digital**
one that runs in a browser (solo or as a network team of up to four players) and a **tabletop** one that
can be printed and played at a table.

Everything in one place: card data → one calculation engine → the interactive calculator →
the Monte Carlo validator → printable sheets → art generation through ComfyUI.

The single rulebook is `docs/RULES_V15.md`; it replaces the earlier layered addenda. The formalised
programme rules the game grew from (v1.1 `rul.txt`, v1.2 `15.txt`) and the ComfyUI workflow used for the
art are not part of this repository — see
[What is not in the repository](#what-is-not-in-the-repository).

## The game in one paragraph

A match is a 15-step campaign. The manager takes a mission contract, the engineer assembles the launcher
side (bus, redundancy, physical modules, trajectory), the scientist the payload side (attitude control,
instruments, power, antenna, buffer), and both sign off. MCC then runs production, tests, the launch
window and the flight itself: 1–4 steps with MCC channels, science brought back step by step, flight
events and a separate acceptance roll. Points, rating, treasury and the final score come from the same
`data/engine.js` that drives every page, the Monte Carlo validator and the network server. v1.5 is the
current ruleset: build anatomy, "payload to the target", the mission contract, facilities 0–4, mission
control 0–4, the science school 0–4, R&D/CML, tests, the production queue, **flight operations** and the
experimental ladder `exp1 → std1 → exp2 → std2`.

## About the challenge

> Designing a space mission requires careful consideration of competing demands, including mission
> objectives, spacecraft design, scientific instruments, launch vehicles, budgets, power, mass,
> communications, and orbital constraints. For students who rarely get to experiment with an entire
> mission from concept to operation, these trade-offs often remain abstract. Your challenge is to create
> an interactive game that allows participants to design, manage, and simulate a complete space mission
> while making engineering decisions, managing limited resources, and evaluating how each choice shapes
> the success of their mission.

**Background.** A space mission is a system: scientific objectives, engineering requirements, available
resources and operational constraints must work together, and a decision that improves one part usually
limits another — a more capable instrument raises the scientific value but also the mass, the power
consumption, the data volume and the cost. Mission design is normally taught as theory, because students
rarely get an environment where a whole mission can be tried from concept to operation, and the usual
tools cover single topics (orbital mechanics, spacecraft design, launches) without showing how they
interact as a system.

**Objectives.** The game must let a participant — alone or in a team of up to four — define a mission
objective, state the requirements, design the spacecraft, select scientific instruments, a launch vehicle
and an orbit, and manage budget, mass, power, communications, data and mission lifetime, while seeing how
every decision reshapes the rest of the mission. The full brief we worked from is summarised in
[`docs/CHALLENGE.md`](docs/CHALLENGE.md).

**How the game answers the brief.**

* **Mission design** — 27 mission cards plus 4 salvage missions. The objective pins the target point,
  the deadline and the required instruments, and every build decision moves mass, power, data and money.
* **Spacecraft and payload** — 90 cards: launchers, redundancy, attitude control/FCS, instruments,
  antennas, power, physical modules, facilities, events and decor. Each instrument carries its own mass,
  power, cost, data rate and scientific value, and there is rarely a single perfect build.
* **Orbit and launch** — six target points (LEO, GEO, Moon, deep space, Mars, asteroid belt) with
  trajectory multipliers, and launchers with different payload capacity, price and orbital reach; the
  engine refuses a build whose mass does not fit the launcher and the chosen point.
* **Resource management** — mass, power, budget, data, communications and time on one dashboard; the
  consultant explains *why* a build fails instead of only marking it wrong.
* **Collaboration** — four roles (manager, engineer, scientist, MCC) sign off their own part of the
  mission; network mode puts up to four participants into one team room with server-side permissions.
* **Random events and consequences** — flight events, accidents, resignations, launch windows; the build
  (buffer, redundancy, science school) decides how much of the damage is absorbed.
* **Mission report and post-mortem** — verdict, points, rating, mission journal, Monte Carlo balance
  report, `.md`/`.csv` playtest export, leaderboard in network mode.
* **Educational layer** — tooltips and the rulebook explain every formula in plain language, and the
  deterministic chat-GM (`tools/session.mjs`) walks a group through a whole campaign step by step.

## Two editions

| Edition | What it is | Where |
|---------|------------|-------|
| **Digital** | Browser game: build calculator, 15-step campaign, role HQ for four roles, network team game | `calc/`, `app/`, `server/`, `data/` |
| **Tabletop** | Print-and-play card game: 63×88 mm cards, A3 team board, tokens, full rulebook | `print/`, `docs/RULES_V15.md` |

## Quick start

| What | Where |
|-----|-----|
| Build calculator + validator | open `calc/index.html` in a browser |
| Campaign v1.5 (MCC, CML/IP, queue, flights) | open `calc/campaign.html` in a browser |
| Role HQ: manager / engineer / scientist / MCC | open `app/index.html` in a browser |
| Card printing (63×88 mm) | open `print/cards.html`, pick a deck, press "Print" |
| Team board A3 | `print/board.html` |
| Tokens | `print/tokens.html` |
| Rules v1.5 (the full rulebook) | `docs/RULES_V15.md` |
| Campaign chat-GM (step by step, you decide) | `node tools/session.mjs new --seed 777 --steps 15` |
| Deck composition | `docs/CARDS.md` |
| Playtest protocol | `docs/PLAYTEST.md` |
| Challenge brief and the mapping to the game | `docs/CHALLENGE.md` |

Everything runs over `file://` — no server needed, the pages load `data/*.js` with plain tags.
The tools, the chat-GM and the room server need Node.js 24; there are no npm packages and no build step.

## Role HQ (`app/`)

`app/index.html` is one programme screen on top of the same `engine.js`. Roles switch in the header:

1. **Manager** picks a mission from the showcase and accepts the contract.
2. **Engineer** builds the launcher side: launcher, redundancy, physical modules, trajectory; confirms the engineering part.
3. **Scientist** builds the science side: FCS, instruments, power, antenna, buffer; confirms the scientific part.
4. After both signatures the manager calls `campaignManual`/`acceptMission`; the mission goes into production.
5. **MCC** runs the steps, launches, sessions, overtime and early acceptance; `finalScore` computes the total.
6. Experimental launchers/instruments (`exp1`/`exp2`) need an approval: the first attempt at a test or a
   launch creates a request that the engineer, the scientist and the manager sign. A test approval lives
   for one step, a launch approval — while the mission waits in `ready`; ordinary missions launch without a
   request. Signatures are placed in the "Experiment approval" panel.

The consultant shows the blockers and risks from `compute.checks`, the build is drawn as an SVG graph and
the campaign stepbar shows production/flights/deadlines. The chat and the journal are local; the state lives
in `localStorage`, and when storage is unavailable (some `file://` modes) — in Export/Import. Launch
parameters: `app/index.html?seed=777&steps=15`.

## Network mode (`server/` + `app/lobby.html` + `app/play.html`)

A team game over the network: a lobby, team rooms and a shared mission screen. This part is in English.

1. `node server/index.mjs --port 8080 --data server/data` — HTTP + SSE, the state lives in `--data`.
2. `app/lobby.html` — e-mail sign-in, team creation (the captain sets the seed and the campaign length), participant roles.
3. `app/play.html?team=<id>` — the team room: mission showcase, build, MCC, programme, archive, final.

The client sends `POST /api/teams/:id/action` with `{type, role, payload}`, the server answers with a snapshot
(`snapshot` + `analysis`) and an SSE stream (`hello` / `snapshot` / `presence` / `history` / `finished`).
Permissions are checked on the server: `new-campaign` — the captain only, signatures — engineer/scientist/manager,
steps and launches — MCC and manager. The interface strings come from the data files (`data/en.js` is only a
thin name/text shim); the server error codes are translated in the client.

Both screens share the same tooltip mechanism: any element with a `data-tip` attribute shows a bubble on hover
and on keyboard focus (styles — in `lobby.css`, the `tooltips` section). For inputs and `select`s the bubble is
attached to the `label` wrapper, because pseudo-elements do not render inside form controls; on touch
devices (`@media (hover: none)`) the bubble is not drawn at all, so nothing covers the underlying text.

## Commands

```powershell
node tools/check.mjs 150        # data + reference builds §12 + Monte Carlo over 150 games
node tools/dom-check.mjs        # runs the inline scripts of every page in a DOM stub
node tools/lang-check.mjs       # language guard: no Cyrillic in code, data or docs
node tools/app-smoke.mjs        # role HQ: build → signatures → acceptMission → steps → finish
                                # + experiment approval: test, launch, save/load, cleanup
node tools/session.mjs selftest  # campaign chat-GM: determinism of two runs
node tools/session.mjs ops       # flights in the air: MCC channels, risk, load plan
node tools/session.mjs overtime --mission m_hubble   # extend acceptance: $50, +8% S
node tools/session.mjs close --mission m_hubble      # early acceptance: S ×0.6
node tools/tune.mjs             # compare balance variants (rating/failure/duplication price)
node tools/gen-art.mjs --dry-run --only rocket_ --limit 2
node tools/gen-art.mjs --only rocket_light,ant_large  # quick style test
node tools/gen-art.mjs --write-manifest --with-aux    # manifest only: 99 cards
node tools/gen-art.mjs --with-aux --skip-existing     # generate into art/assets via ComfyUI
node tools/gen-emblem.mjs --dry-run                   # check the emblem SDXL graph without generating
node tools/gen-emblem.mjs --seeds 103 --lora-strength 0.9 --tag s09   # emblem: LoRA lozhkin
node server/index.mjs --port 8080 --data server/data  # room server (HTTP + SSE)
node tools/server-smoke.mjs      # network API: sign-in, team, roles, signatures, final, archive, table
node tools/play-smoke.mjs        # the whole play.js client: snapshot → actions → final, ids and CSS classes
```

`gen-art.mjs` takes a ComfyUI workflow in the UI format (`--workflow <path>`, by default a
`comui.json` next to the repository — not shipped, see below) with Z-Image (`z_image_bf16` +
`qwen_3_4b` + `ae.safetensors`, KSampler 30 steps, cfg 5, `res_multistep`, shift 3),
converts the UI format into the API format, substitutes the card prompt and stores PNGs in `art/assets/`.
By default it generates at `1024×528` (`1.94:1`) for the `58.2×30 mm` card art window;
`--width` / `--height` override the size. The style is a semi-realistic 3D render,
the background is a dark blue gradient without a grid or captions.
It needs a running ComfyUI at `http://127.0.0.1:8000` (or set `COMFY_URL` / `--url`)
with those models. Without `--with-aux` the manifest holds 91 cards, with decor — all 99.

## Mission emblem (`gen-emblem.mjs`)

A separate pipeline in the style of Vasya Lozhkin: the SDXL graph `art/workflows/emblem_sdxl.api.json`
(`NoobAI-XL-v1.1` → `Lozhkin_style_Illustrious` LoRA, tag `lozhkin`, `dpmpp_2m/karras`,
28 steps, cfg 5, 1024×1024), the prompts — `art/emblem/prompts.json` (variants `emblem`,
`patch`, `poster`), the output — `art/emblem/<variant>_<tag>_<seed>.png`.

```powershell
node tools/gen-emblem.mjs --seeds 401,402,403,404 --lora-strength 0.9 --tag b09
node tools/gen-emblem.mjs --variant patch --seeds 301 --lora-strength 1.2
node tools/gen-emblem.mjs --prompt "lozhkin, ..." --negative "..." --seeds 777
```

Flags: `--seeds a,b,c`, `--variant`, `--tag` (a file-name suffix so a seed is not overwritten),
`--lora-strength` (0.8–1.5), `--steps`, `--cfg`, `--width/--height`, `--sampler`,
`--scheduler`, `--checkpoint`, `--lora`, `--prompt`, `--negative`, `--timeout`, `--dry-run`.
The script checks that ComfyUI can see the checkpoint and the LoRA (`/object_info`) and fails with a hint
when it cannot. Cyrillic inside the image itself is not guaranteed by SDXL — the “TO SPACE!” lettering
is laid over the clean badge by hand or by an external script.
A contact sheet of all variants: `python tools/emblem-sheet.py` → `art/emblem/preview/contact_sheet.png`
(generated output is git-ignored; only `art/emblem/prompts.json` and the graph are tracked).

## Structure

```
space-mission-design/
├── data/
│   ├── config.js      CONFIG v1.5: points, trajectories, buses, criteria, contract, campaign (incl. ops), print runs
│   ├── cards.js       90 cards: launchers, reservations, FCS, instruments, antennas, power, modules,
│   │                  facilities, events, decor + MCC/tests/ground contracts/flight events
│   ├── missions.js    27 mission cards with history + 4 salvage missions
│   └── engine.js      build calculation, trajectories, verdicts, points, campaign v1.5 (flights) + Monte Carlo
├── calc/index.html    calculator: mission → trajectory → build → checks → P, S, Δrating
├── calc/campaign.html campaign v1.5: MCC, factory, school, R&D/CML, tests, contracts,
│                      flights and acceptance, score
├── app/               role HQ on top of the same engine.js: manager, engineer, scientist, MCC,
│                     SVG build graphs, consultant, chat, localStorage + export/import
├── app/lobby.html     network: sign-in, teams, roles (client lobby.js)
├── app/play.html      network: team room — showcase, build, MCC, programme, archive (client play.js)
├── server/            network: index.mjs (HTTP + SSE), room.mjs, history.mjs, results.mjs, store,
│                     data in server/data-* (created on start)
├── print/             cards.html, board.html, tokens.html
├── art/
│   ├── prompts.json   style, negative, templates by card kind
│   ├── manifest.json  99 prompts with decor (generated)
│   ├── assets/        card PNGs (appear after generation)
│   ├── workflows/emblem_sdxl.api.json  emblem SDXL graph (NoobAI-XL + LoRA lozhkin)
│   └── emblem/        prompts.json + generated PNG variants (git-ignored)
├── docs/              RULES_V15.md (the full rulebook), CHALLENGE.md, CARDS.md, PLAYTEST.md
├── playtest/          chat-GM states (session-<seed>.json) and .md/.csv reports
└── tools/             check.mjs, dom-check.mjs, app-smoke.mjs, server-smoke.mjs, play-smoke.mjs, session.mjs, tune.mjs, gen-art.mjs, gen-emblem.mjs, emblem-sheet.py
```

## What is not in the repository

* **Model weights and the ComfyUI workflow for the card art** — `comui.json` plus `*.safetensors`
  (85–218 MB per file) are not shipped. `tools/gen-art.mjs` accepts `--workflow <path>` (or a
  `comui.json` next to the repository) once ComfyUI with `z_image_bf16`, `qwen_3_4b` and
  `ae.safetensors` is running; the emblem pipeline additionally needs `NoobAI-XL-v1.1` and the
  `Lozhkin_style_Illustrious` LoRA. The cards print anyway, with blueprint placeholders.
* **The earlier rule specifications** (`rul.txt` v1.1, `15.txt` v1.2) and the raw mission research notes
  stay outside the repository: `docs/RULES_V15.md` is the normative, self-contained rulebook.
* **Runtime state** — `server/data*/`, `*.log`, `*.pid` and the generated emblem PNGs are git-ignored.

## Key v1.3 decisions

1. **Payload to the target** (variant B):
   `G_point = G_LEO / (k_point · k_trajectory)`, where k = 1.0 (LEO), 2.0 (GEO), 6.0 (Moon),
   8.0 (deep space), 12.0 (Mars), 20.0 (asteroid belt). The trajectory adds a multiplier
   0.85–1.15, a deadline and module requirements. Choosing a point is now a choice of mass and money,
   not a line in the description.
2. **`D_ratio` moved out of probability into science.** §5 and §15.1.4 contradicted each other:
   the probability `min(1, D_sent/D_gen)·p_channel` does not give 0.68. In v1.3
   `P_success = p_launch·p_build·p_channel`, and the data volume affects `S_det`, while
   `D_ratio < 0.5` is a **soft** check: it forbids only a "full success", success and
   partial success stay possible.
3. **Duplication is a property of the FCS, not of the instruments.** Platform duplication gives 0.77 instead of
   0.88 for three cameras; a modular build `min(p)·0.95^(n−1)` brings 0.88 back.
   That is recorded as a deliberate choice, not as a bug.
4. **The mission contract.** The original rules had no income, while ten missions cost $4000–9000.
   The advance pays for the hardware, the bonus of 0.25 advance is the profit; the purchase cap is 1.35 advance.
5. **Card copies as the balancer.** Launchers, reservations and FCS are consumed; the deck holds 3 "double"
   reservations and 3 "duplicating" FCS, so duplication cannot dominate.

## Key v1.4 decisions

1. **The school is a full 0–4 facility.** Before it lived only in the data and in the single
   calculator; in the campaign it sat at 0. Now: +3…6% to the instrument p, a 5…20% discount
   on the mission PM, instrument standardisation from stage 1 (from stage 3 — 20% off the price), +1 FCS slot
   at stage 4. Each level is one preparation action and 5 points in the final score.
2. **The school is an alternative, not a dominator.** The Monte Carlo bot buys 4–5 MCC levels
   when the school is untouched, and 0–1 MCC levels when it invests in the school: the score barely changes
   (≈200), but the risk profile does. Failures drop from 18% to 17%.
3. **Instrument standardisation does not require CML 3** when the school is 1+; launchers do.
   That makes the school a cheap entry into "standards" for instrument teams.

## Key v1.5 decisions

1. **A flight is a phase, not an instant roll.** The launch no longer gives a verdict:
   the mission flies for 1–4 steps (Moon 2, Mars and belt 3, deep space 4), each step is a
   communication session with science. `p_channel` is still rolled once — at acceptance; the sessions do not
   reroll it, so "many attempts" never appears, but time does.
2. **MCC channels are a second resource.** The launch limit (`mcs.capacity`) and the communication channels
   (`campaign.ops.capacity`: 2/3/4/5/6) are counted separately. A video instrument and deep space
   below MCC 3 occupy an extra channel; the overload raises the incident risk
   (0.05 + 0.04 per channel, capped at 0.30) — at most one incident per step. The school reduces the
   channel penalty by 15% per level (down to 60%), without changing the base or the ceiling.
3. **Data is recovered, but not fully.** `ratioOps = data.ratio·(0.75 + 0.25·share)`:
   the onboard recording saves 75% of the data even with lost sessions, and continuous
   tracking gives +7% to S at acceptance. Early acceptance — ×0.6, overtime — $50
   and +8% S per step (no more than two).
4. **Flight events are checked against the build, not chosen by the player.** 8 kinds / 14 cards
   (`CARDS.opsEvents`): the buffer saves you from a flare and a thermal regime, a duplicated FCS —
   from a micrometeorite, the managers — from a software error. The school cuts the event chance from 18% to 12%.
5. **The price for balance (v1.5 base without the ladder).** 40 games: score 197.6 (was 199.6),
   missions 11.0 (11.4), failures 16.2% (16.8%), treasury $2253 ($1900). The treasury tolerance
   in the check was widened to ±2500 $; the details and tables are in `docs/RULES_V15.md`.
6. **The experimental ladder `exp1 → std1 → exp2 → std2`.** An experimental launcher
   or instrument gets −10 pp to p and restores it over three launches/tests/stand runs.
   Standardisation (CML 3; instruments — school 1+) requires that the card has appeared in a mission
   and fixes p together with the residual risk, opening the next generation. The new cards
   are printed in the launcher/instrument decks; see `docs/RULES_V15.md` §20.

## Calibration results (150 games × 10 missions)

| Metric | Target | Actual |
|---------|------|------|
| Average rating | > 40 | **81.4** |
| Failure share | 15–35% | **32.6%** |
| Launcher / FCS duplication | < 40% | **30.1% / 30.1%** |
| Experimental builds (launcher/instrument) | < 20% | **1.5%** |
| Experimental subsystems | reference | **43.1%** |
| Average P_success | 0.68–0.72 | **0.687** |
| Missions skipped | < 10% | **0.5%** |
| Missions per game | ≥ 9.5 | **10.0** |

The values above are the output of `node tools/check.mjs 150` on this revision.

The §12 reference builds reproduce exactly: 0.681 / 0.763 / 0.504 / 0.770 / 0.843 / 0.449.
The open questions and the proposed fixes are in `docs/RULES_V15.md`, Appendix D.

## What next

1. A playtest per `docs/PLAYTEST.md` (3 teams, 10 missions) — collect live metrics.
2. After the playtest, tune `data/config.js` (`ratingPerS`, `contractReward`, `deckCopies`,
   `campaign.ops`) and the point prices of the cards in `data/cards.js` (experimental `ins_exp`,
   `res_exp`, `ctrl_exp`); do not change the engine formulas without a fresh `node tools/check.mjs 150`.
3. A flight playtest: check that overtime for $50 feels like a choice rather than
   a mandatory tax, and that an MCC overload punishes greed, not interesting play.
4. Generate the art in priority order: launchers → instruments → antennas → FCS → facilities →
   events → missions (`node tools/gen-art.mjs --skip-existing`).
5. Assemble the hackathon report: `docs/RULES_V15.md` §1–§13 + a CSV from the calculator.

## Limitations

* The Monte Carlo models the layer "build → rolls → points → money", but **not** hiring,
  salaries, specialists leaving and facility upgrades — those metrics of §25 are checked
  only by a live playtest. It also does not model `res.massFactor`/`res.dispersion`
  (only `priceFactor` is used) and `CONFIG.priceAdjust`; these are explicit limitations,
  not active rules.
* The Monte Carlo flies missions without player decisions: overtime and early acceptance are not
  used, the events are drawn from the deck by chance. The metric in `RULES_V15.md` §25 is the
  baseline "flights run themselves", not the optimum of the game.
* `S` in the points is `S_det·P_success`; the verdict is computed from `S_det`, and `D_ratio` is a soft
  check (below 0.5 it forbids a full success only).
* Art generation needs ComfyUI, the workflow `comui.json` and the Z-Image models — none of the three is
  shipped; without them the cards print with blueprint placeholders (initials + grid).
* The numbers in the rulebook and in `CONFIG` are duplicated on purpose: the document explains,
  `config.js` is the source of truth for the code.
