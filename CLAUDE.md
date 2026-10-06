# GDG Family Feud

Read `BUILD_SPEC.md` for the original brief, and `README.md` for the current operating model, which supersedes the brief where they differ (phones, polls). This repository contains the project brief and seed content; implement the application.

## Working rules

- Use the supplied Blue Ice poster and verify the event-specific club guide.
- Preserve the 16 questions. Pending results are not permission to invent real survey data. Keep demo labels visible.
- Prefer direct Air Jam reuse. Choose one state authority and test the actual host/controller flow.
- Publish only allowlisted public state to the projector and phones. The event pack is bundled with the site by the owner's decision; the answers themselves are not the secret.
- The game is in person and verbally hosted (tech lead, 4 Oct): the moderator console and projector board are the product. Physical buzzers are the default and need no phones. Phones are optional phone buzzers only, one paired phone per team; crowd-assist polls were retired. Team size must never depend on the phone connection limit.
- Teams are named by colour (Team Red, Blue, Yellow, Green, Black, White): an explicit `color` on each engine team, shown consistently on the console, the projector and buzzer phones, never guessed from the A/B slot. An identity correction never touches scores or the round.
- The events team's answers are the built-in event pack (`data/event/event_pack.json`, committed and bundled on purpose: the owner wants any browser to host straight away, so the answers are not secret). Score `count` (workbook Points), keep `votes` and column-G `notes` beside it (moderator only on the projector), and keep the list order set by `ORDER` in `scripts/workbook_to_pack.py` (similar questions at least four places apart). Games have no fixed length: the moderator ends a game whenever turnout or time says so and moves on to new teams; never hard-code a question count per game. Never send unrevealed answers to the projector or phones.
- Prevent duplicate reveals, presses, and awards. Keep local host play usable without the relay.
- Run focused checks and a full match. Report unrun and physical-device checks honestly.
- Keep optional extensions separate from the baseline. Do not add a platform or elaborate recovery service without an observed need.
- Record actual commands and dependencies in the README. Ask before external publication, spending, or account changes.
