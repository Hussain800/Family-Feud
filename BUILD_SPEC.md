# GDG Family Feud: build specification

Event: hello, world!, GDG on Campus, University of Birmingham Dubai.  
Date: Tuesday 6 October 2026, 16:00 to 18:00, Dubai time.  
Location: Innovation Lounge, room 0201.  
Status: implementation instructions and seed content, not an implemented or tested game.

> **Superseded in part (5 Oct 2026).** After testing it, the tech lead confirmed the game is hosted verbally with standalone physical buzzers. Phone joining and audience voting are no longer required: crowd-assist polls were removed, and phones are now an optional one-per-team buzzer mode. The current operating model is in `README.md`; the rest of this brief still applies.

## 1. Product and established requirements

Build a polished, host-led Family Feud game with three views: a private moderator console, a public projector board, and phone controllers for audience voting. Prioritize the quality of a complete playable game: clear controls, readable presentation, satisfying reveals, smooth phone participation, and straightforward recovery. Do not trade these for a large platform.

The supplied poster establishes the event facts above. The two-hour window belongs to the overall event, not necessarily to this game. Stage time, attendance, survey results, hosting budget, venue Wi-Fi restrictions, and projector resolution are unknown. Surface those dependencies without blocking development on details that have reasonable defaults.

### Confirmed by Rayyan

Use the blue event theme under hello world on the club resources page. Present a question introduction, then the question with concealed answer lines. Use the 16 questions supplied by the events team. The events team will survey students and supply top answers, with the quantity depending on each question. Creative additions are permitted. These requirements are preserved in `references/RAYYAN_REQUIREMENTS.md`; the complete question list appears at the end of this document.

The earlier top-ten example and later six-line example are not two fixed board sizes. Support one to ten real answers and use six empty lines in template preview. Do not fabricate answers to fill a layout.

### Requested by Hussain

Build phone connection and voting, using upstream Air Jam as the networking starting point and the club games as practical references. Phone play is part of the finished deliverable. It is not required for the first board checkpoint, and network trouble must not stop host-controlled play.

### Proposed here, not attributed to Rayyan

Use two teams, a default three-round match, human answer judging, three strikes and one steal, and an optional crowd-assist poll during a round. The host controls round selection. These are house rules, not a claim to reproduce a specific television rulebook. All design choices below that are not explicitly attributed to the chat or brand guide are implementation recommendations.

For factual and visual questions, use Rayyan's latest messages, then the event-specific Blue Ice guide, then the poster. Teammate games are technical and interaction references, not the authority for this event's theme. Never treat a model-generated feature as a requirement from the organiser.

## 2. Delivery sequence and scope

Work toward one complete game rather than several parallel architectures. A checkpoint is a working application, not a documentation milestone.

**First, verify the networking path briefly.** Inspect Air Jam's supported starter and current package APIs. Prove that one host and one controller can connect, exchange a small input, and return a visible response. Note the configured room limit and deployment dependencies. This check informs the architecture; it is not a reason to spend the whole session researching frameworks.

**Then complete the board.** Build the visual identity, question intro, concealed slots, reveals, scores, strikes, steal resolution, correction, data import/editor, local saving, and projector window. Demonstrate a whole round using labelled demo results. Preserve a working checkpoint.

**Then complete phone voting.** Add QR/code joining, waiting, a crowd-assist ballot, accepted-vote feedback, closing/results, and reconnect behavior. Test it together with the board, not as a disconnected mockup.

**Then refine and rehearse.** Fix observed failures, inspect actual screenshots, add short sound/reveal cues where useful, run a full match, and prepare deployment and manual fallback. Keep the complete game working throughout.

The finished baseline includes both the board and phone voting. It does not require a cloud database, persisted network-command receipts, a moderator takeover service, elaborate restart recovery, a suggestion moderation queue, an AI judge, or a fixed synthetic-load benchmark. Those are not prerequisites disguised as polish. Section 12 lists optional extensions to consider only after the baseline works.

## 3. Visual and interaction specification


### 3.1 Brand direction and verification

Reference values recorded in the design research are `#1E3FD9` cobalt, `#0A1B66` deep cobalt, `#142FB0` panel cobalt, `#F3F8FF` frost, `#CFE0FF` secondary text, and `#B8CEFF` labels. Archivo is the reading/display face; DM Mono is the label face. Keep `hello, world!` lowercase with punctuation. Use square outlines and a single meaningful fracture origin, not multicolour gradients, rounded card UI, emoji, or decorative shadows. The real monochrome bracket mark is preferable to typed angle brackets as a logo. [B1, B2]

Use Ice for the public screen and phone play; Frost can serve the moderator's reading-heavy forms. If reusing the club JavaScript components, inspect their exported signatures before wrapping them in React. Equivalent accessible markup and the official styling are sufficient; using every component is not a requirement. [B1, B3]

Verify the recorded values against the club guide during implementation; the guide could not be fetched again while assembling this package. If it remains unavailable, follow the supplied poster and disclose that the exact guide has not been checked. Obtain the brand CSS, component source, logo assets, and referenced font assets from the club repository during implementation. Preserve applicable notices. This build kit contains no font files. Do not substitute a network-hosted font at runtime. Treat the official guide as the authority for detailed typography and layout rules.

### 3.2 Game-specific application, proposed here

The game board needs its own layout; it is not the poster squeezed into landscape.

**Projector target:** 1920 x 1080, with checks at 1280 x 720 and 1366 x 768. Use at least 4% safe margins. No scrolling during play. Fit gracefully to other ratios rather than assuming the venue has the target projector.

**Lobby:** a large event wordmark and `<FAMILY FEUD>` on the left, a large joining QR and manual code on the right. Show connected count, team names, and one short instruction. Avoid exposing a roster of unmoderated nicknames on the projector.

**Question introduction:** large, readable question, category, round number, and the event identity. No official answer text. A clear host button moves to the board; animation completion must not advance gameplay.

**Concealed board:** up to six answers use a centred single column; seven to ten use two columns. For two columns, put the first half of the ranked list down the left and the rest down the right. Each tile has a visible slot number, concealed content, and a points region that is empty until reveal. Do not expose point values on concealed slots.

**Revealed board:** answer text and survey count replace the concealed state. Use tabular digits. Target 36-48px answer text at 1080p, with at most two lines. Do not fix overflow by shrinking a long answer until it is unreadable. Show a host warning before starting a round whose labels exceed the designed width.

**Score strip:** two named teams, selected-team indication through words and outline/fill rather than hue alone, a separate round pot, and up to three strike marks. A wrong-answer strike can remain frost with explicit text; do not add red as general decoration.

**Live play QR:** smaller than the lobby QR and outside the main answer area. Include a readable join URL or domain and room code. The QR must point to this game, not to the club's existing social-links QR.

**Phone:** portrait-first, one principal action at a time, at least 48px touch controls and 56px text inputs, 16px minimum input text, safe-area padding, and clear state changes. Preserve page zoom. Prevent accidental double submission through command handling, not by disabling useful browser accessibility features.

**Moderator:** a practical Frost interface. Put the public-screen preview, hidden answer list, reveal controls, strike button, current control, settlement status, question picker, and phone interaction controls within easy reach. Make dangerous actions visually distinct through wording and confirmation, not inaccessible colour coding.

### 3.3 Motion and audio

Reuse the official event wordmark treatment for the opening. Do not create a fresh impact on every answer tile. Proposed gameplay transitions are short opacity/wipe changes; they are not extra fractures. Respect reduced motion and offer a quiet mode.

Only the projector window should play game sounds by default. Avoid playing the same cues on the moderator laptop or participant phones. Add an explicit sound-unlock action on that window, a mute button, and a volume control. Browser autoplay can prevent unrequested audio, so silence must never block play. [W3]

Use short original generated tones or licensed assets with provenance, not extracted television clips. Sounds and effects are non-authoritative: losing an animation must never change the score.

### 3.4 Operator controls and routing

Use `/host` for organiser entry and the private console, `/screen/:roomCode` for the public display, `/join` for code entry, and `/play/:roomCode` for the phone experience. The QR may prefill `/join?room=ABCDEF`. Authentication is separate from route naming. Direct navigation must show a valid state or an honest reconnect/setup screen. The projector reads only public state from the moderator window; it is not a second Air Jam host. Use the supported SDK routes for phone joining when they differ from these suggested paths.

Make visible buttons the primary controls. Optional host shortcuts are 1-9 and 0 for slots 1-10, X for a strike, and U for the latest eligible undo. Shortcuts operate only in the host view, only in valid phases, never inside a text field, and never repeatedly from a held key. Ignore keyboard auto-repeat. Do not bind an unconfirmed destructive reset or a score award to a casual keystroke.

A public-screen fullscreen button should use a real user gesture and have a clear exit path. The moderator can preview public output, but that preview must consume the public projection rather than a superficially hidden copy of private state. Do not expose the private console on a mirrored display.

## 4. Content, import, and ownership

`data/templates/event_questions.pending.json` contains all 16 canonical questions and deliberately empty answer arrays. `data/demo/demo_pack.json` contains invented practice answers for a few questions. The synthetic pack must always display **DEMO: INVENTED RESULTS** in the moderator, projector, and phone views. Real question wording does not make invented answers surveyed data.

Support the bundled JSON structure directly, including `schemaVersion`, `packId`, `title`, `purpose`, and `questions`. Each question carries its ID, category, prompt, readiness status, survey metadata, answer rows, and optional approval metadata. An answer row has `id`, `rank`, `text`, `count`, and `aliases`. Use `count` as survey points; do not silently rename it to an incompatible input schema.

`awaiting_survey` is valid for preview but cannot start a scored event round. `ready` questions have genuine supplied results or belong to the separately labelled demo pack. The host can confirm entered event results in the editor. Do not require a new organiser account or formal approval workflow.

Provide JSON import/export and a compact answer-row editor, not a content-management platform. Show validation errors before replacing the current pack. A rejected import leaves the current game intact. Support one selected ready question without requiring results for all 16. A host can build a playlist from whatever real results arrive.

### Validation

Preserve q01 through q16, their text, punctuation, and category. Editing answer rows must not rewrite questions. Ready questions have one to ten nonempty answers, unique IDs, positive integer counts, and contiguous display ranks. Sort by supplied counts, preserve the events team's tie order, and flag duplicate normalized labels or conflicting aliases for human resolution.

Do not force counts to total 100. Do not invent the number of surveyed students. When respondents are unknown, use counts without a sample-size claim. For confirmed single-response surveys, listed counts must not exceed the supplied respondent total; multiple-response surveys can legitimately have different totals. Record the method supplied rather than inventing one. Let the host confirm the data source when methodology is incomplete.

Treat every imported label as plain text. Lock the active question's answer definitions while its round is underway. Editing must not silently change the meaning of scores already awarded. Keep a recoverable copy of the current pack before replacement. CSV import is optional, not a prerequisite.

The software cannot prove that externally supplied data was genuinely surveyed. Preserve the provenance labels provided, keep bundled synthetic fixtures clearly distinct, and never offer a switch that relabels the bundled demo as verified event data.

### Private content

Import real answers into the moderator's local browser storage at runtime. Do not hardcode them, place them in public JSON, commit them, or include them in frontend bundles. A public repository may contain canonical questions and clearly identified synthetic examples, but not the real answer bank or private session backups.

No raw student responses, emails, phone numbers, or identities are needed. Ask the events team for aggregate answer groups, counts, and accepted synonyms. The game is not a survey-collection system.

## 5. Gameplay and scoring

### Human-led round

The host chooses a ready question and the starting team. First show the question introduction, then the concealed board. The team gives a guess aloud. The host selects a matching hidden answer or adds a strike. No automatic text matching or AI judgement is required.

A correct unrevealed answer reveals its text and count and adds that count to the round pot once. Repeating the reveal does nothing to the score. An already revealed guess can show ALREADY ON THE BOARD; under these house rules it adds neither points nor a strike.

Three strikes invite one guess from the other team. The host adjudicates it. A successful steal reveals one new answer and adds its count to the pot. A failed steal adds nothing. The successful stealing team receives the pot; if the steal fails, the originally controlling team receives it. A clean round awards the pot to the controlling team. Provide one clear confirm-award action and prevent it from being applied twice.

Arithmetic example, invented solely to define the rule: a pot of 42 and a successful steal worth 8 gives the stealing team 50 points. A failed steal leaves a pot of 42 for the original team. The base multiplier is 1; a multiplier feature is not needed for the baseline.

After settlement, revealing remaining answers is for discussion only. It must never change the pot or team totals. Next round resets the pot, strikes, and reveals, but retains match scores. A new match resets scores only after confirmation. A tie at match end is a valid visible result.

### Small explicit state model

Use a typed reducer or equivalent small engine with explicit phases such as `lobby`, `intro`, `board_ready`, `team_turn`, `steal`, `round_over`, and `match_over`. A pause/disconnect status is separate from scoring state. Avoid combinations of independent flags that allow a round to be both live and settled.

Track the round ID, current question, controlling team, revealed slot IDs, strikes, pot, and settlement. A settlement records its winner and actual awarded amount. Once settled, repeated award requests are no-ops. This is ordinary state logic; it does not require a durable event ledger or database transaction framework.

Keep rule transitions testable outside React. Inputs and the current state produce the next state. Network callbacks and animation callbacks must not modify scores through a second independent path. Animation completion never determines scoring or round advancement.

### Correction

Provide undo for recent host mistakes and explicit team-score correction. A small local history of gameplay states is sufficient. If undoing a settlement, reverse exactly the recorded award before reopening that round. Do not subtract a freshly recomputed pot that may have changed since the award.

Warn that a displayed answer cannot become unknown to the audience even if a reveal is undone. Do not rewind phone identities or ballots when undoing a strike. A correction that changes the current round while a poll is live cancels the poll clearly.

Use visible controls as the primary input. Confirm destructive resets. Stop duplicate keyboard events and double clicks from applying the same reveal, strike command, or award twice. Tests should distinguish two deliberately issued strikes from two deliveries of one input.

## 6. Phone participation

The baseline twist is one **crowd-assist poll**, not a second survey.

During a team turn, the host collects two to six suggested guesses aloud and types the candidates. These are guesses from the room, not choices populated from the private answer bank. The host opens a poll, normally for 20 seconds, and may close it early. Phones recommend a guess. After closing, show aggregate results; the active team decides whether to use that suggestion. The host judges the resulting guess normally.

Votes do not reveal an answer or award survey points. A candidate must not be marked correct, ranked by official frequency, or linked publicly to a hidden answer. No phone text submissions or moderation queue is required in the baseline. The host can run a whole game without using a crowd assist.

### Joining and phone states

Offer a QR code and manual room-code entry. Generate the code according to the actual Air Jam runtime, not an assumed length. The QR points to the game's reachable join page and includes the current room where supported. It must not point to localhost for remote phones or to the club's social links.

Use portrait layouts with joining, waiting, voting, sending, accepted, closed/results, reconnecting, and unavailable states. A nickname may be optional but is never identity or authorisation. Do not require an account or personal contact information. Hide an unmoderated nickname roster from the projector.

### Ballot handling

Give each poll a unique ID and each candidate an ID. Identify a participant using the connection identity supplied by the networking framework, not an arbitrary identity in a vote payload. A vote contains the poll and option IDs and, where needed for retry tracking, a request ID.

Accept one final choice per connected participant identity per poll. This baseline does not support changing a vote after acceptance. Store accepted ballots in a host-side map keyed by poll and participant. A retry of the same accepted choice returns confirmation without increasing the count. A later different choice receives an already-voted response. Reject wrong poll IDs, unknown options, malformed input, and arrivals after closing.

Show VOTE RECEIVED only after the host acknowledges acceptance. Use the SDK's supported input and return-signal mechanisms after inspecting their behavior. Do not model an important discrete ballot as a continually held button or assume that transient input is durable. Retries are bounded and must preserve the same logical vote.

The authoritative host deadline decides acceptance. The phone countdown is informative, not authoritative. Persisted ballot receipts across host restart are not required: refreshing the host cancels the active poll. Keep completed scores and answers recoverable independently of ballots.

Participants connected while the poll is open may vote before its deadline. Do not show a fixed eligible-voter percentage when attendance is unknown or changing. Publish response count while open, and aggregate option totals only when closed. Keep individual choices private to the host. Ties and zero-vote outcomes are resolved verbally; there is no need for another voting engine. Reopening creates a new poll ID. A round change cancels its poll.

### Reconnection and limitations

Use the SDK's actual reconnect behavior and verify whether participant identity survives reconnect and phone refresh. A returning identity should receive its accepted status for a still-active poll where supported. If identity changes, document the limitation instead of claiming one browser equals one human. A new room after host restart requires a new QR and rejoin notice.

This is a cooperative event game, not a tamper-proof competition system. Still reject participant attempts to publish host state, reveal answers, alter scores, reset the room, or claim the active host role. Do not disable role checks merely to make the demo connect.

## 7. Architecture and public/private boundaries

### Reuse one networking system

Start from Air Jam's supported React/TypeScript starter and SDK, using its host/controller model. Keep the game engine and private answer data on the organiser's host. Reuse the framework for room creation, joining, controller transport, and public synchronization. Inspect the currently supported APIs and compatible versions before copying examples. [A1, A2]

Use the starter's tooling instead of forcing a different application framework. A small schema validator, state reducer, and persistence helper are enough. The existence of a large upstream repository does not mean the full platform, catalogue, arcade launcher, game physics, database control plane, and all examples belong in this game.

First prove host/controller connectivity and verify the configured player limit. Attendance and tested capacity are not known. If the framework cannot meet a concrete requirement, explain the blocker and the smallest viable fallback before adopting it. A small Node/Express/Socket.IO service is a possible fallback, not a parallel system to build speculatively. Once selected, use one state authority and one transport design.

Do not assume an app ID is a secret moderator password. Confirm that only the designated host can mutate the current room. Opening the public frontend on another device must not confer control over the existing session. Preserve the framework's host bootstrap and room checks; use its supported deployment configuration rather than copying disabled authentication or broad origins from a prototype. [A2]

### Projector without another network host

The ordinary event setup is the organiser's laptop with an extended display. Open a separate projector window and send an explicit public snapshot from the moderator window, using a same-origin channel such as BroadcastChannel or another small supported bridge. The projector requests a current snapshot on load and shows a reconnecting state if the host disappears. It does not import the answer pack, read host persistence, or create a second Air Jam host.

The public snapshot also supplies the phone UI through the SDK. Screens are renderers; neither the projector nor phone callbacks run an independent scoring engine. A basic revision counter helps reject stale snapshots. Remote projector support is optional and should use the same public projection if added.

### Explicit data selection

Construct public state from an allowlist. Never serialize the entire room or host store and then hide fields with CSS. Hidden answer text, counts, aliases, survey metadata that exposes answers, individual ballots, session backups, and organiser credentials stay outside shared stores and public messages.

A suitable slot shape is:

```ts
type PublicSlot =
  | { index: number; revealed: false }
  | { index: number; revealed: true; text: string; count: number };
```

A suitable public snapshot contains the current question, public slots, team names and scores, round pot, strikes, phase, demo label, room joining details, poll candidates/deadline/status, and post-close aggregates. This is a proposed application contract, not an Air Jam SDK type.

Treat the local organiser browser as trusted. The host and projector may share an origin and machine; this separation is a programming boundary, not a claim that an attacker controlling the organiser's browser cannot read its storage. Untrusted phones must not receive or obtain the real answer bank.

Keep optional host backups out of public folders and version control. Bound nickname, imported text, and vote payload lengths. Escape all user text. Use reasonable admission rules without treating every phone behind campus Wi-Fi as a single player.

## 8. Saving and failure behavior

Save the answer pack and game progress in moderator-local browser storage. Use localStorage or IndexedDB according to actual data size and the starter, not a required database migration framework. Save after meaningful host actions. Export a private session backup and support deliberate restore. Restore validation must not destroy the current session on failure.

On host refresh, offer resume or new match. Resume restores the question, reveals, scores, strikes, and recorded settlement. Cancel any unfinished poll and tell the host. Try only supported room-reconnect behavior; if a new room is necessary, clearly show the changed code. Never silently merge ballots from an old room into a new one.

| Failure | Required behavior |
|---|---|
| One phone loses connection | Show reconnecting; the host and board continue. Recover accepted-vote status when identity permits. |
| The realtime service is unavailable | Disable crowd assist visibly; keep local reveals, scoring, and the projector usable. |
| The projector reloads | Request and render the latest public snapshot, without re-awarding points. |
| The moderator refreshes | Offer local resume, cancel unfinished voting, and restore the board before restarting phone play. |
| Browser storage fails | Show an unsaved warning; retain the live in-memory game and offer export where possible. |
| An imported pack is invalid | Show specific errors and leave working data unchanged. |
| Audio or fullscreen is blocked | Keep play usable and offer an explicit user-gesture control. |
| A host misclicks | Provide the defined undo/correction path, not an unexplained scoreboard mutation. |

Do not promise durable server recovery from an ephemeral hosting disk. A local browser save is not a cloud backup. Label the recovery path actually built, and practice it.

## 9. Verification and acceptance

Implement focused automated tests for rules, input validation, projection, and polls, plus browser checks. Run what the environment supports and report unavailable checks plainly. Do not replace failing tests with weaker assertions to claim success.

### Required checks

| Area | Concrete check |
|---|---|
| Content | All 16 canonical prompts remain exact. Pending packs preview without fake scores. Valid and invalid imports behave as specified. |
| Data integrity | Real counts are not normalized to 100. Demo labels persist across all views and reloads. |
| Reveals | One accepted reveal adds once; repeating the input adds nothing. Post-round reveals add nothing. |
| Strikes | A deliberate third strike enters steal; repeated delivery of one input is not two strikes. |
| Settlement | Test a clear board, successful steal, failed steal, and repeated award. Verify exact team totals. |
| Corrections | Undo a reveal and a settlement. Verify both pot and scoreboard; do not claim that displayed information becomes secret again. |
| Voting | Separate participant identities count separately. Duplicate/retried votes do not count twice. Late, malformed, and stale-poll votes fail. |
| Privacy | Plant a unique unrevealed-answer sentinel in an imported host pack. Verify it is absent from public snapshots, rendered screen/phone content, network messages, and public response assets until revealed. Check aliases and counts too. |
| Roles | Phone-originated reveal, score, reset, and host-publication attempts do not affect the active game. |
| Recovery | Test phone disconnect/rejoin, host refresh, projector refresh, cancelled-poll recovery, and storage-error feedback. |
| Usability | Play a full match across host, projector, and at least two independent controller sessions. Inspect large-display and narrow-phone screenshots. |

The synthetic fixture files intentionally contain public fake answers. Privacy testing must use a newly imported private sentinel rather than treating the existence of a documented synthetic example as a leaked genuine result.

Test 1920 x 1080, 1280 x 720, and a narrow phone viewport when tools permit. Check long labels, one-answer and ten-answer layouts, safe margins, plain-text rendering, disabled controls, and disconnect feedback. Avoid a false pass from three tabs accidentally sharing the same controller identity.

Several physical phones and the actual network remain an event-day verification requirement. Browser emulation is not evidence of physical-device or campus-network compatibility. Once expected attendance is known, test a representative number of connections and report the measured conditions. There is no arbitrary mandatory 100-client or 30-minute test gate, and no unsupported audience-capacity claim.

A successful build is necessary, not sufficient. A believable handoff demonstrates a complete match, the phone poll, privacy/role boundaries, and recovery. Keep unrun tests explicitly unrun.

## 10. Implementation workflow

Read the specification and inspect seed files and poster before making choices. Give a short implementation plan, identify only genuinely blocking unknowns, and begin. Do not spend the session producing another design document. Missing survey results are handled by the labelled demo pack.

Use the starter's actual scripts. Establish a useful local launch command early. Keep game logic, public projection, storage, and UI separable enough to test, without introducing a framework of abstract factories. Record the selected SDK versions, key architecture decision, actual routes, and commands in the README.

Build the small connection check, then a complete board checkpoint, then the connected phone flow, then refinement. Preserve a working checkpoint before adding extras. If coding agents are available, delegate only independent work after shared interfaces exist; a multi-agent setup is not required.

Do not silently reduce the visual ambition or abandon phone play. Address a concrete blocker with a focused decision and continue other unblocked work. Conversely, do not implement every possible hardening idea simply because it sounds sophisticated.

## 11. Launch, deployment, and handoff

Provide one verified deployment path for both the frontend and its realtime service. A deployed static frontend alone is not proof that the relay is reachable. Inspect compatible hosting settings, origins, app registration, player limits, and room policy. Keep secrets out of frontend environment variables and tracked files. [A1, A2]

Use a reachable join origin for phones. Display the actual service status and explain the public URLs. Obtain approval before publishing a repository, deploying publicly, spending money, changing service accounts, or using credentials. Preparing configuration and running local tests do not authorize those external actions.

Prepare a local production build with assets available locally so the board and same-laptop projector work when internet or the relay fails. Do not promise offline phone networking merely because the board works offline. No service worker, tunnelling setup, or native app is required unless the chosen deployment actually needs it.

The final README should contain exact install/run/build/test commands, actual host/projector/join routes, how to load survey data, how to run a round and poll, how to resume/export a save, the deployment configuration, measured results, and remaining venue checks. Keep the operator instructions short enough to use during the event.

Report implementation status honestly: implemented and tested, implemented but untested, blocked, or optional. State the actual survey-data status. Do not call the application event-ready while genuine data or physical rehearsal remains outstanding.

## 12. Optional extensions after a complete playthrough

Add at most one or two small improvements when they demonstrably help the experience: a brief branded winner treatment, keyboard controls, a category-selection vote, or a manually adjudicated face-off. Preserve reduced motion and keep effects out of scoring logic.

Phone-written suggestions and a moderation queue are an optional expansion of crowd assist, not prerequisites. More elaborate host recovery, durable ballot receipts, a second moderator, or server-owned private state require a concrete observed need and an explicit architecture decision. Do not introduce them just to make the project sound production-grade.

A networking buzzer can define operational answer order, but it must not be described as proving which human reacted first. An AI judge, accounts, payments, tournaments, analytics platforms, 3D engines, and a full television-show clone are outside this event build.

## 13. Sources and evidence boundaries

The chat and poster establish the confirmed requirements. The architecture, scoring policy, poll format, and delivery sequence are proposed implementation decisions. The package is not executable software, and no game, deployment, SDK integration, load capacity, or venue connection has been tested by packaging these instructions.

The Air Jam architecture page and official Claude Code guidance were accessed on 4 October 2026 for this package. The quick-start and Blue Ice raw guide could not be fetched again during this assembly. Their links remain implementation references, not claims of newly verified contents. Verify package APIs and the club guide during the build. Teammate deployments are references, not independently tested performance evidence.

- **C1:** Supplied `chat.md`, Rayyan's messages of 3 and 4 October 2026; relevant excerpts are summarized in `references/RAYYAN_REQUIREMENTS.md`.
- **C2:** Supplied poster, included as `references/event-poster.png`.
- **B1:** Event guide: https://raw.githubusercontent.com/UdayAhuja19/gdg-resources/main/hello-world/BLUE-ICE.md
- **B2:** Event CSS and resources: https://raw.githubusercontent.com/UdayAhuja19/gdg-resources/main/hello-world/blue-ice.css and https://udayahuja19.github.io/gdg-resources/
- **B3:** Event components: https://raw.githubusercontent.com/UdayAhuja19/gdg-resources/main/hello-world/blue-ice.js
- **A1:** Upstream and starter: https://github.com/vucinatim/air-jam and https://airjam.io/docs/getting-started/quick-start
- **A2:** Architecture: https://airjam.io/docs/how-it-works/architecture
- **A3:** Replicated state reference: https://airjam.io/docs/sdk/networked-state
- **T1:** Teammate repositories: https://github.com/HyperionBurn/air-jam and https://github.com/HyperionBurn/turbo-kart-rally
- **T2:** Teammate deployments: https://air-brawl.onrender.com/ and https://turbo-kart-rally-mstb.onrender.com/
- **W1:** Claude Code project instructions: https://code.claude.com/docs/en/memory
- **W2:** Claude Code implementation workflow: https://code.claude.com/docs/en/best-practices
- **W3:** Browser audio behavior: https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay

## 14. Exact supplied questions

These are Rayyan's supplied questions, not generated alternatives. Genuine answer data remains pending. Preserve the JSON IDs and the text below.

### Student Life

1. Name something students do instead of studying.
2. Name something you’d find in almost every student’s bag.
3. Name a reason someone might be late to class.
4. Name something students commonly eat between classes.
5. Name something students do the night before an exam.

### Campus

6. Name something people queue for on campus.
7. Name something you’d expect to find at a university event.

### Dubai

8. Name something people complain about during a Dubai summer.
9. Name a place you’d take a friend who is visiting Dubai.

### Food

10. Name something you would order at 2 a.m.
11. Name something people buy when they’re hungry at a supermarket.

### Phones & Tech

12. Name an app that almost every student has on their phone.

### Everyday Life

13. Name something people do when they’re bored.
14. Name something people often forget when leaving the house.
15. Name something people do as soon as they get home.
16. Name something people take photos of.
