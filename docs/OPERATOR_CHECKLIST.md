# Operator rehearsal checklist

A list to work through, not a record of checks already done.

## The night before (Monday 5 Oct)

- [ ] **Load the real pack on the laptop that will run the event**, in the browser and at the address you will use on the day (storage is per browser and per address; loading it anywhere else does not load it here):
  1. Open `/host`. It says *No event questions on this laptop yet*. Click **Load the event pack in Setup**.
  2. Under **Survey results**, **Import the event pack**: choose `event-pack.json`.
  3. It must say *Event pack checked: 14 questions, 73 answers*. Click **Load this pack**, then **Confirm**.
  4. Setup reads *Event pack · 14 questions, 73 answers*; Live lists Question 1 to 14.
- [ ] Confirm there is **no DEMO label** on the console or the projector.
- [ ] Open a few questions. Check the seven answers in Question 2, the six in Question 4 and the long label in Question 7 (it asks before it starts). Open **Counted as** on an answer to see what people wrote.
- [ ] Export a private backup (**Setup → Backup and recovery**) and keep it off the public repository.
- [ ] Decide buzzers with Rayyan: physical (default) or phone.
  - If phone: decide who holds each team's phone, and accept the limits in the README (arrival-order timing; an impostor can knock a phone offline but cannot buzz).

## Rehearsal with Rayyan and the presenters

- [ ] **Choose two colours**: First team, Second team. Check that a colour one team has is greyed out for the other, and that the projector shows the same two names and colours.
- [ ] Ask someone who has not seen the console to take the **Quick guide**. Then, without help, they should:
  - reveal an answer;
  - record a wrong answer;
  - undo a mistake.

  Note where they hesitate.
- [ ] Run one face-off with the real buzzers. The presenters say who buzzed first and who won; the operator taps it. Agree that the presenters' call is final.
- [ ] Run a whole round:
  - play or pass;
  - reveals;
  - three wrong answers;
  - a steal (one right, one missed in another round);
  - a penalty with **Adjust score**;
  - an Undo;
  - **Next question**.
- [ ] **Next teams**: choose the next two colours and confirm. The scores reset, the answers stay, and the played questions are tagged.
- [ ] Look at each colour on the projector from the back of the room, especially **Team Black** and **Team White**.
- [ ] To rehearse without touching the event session, use a separate browser profile (or **Load practice pack** and expect the DEMO label).

## At the venue

- [ ] Use the laptop's extended display. Open the projector, make it fullscreen, and click **Enable sound**. The console header should say *Projector ready*.
- [ ] Use **Setup → Projector → Play a test sound**, and set the volume for the room.
- [ ] Check long answers and the red X from the back of the room.
- [ ] Phone mode only:
  - pair both phones on the venue Wi-Fi;
  - open, press, reset;
  - lock one phone's screen and see the console report it.

## During play

1. **Choose the two teams' colours** (once per game), then **Start** a question. The presenters read it.
2. **Show the board.**
3. **Start the face-off.** Tap who buzzed first, then **Reveal** or **Wrong answer**.
4. Record the presenters' call: **Team X wins the face-off**.
5. **Plays** or **Passes.**
6. Reveal each right answer as the team says it. Press **Wrong answer** for misses.
7. Steal at three wrong answers.
8. **Give the points** with one click (a fast double-click awards once but also skips to **Next question**), then **Next question**.
9. After the game: **Next teams**, choose two colours, confirm.

## If something fails

- **Projector window closed or asleep:** the header says *Projector not open*. Reopen it; it catches up and plays nothing twice.
- **Wrong click:** **Undo** (`U`). Use **Adjust score** for corrections; never restart a game to fix a score.
- **Wrong colour chosen:** **Setup → Game → Correct a team's colour**. Scores, the round and the buzzers are left alone.
- **Console refreshed:** choose **Resume the game**. The pack and the colours come back with it.
- **No questions after a refresh, or a different browser:** the pack was loaded somewhere else. Load it again (the steps above) or **Restore previous pack**.
- **Storage warning:** export a backup at once.
- **Phone buzzer drops or misbehaves:** the presenters judge, and you tap the team. **Setup → Buzzers → Unpair** gives a new code.
