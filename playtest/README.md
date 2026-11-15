# playtest/

This folder holds the campaign chat-GM states (`tools/session.mjs`) and the reports built from them.

* `session-<seed>.json` — the game state (treasury, NP, PM, production, RNG state).
  The file is created by the `new` command and rewritten after every action.
* `session-<seed>.prev.json` — the previous state, restored by `undo`.
* `session-<seed>.md` / `.csv` — the mission-journal report (`report`): step, mission, point,
  trajectory, P, S_det, verdict, Δrating/ΔVChK, price and advance.

`compute` is not stored in the JSON — it is recalculated from the state through
`ENGINE.campaignCompute`, so the file can be edited by hand without breaking the calculation.

Quick start:

```powershell
node tools/session.mjs new --seed 777 --steps 15
node tools/session.mjs offers
node tools/session.mjs accept --mission m_insight --auto
node tools/session.mjs launch
node tools/session.mjs prep school
node tools/session.mjs next
node tools/session.mjs finish
node tools/session.mjs report
```

`node tools/session.mjs selftest` runs a scripted scenario twice
and checks that the state and the printed output match (determinism).
