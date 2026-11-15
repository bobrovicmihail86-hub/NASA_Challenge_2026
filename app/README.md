# Role HQ `game/app`

A single-page app on top of `../data/engine.js`: no build step, no dependencies, works over `file://`.
Open `index.html` (or `index.html?seed=777&steps=15`).

## Screens

| Role | What it does | Key actions |
|---|---|---|
| Manager | showcase, contract, production, preparation | `accept`, `launch`, `launch-all`, `next-step`, `finish`, `prep-hire/mcs/pr`, `ground`, `approve-exp` |
| Engineer | launcher, redundancy, physical modules, trajectory | `recommend`, `patch-engineer`, `confirm-engineer`, `prep-factory`, `test-rocket`, `tech-rocket`, `standardize`, `approve-exp` |
| Scientist | FCS, instruments, power, antenna, buffer | `recommend`, `patch-scientist`, `confirm-scientist`, `prep-school`, `test-stand/instrument`, `tech-instrument`, `standardize`, `approve-exp` |
| MCC | flights, sessions, acceptance, steps | `launch`, `next-step`, `finish`, `overtime`, `close-flight` |

Every change goes through the single point `APP.dispatch(type, payload)`. The role is checked by the
`ALLOWED` matrix in `core.js`; the build is edited only by the engineer/scientist, acceptance and
steps — by the manager/MCC.

## Experiment approval

Experimental launchers and instruments (`exp1`/`exp2`) need a separate approval for a test and for
launching a ready mission:

* on the first attempt of the action a request is created in `state.expApprovals`; the initiator among
  the three signing roles signs it automatically (the MCC only creates the request);
* three signatures are needed — engineer, scientist and manager (`APP.dispatch('approve-exp', { scope, key })`);
* an incomplete request does not block ordinary launches, but the experimental mission stays in `ready`;
* a test approval is valid only within the current step, a launch approval — while the mission waits in `ready`;
* after the action is performed the request is deleted, after the launch — together with the mission;
* signatures are kept in the session; on load, stale requests (another step, a mission outside `ready`) are dropped.

The "Experiment approval" panel shows the requests, the risk cards and the signature buttons; it is
visible on the manager, engineer and scientist screens. Blocked actions return `needsApproval`
and spend no preparation actions.

## Flow

1. `APP.newCampaign(seed, steps)` → `ENGINE.campaignSetup`.
2. The engineer and the scientist edit `APP.builds[missionId].sel` and confirm their parts.
3. The manager calls `ENGINE.campaignManual` (via `APP.buildAnalysis`) and `ENGINE.acceptMission`.
4. Step: `launchReady → stepFlights → endStep → advanceProduction`.
5. Finish: `finalizeFlights → failRemaining → finalScore`.
6. For an experimental build three signatures are collected before a test/launch (`approve-exp`).

`offers`, `production`, `ready`, `flights`, the logs and the role points live in the engine/APP state;
`APP.reports` keeps the latest launch and acceptance reports for the MCC showcase.

## Files

- `index.html` — shell markup.
- `app.css` — dark theme, responsive layout, SVG graphs, mobile layout.
- `core.js` — state, `dispatch`, permissions, checks, saving, undo, chat.
- `ui.js` — header, stepbar, consultant, journal, chat, modals.
- `cards-ui.js` — shared cards, SVG graphs, engineer/scientist screens.
- `manager.js` — manager showcase/production/preparation and the MCC screen.

## Saving

`localStorage['smd.app.v1']` + the Export/Import buttons. Over `file://` storage may be blocked by
browser policy — the app shows a warning and keeps working through a JSON file.
Serialisation does not store `compute` for production/flights; it is rebuilt from `sel` on load.

## Checks

```powershell
node tools/check.mjs 40       # the engine and the balance are untouched
node tools/app-smoke.mjs      # recommendation → signatures → acceptMission → steps → finish → undo/load
                              # + experiment approval: test, launch, save/load, cleanup
```

The browser scenario can be walked by hand: switch roles, press "Recommend", confirm both parts,
accept the mission, close the step and open the MCC.
