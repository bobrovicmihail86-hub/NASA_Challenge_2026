# Playtest protocol

The goal: check that the v1.5 mechanics produce meaningful decisions rather than a "single correct
build", and that the numbers from §25 reproduce with live players.

## 1. Table composition

* 2–4 teams (3 is best), each with its own A3 board.
* A shared mission deck: 27 cards, 3 missions are revealed at the start and 1 new one after every mission.
* Personal hardware decks: every player draws from a shared pile (or from a personal set
  if the print run was split per team).
* A shared event deck (28 cards).
* Tokens: money, NP, PM, VChK, rating, managers.
* The calculator `calc/index.html` — on a shared screen/tablet, to check builds.

Duration: 10 missions ≈ 90–120 minutes, plus 20 minutes for the rules explanation.

## 2. Order of play

1. **Start:** $1200, NP 50, PM 40/step, VChK 10, rating 0. Factory and school at stage 0.
2. **Mission choice:** 3 open cards. The team discusses, the manager takes the contract (§15);
   the other roles may object, the manager decides.
3. **Contract:** the team receives the advance (§11), the purchase cap is 1.35 of the advance.
4. **Build:** lay out the launcher + redundancy + FCS + instruments + antenna + power + buffer +
   modules. Check the 7 hard conditions from the board (§5–§7); `D_ratio` is soft (§9: below 0.5
   it forbids a full success only). If a hard condition fails, the mission is "impossible":
   the cards come back, the step is spent.
5. **Production:** PM = 40 + the factory bonus; cycles = the launcher time. Missing the deadline is a failure (§16).
6. **Launch:** rolls of p_launch → p_build → physical stages → p_channel (§9). Every roll
   is recorded in the mission log.
7. **Science:** `D_ratio`, `S_det`, the verdict per §9, award rating/VChK/role points (§10), pay the bonus (§11).
8. **Flight (v1.5):** the mission flies for 1–4 steps, occupies MCC channels, brings science by sessions,
   survives flight events and is accepted with a separate roll (§26–§31).
9. **Events and the step:** an event, salaries, hiring, factory/school upgrades (§14–§19).
10. **End of the game:** after 10 missions. The team with the highest rating wins; on a tie —
    more VChK; then — more completed missions.

## 3. What to record

Fill the table for every mission (this file can be copied):

| # | Mission | Point | Trajectory | P | S_det | Verdict | rating | VChK | Price | Advance |
|---|--------|-------|------------|---|-------|---------|----|-----|------|-------|
| 1 | | | | | | | | | | |

Also note:

* whether duplication was used (launcher / FCS / antenna);
* whether experimental cards were used and why;
* how often a build turned out "impossible" and on which check;
* how often a player deliberately went for P < 0.5;
* how much money was left at the end of the game.

## 4. Review questions after the game

1. Was the decision "which instrument to install" interesting, or always obvious?
2. Was the difference between the points (LEO / Moon / Mars / belt) felt?
3. Did the players use the modular build? If not — why?
4. Does "double redundancy" look mandatory?
5. Was the money enough? Was there a surplus?
6. Were there missions nobody wanted to take? Why?

## 5. Acceptance metrics (from §25)

| Metric | Target | How to count |
|---------|------|-------------|
| Average rating after 10 missions | > 40 | from the team journal |
| Failure share | 15–35% | failures / missions |
| Share of "impossible" builds | < 10% | from the notes |
| Launcher duplication share | < 40% | from the notes |
| Experimental build share (launcher/instrument) | < 20% | from the notes |
| Experimental subsystems (reserve/FCS/antenna) | reference | from the notes |
| Average P_success of accepted builds | 0.68–0.72 | average over the journal |
| Missions per game | ≥ 9.5 | from the journal |

If the live numbers deviate from the validator by more than 10 pp, first check whether the players
confuse `S_det` and `S`, then check that `D_ratio` is applied correctly.

## 6. Quick check of a single build (no full game)

Open `calc/index.html`:

1. Pick a mission and a trajectory.
2. Assemble the launcher and the payload.
3. Look at the "Checks and result" block: 7 checks, P, D_ratio, S, the verdict, Δrating/ΔVChK.
4. The "Run" button in section 5 is a 10-mission play validator.
5. "CSV of games" — an export for the playtest table.

## 6a. Campaign v1.5 in a chat: `tools/session.mjs`

A step-by-step mode where the player makes the decisions and the engine computes every number
(`calc/campaign.html` is not needed — the game can be played in a chat).

```powershell
node tools/session.mjs new --seed 777 --steps 15   # length 12 / 15 / 18
node tools/session.mjs offers                      # showcase + the GM hint
node tools/session.mjs cards                       # ids and card stats
node tools/session.mjs build --mission m_insight --rocket rocket_medium `
     --res res_single --control ctrl_advanced --instruments "ins_camera:1,ins_spectrometer:1" `
     --antenna ant_medium --power pwr_reactor --physical phy_lander --traj landing
node tools/session.mjs accept --mission m_insight --auto   # or the same keys as in build
node tools/session.mjs launch                      # stage rolls, journal
node tools/session.mjs ops                         # v1.5: flights, MCC channels, risk, plan
node tools/session.mjs overtime --mission m_hubble # v1.5: extend (+$50, +8% S)
node tools/session.mjs close --mission m_hubble    # v1.5: early acceptance (S ×0.6)
node tools/session.mjs prep school|factory|mcs|hire|pr|tech|std|ground|stand|rocket|instrument
node tools/session.mjs next                        # auto-launch ready, salaries, new missions
node tools/session.mjs finish                      # final window + score
node tools/session.mjs report                      # playtest/session-<seed>.md and .csv
node tools/session.mjs undo                        # undo the last action
```

What to record about the campaign (on top of the §3 table):

| Field | Source |
|------|--------|
| Acceptance step and launch step | `show` — "production", "ready step", the journal |
| Plan (P, S_det, verdict) | `build` — the "Checks" and "Plan verdict" blocks |
| Actual (stage rolls) | `launch` — the `launch/collect/physical/channel` lines |
| Preparation costs | `prep` — the "step N: …" line, the treasury after the action |
| School/factory/MCC at the end | `show` — "MCC / factory / school" |
| Total | `finish` — the breakdown by score component |
| Flight (step, channel, % of data) | `show` — the "In flight" block; `ops` — channels and the plan |
| Overload relief from the school | `ops` — the "school −15…60% of the penalty" note |
| Flight events and incidents | `next` — the `ops` / `incident` lines, the journal |
| Overtime and early acceptance | `overtime` / `close` — the acceptance line |

`report` assembles the `.md` and `.csv` from the journal itself; the review questions are in §4,
the campaign acceptance metrics are in `docs/RULES_V15.md` §25 (score ≥ 80, missions 9–14,
failures 13–33%, treasury ±2500 $ including the flights), the flight mechanics — §26–§31.

Two helpers inside `build`:

* **Mission brief** — the description always carries a `data: <type> — matching instruments` line
  and `mission modules: …`. A foreign data type gives `S_det ×0.5` (the engine, `E.data.typeMatch`),
  so "sampling the soil with cameras alone" no longer looks normal either in the chat or on the card.
* **Science consultant** — an input-control block after the build: mass, power, FCS slots,
  deadlines, trajectory modules, budget and data type. It does **not** judge reliability,
  duplication and wear — that is what trial runs are for (`prep stand/rocket/instrument`).
  Turn it off: `build ... --no-consult`.

## 7. Typical mistakes at the first playtest

* Computing `P_success` without `p_channel`: the channel is part of the probability, `D_ratio` is part of the science.
* Forgetting that `S` in the points is `S_det × P_success`, while the verdict is computed from `S_det`.
* Adding the launcher mass to the payload mass (the launcher mass is already inside the payload capacity).
* Applying duplication to the antenna through the FCS (only the instrument build is duplicated;
  the antenna is duplicated by its own module).
* Forgetting the uniqueness bonus (a first arrival at a point ×1.5).
