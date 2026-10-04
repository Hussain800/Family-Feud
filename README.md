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
| `pnpm run serve` | The Render server: relay and built game on one port (`PORT`, default 4000); run `pnpm run build` first |
| `pnpm test` | Unit tests (106) |
| `pnpm run typecheck` / `pnpm run lint` | Types and lint |
| `pnpm run e2e` | Full match across moderator, projector and two isolated phones (needs `pnpm run dev` and Chrome) |
| `pnpm run e2e:failures` | Relay down, storage failing, rejected import, answer editor, template preview, sound unlock, direct navigation |
| `pnpm run e2e:drop` | A phone drops mid-poll, and the 17th phone meets a full room |
| `pnpm run e2e:extras` | A level match, the tie-break round, and the countdown timer on the projector |
| `pnpm run e2e:paste` | Pasting survey rows from a spreadsheet: errors by line, preview, load, adding to a loaded pack, playing a pasted question |
| `pnpm run e2e:faceoff` | Face-off with real key presses: buzz order, play or pass, learning a buzzer, a Space-bar buzzer, manual fallback |
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
2. **Play** tab: pick a question, **Start round**. The projector shows the question introduction.
3. **Show the board** (concealed lines), then **Start face-off (buzzers)** (below). **Skip face-off, begin guessing** is the old flow: the starting team picked in the question list (or **Switch start to**) plays.
4. After the face-off the winner chooses; then judge guesses aloud. **Reveal** a matching answer, or **Add strike (X)**. Keys: `1`–`9`, `0` reveal slots 1–10, `X` strike (a miss, during the face-off), `B` open buzzers, `U` undo. Held keys and text fields are ignored.
5. Three strikes give the other team one steal guess: **Steal hit** on the answer, or **Steal missed (X)**.
6. **Award N to Team X** once. **Next round**, or **Finish match**. Between rounds the projector shows the scoreboard ("After round 1 of 3 … Team B leads … round 2 is next"), not the join page.
7. **Crowd assist** (optional, during a team turn): type 2–6 guesses the room is shouting, choose seconds, **Open poll**. Phones vote once each. **Close poll now** or wait for the deadline; totals show on the projector and phones, and the team decides. Votes never reveal an answer or score points.

### Face-off and buzzers

The tech lead confirmed a buzzer face-off between one player from each team, the winner choosing play or pass, on physical buzzers the club already owns. On 4 Oct he confirmed they are **standalone** buzzers (not connected to any computer), and that two named club members (Salena and Manahil) will judge it. So the main route is: the judges say which buzzer was first, and whoever runs the laptop taps that team. Every round opens with the face-off unless you skip it.

1. **Start face-off (buzzers)**. The projector says to bring one player per team to the buzzers. Read the question aloud.
2. When a buzzer goes off, tap **Team X buzzed first** (a wrong tap can be corrected by tapping the right team before anyone answers). The projector shows which team buzzed (a soft ping plus a lit team card). The player answers aloud. *USB keyboard-style buzzers instead:* open the small section under the buttons and press **Open buzzers** (`B`); the first key press then counts and a second is ignored, and a press before opening is ignored too.
3. Judge it: **Reveal** the matching answer (click or press its number), or **Miss** (`X`). A miss is not a strike.
4. If the first buzzer's answer is the top answer, that team wins the face-off immediately. Otherwise the other team's player answers: the higher survey count wins, a tie goes to the first buzzer, and if one misses the other's hit wins. If both miss, **Open buzzers** again for the next two players.
5. The winner is asked **play or pass**; click **Team X PLAYS** or **Team X PASSES to Team Y**. The face-off answers already revealed stay on the board and in the pot, which goes to whichever team ends up in control (Wikipedia describes the TV show the same way: the winning family scores every revealed answer, including the face-off ones).
6. Strikes, steal and award continue exactly as before.

If something goes wrong: **Skip face-off** (confirm) goes straight to guessing with the starting team; **Undo** (`U`) steps back through a buzz or a result; **Team X buzzed first** is the standard route for the club's standalone buzzers (see above); **Open buzzers** after an accidental buzz clears it.

**Connecting USB keyboard-style buzzers (only if the club's turn out to be that kind; they are not expected to be).** The game reads buzzers that act like a keyboard key (the common USB kind): one key per team. Plug them in, open the **Session** tab, click **Learn** beside a team, press that team's buzzer, and repeat for the other team. Pressing a learned buzzer lights its lamp on that tab, so you can test before the event. The keys are saved in this browser. Until you learn them, `Q` (first team) and `P` (second team) work as test buzzers, so two people can try a face-off on one keyboard. Constraints:

- The moderator window must be focused. Browsers deliver key presses only to the focused window; the console warns while buzzers are open and the window is not focused. If you click the projector window (to go fullscreen), click the console again.
- Buzzer keys take priority over Play-tab shortcuts, so a stray buzzer press can never reveal an answer. If a buzzer sends a digit, `X` or `U`, that shortcut stops working; use the buttons.
- Two buzzers that send the same key cannot be told apart; the app refuses to give two teams one key.
- Ties closer than a few milliseconds cannot be separated in a browser; the first key event to reach the page wins.
- **Not tested with the real buzzers**: their model is unknown. Keyboard behaviour was tested with real key presses in Chrome only. Buzzers that do not connect to the laptop need the manual buttons, and then the host's ears decide who was first; those cheap sets have no lock-out, so a second person watching helps.

House rules (proposed, not attributed to the organisers): two teams, three rounds by default, human judging, three strikes and one steal, a buzzer face-off then play or pass, pot to the controlling team unless a steal succeeds. A repeated guess shows ALREADY ON THE BOARD and adds neither points nor a strike. Reveals after the award are for discussion and never change a score. Undo restores the previous state exactly; an answer already shown cannot become unknown to the audience.

8. **Countdown timer** (during a face-off, a team turn or a steal): **5 s / 10 s / 20 s / 30 s** under the round buttons put a large countdown in the middle of the projector's header, with a tick for the last three seconds and a buzzer at zero (**TIME** stays up). **Stop timer** removes it, and so does anything that happens in the round (a buzz, a reveal, a strike, an undo), so start it after the buzz, once the answer is awaited. It is advice for the room: nothing is enforced when it hits zero, the host still decides. The projector must stay a window of the same browser as the console (it reads the host's clock).
9. **Tie-break round**: if the match ends level, the Match over panel offers **Play a tie-break round**. It adds one round (a normal one, with its own face-off, strikes and steal, picked from the unplayed questions), and the projector calls it TIE-BREAK instead of "round 4 of 4". If that round is level too, the button appears again. Undo steps back to the finished tie. A tie is still allowed to stand: just do not press the button.

Any change to the round while a poll is open (a reveal, strike, undo, score correction) cancels the poll, and the host is told.

## Survey data

The 16 supplied questions are fixed. `data/templates/event_questions.pending.json` is the empty template. Real answers are never committed and never bundled; they live in the moderator's browser storage only.

The events team surveys students on Monday 5 Oct and Rayyan expects the answers at the end of that day, the night before the event. Ask them for a sheet with one row per answer: **question number, answer, number of students who said it** (and optionally a fourth column of other wordings to accept). Then, on the *Questions & data* tab:

- **Paste results from a spreadsheet** (the fast way): copy the rows from Google Sheets or Excel (or paste a CSV, or choose a `.csv` file), **Check these rows** (errors are listed by line, nothing changes), read the preview, **Load these results**. Question numbers are 1 to 16; the question wording always comes from the supplied list. Paste a few questions at a time if you like: questions already loaded stay unless you paste them again, and the previous pack is kept as a recoverable copy. Rows are sorted by count; a duplicate answer, a non-whole count or more than 10 answers per question is refused with a reason. Pasted rows are always an event pack, never the demo pack.

Two other ways:

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
- **Known gap:** with local auth disabled, a client that knows the room code can adopt a room in the window after the real host drops. It can change what phones see, not scores or the projector. A public product should set `AIR_JAM_AUTH_MODE=required` with a registered app id; the club deployment deliberately runs with it disabled (see *Deploying*).
- Relay limits by default: 120 controller joins per minute per IP and 30 host registrations per minute, comfortable for 16 phones behind one campus address.
- Local dev runs with auth disabled and CORS `*`. That is for a laptop on a trusted LAN only.

## Deploying (a public link for friends and the tech lead)

**Status: nothing is deployed, and no account, spend or credential has been used.** The config is ready (`render.yaml`, `scripts/serve.mjs`) and the same server was run locally in production mode; it has not been run on Render itself.

How it fits together: `scripts/serve.mjs` runs the Air Jam relay and serves the built game from one port, so one Render web service gives one link, the same shape as the other club games on Render. Phones, the console and the projector all use that address; phones no longer need to be on the laptop's Wi-Fi.

To put it on Render (about 10 minutes, free plan):

1. On render.com, **New + > Blueprint**, connect the GitHub repo `Hussain800/Family-Feud`, and **Apply**. Render reads `render.yaml`. (Manual alternative: New + > Web Service, same repo, build command and start command copied from `render.yaml`, plus the three env vars in it.)
2. Wait for the build (a few minutes). The address looks like `https://gdg-family-feud.onrender.com` (Render may add letters if the name is taken). Every push to `main` redeploys it by itself.
3. Open `<address>/host` on the laptop, **Open projector** on the same browser, and phones scan the QR on the projector. Share `<address>/host` only with whoever runs the game; friends testing phone voting use the QR or `<address>/join`.

Things to know:

- **Free plan sleeps.** After about 15 minutes with no traffic the service stops, and the next visit takes 30 to 60 seconds to wake; all rooms are lost whenever it restarts. For the event, open it 10 minutes early, and consider a paid instance for the day (a spending decision for the club; not made here).
- **Results stay in the moderator's browser, per address.** Browser storage belongs to one address, so results pasted at `localhost:5173` are not there at the Render address. Load the real results at the address you will use on the day, and keep **Session > Export private backup** (Restore works on any address).
- **The relay runs with Air Jam app authentication disabled** (`AIR_JAM_AUTH_MODE=disabled`), because the framework otherwise insists on an account-backed app id. Consequences: anyone who can reach the address can open `/host` (they get their own empty console; the real answers live only in your browser) and create rooms; and, as noted under *Known gap* above, someone who knows a room code can adopt a room after its real host drops, which can change what phones see but not scores or the projector. Acceptable for a club evening; not for a public product.
- The laptop needs internet to load the page and keep phones connected. Keep the local route (`pnpm run dev`) as the backup if the venue connection is poor. The board and scoring keep working in an open console even if the connection drops.
- To test the same thing locally in production mode: `pnpm run build`, then `NODE_ENV=production PORT=8080 pnpm run serve`, and open it by your LAN address (not `localhost`, which phones cannot reach, so the projector would not show a QR).

## Local network status

`pnpm run dev` and `pnpm start` (after `pnpm run build:lan`) were both run, and the full match passes against each. Fonts, logos and scripts are served locally, so the board and the same-laptop projector work offline. Phone networking still needs the relay and a reachable network.

- In dev, phones reach the relay through the web port (`:5173`). In production preview they connect to `:4000` directly (baked in at build time), so allow both ports through the laptop firewall.
- `pnpm run serve` (the Render server) was also run in production mode, on one port, through the full match with two phones, the failure scenarios, the 16-phone limit, the face-off, spreadsheet paste and the tie-break and timer scripts, all against the laptop's LAN address.
- A fully self-run public host needs the relay (`@air-jam/server`) and the static frontend: `scripts/serve.mjs` does both. Air Jam's own app-id authentication (`AIR_JAM_AUTH_MODE=required` with a database or master key) was not set up. **Ask before publishing, deploying, spending or changing accounts.**
- `vercel.json` came with the starter and is unused (Vercel cannot host the relay).

## Verification

Ran on 4 Oct 2026, Windows 11, Chrome (headless via `playwright-core`, no browser download).

**Run and passing:** `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (106 tests: rules including the face-off and tie-break, validation, spreadsheet paste, polls, projection and privacy sentinel, store role gating, module boundaries, text escaping, sound cue mapping, storage failure), `pnpm run build`, `pnpm run build:lan`, and the six e2e scripts: 57 checks for a full match, 30 for failures, 12 for phone connection (a drop and the full room), 28 for the face-off with real key presses, 8 for pasting survey rows, 16 for the tie-break and the timer. Highlights: a repeated reveal adds nothing; a double click is one strike and a held key is ignored; clear board, successful steal, failed steal and repeated award give the exact totals; undo reverses exactly the recorded award; a planted sentinel answer, alias, count and survey note never appears in the projector, a phone's page, its websocket frames, a raw controller's traffic, phone storage or any script served to a phone until revealed (and an alias never appears).

**Simulated, not physical:**
- "Phones" are two isolated Chrome contexts emulating 390×844 touch devices on this laptop, plus raw socket clients. Not iOS Safari, not Android, not a real touchscreen.
- Disconnects are simulated by blocking websocket and polling traffic, not by a real Wi-Fi drop.
- Projector layouts were captured at 1920×1080, 1366×768 and 1280×720 in headless Chrome, not on the venue projector. Screenshots are in `docs/screenshots/` (`13-final` and the host-resume shot use the privacy test pack, so their totals are test numbers).
- 16 raw sockets filled a room to the cap; that is a limit check, not a load test.
- The audio context unlocks from the button and the cue mapping is unit-tested. The sound effects and the theme loop are original and synthesised in the browser (no samples, nothing copied from any show), but nobody has judged how they sound yet; that needs a person with speakers. The theme plays on the lobby, the question intro, between rounds and at the end, and is silent during live play so the host can talk. Switch it off with **MUSIC OFF** on the projector's control bar.

**Done by a person, on 4 Oct 2026:** one physical phone (Samsung S25 FE, Samsung Internet) on the home Wi-Fi joined from the QR code, voted, and saw the results; the join was almost instant.

**Not run:** the physical buzzers (model unknown); more than one physical phone; venue Wi-Fi, including client isolation; the real projector, fullscreen on it and its legibility from the back; Safari, Firefox; a screen-reader pass; more than one operator rehearsal; a Windows Firewall prompt on a fresh laptop.

## Remaining checks

Work through [`docs/OPERATOR_CHECKLIST.md`](docs/OPERATOR_CHECKLIST.md). Short version:

- [ ] Real survey results loaded, counts and spelling checked, DEMO label gone.
- [ ] The real buzzers: Session tab, Learn each one, press to test; run one face-off with the console window focused. If a buzzer will not register, use the manual buttons.
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
