# Space Mission Design — Rules v1.5

**This is the whole rulebook.** One mission is calculated on a table, a campaign of
12/15/18 steps is played on top of it, and accepted missions then fly for a few steps.
Earlier releases were layered addenda — v1.3 §16–§19, v1.4 §1–§10, v1.5 §11 — and
those layers are merged here: `RULES_V13.md` and `RULES_V14.md` no longer exist. The
Russian edition of the game is frozen in `ru/` (git tag `ru-v1.5`), where the same material
still lives as the layered text `ru/docs/RULES_V15.md`.

Every number in this document also lives in code, and the code is the source of truth:

| File | What it holds |
| --- | --- |
| `data/config.js` | every constant: points, trajectories, buses, campaign, MCC, CML, tests, score |
| `data/cards.js` | launchers, instruments, antennas, power, buffers, physical modules, events |
| `data/missions.js` | missions with points, trajectories, complexity, deadlines |
| `data/engine.js` | all formulas: mass, power, channel, verdict, campaign step, flight ops |

If the text and the code disagree, the code wins; `node tools/check.mjs` and
`tools/lang-check.mjs` guard the pair. Section numbers are stable, so a check can cite
"§27" and mean exactly one thing.

## Contents

| Part | Sections |
| --- | --- |
| I. One mission | §1 what was fixed · §2 build anatomy · §3 payload mass · §4 trajectories · §5 point capacity · §6 power · §7 downlink and data · §8 reliability and redundancy · §9 verdict · §10 rating, VChK and role points · §11 mission contract · §12 reference builds · §13 worked example |
| II. Campaign | §14 the run · §15 contract, fund, salaries · §16 production and PM · §17 mission control 0–4 · §18 factory and school · §19 R&D and CML · §20 experimental ladder · §21 tests · §22 ground contracts · §23 failures and rescues · §24 final score · §25 balance |
| III. Flight operations | §26 flight steps · §27 MCC channels · §28 human factor · §29 sessions and flight events · §30 acceptance · §31 managing a flight |
| IV. Role HQ | §32 experiment approval |
| Appendices | A formulas · B where things live · C optional event layer · D playtest checklist |

## Glossary

| Term | Meaning | In code |
| --- | --- | --- |
| `p` | probability that a stage works | `p` on every card |
| `S_raw` | science a build produces if everything works | `E.sci().sRaw` |
| `S_det` | science after uniqueness and the data ratio | `E.sci().sDet` |
| `S` | expected contribution, `S_det · P_success` | `E.sci().s` |
| rating | team reputation; carries most of the score | `state.rating` |
| VChK | internal human capital | `state.vchk` |
| NP | research potential | `state.np` |
| PM | production capacity, per step | `state.pm` |
| IP | intellectual property, one counter per class | `state.ip` |
| MCC | mission control centre, levels 0–4 | `state.mcsLevel` |
| CML | competence level per class, 1–4 | `state.tech` |
| point | destination: `leo`, `geo`, `moon`, `mars`, `deep`, `belt` | `CONFIG.points` |

## Part I — One mission

### §1 What was fixed in the card game

Three systematic mismatches between the paper rules and a card table, and how they were
solved:

| # | Problem | Fix |
| --- | --- | --- |
| 1 | §5 folds data volume into `P_transfer = min(1, D_sent/D_gen)·p_channel`, but §15.1.4 computes `P_success = 0.88·0.86·0.90 = 0.68` without it. The numbers do not close: a three-camera build yields P ≈ 0.17 instead of 0.68 | `D_ratio` moves out of probability into the **science result**: `S_det = S_raw·D_ratio`. `D_ratio < 0.5` forbids **only** a full success |
| 2 | The trajectory barely matters: payloads are 0.1–0.7 t against a 2–30 t capacity, so mass never binds — only control slots, power and the channel do | **Point capacity table**: `G_point = G_leo / (k_point·k_trajectory)`. The point and the trajectory variant become two independent multipliers |
| 3 | The team has no income while ten missions cost $4000–9000 | §11: the **mission contract** — the advance pays for the hardware, the success bonus is the profit |

### §2 Build anatomy

```
        ┌── REDUNDANCY BLOCK (required, exactly 1)
ROCKET ─┤
        └── BOOSTER (required, exactly 1)

PAYLOAD
  ├── Flight control system (required, exactly 1) — the only source of instrument redundancy
  ├── Instruments (1–6, count ≤ control slots)
  ├── Antenna (required, exactly 1) + optional antenna duplication module
  ├── Power source (required, exactly 1)
  ├── Buffer (0–1)
  └── Physical modules (0–3): capsule, lander, rover, manipulator, relay
```

Consumable cards leave the build into the discard pile after a launch and their copies
are limited: **booster, redundancy block, flight control system**. Everything else is a
"blueprint" and returns to hand after the mission.

Trajectory requirements (a lander for `landing`, a relay for `relay`) are **hard**: without
the module the variant is unavailable. Mission requirements ("capsule", "rover",
"manipulator") are **soft**: each missing module halves `S_raw` but the mission stays
playable.

### §3 Payload mass

```
M_payload = (M_fcs + Σ M_inst·n + M_ant·(1 + 0.15·duplication) + M_pwr + M_buf + Σ M_phys)·1.10 + 10 kg
```

`1.10` is the service-systems factor, `10 kg` the adapter. The redundancy block's mass
factor (×1.15 for the double block) applies to the launcher itself and is **not** part of
`M_payload`. *Known gap:* only `priceFactor` of the redundancy block is validated;
`massFactor` and `dispersion` are recorded as unmodelled rather than quietly dropped.

### §4 Trajectories

The mission card offers 2–3 variants. A variant changes three things: how much a kilogram
"costs" (`k_trajectory`), the deadline, and the transmission window.

| id | Name | k× | Deadline | Window | Requires |
| --- | --- | ---: | --- | ---: | --- |
| `direct` | Direct transfer | 1.00 | 0 | 1.00 | — |
| `fast` | Fast transfer | 1.15 | −1 | 1.00 | — |
| `assist` | Gravity assist | 0.85 | +2 | 1.00 | — |
| `orbit` | Orbital insertion | 0.90 | +1 | 1.00 | — |
| `landing` | Direct landing | 1.00 | 0 | 1.00 | lander |
| `relay` | Relay link | 1.05 | +1 | 1.00 | relay |
| `polar` | Polar orbit | 1.03 | 0 | 0.60 | — |
| `low` | Low periodic orbit | 1.00 | −1 | 0.35 | — |
| `geo` | GEO insertion | 1.00 | 0 | 1.00 | — |

### §5 Point capacity

`G_point = G_leo / (k_point · k_trajectory)`, with `k_point` and the point multipliers:

| Point | k | Solar φ | Channel ψ | Reliability ξ |
| --- | ---: | ---: | ---: | ---: |
| Earth orbit | 1.0 | 1.00 | 1.00 | 1.00 |
| Geostationary orbit | 2.0 | 1.00 | 1.00 | 1.00 |
| the Moon | 6.0 | 0.70 | 0.90 | 0.95 |
| deep space | 8.0 | 0.10 | 0.50 | 0.85 |
| Mars | 12.0 | 0.45 | 0.80 | 0.92 |
| the asteroid belt | 20.0 | 0.20 | 0.60 | 0.88 |

Capacity per point in kg (before the trajectory multiplier):

| Launcher | LEO | GEO | Moon | Deep | Mars | Belt |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Light (2 t) | 2000 | 1000 | 333 | 250 | 167 | 100 |
| Medium (6 t) | 6000 | 3000 | 1000 | 750 | 500 | 300 |
| Heavy (15 t) | 15000 | 7500 | 2500 | 1875 | 1250 | 750 |
| Super-heavy (30 t) | 30000 | 15000 | 5000 | 3750 | 2500 | 1500 |
| Experimental (12 t) | 12000 | 6000 | 2000 | 1500 | 1000 | 600 |

*Example.* A 0.30 t build to the Moon by direct landing (`k = 6·1.00 = 6`) needs 1.8 t;
Medium gives `6/6 = 1.0 t` — **not enough**; Heavy gives 2.5 t. Even by gravity assist
(`k = 6·0.85 = 5.1`) Medium gives only 1.18 t. A lunar landing with a lander and a
manipulator is a heavy-lift job, exactly as history showed.

*Example.* A 0.10 t build to the Moon by direct transfer (`k = 6`) needs 0.60 t; Medium
gives 1.0 t — passes. The same build to Mars (`k = 12`) needs 1.20 t, Medium gives 0.5 t —
fails, Heavy gives 1.25 t — passes. A flagship 0.55 t build (lander + manipulator +
3 instruments): Heavy gives 2.5 t to the Moon, 1.25 t to Mars, 0.75 t to the belt; Medium
to the belt gives 0.30 t and fails. That is how the price of a wrong destination becomes
tangible.

### §6 Power

```
P_available = min(launcher bus, P_source · φ_point)
P_demand    = 20 W + P_fcs + P_antenna + Σ P_instruments
condition:    P_available ≥ 1.2 · P_demand
```

Buses: Light 150 W, Medium 300 W, Heavy 600 W, Super-heavy 1000 W, Experimental 390 W.
The RTG and the reactor are the only sources with φ = 1.0 at every point.

### §7 Downlink and data

```
C_channel   = min(antenna bw, channel bus) · ψ_point
D_generated = Σ bw_instrument · n · t_observe · coeff(data type)
D_sent      = C_channel · trajectory window · t_mission · (0.8 without buffer | 1.0 with buffer)
D_ratio     = min(1, D_sent / D_generated)
```

`coeff`: video 1.0, spectrum 0.4, telemetry 0.1. Channel buses: 5 / 10 / 25 / 50 / 13 Mbit/s.
If the mission's data type matches none of the instruments on board, `S_raw × 0.5` — the
mission is about the wrong thing.

**Correction to the paper §5.** `D_ratio` no longer enters probability. Channel
probability is `p_channel = p_antenna · ξ_point`. Data volume shapes the scientific result
`S_det = S_raw · D_ratio`, and `D_ratio < 0.5` forbids **only** the "full success" verdict.
It is a soft check: success and partial success stay possible, and `D_ratio` never enters
`feasible`. So `0.88·0.86·0.90 = 0.68` stays true, and a camera-heavy build on a narrow
channel simply returns less science instead of zeroing the mission.

### §8 Reliability and redundancy

```
p_launch = p_launcher, then the redundancy block:
  single:        p
  double:        1 − (1 − p)²              (price ×1.6, launcher mass ×1.15, 3 copies)
  experimental:  p + 0.05, σ×1.5           (price ×1.6, 4 copies)

p_build  = Π p_instruments                 (plain build)
         = min(p) · 0.95^(n−1)             (modular build, optional)
  then FCS duplication:
  "Redundant":      1 − (1 − p_build)²     (3 copies)
  "Experimental":   p_build + 0.05, σ×1.5  ($200, 6 slots, 2 copies)

p_channel = p_antenna · ξ_point, with the antenna duplication module p_antenna → 1 − (1 − p)²
P_success = p_launch · p_build · p_channel
```

Platform redundancy (through the flight control system) is **weaker** than per-instrument
redundancy once three instruments are on board: for three cameras
`1 − (1 − 0.636)² = 0.868` against `(1 − (1 − 0.86)²)³ = 0.943`. That gap is the deliberate
price of simplicity — one board is duplicated, not each instrument. The modular build
(`min·0.95^(n−1)`) closes it: 0.776 → 0.95 after duplication.

### §9 Verdict

```
S_det = S_raw · uniqueness · D_ratio        — what we get if everything works
S     = S_det · P_success                   — expected contribution

if a hard check of §5–§7 fails              → "impossible"
else if P_success < 0.5                     → "failure"
else if S_det ≥ target and D_ratio ≥ 0.5    → "full success + bonus"
else if S_det ≥ 0.7·target                  → "success"
else if S_det ≥ 0.3·target                  → "partial success"
else                                        → "failure"
```

`target = 20 + 10·complexity` (30 / 33 / 36). Uniqueness: first arrival at a point ×1.5,
a repeat visit ×0.8.

### §10 Rating, VChK and role points

| Outcome | Δrating | ΔVChK | Role points (eng / sci / man) |
| --- | --- | --- | --- |
| Full success | +0.21·S·1.1 | +0.05·S | +2 / +2 / +2 |
| Success | +0.21·S | +0.05·S + MCC bonus | +2 / +2 / +2 |
| Partial success | +0.105·S | +0.025·S | +1 / +1 / +1 |
| Failure at launch | −4 | −3 | −2 / 0 / −1 |
| Failure at build or channel | −4 | −3 | +1 / −1 / 0 |

`0.21` instead of the paper's `0.10` is calibration: at 0.10 the average rating after ten
missions lands near 12, while the target is "above 40". Failure costs −4 instead of −5 so
the failure share stays inside the 15–35% corridor. The `1.1` factor applies **only** to
rating; ΔVChK is always `0.05·S`. The MCC bonus (`vchkPerSuccess` of the current level, see
§17) is added on a success. Role points follow the actual roll, not the planned verdict:
a launch failure is `−2 / 0 / −1`, a build or channel failure is `+1 / −1 / 0`.

### §11 Mission contract

```
advance = 250 + 200·complexity + point bonus + Σ price of the required modules
bonus   = 0.25 · advance (success), 0.5 · bonus (partial success), 0 (failure)
purchase cap per mission = 1.35 · advance
```

Point bonus: LEO 0, GEO 80, Moon 250, Mars 500, deep space 700, belt 800.

The advance arrives when the mission is taken and pays for the hardware; whatever is not
spent is the team's profit. The bonus is pure profit. A failure does not return the
advance, so the risk is real: the team loses the hardware and the bonus, but does not go
bankrupt on salaries. The purchase cap is counted from the advance, **not** from the cash
on hand, so a cheap mission is never blocked by money already spent elsewhere.

### §12 Reference builds

| Build | Formula | P_success |
| --- | --- | --- |
| 1 camera, no redundancy | 0.88·0.86·0.90 | 0.681 |
| 1 camera, double redundancy | 0.986·0.86·0.90 | 0.763 |
| 3 cameras, no redundancy | 0.88·0.636·0.90 | 0.504 |
| 3 cameras, redundancy + redundant FCS | 0.986·0.868·0.90 | 0.770 |
| the same + modular build | 0.986·0.950·0.90 | 0.843 |
| experimental launcher (p = 0.58) | 0.58·0.86·0.90 | 0.449 |

Row 4 is lower than the paper's 0.88 because platform duplication is weaker than
per-instrument duplication. That is a property of the model, not a bug: **to reach 0.88
the player must build modularly** (row 5), which turns "duplicate the board" and "build
modularly" into a real choice.

### §13 Worked example: Luna 9

Build from `tools/check.mjs`: Medium launcher + single redundancy + advanced FCS + camera +
spectrometer + medium antenna + buffer + lander, direct landing.

* Advance `250 + 200·1.3 + 250 (Moon) + 600 (lander) = $1360`; bonus `0.25·1360 = $340`;
  a full success pays `$1700`.
* `P_success = 0.607`, `D_ratio = 1.00`, `S_det = 75.0` against a target of 33 → full
  success: `Δrating = 10.52`, `ΔVChK = 2.28`.
* Had `D_ratio` fallen below 0.5, the same `S_det` would only have scored "success" — the
  build would still have been feasible.

## Part II — Campaign

### §14 The run

* **15 steps** by default (`campaign.steps`); the interface offers 12 / 15 / 18.
* Start: **$1200, 50 NP, 40 PM, rating 0, VChK 10**, ground-segment fund **$150**.
* Showcase of 3 missions, 3 production slots, MCC level 0, factory 0, school 0, 2 managers.
* Order inside a step: ready missions launch (within the MCC limit), production advances,
  then the player spends preparation actions and takes new missions.
* Preparation actions: **1** if a mission was accepted in the previous step, otherwise
  **2**. At most **one test per step**. Preparation actions do not accumulate.
* End of the step: deadlines fire, salaries are paid, MCC upkeep is paid, the showcase is
  refreshed.
* **Final step** (final window): deadlines do not fire, ready missions launch without the
  MCC limit, everything else still in production counts as failed.
* The whole run is playable without a browser: `node tools/session.mjs` (see
  `docs/PLAYTEST.md` §6a). Its `next`, `launch` and `prep` commands reproduce exactly the
  same order as the "Next step", "Launch" and preparation buttons in `calc/campaign.html`.

### §15 Contract, ground fund, salaries

* The mission advance is §11. The purchase cap is `1.35 · advance`, which normally covers
  the hardware of a well-chosen build with money to spare.
* **10% of every advance** goes into the ground-segment fund (`groundFundShare`).
* Any purchase is paid **from the fund first and from cash second**; the fund therefore
  covers upgrades and MCC upkeep before your own money is touched.
* Salaries: $3 / $5 / $8 per specialist at levels 1 / 2 / 3, staff 4 / 3 / 1 at reputation
  tiers 1 / 2 / 3 — **$35 per step** at the start. If the payroll cannot be met, the team
  loses **1 VChK**.
* MCC upkeep: $0 / 5 / 10 / 15 / 20 per step for levels 0–4. If it cannot be paid, the MCC
  drops by one level until the next step (`mcsPenalty`), and the leak is written to the log.

### §16 Production and PM

```
prodTime = launcher cycles, −1 at factory level 4 (minimum 1)
ready at step start + prodTime; deadline at start + deadline
build PM = rocket.pm + fcs.pm + Σ instrument pm·count + Σ physical pm, then × school pmFactor
spread   = max(prodTime, ceil(deadline · 0.40))
pmRate   = ceil((build PM + 10) / spread)        ← the +10 is integration and test overhead
PM limit = 40 + factory bonus
free PM  = limit − occupied PM − preparation PM
```

While a mission is in production or waiting for launch, its `pmRate` occupies the PM
limit. After the launch the PM are released; an expiry or a failure releases them too.

### §17 Mission control 0–4

| Level | Launches/step | Channel p | S | VChK per success | Deep space | Upkeep | Managers |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 Rented station | 1 | +0.00 | ×1.00 | 0.0 | +0.00 | 0 | 0 |
| 1 Tracking station | 2 | +0.02 | ×1.03 | 0.5 | +0.00 | 5 | 2 |
| 2 Mission control centre | 2 | +0.04 | ×1.06 | 1.0 | +0.00 | 10 | 3 |
| 3 Deep-space network | 3 | +0.06 | ×1.09 | 1.5 | +0.05 | 15 | 4 |
| 4 Global network | 3 | +0.08 | ×1.12 | 2.0 | +0.10 | 20 | 5 |

Upgrade cost: $200 / 350 / 500 / 700, 20 / 30 / 40 / 50 PM, 15 / 25 / 35 / 45 NP, rating
30 / 50 / 70 / 90. A shortage of managers lowers the **effective** level: every two
missing managers cost one level (minimum 0). Channel `p` is added to the antenna
probability, `S` multiplies the science, `Deep space` adds to the antenna probability for
`deep`, `mars` and `belt`.

### §18 Factory and school

**Factory** — $150 / 250 / 400 / 600, 30 / 40 / 50 / 60 PM, rating 60 / 70 / 80 / 90.

| Level | Name | Effect |
| ---: | --- | --- |
| 0 | No factory | — |
| 1 | Assembly shop | +10 PM/step |
| 2 | Factory upgrade | +20 PM/step, −10% engineer attrition |
| 3 | Automated line | +30 PM/step, standardisation 20% cheaper |
| 4 | Orbital shipyard | +40 PM/step, −1 launcher production cycle |

**Science school** — $200 / 300 / 450 / 650, 25 / 35 / 45 / 55 PM, 20 / 30 / 35 / 40 NP,
rating 0 / 0 / 30 / 55.

| Level | Name | Instrument p | Build PM | Standardisation | Control slots | MCC overload penalty |
| ---: | --- | ---: | ---: | --- | ---: | ---: |
| 0 | No school | +0% | ×1.00 | unavailable | +0 | −0% |
| 1 | Institute | +3% | ×0.95 | instruments unlock | +0 | −15% |
| 2 | School upgrade | +4% | ×0.90 | open | +0 | −30% |
| 3 | Campus with observatories | +5% | ×0.85 | −20% price | +0 | −45% |
| 4 | Science megacomplex | +6% | ×0.80 | −20% price | +1 | −60% |

The `p` bonus is added to every instrument's `p` **before** they are multiplied. `Build PM`
multiplies the assembly effort (`E.pm`) — it discounts the mission and its `pmRate` but not
the step's PM limit. Launcher standardisation still needs CML 3; the school only opens
instruments. `MCC overload penalty` is the discount on the per-channel surcharge in
`p_incident` (§28); the 0.05 base and the 0.30 ceiling never change. A stand test and an
instrument flight test use the same school `p`.

### §19 R&D and CML

* CML starts at level 1, maximum 4, and is tracked per launcher class and per instrument
  class (`light`, `medium`, `heavy`, `superheavy`; `camera`, `spectrometer`, `radiometer`,
  `magnetometer`).
* IP threshold for level 2 / 3 / 4 — 2 / 3 / 4 IP **in that class**.
* Upgrade: `$100 × target level`, `10 × level` NP, `5 × level` PM.
* Bonus: **+2% to `p` per level above 1, capped at +6%**.
* Launcher CML 4: −1 production cycle. Instrument CML 4: +10% to instrument value, i.e. to
  `S_raw` (`E.techMods().valueFactor`).
* IP is earned: success — +1 to the launcher class and +1 to the instrument class; full
  success — +2 to the instrument class; partial success — +1 to the launcher class. Tests
  give IP by the table in §21.
* **Standardisation** of one card is one preparation action: launchers need CML 3 of that
  class, instruments need school 1+ or CML 3. Price $100, school 3+ gives −20% ($80). The
  card is no longer offered for standardisation and adds **+5 to the final score**.
* *Known gap:* the printed factory card still says level 1 unlocks launcher standardisation,
  while the engine gates experimental launchers on CML 3 alone (`E.standardize`). The card
  text is left as is until the tabletop pass settles which of the two rules is right.

### §20 The experimental ladder

Launchers and instruments walk the same chain of generations:

`exp1 → std1 → exp2 → std2`

* `exp1` is available from the start; `std1` and `exp2` unlock by standardising `exp1`,
  `std2` by standardising `exp2`.
* An experimental card (no `standard` flag) takes **−10 pp to its `p`**. Every mission
  launch with the card, every flight test and every stand run removes one third of the
  penalty; after three runs the risk is zero. The risk applies to the roll **before** the
  current run is counted.
* Standardisation requires the card to have appeared in an accepted mission (`expSeen`),
  costs $100 (school 3 gives −20%) and needs CML 3 for launchers; instruments may be
  standardised at school 1+ without CML 3.
* `standardP[expId]` freezes the **effective `p` at the moment of standardisation**,
  residual risk included. Standardisation therefore does not "heal" a card: an unflown
  `std1` stays weaker than a flown one, and class R&D plus the school bonus are added on
  top of the frozen base.
* `exp2` inherits the base from `std1`, takes −10 pp again and starts its own run counter;
  `std2` freezes `p` from `exp2`.
* R&D for experimental and standard cards runs through the `baseClass` of the base
  launcher/instrument — there is no separate CML branch for them.

### §21 Tests

| Test | Cost | PM | NP | q / p | Success | Failure |
| --- | --- | ---: | ---: | --- | --- | --- |
| Stand | $50 | 10 | 5 | `0.75 + 0.05·school`, capped at 0.95 | +1 IP | 0 IP |
| Launcher flight test | 50% of the launcher price + $20 | 10 | 0 | launcher `p` + CML | +2 IP, half the money back | +1 IP |
| Instrument flight test | 50% launcher + 50% instrument + $20 | 10 | 0 | instrument `p` + school + CML | +2 IP, half back, the instrument survives | +1 IP |

A test costs one preparation action and **at most one test per step** is allowed.

### §22 Ground contracts

One contract is one preparation action and never counts as a mission.

| Contract | Effect |
| --- | --- |
| Geodetic contract | +$80 into the fund |
| Tracking agreement | +$120 into the fund, −1 NP |
| Telemetry service | +$100 into the fund, +1 IP to an instrument of your choice |
| Range lease | +$150 into the fund |
| Science grant | +$60 into the fund, +10 NP |
| Press contract | +$40 into the fund, +1 VChK |

### §23 Failures, streaks and rescues

* A mission fails at launch, at assembly or at the channel: `−4` rating, `−3` VChK each.
* Every **third** failure in a row adds one `failStreakPenalties` → **−10** to the final
  score. An expiry counts as a failure for the streak; a real failure is where the rescue
  is rolled.
* **Rescue:** after a failure there is a **35%** chance (`CONFIG.salvage.chance`) that the
  instruments are recovered. A rescue adds **+20 to the final score** and returns half of
  the lost science into rating and VChK (`0.5·0.21·S_raw·D_ratio` and
  `0.5·0.05·S_raw·D_ratio`).
* The printed game also has **salvage missions** — a separate four-card deck
  (`data/missions.js` → `SALVAGE`): $50, `p` 0.60–0.75 by point, they return the hardware
  and 50% of the data and do not count against the ten-mission limit. The campaign app
  resolves a failure with the rescue roll above instead of asking you to play the card.

### §24 Final score

```
total = rating
      + 0.5·VChK
      + 5·(CML levels above 1, summed over all classes)
      + 5·(standardised cards)
      + 5·MCC level
      + 5·school level
      + 20·rescues
      − 10·(failure streaks)
```

The score is printed by the "Finish and score" button, or automatically after the last step.
`campaignScore` in `data/config.js` holds the weights (5 / 5 / 5 / 5 / 20 / −10), and the
`lobby` screen and the report break the total down line by line.

### §25 Balance

```powershell
node tools/check.mjs 40
```

Campaign goals: average score ≥ 80, 9–14 missions, 13–33% failures, cash left ±$2500.

| Metric (40 runs, seed 20260101) | v1.4 | v1.5 | Tolerance |
| --- | ---: | ---: | --- |
| Average final score | 199.6 | **197.6** | ≥ 80 |
| Missions per campaign | 11.4 | **11.0** | 9–14 |
| Failure share | 16.8% | **16.2%** | 13–33% |
| Cash left | $1900 | **$2253** | ±$2500 |

The reference run also lands at MCC 0.6, factory 2.6, school 1.0, 0.4 CML levels, 0.6
standardisations, 2.6 tests and an average `P` of 0.83 for the chosen builds.

Flights cost roughly two score points and 0.4 of a mission per campaign. Cash grows because
the bot buys hardware less often — fewer missions finish production and launch — not because
of new income; that is why the cash tolerance is widened to ±$2500. With the experimental
ladder (§20) enabled the same 40 runs give 178.3 points, 9.7 missions, 15.5% failures and
$1730 cash — every value stays inside the tolerances.

## Part III — Flight operations

A mission is not accepted the moment it reaches orbit. It flies for several steps, occupies
MCC channels, brings science in link sessions and is accepted on a separate `p_channel` roll.
All numbers are `CONFIG.campaign.ops`, the engine block is `data/engine.js` under
"v1.5: flight operations", the interface is `calc/campaign.html` §3b, the CLI is
`tools/session.mjs` (`ops`, `overtime`, `close`) and the checks are `tools/check.mjs` §6b.

### §26 Flight steps

| Point | Base steps | Example |
| --- | ---: | --- |
| `leo` | 1 | GRACE |
| `geo` | 2 | GOES-R — 3 (see below) |
| `moon` | 2 | Luna 9, Chang'e 5 |
| `mars` | 3 | Perseverance, InSight |
| `belt` | 3 | Hayabusa 2 |
| `deep` | 3 | Cassini–Huygens — 4 |

`flightSteps = min(flightMax, base + (missionTime ≥ 36 ? 1 : 0))`, `flightMax = 4`. A mission
card may store a ready-made `flight` (Hubble 2, GRACE 1, GEO 3, deep space 4). The flight
begins on the launch step and its last session coincides with the acceptance step
(`endStep = launchStep + flight − 1`); an overtime pushes `endStep` by one step.

### §27 MCC channels

Channels are a resource separate from launches per step (`CONFIG.mcs.capacity`):

| MCC level | 0 | 1 | 2 | 3 | 4 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Channels (`ops.capacity`) | 2 | 3 | 4 | 5 | 6 |

Flight load: `1` base + `1` for video (an instrument with `bw ≥ 20`) + `1` for deep space
(`deep`, `mars`, `belt`) while the effective MCC level is below 3. Overload is
`max(0, total load − channels)`. The load is visible in the MCC line and in the three-step
plan (`mcsLoadPlan`), including in the CLI (`ops`).

### §28 Human factor

One roll per step, for all flights at once:

```
p_incident = min(0.30, 0.05 + 0.04·(1 − relief)·overload + risk bonus)
relief     = min(0.60, 0.15·school level)
```

The school never touches the 0.05 base or the 0.30 ceiling; it lowers the price of each
overloaded channel: 0.04 → 0.034 / 0.028 / 0.022 / 0.016 at school levels 1–4. With one
channel over the limit that is `p = 0.090 → 0.084 / 0.078 / 0.072 / 0.066` — a trained shift
and a considered programme soften an overload without cancelling it. The `oe_overload` card
still adds a flat `+0.10`.

When the roll fires, the target is the flight with the largest risk bonus (otherwise a random
one), and the kind is:

| Kind | Weight | Effect |
| --- | ---: | --- |
| Lost session | 0.50 | the slice of the step ×0, nothing is accrued |
| Command error | 0.30 | −$50 (if there is no money, the slice ×0.5) |
| Instrument fault | 0.20 | the slice of the step ×0.5 |

### §29 Sessions and flight events

Every flight step is one session: `slice = (S_raw / flight) · data.ratio · quality`. Quality
drops from events and incidents; a lost session is not accrued at all.

The chance of an event per session is `18% − 1 pp per school level`, minimum 12%. The
`opsEvents` deck holds 8 kinds in 14 cards and the effect is always checked against the
mission's build:

| Card | Copies | Effect |
| --- | ---: | --- |
| Solar flare | 2 | no buffer — the session is lost (×0) |
| Deep-space network window | 2 | slice ×0.5 |
| Thermal regime | 2 | no buffer — slice ×0.5 |
| Software fault | 2 | enough managers — no effect; otherwise $50 for a patch or slice ×0.5 |
| Micrometeorite | 1 | FCS not redundant — the flight ends early |
| Shift overload | 2 | MCC overloaded — +0.10 risk; otherwise no effect |
| Instrument calibration | 2 | +1 IP to the first instrument |
| Press interest | 1 | +$50, +1 VChK |

### §30 Acceptance

`p_channel` is rolled **once**, at acceptance, exactly as before — sessions never reroll it.

```
share    = accrued / (S_raw · data.ratio), clamped to 0…1
ratioOps = data.ratio · (0.75 + 0.25·share)      ← onboard storage keeps at least 75%
S        = S_raw · ratioOps · 1.07 · (1 + 0.08·overtimes)
early end ×0.6, physical failure ×0.6
```

The verdict is derived from `S` and `ratioOps` with the same thresholds as §9. A clean
flight is worth +7% of `S` against the old instant acceptance; lost sessions pull the data
down to the 75% floor; early acceptance is the most expensive route of all.

### §31 Managing a flight

* **Overtime** (`overtime`): $50, at most twice, +1 step and +8% of `S` each. Unavailable
  once the flight is already ending early.
* **Early acceptance** (`close`): right after the first session, multiplier ×0.6. Use it
  when the data collected matter more than a complete programme.
* **End of campaign:** the session of the step runs first, then `finalizeFlights` accepts
  every active flight with the data accrued so far (marker `final`) and writes off whatever
  is left.
* **Where to look:** `calc/campaign.html` §3b — the MCC line, flight cards (step, channel,
  % of data, acceptance), the three-step load plan and the "Extend"/"Accept" buttons; §5
  "Tests and standardisation" — the experimental instrument chosen for the stand, the
  effective `p` and the residual risk on build cards, and the list of cards available for
  standardisation. The app shows the same data on the build cards and on the engineer and
  scientist screens. CLI: `node tools/session.mjs show` prints the "In flight" line and the
  flight list, `ops` prints channels, risk and the plan, `overtime --mission ID` and
  `close --mission ID` act. `report` writes an "Operations" line into
  `playtest/session-<seed>.md`: flights, sessions, events, incidents, early acceptances,
  overtimes, peak channel use and overload steps.

## Part IV — Role HQ

### §32 Experiment approval

Experimental cards (`exp1` / `exp2`) are a shared risk of the programme, so in the app a
test or a launch with them needs a collegiate approval. The rule changes neither `p`, nor
`riskRuns`, nor any engine formula: it is a procedural layer in `app/core.js`.

* An attempt at `test-rocket`, `test-stand`, `test-instrument`, `launch` or `launch-all`
  creates a request in `state.expApprovals`; the initiator — one of the three signing roles —
  signs it automatically.
* Three roles sign: engineer, scientist and manager (`approve-exp`, request key). The MCC
  can start a launch but does not sign.
* While fewer than three signatures are in, the action returns `needsApproval`, does not
  call the engine and does not spend a preparation action; the mission stays `ready`.
* A test request is bound to its step and cleared on the next step; a launch request lives
  while the mission is `ready` and is deleted after the launch.
* Ordinary (non-experimental) missions and tests create no requests.
* Signatures survive `serialize` / `hydrate`; on load, test requests from another step and
  launch requests for missions outside `ready` are dropped.
* Requests are visible in the "Experiment approval" panel on the manager, engineer and
  scientist screens — `app/core.js` (`expApprovals`, `signExpApproval`,
  `launchApprovalRequest`), `app/cards-ui.js` (`expApprovalsPanel`), checked by
  `tools/app-smoke.mjs`.

## Appendix A. Formula sheet

```
G_point   = G_leo / (k_point · k_trajectory)
M_payload = (M_fcs + ΣM_inst + M_ant·(1+0.15d) + M_pwr + M_buf + ΣM_phys)·1.10 + 10
P_avail   = min(launcher bus, P_source·φ);   need 1.2·(20 + ΣP)
C_chan    = min(bw_ant, channel bus)·ψ
D_gen     = Σ bw·t_obs·coeff;   D_sent = C_chan·window·t_mission·(0.8|1.0)
D_ratio   = min(1, D_sent/D_gen)
P_success = p_launch · p_build · p_channel
S_det     = S_raw·uniqueness·D_ratio;   S = S_det·P_success
target    = 20 + 10·complexity
D_ratio < 0.5 forbids only a full success (soft check)
advance   = 250 + 200·complexity + point bonus + Σ module prices;  bonus = 0.25·advance
purchase cap = 1.35·advance
p_incident = min(0.30, 0.05 + 0.04·(1 − relief)·overload + risk);  relief = 0.15·school, max 0.60
ratioOps  = data.ratio·(0.75 + 0.25·share);   S = S_raw·ratioOps·1.07·(1 + 0.08·overtimes)
total     = rating + 0.5·VChK + 5·tech + 5·std + 5·MCC + 5·school + 20·rescues − 10·streaks
```

## Appendix B. Where things live

| What | Where |
| --- | --- |
| One-mission calculator | `calc/index.html` |
| Campaign calculator (steps, MCC, tests, flights) | `calc/campaign.html` |
| Role HQ app | `app/index.html`, `app/core.js`, `app/cards-ui.js`, `app/play.js`, `app/manager.js` |
| Print and play | `print/cards.html`, `print/board.html`, `print/tokens.html` |
| Card reference | `docs/CARDS.md` |
| Session protocol | `docs/PLAYTEST.md` |
| Node campaign CLI | `node tools/session.mjs` |
| Monte-Carlo and tuning | `node tools/check.mjs 40`, `node tools/tune.mjs` |
| Guards | `tools/dom-check.mjs`, `tools/app-smoke.mjs`, `tools/play-smoke.mjs`, `tools/lang-check.mjs` |

## Appendix C. Optional event layer (tabletop only)

The printed variant draws one card at the end of every cycle: 13 kinds, 28 cards. **Only
"Advertising" is automated** (`CONFIG.events.advertising`, rolled after a successful
mission). Everything else in this table is resolved by the table leader by hand; the app
and the campaign calculator ignore it.

| Event | Copies | Condition / effect |
| --- | ---: | --- |
| Popularisation | 4 | rating ≥ 40; +20+0.5·rating $, +3+0.05·rating VChK, +2 rating |
| Advertising | 3 | 30% after a success: +10+0.3·rating $; the next failure cancels the bonus |
| Production accident | 3 | 10%: +1 cycle and −5 PM for the current item |
| Scientific breakthrough | 2 | 5% with NP ≥ 80: S ×1.1 once |
| Specialist poached | 2 | L2+: 5% per cycle − 0.02%·rating; retention costs 2 manager points |
| Resignation after a rating drop | 2 | rating below 30·level: p = 0.25 + 0.15·(threshold − rating)/threshold |
| Specialist joins | 2 | rating ≥ 60 and 3 successes in a row: p = 0.2 + 0.005·(rating − 60) |
| Volunteer novice | 2 | VChK ≥ 30: one or two L1 specialists |
| Dream team | 1 | rating ≥ 60 and VChK ≥ 40: 10% → 1×L2 + 1×L1 |
| Salary delay | 2 | cash below the payroll: one hire leaves |
| Solar flare | 2 | option: −5% instrument p for the current mission |
| Launch window closing | 2 | option: deadline −1 cycle |
| Standardisation offer | 1 | 50% off one standardisation while the school or factory is running |

## Appendix D. Playtest checklist

These are the open questions left after calibration — the numbers hold, the feel is still
being checked on the table.

1. **Experimental launcher/instrument — 3.5%** of builds against a target below 20%. The
   price of `ins_exp` is 1.1 base and its value is cut to 31. That satisfies O1, but the card
   is rarely used: check in a live game whether it has become a dead card. Experimental
   **subsystems** (redundancy / FCS / antenna) are a separate 43.2%, because their copies
   are consumed and they enter almost every build.
2. **Money accumulates** (≈$4.1k by the end): the advance covers the hardware and the
   1.35·advance purchase cap prevents spending the surplus. Hiring, school, factory and
   salaries are **not** modelled in the single-mission validator — that is the campaign
   layer, tested by `tools/check.mjs`. Check live.
3. **Skipped missions — 0.4%** after the `chooseBuild` fix (13.3% before): the purchase cap
   is now counted from `1.35·advance`, not from cash on hand, so Cassini and OSIRIS-REx
   assemble without an extra `res_double` copy. The residual case is GRACE with the
   launcher/FCS copies exhausted under a late budget; check on the table.
4. **Failures 32.6%** sit near the top of the corridor; at `P_success 0.686` the lower
   failure bound is ≈32%. Further reduction only comes from raising P — school, redundancy.
5. **Physical stages** (landing 0.80, capsule 0.85, rover 0.85) cause 8.9% of failures and
   cut S by 40%, but never cancel a mission. Check whether that is too soft for a "direct
   landing".

---

*Document history: v1.5 merges the layered v1.3 / v1.4 / v1.5 addenda into one rulebook.
The Russian edition is frozen in `ru/` at git tag `ru-v1.5`; its own rules file is
`ru/docs/RULES_V15.md`.*
