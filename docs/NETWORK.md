# Network mode — team rooms

`server/` serves the static game over HTTP and adds a small JSON API plus an event stream, so several people
can build one mission in one team room. One Node process, zero dependencies, no build step. The server is the
only writer: every client change comes back as a fresh snapshot, so two browsers can never drift apart.

The hosted copy on GitHub Pages is static, therefore **solo only** — see §9.

## 1. Start the server

```powershell
node server/index.mjs --port 8080 --data server/data
node server/index.mjs --port 9000 --host 127.0.0.1 --data D:\rooms   # local-only, another port and data dir
```

| Flag | Default | Meaning |
|---|---|---|
| `--port`, `-p` | `8080` | HTTP port |
| `--host` | `0.0.0.0` | listen address; `0.0.0.0` accepts LAN clients, `127.0.0.1` — only this machine |
| `--data` | `./server/data` | rooms, results and sessions on disk |

On start it prints the addresses:

```
Space Mission Design server
  url  : http://localhost:8080/
  lobby: http://localhost:8080/app/lobby.html
  data : …\server\data
  teams: 0
```

`curl http://localhost:8080/api/health` answers `{"ok":true,"service":"smd","teams":…,"rooms":…,"up":…}`.
Stop with `Ctrl+C`: open rooms are persisted on the way out.

Open **`http://localhost:8080/app/lobby.html`** — not the file from disk. The page signs in through
`POST /api/login` and listens to `/api/teams/:id/stream`; over `file://` both calls fail.

## 2. Sign in

The only field is an e-mail. It is an identity, not an account: no password, no confirmation mail, no reset.
The server issues a token, the client keeps it in `localStorage['smd.token']` and sends it as `X-Token`
(the event stream uses `?token=` because `EventSource` cannot send headers). Whoever types an address plays as
that address — keep the server on a trusted network, and use *Sign out* on a shared machine.

## 3. Create a team (the captain)

* name — 2 to 40 characters, plus an emblem: an `https://` link or a `data:` image up to 200 KB (optional);
* seed — `1 … 99999999`, the same seed reproduces the same campaign;
* campaign length — `6 … 24` steps (`15` is the tournament default);
* roster — one row per participant: e-mail, display name, and one or more stations out of
  `manager`, `engineer`, `scientist`, `ops`.

The server enforces: at most 12 members, unique e-mails, at least one role per member, **at least one manager**,
and the captain must be in the roster. The captain cannot be removed from the roster. Roster editing is
captain-only, and so are `new-campaign`, `undo`, `import` and `export`.

## 4. Invite the rest of the team

* the *Invite* button copies `http://<host>:8080/app/lobby.html?join=<teamId>`; the invitee signs in and gets
  the join dialog with the station picker;
* or *Open games* lists every active room with its step, roles and head-count — *Join* asks for a name and roles;
* a full room shows 12 members and refuses new ones;
* the room itself is `http://<host>:8080/app/play.html?team=<teamId>`.

## 5. Inside the room

* the header shows the team, `revision N`, presence (`Online: Anna (manager) · …`) and the campaign status;
* a player sees only the stations their roster entry allows; the role switcher lists just those;
* every action is `POST /api/teams/:id/action` with `{type, role, payload}`; the server checks the allow-list
  and answers with `snapshot` + `analysis` + `rev`, while the other browsers get the same snapshot pushed over
  SSE (`hello`, `snapshot`, `presence`, `history`, `finished`, 20 s heartbeat);
* there is **no turn order**: the team works inside one step in parallel. The step advances when a manager or
  the ops officer presses *Next step*; a mission needs both the engineer and the scientist to confirm their
  parts before the manager can accept it;
* `select-mission` and `toggle-panel` are per-viewer and are not broadcast — everyone may inspect a different
  mission card;
* experimental launchers and instruments need three signatures (engineer, scientist, manager) before a test or
  a launch, as in the solo edition;
* the room has no chat panel: the log and presence are the shared channel, voice is on you. (The server accepts
  a `chat` action and the solo app has a chat, the room UI does not draw one.)

## 6. Who may do what (server-side)

| Group | Actions |
|---|---|
| common | `chat`, `toggle-panel`, `save`, `select-mission` |
| manager | `accept`, `recommend`, `launch`, `launch-all`, `next-step`, `finish`, `prep-hire`, `prep-mcs`, `prep-pr`, `ground`, `approve-exp` |
| engineer | `recommend`, `patch-engineer`, `confirm-engineer`, `prep-factory`, `test-rocket`, `tech-rocket`, `standardize`, `approve-exp` |
| scientist | `recommend`, `patch-scientist`, `confirm-scientist`, `prep-school`, `test-stand`, `test-instrument`, `tech-instrument`, `standardize`, `approve-exp` |
| ops (MCC) | `launch`, `launch-all`, `next-step`, `finish`, `overtime`, `close-flight` |
| captain only | `new-campaign`, `undo`, `import`, `export` |

Anything outside the table is refused with `403`, whatever the client sends.

## 7. LAN, classroom, internet

The default `--host 0.0.0.0` already accepts other machines. Find your IPv4 address (`ipconfig` on Windows,
`ip addr` on Linux/macOS), allow the port in the firewall once, and hand out
`http://192.168.x.x:8080/app/lobby.html`. Rooms need no internet access.

For players outside the LAN, forward the port on the router or put a tunnel in front of it
(`cloudflared tunnel --url http://localhost:8080`, `ngrok http 8080`). The server speaks plain HTTP and has no
TLS of its own — behind a tunnel or a reverse proxy it inherits theirs. Bind `127.0.0.1` if the machine should
not be reachable from the network at all.

## 8. What lands on disk

```
<data>/teams/<teamId>/team.json      roster, seed, length, status
<data>/teams/<teamId>/state.json     campaign state (the room reopens from it)
<data>/teams/<teamId>/history.json   the event log of the room
<data>/results/<teamId>.json         the final record: score, rating, missions
<data>/results/global.json           the tournament table
<data>/sessions.json                 login tokens (e-mail + timestamps); the lobby shows masked addresses
```

Delete `<data>` for a clean tournament — the server recreates the tree on the next start. A finished room is
read-only: only the captain can start a new campaign or export the archive.

## 9. Why the hosted demo has no rooms

GitHub Pages serves files and nothing else: no `/api`, no SSE, no writer. The Pages build is the solo game
(`app/index.html`) and the two calculators; the team room always needs `node server/index.mjs` somewhere.

## 10. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| sign-in fails, the console shows a failed `POST /api/login` | the lobby was opened from disk (`file://`) — use `http://localhost:8080/app/lobby.html` |
| the room shows a `Session expired` gate (401) | the token is gone: the server restarted with another `--data`, or browser storage was cleared — sign in again |
| `you are not a member of this team` (403) | a different e-mail was used, or the captain removed you from the roster |
| `only the captain can do that` (403) | `new-campaign` / `undo` / `import` / `export` are captain-only |
| `action … is not available for role …` (403) | that station does not own the action — switch to another of your roles |
| `the campaign is finished — open the results archive` (409) | the room was finalised; the archive is read-only |
| `a team can have at most 12 members`, `the team needs at least one manager` | the roster breaks the rules from §3 |
| nobody else appears after `Online:` | they are not signed in, or a proxy buffers the `text/event-stream` response |

## 11. What the checks cover

```powershell
node tools/server-smoke.mjs   # boot on a random port: login, team, roles, signatures, final, archive, table
node tools/play-smoke.mjs     # the whole play.js client: snapshot → actions → final, ids and CSS classes
```

