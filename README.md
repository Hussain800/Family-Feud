# hello, world! Family Feud

Host-led Family Feud for the GDG on Campus UOBD event *hello, world!* (Tue 6 Oct 2026, Innovation Lounge, room 0201), in the Blue Ice theme.

**How it is played (agreed with the tech lead, 4 Oct):**
- Two teams come to the front, and Salena and Manahil present.
- The club's standalone physical buzzers settle the face-off; the presenters judge it.
- Team members answer out loud.
- One person (Hussain) runs the laptop: they reveal answers, record wrong answers and keep score.

The app has two screens, a private **moderator console** and a public **projector board**. Phones are optional: an off-by-default phone-buzzer mode gives one paired phone per team, pending Rayyan's final decision. Team size never depends on phones.

**Status: release candidate for Tuesday 6 Oct, tested in a browser simulation; not yet event-ready.**
- The events team's workbook (14 questions, 73 answers) is converted to a private event pack and has been played end to end. It is not in this repository: it has to be loaded into the browser on the event laptop ([Survey data](#survey-data)).
- Teams are chosen by colour: Team Red, Blue, Yellow, Green, Black or White.
- No venue projector, venue Wi-Fi, speakers or real buzzer phones have been tried.

See [Verification](#verification).

## Quick start

Needs Node and pnpm (built and tested on Node 24.16, pnpm 12.6, Windows 11).

```bash
pnpm install
pnpm run dev
```

1. Open `http://localhost:5173/host` on the laptop.
2. Click **Open projector**, drag that window to the projector, and answer its sound prompt (**Enable sound** or **Continue muted**).
3. Move the mouse on the projector, open **Projector settings** (top right) and choose **Fullscreen**.

The console's header shows whether the projector is open and whether its sound is on.

| Command | What it does |
|---|---|
| `pnpm run dev` | Relay on `:4000` + Vite dev server on `:5173` (the LAN address is baked in for phone mode) |
| `pnpm run build` | Typecheck and production build to `dist/` |
| `pnpm run serve` | The Render server: relay and built game on one port (`PORT`, default 4000); run `pnpm run build` first |
| `pnpm test` | Unit tests |
| `pnpm run typecheck` / `pnpm run lint` | Types and lint |
| `pnpm run e2e` | A complete physical-buzzer game with the relay unreachable (needs `pnpm run dev` and Chrome) |
| `pnpm run e2e:guide` | The quick guide: offer, Skip, replay, keyboard, no effect on the game |
| `pnpm run e2e:event` | The rehearsal: a three-round match with the private event pack, then Yellow/Green, Black/White and White/Black (needs `private/family_feud_board.xlsx` and `private/event-pack.json`, otherwise it skips itself; it imports the Excel file through Setup; `VIEW=1366x768` for the small size) |
| `python scripts/workbook_to_pack.py <workbook.xlsx>` | Checks the events team's workbook against its source cells and writes `private/event-pack.json` (the app itself reads the `.xlsx` directly in Setup) |
| `pnpm run e2e:phones` | Phone buzzers: two phones, pairing, a full face-off, an impostor, stale and duplicate presses, a drop |
| `pnpm run e2e:faceoff` | Face-off rules: taps, corrections, misses, the hosts' call, play or pass, skipping |
| `pnpm run e2e:failures` | Relay down, storage failing, rejected import, answer editor, preview, projector sound, odd URLs |
| `pnpm run e2e:extras` | A level game, the tie-break round, the countdown timer |
| `pnpm run e2e:paste` | Pasting survey rows from a spreadsheet |
| `pnpm run probe` | Raw-socket checks of the relay (room limit, role spoofing, host takeover) |

Windows notes:
- `pnpm-workspace.yaml` allows esbuild's install script.
- `scripts/dev.mjs` replaces the stock `air-jam-server dev`, which fails on Windows. The upstream command is kept as `pnpm run dev:sdk`.

Keep one `/host` window per browser. A second one shows a warning.

## Running the game

**First visit:** the console offers *New here? Learn the controls in about a minute.* That is five small popovers over the real controls; **Skip** is remembered on that laptop. **Quick guide** in the header replays it at any time, and it never starts on its own during a game.

The console has two screens:
- **Live**: the game itself.
- **Setup**: survey results, buzzer choice, projector check, backups. Visit it before the event.

During a round the console shows:
- the question, large;
- one box saying **what happens now**, with the buttons for it;
- every private answer with its points and a **Reveal** button;
- **Wrong answer** (`X`) and **Undo** (`U`), always at the bottom;
- scores, round points and strikes on the right, with **Adjust score** for penalties and corrections;
- a small copy of the audience screen, which you can collapse.

Keys: `1`–`9` and `0` reveal answers 1–10, `X` wrong answer, `U` undo. Keys do nothing while you are typing in a box.

1. **Live**: choose the two teams under **Teams** (**First team**, **Second team**: six colours each; a colour one team has is greyed out for the other) and press **Start** on a question. With the event pack that is Question 1 to 14. A browser with no event pack shows *No event questions on this laptop yet* instead of a question list.
2. **Show the board** once the presenters have read the question.
3. **Start the face-off.**
   - Tap **Team X buzzed first** for whichever buzzer the presenters name. A buzz only decides who answers first.
   - Press **Reveal** if their answer is on the board, or **Wrong answer** (one red X, no strike).
   - If the first answer is not the top one, the other player answers too.
   - Then record the presenters' decision with **Team X wins the face-off**. The console shows what the survey suggests (*By the survey, Team A wins: Team A found the top answer*), but the presenters decide and can overrule it. **Hosts already decided?** and **Wrong call?** cover the rest.
4. Choose **Team X plays** or **Team X passes**.
5. The team answers out loud, one by one. Press **Reveal** for a match (the tile flips over on the projector, with a bell). Press **Wrong answer** for a miss (a big red X and a buzzer).
6. The third wrong answer opens the **steal**: the other team gets one guess. **Reveal** if it is right (they take the round), **Wrong answer** if not.
7. **Give N points to Team X** (once; a fast double-click awards once, never twice, but its second click also lands on **Next question**), then **Next question**. Reveal the rest for fun afterwards; it never changes a score.
8. After the last round the projector shows the winner. Under **Next teams**, choose the next two colours and confirm: the scores and the round reset, the answers stay, and questions already played are tagged *Used in an earlier game* so the next pair gets fresh ones. **Setup → Game → Correct a team's colour** fixes a wrongly chosen colour without touching scores, the round or the buzzers.

Also available:
- **Skip the face-off**, then pick who plays first.
- **End round early.**
- **Timer** (5 to 30 s, advice only; it ends by itself or when anything happens).
- **Play a tie-break round** when a game ends level.

House rules (proposed, not set by the organisers):
- Four rounds (questions) per game by default (Setup).
- Three strikes and one steal.
- Face-off answers count once, in the round's points, for whichever team ends up playing.
- A repeated answer shows ALREADY ON THE BOARD and costs nothing.
- Undo restores the previous state exactly. An answer the room has seen cannot be hidden again.

### The projector

The projector uses a fixed 1920×1080 stage. It scales to any screen, centred, with even bars on other aspect ratios, so the layout never reflows or crops.

Every state is one centred composition on the ice, with the club's four colours as a thin rule on the bottom edge:
- **Title card:** the club line, the cracked *hello, world!* wordmark (its fracture fades out before the text), a large FAMILY FEUD title plate, and the two teams with equal weight.
- **Question introduction.**
- **The framed answer board:**
  - hidden tiles are raised ice panels with their number in the middle;
  - revealed tiles are frost, with the answer on the left and the points in their own block;
  - one to ten answers fit, and long answers step down a size instead of being cut off.
- **Steal, points, between rounds and the winner**, all in the same style.

**GDG colours** follow the club's own rules:
- The official mark (yellow, red, blue, and black, drawn in frost on blue so it stays visible) and FAMILY FEUD's code brackets, drawn as the mark's coloured chevrons, sit straight on the ice with no white plates. The *hello, world!* guide keeps the Google colours off the ice, so this is a deliberate exception chosen for the game.
- **Team colours** (Rayyan, 5 Oct): the two teams are Team Red, Blue, Yellow, Green, Black or White. The colour is explicit metadata on each team. On the projector (title card, scoreboard, between rounds, final) and the console's score cards, the team's whole box is filled with its colour, as a tonal gradient with a lit top edge and a fine inner keyline, with its own readable ink for the name and score. A small badge carries it on buzzer phones and in banners. Black gets a light outline on the cobalt, White a dark one on frost, and Blue a frost one against the cobalt. The playing team's box gets a double ring and a glow in its colour. **PLAYING** and **STEALING** labels mark control, so colour is never the only signal. A game saved before colours existed keeps its names and scores, shows a neutral accent, and can be given colours in Setup.
- Red as a team colour is a badge, never a full screen. A wrong answer is still the big red X square with its white border and harsh buzzer.

Effects:
- Answers flip over with a bell.
- Every wrong answer shows a large red X with a harsh buzzer.
- Short banners mark play or pass, the steal and the points awarded.
- Each effect plays once per accepted action. Nothing replays when the projector reloads or reconnects, or when the console undoes something, and scores never wait for an animation.
- With reduced motion the tiles turn over instantly; **Quiet mode** stops all sound and animation.
- All sounds are original and synthesised in the browser.

**Operator controls stay off the audience's screen.**
- Browsers only allow sound after a click in that window, so the projector first asks *Turn on sound for the show?* with **Enable sound** or **Continue muted**. The console warns until sound is on.
- After that, a small **Projector settings** entry appears only when the mouse moves or a key is pressed, and fades after 4 seconds. It holds Enable/Test sound, Mute, Music, Volume, Quiet mode and Fullscreen.
- The panel stays open while you are using it and closes itself after 12 seconds untouched. Hidden controls never catch clicks.
- **Setup → Projector** can also play a test sound from the laptop.
- The DEMO notice sits in its own slot at the top of the stage and never overlaps anything.

### Phone buzzers (optional, off by default)

Rayyan has not yet decided between physical and phone buzzers, so this mode is built but off. **Setup → Buzzers → Phone buzzers** turns it on:

1. One player per team opens the join address on their phone (the projector shows a QR code until both teams are paired).
2. Each phone holder types their team's **4-digit code**. The codes are shown only on the console, so read each code to its own team only.
3. During the face-off press **Open phone buzzers**. The first press counts and becomes the same "Team X buzzed first" a tap makes. The other phone shows *Locked out*.

**Reset and reopen** handles a dispute, and the tap buttons still work as the presenters' override. **New code / Unpair** forgets a phone. Starting the **next teams** always makes new codes, so the last pair's phones control nothing. Choosing a colour never pairs a phone. Switching back to physical buzzers keeps the game and discards any press still in flight.

Honest limits:
- **Timing:** the projector says *RECEIVED 0.84 S AFTER THE BUZZERS OPENED*. That is when the press reached the laptop, including network delay. It is arrival order, not proof of who physically pressed first. Times from different phones are never compared.
- **Impersonation:** the Air Jam relay tells every phone in a room the controller id and device id of every other phone, and a phone presenting both can take over that seat. Tested: a third client did exactly that.
  - The pairing token blocks it from buzzing. Only the phone that typed the team's code gets the token, and every press needs it, so the impostor's presses were all refused.
  - It does knock the real phone offline. The fix is **Unpair**, then pair again with the new code: about ten seconds.
  - Ten wrong codes lock pairing until you make new codes.
  - Using phone mode at the event is Hussain's and Rayyan's decision.
- **Drops:** a dropped phone shows as disconnected after about 8 seconds (the relay's grace period, lowered from its default 30 s in `scripts/dev.mjs` and `scripts/serve.mjs`). The presenters then judge that face-off and you tap.
- **Phone refresh:** a phone that refreshes forgets its pairing (it holds it in memory only) and pairs again with a new code.

## Survey data

**The event questions and answers are built into the game.** Anyone who opens the Render link, on any laptop, gets the 14 event questions with their real answers and points, with nothing to load (Hussain's decision, 6 Oct). They live in `data/event/event_pack.json`, which is committed and bundled with the site. That means the answers are readable by anyone who opens `/host` or the page source: the host console is not secret, and a player who finds `/host` can spoil the game.

The data is the events team's workbook, `family_feud_board.xlsx`: one sheet, **14 questions, 73 answers, 32 respondents**.

**Points are not votes.** Each answer has **Votes** (how many of the 32 said it) and **Points** (`ROUND(votes / 32 * 100)`, rounded half up, so 4 votes is 13). The game reveals, pots and awards **Points** only. Votes are shown to the moderator beside each answer and checked against the respondent count, never scored. Retained answers need not add up to 100, and nothing is normalised. Equal points keep their source order. Column G ("what people wrote") is kept as moderator-only guidance under **Counted as** on each answer; it is not an accepted alias, and the hosts judge spoken answers. The projector is only ever sent revealed answers and their points.

**Play order.** Games are four questions each: three team pairs use twelve of the fourteen questions (games are four rounds by default; Setup changes it). The list is grouped *Game 1* (questions 1 to 4), *Game 2*, *Game 3* and *Spare*, and questions with similar answers sit in different games, at least four places apart:

| Similar | Questions |
|---|---|
| Food and eating | 2 (2 am order), 6 (supermarket), 10 (between classes) |
| Doomscrolling among the answers | 1 (instead of studying), 5 (bored), 9 (back home) |
| Dubai | 3 (summer), 7 (place to take a friend), 11 (photos) |
| Bag and forgotten items | 4 (in a bag), 14 (forgot leaving the house) |

The numbers are play order, not the workbook's. `ORDER` in `scripts/workbook_to_pack.py` holds the mapping (the workbook's question 8 is played as question 2, and so on); change it and re-run the script to reorder.

**Changing or rebuilding the data.** Edit the workbook, then:

```bash
python scripts/workbook_to_pack.py "C:/path/to/family_feud_board.xlsx"
```

It writes `data/event/event_pack.json` and checks all 73 rows against their source cells, plus the 14 answer counts and points totals (needs Python with `openpyxl`). Commit and push the file; Render redeploys. Setup can also read the `.xlsx` or a `.json` pack directly (**Load the event answers**), which replaces the built-in questions in that one browser only.

A browser keeps its own question set only if someone chose **Load practice pack** (shown with **DEMO: INVENTED RESULTS**) or loaded some other pack with results. An empty one, or an older copy of the event pack, gives way to the built-in questions, and **Use the event questions** in Setup switches back at any time. The previous set is kept as a recoverable copy (**Restore previous pack**), and a round in progress keeps its own answers.

### Other ways in

The 16 template questions (`data/templates/event_questions.pending.json`) and the spreadsheet-paste and answer-editor tools in **Setup → Survey results** still work for a template pack. They are hidden while an event pack is loaded, because the event pack is read-only on screen: to change an answer, correct the workbook, convert it again and import the new file.

The validator refuses bad data with specific errors and leaves the current game alone:
- a template pack's wording must match the supplied questions; an event pack brings its own;
- 1–10 answers per question;
- points and votes must be positive whole numbers; votes may not exceed the respondents, and in a single-response pack may not total more than them (points are never held to that);
- duplicate labels and conflicting aliases are flagged.

All text renders as plain text.

`data/demo/demo_pack.json` holds invented practice answers for Questions 1, 3 and 10, ready for the rehearsal.

## Saving and recovery

| Situation | Behaviour |
|---|---|
| Console refresh | Offers **Resume the game**: question, reveals, scores, strikes and points given. The quick guide never interrupts it. |
| Projector reload | Asks the console for the latest board. Nothing is scored twice and no effect replays. |
| Relay or internet down | Physical mode needs neither: board, scores, effects, saving and projector all run on the laptop. Phone mode says plainly that phones are offline. |
| Browser storage fails | **Not saved** in the header plus a warning. The game continues in memory, and **Setup → Export private backup** still works. |
| Wrong click | **Undo** (`U`). Penalties and corrections via **Adjust score** are undoable too. |

Export a private backup before the event (**Setup → Backup and recovery**) and keep it out of the public repository.

## Architecture

One authority: the moderator page. It owns the pieces below, and the public view is built by an allowlist (`src/public/project.ts`) and sent to the projector over `BroadcastChannel` and, in phone mode, to buzzer phones through the Air Jam store.
- the rules engine (`src/engine`): a pure reducer with explicit phases, per-action ids (a repeated delivery is a no-op) and undo;
- the answers;
- saving;
- the phone-buzzer rules (`src/buzzers`, pure).

- The only network actions are `pairBuzzer` and `buzz`. Both refuse calls stamped as the host (the relay lets a phone spoof that channel), take the team from the console's pairing rather than the payload, and are refused outright in physical mode. Nothing on the network can reveal, score, award or reset (`tests/store.test.ts`).
- `src/ui/ScreenView.tsx` renders both the projector and the console's preview. The preview never plays sound; the red X and banners are drawn by the projector page only.
- The projector and buzzer phones never import the answer pack, host storage or the console (`tests/boundaries.test.ts`).
- Air Jam `@air-jam/sdk` and `@air-jam/server` 0.9.2.
- The crowd-assist poll from the first version was removed on 5 Oct after the tech lead's feedback. It remains in git history before commit `3ea5cea`.

## Deploying

Deployed by Hussain at `https://gdg-family-feud.onrender.com` (Render free plan, `render.yaml`, `scripts/serve.mjs`: relay and game on one port). Every push to `main` redeploys. The 5 Oct changes (simplified console, game-show effects, quick guide, optional phone buzzers) were pushed to `main` on 5 Oct; the pre-change version is tagged `pre-feedback-2026-10-04`.

- **The free plan sleeps** after about 15 minutes idle (30–60 s to wake) and loses rooms on restart. Open it 10 minutes early. A paid instance for the day is a club spending decision.
- **Results stay in the browser, per address.** Results pasted at `localhost:5173` are not at the Render address, so load them where you will play and keep a backup.
- **Authentication is off.** The relay runs with Air Jam app authentication disabled (`AIR_JAM_AUTH_MODE=disabled`), so anyone with the address can open their own empty console. The real answers live only in the operator's browser.
- **Offline fallback:** physical mode works with no internet once the page is loaded. `pnpm run dev` on the laptop is the offline fallback.

## Verification

Ran on 5 to 6 Oct 2026, Windows 11, headless Chrome via `playwright-core`, against `pnpm run dev` on this laptop in fresh, isolated browser contexts (nothing touched any saved game). The team-colour and event-data release is a local commit on top of the pushed projector redesign (earlier state tagged `pre-final-release-2026-10-05`). The suites were last run against the deployed Render site before the projector redesign; that site has no private pack, so only the practice-pack suites can run there, and only after this release is pushed.

**Run and passing:**
- `pnpm run typecheck`, `pnpm run lint`, `pnpm test` (132 unit tests) and `pnpm run build`.
- The browser suites (results below).

| Suite | Checks | Covers |
|---|---|---|
| `e2e:event` | 65 (at 1920×1080 and again at 1366×768) | **The rehearsal with the real pack**, through the console with the projector watching: the load-data state; the staged import (14 questions, 73 answers); three rounds (a cleared 7-answer board, a successful steal on the 6-answer board, a failed steal); face-off calls and a corrected call; Play and Pass; Undo of a strike and of a reveal; a manual correction and its Undo; a double click on Award; refreshes of console and projector mid-round and mid-steal; expected awards worked out from the Points column (round 1: 87 to Red; round 2: 54 to Blue; round 3: 67 to Blue; −10 correction to Red; final Red 77, Blue 121, Team Blue wins) against the actual scores; the projector never sent an unrevealed answer, a note or a vote; Next teams in Yellow/Green, Black/White and White/Black with the pack and the used-question tags intact. |
| `e2e` | 48 | A complete physical-buzzer game with every realtime connection refused: face-off with the hosts' call, pass, reveals, three wrong answers (X, XX, XXX, then the steal banner), a missed steal, points, penalty and Undo, a projector reload, a console refresh and Resume, finishing, the next two teams. It also checks that nothing sent to the projector ever held an unrevealed answer, and that each effect fired once. |
| `e2e:guide` | 28 | First-visit offer, Skip remembered, Done, replay, Escape, Tab kept inside, focus returned, popovers inside 1366×768. Mid-round, keys and clicks change nothing and the projector's revision never moves; no offer during a resumed game. An empty autosave still gets the offer. |
| `e2e:phones` | 40 | Two phone pages pair with codes, the first press locks, the other phone is locked out, honest timing labels, reset, a double tap counted once. An impostor takes a seat but is refused, as are host-channel spoofs, stale, duplicate and unpaired presses. Also: a drop shown in 8 s, switching to physical, next teams. |
| `e2e:faceoff` | 27 | Taps, corrections, misses, both missing, the hosts overruling the survey, play or pass, skipping |
| `e2e:failures` | 38 | Relay down, storage failing, rejected import, editor, preview, projector sound status. The projector settings panel: it hides when idle, hidden controls catch no clicks, a key brings it back, and it stays while keyboard focus is inside. Odd URLs. |
| `e2e:extras` | 16 | Tie-break, timer |
| `e2e:paste` | 8 | Spreadsheet paste |

**Also checked by hand, through scripts:**
- A layout scan of every tab and round state (including ten answers and the guide) at 1366×768 and 1920×1080, at 100% zoom: no overflow, and Wrong answer and Undo reachable without scrolling.
- The tile flip measured in the running projector: 0°, 111°, 163°, 177°, then 180° over about 450 ms, and an instant swap with reduced motion.
- The red X shows for about 1.1 s, centred on the stage.
- **The projector redesign was checked in the running app:**
  - **Lobby balance:** equal left and right margins at 1920×1080, 1366×768 and 1440×900 (16:10, with even 45 px bars top and bottom).
  - **Long names:** two 24-character team names wrap without clipping.
  - **Ten answers:** a ten-answer board with long labels fits.
  - **Flip:** 0°, 88°, 156°, 175°, then 180° over about 450 ms.
- **Not provable headlessly:** a fullscreen resize. Headless Chrome reports fullscreen but keeps the window size. The stage re-fits on any resize, as checked at five sizes, but confirm it on the venue projector.

Screenshots are in `docs/screenshots/`: `before-*` for the old console, `after-*`, `physical-*`, `guide-*` and `phone-*` for the new one, and `colours-*` for the four team-colour pairs (Red/Blue, Yellow/Green, Black/White, White/Black), taken from the invented practice pack. Screenshots made with the real pack go to `private/rehearsal/` and are never committed.

**Not run** (needs people, devices or the venue):
- real phones on venue Wi-Fi (phone mode was tested with emulated phones and raw sockets on this laptop);
- the speakers, and anyone listening to the sounds;
- the venue projector, legibility from the back;
- the real standalone buzzers with the presenters;
- Safari or Firefox;
- a screen reader;
- whether someone new learns the console in about a minute. That is a goal to test at the rehearsal, not a result.

## Before the event

Work through [`docs/OPERATOR_CHECKLIST.md`](docs/OPERATOR_CHECKLIST.md).

## Third-party material

Blue Ice values match the club guide (checked 4 Oct 2026). From `UdayAhuja19/gdg-resources`:
- `src/styles/blue-ice.css` (font paths edited);
- `src/styles/blue-ice-club.js` (unmodified; draws the wordmark);
- `public/brand/gdg-mark-*.svg`.

Fonts are Archivo and DM Mono under the SIL Open Font License (`public/fonts/`), served locally.

## Layout

```
src/engine/    rules reducer, phases, undo          src/public/   public snapshot, channel, projection
src/content/   canonical questions, validation      src/buzzers/  phone-buzzer pairing and presses (pure)
src/host/      console, guide, saving               src/game/     the Air Jam store (public state + buzzer calls)
src/screen/    projector page, effects              src/play/     join page, buzzer phone
src/ui/        shared renderer, sound, stage        scripts/      launcher, server, relay probe, e2e runs
```
