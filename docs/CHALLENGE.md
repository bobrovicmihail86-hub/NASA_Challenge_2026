# NASA Space Apps Challenge 2026 — Space Mission Design Game

Official challenge page:
<https://www.spaceappschallenge.org/2026/challenges/space-mission-design-game/>

This document collects the brief the project was built against and maps every part of it to what is
implemented. The authoritative wording lives on the official page; the quotations below follow it.

## The challenge

> Designing a space mission requires careful consideration of competing demands, including mission
> objectives, spacecraft design, scientific instruments, launch vehicles, budgets, power, mass,
> communications, and orbital constraints. For students who rarely get to experiment with an entire
> mission from concept to operation, these trade-offs often remain abstract. Your challenge is to create
> an interactive game that allows participants to design, manage, and simulate a complete space mission
> while making engineering decisions, managing limited resources, and evaluating how each choice shapes
> the success of their mission.

## Background

> Space missions are complex systems in which scientific objectives, engineering requirements, available
> resources, and operational constraints must work together. Designing a mission involves decisions about
> the spacecraft, scientific instruments, launch vehicle, orbit, power, mass, communications, budget, and
> mission lifetime. A decision that improves one aspect of a mission can create limitations in another.
> For example, adding a more capable instrument may increase scientific value while also increasing mass,
> power consumption, data volume, and cost. Understanding these trade-offs is essential to developing
> successful space missions.

> However, learning space mission design is often limited to theoretical exercises because students and
> aspiring engineers rarely have access to an environment where they can experiment with an entire
> mission from concept to operation. Existing tools often focus on individual topics such as orbital
> mechanics, spacecraft design, or rocket launches without demonstrating how these elements interact as a
> complete system.

> An interactive game can help address this gap by allowing participants to experiment, make decisions,
> encounter constraints, and learn from both successful and unsuccessful missions. Players could design
> missions individually or collaborate in teams of up to four people, with each participant contributing
> to the mission strategy and working together to achieve the best possible result.

## Objectives

> Your challenge is to create an interactive Space Mission Design Game that allows participants to
> experience the process of designing and managing a complete space mission. You may consider enabling a
> player to participate individually or collaborate with a team of up to four people, with participants
> working together to make strategic decisions and achieve the highest possible mission performance.

> The game could allow participants to define a mission objective, establish mission requirements, design
> a spacecraft, select scientific instruments, choose a launch vehicle and orbit, and manage key
> constraints such as budget, mass, power, communications, data, and mission lifetime. Players benefit
> from seeing how their decisions affect other parts of the mission, and from understanding the
> trade-offs involved in real-world space mission design.

## Directions suggested by the brief

**Mission design.** Start from a mission objective before making spacecraft and engineering decisions;
give every major design decision a consequence (more instruments — more science, but also more mass,
power, cost and data); show that there is rarely a single perfect solution; keep realistic constraints on
budget, mass, power, communications capacity and mission lifetime.

**Spacecraft and payload.** Structure, power systems, batteries, communications, onboard computers,
attitude control and scientific instruments. Instruments have mass, power consumption, cost, data
generation and scientific value; simple and advanced components can serve different difficulty levels.

**Orbit and launch.** Several orbital options with their characteristics; the chosen orbit affects
coverage, observation opportunities, communications and mission lifetime; launch vehicles differ in
payload capacity, cost and orbital capability, and the spacecraft mass must be compatible with the
launcher and the orbit.

**Resource management.** Mass, power, budget, data, communications and time are visible at all times, and
the game may point out which of them are critical for the current mission.

**Collaboration.** In team mode up to four participants work on the same mission, with different roles
and responsibilities, situations that require negotiating between competing priorities, and a final
result that depends on how well the team coordinates its decisions.

**Educational value.** Explain concepts such as orbital altitude, payload capacity, power consumption,
data rate and communications in simple terms through the game itself; use short explanations, tutorials,
visual indicators or optional learning resources, and teach *why* a decision affects mission performance
instead of only stating whether it was correct.

**Optional features suggested by the brief.** Multiple mission scenarios, random events and unexpected
constraints, difficulty levels, realistic or simplified spacecraft models, interactive spacecraft
visualisations, mission dashboards with real-time resource consumption, leaderboards and rankings, mission
reports, saving/sharing/comparing designs, cooperative missions for up to four players, competitive
scenarios and a sandbox mode, plus a post-mission analysis explaining why the mission succeeded or failed.

## How this project answers the brief

| Brief direction | Implementation |
|-----------------|----------------|
| Mission design starting from an objective | 27 mission cards + 4 salvage missions (`data/missions.js`); the card fixes the target point, deadline and required instruments, the contract sets the reward and the penalty |
| Every decision has a consequence | one engine (`data/engine.js`) recalculates mass, power, data, money, `P_success`, science `S`, points and rating after each card |
| No single perfect solution | 90 cards and the §12 reference builds give the same objective several valid builds with different risk profiles |
| Realistic constraints | launcher payload vs target point, power budget per mode, data volume vs downlink, ground-station sessions, deadlines, treasury |
| Spacecraft and payload | buses, redundancy, physical modules, FCS/attitude control, instruments, antennas, power sources, buffer, facilities 0–4 |
| Orbit and launch | six target points with trajectory multipliers 0.85–1.15; launchers `light → superheavy` with price, payload and reach |
| Resource management | one dashboard in `calc/` and `app/`: mass, power, budget, data, communications, time; the consultant lists blockers and risks |
| Collaboration up to four players | four roles with separate signatures in `app/index.html`; network team rooms in `server/` + `app/play.html` |
| Educational value | tooltips on every element (`data-tip`), plain-language rulebook `docs/RULES_V15.md`, chat-GM `tools/session.mjs`, Monte Carlo report |
| Random events | 8 kinds / 14 flight-event cards plus campaign events (`CARDS.opsEvents`, `CARDS.events`) checked against the build, not chosen by the player |
| Mission report and post-mortem | verdict, points, rating, journal, `tools/session.mjs report` (`.md`/`.csv`), archive and leaderboard in network mode |
| Save / share / compare | `localStorage` state plus Export/Import in the browser; seed-based campaign reproducibility |
| Tabletop edition | `print/cards.html` (63×88 mm), `print/board.html` (A3), `print/tokens.html` |
