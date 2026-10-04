# hello, world! Family Feud

Host-led Family Feud for the GDG on Campus UOBD event: *hello, world!*, Tue 6 Oct 2026, Innovation Lounge, room 0201. A private moderator console, a separate projector board, and phones that join and vote in an optional crowd-assist poll. Blue Ice theme.

**Status: playable, tested in a browser simulation, not yet event-ready.** The survey results have not arrived, so only the labelled demo pack has been played. No physical phone, venue Wi-Fi or venue projector has been tried. See [Verification](#verification) and [Remaining checks](#remaining-checks).

## Quick start

Needs Node and pnpm. Built and tested only on Node 24.16, pnpm 12.6, Windows 11; other versions are untried.

```bash
pnpm install
pnpm run dev
```

`pnpm run dev` starts the realtime relay on `:4000` and the web app on `:5173`, and prints the address phones should use:

```
Moderator console   http://localhost:5173/host
Phones join at      http://192.168.1.236:5173/join
```

Open the console on the laptop, click **Open projector**, and drag that window to the extended display. Phones need the laptop's LAN address, which the launcher detects. If it picks the wrong adapter: `FEUD_HOST=192.168.1.50 pnpm run dev`.

| Command | What it does |
|---|---|
| `pnpm run dev` | Relay + Vite dev server with the LAN address baked in |
| `pnpm run build` | Typecheck and production build to `dist/` |
| `pnpm run build:lan` | Production build with the laptop's LAN address baked in |
| `pnpm start` | Relay + the production build (run `build:lan` first) |
| `pnpm test` | Unit tests (68) |
| `pnpm run typecheck` / `pnpm run lint` | Types and lint |
| `pnpm run e2e` | Full match across moderator, projector and two isolated phones (needs `pnpm run dev` and Chrome) |
| `pnpm run e2e:failures` | Relay down, storage failing, rejected import, answer editor, template preview, sound unlock, direct navigation |
| `pnpm run e2e:drop` | A phone drops mid-poll, and the 17th phone meets a full room |
| `pnpm run probe` | Raw-socket checks of the relay: room limit, role spoofing, host takeover |

Windows notes: pnpm 12 blocks esbuild's install script unless allowed, which `pnpm-workspace.yaml` does (`allowBuilds`). The stock `air-jam-server dev` wrapper fails on Windows (`spawn pnpm ENOENT`), so `scripts/dev.mjs` replaces it. The upstream command is kept as `pnpm run dev:sdk`.

Keep one `/host` window per browser. A second one warns, because two consoles share one saved game.

## Routes

| Route | Who | Notes |
|---|---|---|
| `/host` | Organiser | Moderator console. The only Air Jam host. |
| `/screen/:roomCode` | Projector | Reads the public snapshot from the console over `BroadcastChannel`. Must be a second window of the same browser on the same origin. `/screen/local` works with no relay. |
| `/join` | Phones | Manual code entry. `/join?room=ABCD` goes straight in. |
| `/controller?room=ABCD` | Phones | The SDK's controller route. **The QR code points here**, not at `/join`, because the SDK builds join links this way. |
| `/play/:roomCode` | Phones | Alias that lands on `/controller`. |

The projector is not a second network host. It never reads the answer pack or the moderator's storage; `tests/boundaries.test.ts` enforces that statically.

## Running a match

1. **Load results** (below). With nothing loaded, questions preview with six empty lines and cannot start a scored round.
2. **Play** tab: pick a question and the starting team, **Start round**. The projector shows the question introduction.
3. **Show the board** (concealed lines), then **Begin guessing**.
4. Judge guesses aloud. **Reveal** a matching answer, or **Add strike (X)**. Keys: `1`–`9`, `0` reveal slots 1–10, `X` strike, `U` undo. Held keys and text fields are ignored.
5. Three strikes give the other team one steal guess: **Steal hit** on the answer, or **Steal missed (X)**.
6. **Award N to Team X** once. **Next round**, or **Finish match**.
7. **Crowd assist** (optional, during a team turn): type 2–6 guesses the room is shouting, choose seconds, **Open poll**. Phones vote once each. **Close poll now** or wait for the deadline; totals show on the projector and phones, and the team decides. Votes never reveal an answer or score points.

House rules (proposed, not attributed to the organisers): two teams, three rounds by default, human judging, three strikes and one steal, pot to the controlling team unless a steal succeeds. A repeated guess shows ALREADY ON THE BOARD and adds neither points nor a strike. Reveals after the award are for discussion and never change a score. Undo restores the previous state exactly; an answer already shown cannot become unknown to the audience.

Any change to the round while a poll is open (a reveal, strike, undo, score correction) cancels the poll, and the host is told.

## Survey data

The 16 supplied questions are fixed. `data/templates/event_questions.pending.json` is the empty template. Real answers are never committed and never bundled; they live in the moderator's browser storage only.

**Load real results** on the *Questions & data* tab either way:

- **Import JSON**: paste or choose a file in the bundled structure (`schemaVersion`, `packId`, `title`, `purpose`, `questions[]` with `id`, `category`, `prompt`, `status`, `survey`, `answers[]`, `approval`). Answer rows are `id`, `rank`, `text`, `count`, `aliases`. A partial pack is fine: questions you leave out stay `awaiting_survey`.
- **Answer editor**: pick a question, add rows (up to 10), set where the results came from, **Confirm these as event results**.

Rules the validator enforces, with specific errors and **no change to the current game on failure**: prompts and categories must match the supplied wording exactly; 1–10 answers; positive integer counts (never scaled to 100); unique ids; duplicate labels and conflicting aliases are flagged; answers sort by count and keep the supplied order on ties; single-response totals cannot exceed the respondent count if given; labels over about 30 characters raise a warning before the round starts and wrap rather than shrink. All text renders as plain text.

`data/demo/demo_pack.json` holds invented practice answers (q01, q03, q10). **Load demo pack** shows **DEMO: INVENTED RESULTS** on the moderator, projector and phones, and it stays visible after a reload. The demo pack is read-only in the editor and cannot be relabelled as event data. A resumed round keeps its own demo flag.

Ask the events team for aggregate answer groups, counts and accepted synonyms only. No student identities, emails or phone numbers are needed or stored.

## Saving and recovery

| Situation | Behaviour |
|---|---|
| Host refresh | Offers **Resume** (restores question, reveals, scores, strikes, any award) or a new match. An unfinished poll is cancelled. The room code changes, so show the new QR. |
| Projector reload | Asks the console for the latest board. Nothing is re-awarded. |
| A phone drops | Shows *Reconnecting*. Board and scoring carry on. If the poll is still open it recovers its accepted vote. |
| Relay down | Crowd assist is disabled with a reason. Reveals, scoring, saving and projector keep working. |
| Browser storage fails | A **NOT SAVED** chip and an UNSAVED warning. The live game continues in memory; **Session → Export private backup** still works. |
| Misclick | **Undo** (`U`). Score corrections (`±1`, `±5`) are separate and undoable. |

Progress and the pack save in this browser after every action. That is a local copy, not a cloud backup. **Session → Export private backup** writes `*.session-backup.json` (already in `.gitignore`); **Restore** validates the whole file first and leaves the current game alone if it is bad. Keep backups out of the public repository.

## Architecture

One authority: the moderator page. It owns the rules engine (`src/engine`, a pure reducer with explicit phases and per-action ids so a repeated delivery is a no-op), the answer pack, undo history, the poll and saving. The public view is built by an allowlist (`src/public/project.ts`) and fanned out two ways: `BroadcastChannel` to the projector, and the Air Jam replicated store to phones. Phones can only call `castVote` and `pollStatus`.

- Air Jam: `@air-jam/sdk` and `@air-jam/server` **0.9.2**, from `create-airjam` (minimal template). The unscoped `airjam` and `@airjam/*` packages on npm are an unrelated product.
- Votes use the store's discrete action with an accept/reject acknowledgement, not the per-frame input lane. **VOTE RECEIVED** appears only after the host accepts. Identity is the framework's connection identity, never the payload. A retry of the same choice confirms without recounting; a different later choice is refused; late, stale, unknown-option and malformed votes are refused.
- Phones keep one stable identity per browser (the SDK stores a device id), so a refresh keeps the same participant: tested, the refreshed phone recovered its vote without a second ballot. Separate browsers count as separate participants (tested with isolated contexts). Two tabs in one browser should share an identity per the SDK docs; that was not tested.
- `src/ui/ScreenView.tsx` is the single renderer for the projector and the console's preview, so the preview shows the real public projection.

Findings from checking the real relay (`pnpm run probe`):

- **Room size is capped at 16 phones.** The SDK protocol schema rejects `maxPlayers` above 16; the 17th phone gets `ROOM_FULL` (the phone shows "This room is full", tested). Left unset the default is 8. Crowd assist works for up to 16 voters per room. If more than 16 people must vote, the SDK cannot do it; the smallest fallback would be a small Express/Socket.IO relay. **Not built, because attendance is unknown.**
- **A `ctx.role === "host"` check is not a security boundary.** A phone can emit `controller:host_action_rpc` and the relay then stamps the call as the host. So the only network-reachable actions are the two vote actions, which distrust the caller. The host publishes through `_publish`, whose underscore prefix makes the relay refuse it on both channels. There is no reveal, score, award or reset action on the network.
- Room codes are 4 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- Phones cannot send host events (`host:state_sync`, `removeController`, `resetRoom`), and a second host cannot take over a room with an active host.
- **Known gap:** with local auth disabled, a client that knows the room code can adopt a room in the window after the real host drops. It can change what phones see, not scores or the projector. Production use should set `AIR_JAM_AUTH_MODE=required`.
- Relay limits by default: 120 controller joins per minute per IP and 30 host registrations per minute, comfortable for 16 phones behind one campus address.
- Local dev runs with auth disabled and CORS `*`. That is for a laptop on a trusted LAN only.

## Deployment status

**Nothing is deployed or published, and no account, spend or credential has been used.** The verified path is local: the organiser's laptop runs the relay and the web app, phones join over the same Wi-Fi.

- `pnpm run dev` and `pnpm start` (after `pnpm run build:lan`) were both run, and the full match passes against each. Fonts, logos and scripts are served locally, so the board and the same-laptop projector work offline. Phone networking still needs the relay and a reachable network.
- In dev, phones reach the relay through the web port (`:5173`). In production preview they connect to `:4000` directly (baked in at build time), so allow both ports through the laptop firewall.
- A public host would need the relay (`@air-jam/server`, a Node/Express/Socket.IO service) and the static frontend, with `AIR_JAM_AUTH_MODE=required`, `AIR_JAM_ALLOWED_ORIGINS`, `VITE_AIR_JAM_APP_ID` and a host-grant secret kept out of the frontend. None of this was configured. **Ask before publishing, deploying, spending or changing accounts.**
- `vercel.json` came with the starter and is unused.

## Verification

Ran on 4 Oct 2026, Windows 11, Chrome (headless via `playwright-core`, no browser download).

**Run and passing:** `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (68 tests: rules, validation, polls, projection and privacy sentinel, store role gating, module boundaries, text escaping, sound cue mapping, storage failure), `pnpm run build`, `pnpm run build:lan`, and the three e2e scripts: 56 checks for a full match, 29 for failures, 12 for phone connection (a drop and the full room). Highlights: a repeated reveal adds nothing; a double click is one strike and a held key is ignored; clear board, successful steal, failed steal and repeated award give the exact totals; undo reverses exactly the recorded award; a planted sentinel answer, alias, count and survey note never appears in the projector, a phone's page, its websocket frames, a raw controller's traffic, phone storage or any script served to a phone until revealed (and an alias never appears).

**Simulated, not physical:**
- "Phones" are two isolated Chrome contexts emulating 390×844 touch devices on this laptop, plus raw socket clients. Not iOS Safari, not Android, not a real touchscreen.
- Disconnects are simulated by blocking websocket and polling traffic, not by a real Wi-Fi drop.
- Projector layouts were captured at 1920×1080, 1366×768 and 1280×720 in headless Chrome, not on the venue projector. Screenshots are in `docs/screenshots/` (`13-final` and the host-resume shot use the privacy test pack, so their totals are test numbers).
- 16 raw sockets filled a room to the cap; that is a limit check, not a load test.
- The audio context unlocks from the button and the cue mapping is unit-tested, but the tones have not been listened to.

**Not run:** any physical phone; venue Wi-Fi, including client isolation; the real projector, fullscreen on it and its legibility from the back; Safari, Firefox; a screen-reader pass; more than one operator rehearsal; a Windows Firewall prompt on a fresh laptop.

## Remaining checks

Work through [`docs/OPERATOR_CHECKLIST.md`](docs/OPERATOR_CHECKLIST.md). Short version:

- [ ] Real survey results loaded, counts and spelling checked, DEMO label gone.
- [ ] At least two physical phones join over the venue Wi-Fi; one vote each, a refresh, a screen lock.
- [ ] The join URL on the screen opens from a phone that is not on the laptop's account.
- [ ] Expected attendance known; decide whether the 16-phone cap is acceptable.
- [ ] Projector: fullscreen, sound enabled, QR scans from the back, long labels readable.
- [ ] One full rehearsal by the person who will operate it, including an undo, a host refresh and a relay-off run.
- [ ] Confirm the game's stage time and operator with Rayyan.

## Third-party material

Blue Ice values were checked against the club guide on 4 Oct 2026 and match (`#1E3FD9`, `#0A1B66`, `#142FB0`, `#F3F8FF`, `#CFE0FF`, `#B8CEFF`). From `UdayAhuja19/gdg-resources`: `src/styles/blue-ice.css` (font paths edited to `/fonts/`), `src/styles/blue-ice-club.js` (unmodified; draws the cracked wordmark), `public/brand/gdg-mark-*.svg`. Fonts are Archivo and DM Mono under the SIL Open Font License, with licences beside them in `public/fonts/`. No font is loaded from a network host at runtime.

## Layout

```
src/engine/    rules reducer, phases, undo          src/public/   public snapshot, channel, projection
src/content/   canonical questions, validation      src/poll/     ballot logic
src/host/      moderator console, saving            src/game/     the Air Jam store (public state + votes only)
src/screen/    projector page                       src/play/     join page, phone controller
src/ui/        shared renderer, sound, stage        scripts/      launcher, relay probe, e2e runs
```
