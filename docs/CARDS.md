# Decks and card printing

Deck composition and print runs. The data source is `data/cards.js`, `data/missions.js` and
`data/config.js` (`deckCopies`). Printing — `print/cards.html`.

## 1. Composition

| Deck | Kinds | Cards | Key fields |
|--------|-------|------|----------------|
| Upper stages | 5 | 22 | payload, p, price, cycles, PM, NP, power/channel bus |
| Reservation units | 3 | 15 | price ×1.0/1.6/1.2, launcher mass, duplication type |
| Flight control systems | 4 | 19 | slots 3/5/5/6, duplication, power |
| Instruments | 5 | 28 | mass, W, Mbit/s, value, p, data type |
| Antennas | 5 + 1 | 21 | Mbit/s, p, mass, duplication module |
| Power and buffers | 5 + 4 | 30 | W, type (solar/RTG), kWh |
| Physical modules | 5 | 16 | mass, price, stage p, S bonus |
| Facilities (factory/school) | 10 | 10 | stages 0–4, effects, school upgrade cost |
| Events | 13 | 28 | conditions, effects |
| Decor | 8 | 16 | mass 0 |
| **Missions** | **27** | **27** | point, complexity, S target, deadline, trajectories, history |
| Salvage missions | 4 | 4 | $50, p 0.60–0.75 |
| **Total (v1.3 core)** | **99** | **236** | |
| Experimental ladder (v1.5) | 6 | 6 | std1 / exp2 / std2 for launchers and instruments; p is fixed by standardisation |
| MCC 0–4 (reference) | 5 | 5 | level, launches, channel p, S, upkeep |
| Tests | 3 | 3 | cost, q, IP, refund |
| Ground contracts | 6 | 6 | fund, NP, VChK, IP |
| Flight events (v1.5) | 8 | 14 | build check, session slice, IP/money/risk |
| **Total (with the v1.5 campaign)** | **127** | **270** | |

The "all" print set (without missions, salvage missions and the campaign decks) is 211 cards, 24 A4
sheets. The MCC, tests, ground contracts and flight events decks print with their own buttons.
For a quick playtest print by decks: first missions + launchers + FCS + instruments + antennas + power.

## 2. Card anatomy

**Face:** header (kind + id), a 30 mm art window, the name, a sub-line, a stat block (2 columns) and
a short rules text.
**Back:** for missions — a historical note, the real outcome and a comment; for everything else —
the extended rules and the formula.

Format 63×88 mm (a standard card with a back), 3×3 on A4, 3 mm gap, 7 mm margins.
Art — `art/assets/<id>.png`; when the file is missing a placeholder with initials and a blueprint grid
is drawn, so the deck can be printed before the art is generated.

## 3. Consumption and print run

* **Consumables** (discarded after a launch): the upper stage, the reservation unit and the flight
  control system. Their print run is baked into the card (`copies`).
* **Reusables** (returned to hand): instruments, antennas, power, buffers, physical modules and decor.
  The print run is "how many can sit in one build at the same time".
* **Facilities** — one card per facility, the stage is marked with a cube on the board.
* Events — shuffled into their own deck, drawn at the end of the step.

The copy limit is the main balancer: the deck holds 3 "double" reservations and 3 "duplicating" FCS
cards, so duplication physically cannot be used in more than 30–34% of the missions (see
`docs/RULES_V15.md` §12).

## 4. Printing

1. Open `print/cards.html` in a browser.
2. Pick a deck with the buttons at the top and enable "respect the print run".
3. Print: A4, portrait, scale 100%, no browser margins (the margins are set in CSS — 7 mm).
4. Backs: enable "backs" and print on the reverse side of the sheet, flipping along the long edge.
   The order of the cards on the backs is mirrored automatically.
5. Cutting: 63×88 mm, ideally on a guillotine; round the corners at 3 mm.

Board: `print/board.html` — A3, landscape, scale 100% (404×281 mm of working area).
Tokens: `print/tokens.html` — A4, cut along the dotted lines, 200–300 g/m² card.

## 5. What to print for the first playtest

The minimal set (≈180 cards, 20 sheets):
missions 27, launchers 22, reservations 15, FCS 19, instruments 28
(by the `CONFIG.deckCopies` print run: 8 cameras, 7 spectrometers, 6 radiometers,
6 magnetometers, 1 experimental), antennas 19, power 17, buffers 13,
physical modules 16 + the A3 board + tokens.

Decor cards and events — on the second pass, after calibration. The full set
(211 cards without missions and salvage missions) prints with the "all" button in `print/cards.html`.
