# GDG Family Feud Event Upgrade Ideas
## Making the Tuesday 6 October Event Better (with 1–2 Days Left)

**Event:** Tuesday 6 October 2026, 30–100 students, projector + laptop + phones + physical buzzers, lounge/seminar room.

**Scope:** How to improve the event with realistic time investment, how to handle survey answers without surveying 100 people, and what to clarify with the tech lead before event day.

---

## Part 1: The Best Upgrades for a 2-Day Turnaround

### The Top 5 (MUST-DO in Order)

1. **Announce Judging Criteria Upfront** ✓ MUST | Host-only  
   At event start, host says: "We surveyed students on these 16 questions. An answer counts if a student said it, or if it's a clear synonym. The host has final say and will make fast decisions to keep momentum. No disputes—we're here to have fun." This prevents arguments mid-game from eating 2+ minutes. Budget: 30 seconds to say; huge payoff in pacing. Effort: none.

2. **Run a Sound Check 30 Minutes Before Event** ✓ MUST | Host-only  
   Test the host microphone from both podium positions; have someone sit in the back row and confirm they can hear clearly. Verify the projected board is readable from the back (adjust brightness if needed). Test buzzers—confirm both are audible and responsive. Audio/visibility failures are the #1 cause of events flopping. Budget: 10 min. Effort: none.

3. **Question Sensitivity Review** ✓ MUST | Host-only  
   Host reads all 16 questions beforehand. Flag anything touching personal relationships, finances, religion, politics, or medical topics. Remove or re-word if needed. Prevents awkward silences that kill energy. Budget: 20 min. Effort: none.

4. **Designate a Separate Board Operator** ✓ MUST | Host-only  
   Assign one club officer to manage the app display (reveal answers, update score). Frees the host to focus on pacing, celebration, and audience energy instead of fiddling with the screen. Smoother TV-show feel. Budget: 5 min orientation. Effort: none.

5. **Live Scoreboard Visible to All** ✓ SHOULD | Existing feature  
   Display a large leaderboard on a second monitor or slide visible from all seats. Update after each question. Keeps outcome uncertainty high so the audience watches to the end. Budget: 0 (use app's existing scoreboard). Effort: none.

---

### Additional Ideas by Priority

#### SHOULD
- **Use a Visible Timer for Each Question** (Host-only): Assign a timekeeper to use a phone timer visible to the host. Call time when 3–4 minutes have passed per question. This keeps the full event under 70 minutes and prevents energy from flagging. Budget: 2 min setup (use a phone kitchen timer). Effort: none.
- **Music + "Stand Up If You've Ever..." During Breaks** (Host-only): Between 5-minute breaks, prepare 3 quick prompts (e.g., "Stand up if you've skipped a lecture for an event"). Play upbeat music; host reads prompts. Resets audience energy. Budget: 5 min setup (write 3 prompts; the app already plays its own theme between rounds). Effort: low.
- **"Steal From the Audience" Prize Moments** (Host-only): When a team strikes out, pause and say, "First person to shout the correct answer wins a prize!" Reveal an unrevealed answer. Audience members stay alert and have a shot to win. Budget: 5 small prizes (snacks, GDG merch). Effort: low.
- **Printed Host Guide (One-Page Cheat Sheet)** (Host-only): Print one page with core rules, pacing timeline, answer key with top 3 answers per question, and host notes (e.g., "If disputed, explain survey origin and move on"). Host is calmer and faster. Budget: 5 min to print. Effort: none.

#### COULD
- **Fast Money Lightning Variant** (Small code, not built): Instead of official 20+25 seconds per player × 5 questions, run 10–15 seconds per question, 3 questions total. Keeps finale snappy. Requires pre-seeded Fast Money answers (tied to your 16 survey questions). Budget: 30 min coding. Effort: small.
- **Audience Polls Between Rounds** (Small code, not built): Between rounds, quick 30-second poll on projector: "Which team will win the next round?" Audience votes via phones; results display live. Note: the app's existing poll is for host-typed guesses during a team's turn; this prediction vote is a new feature. Budget: small. Effort: small.
- **Visible Countdown Timer** (Small code, not built): On-screen timer with color fade (green → yellow → red) is more engaging than a clock. ~5 lines of CSS/JS. Budget: 15 min. Effort: small.
- **Audience Raffle Prize Pool** (Host-only): Collect 5–10 small prizes. Raffle ticket for "steal from audience" winners. Draw 2–3 winners at end. Budget: collect prizes (free/cheap). Effort: none.

#### SKIP (Not viable in 2 days or needs external tools)
- **AhaSlides or Poll Everywhere integration** — Your app already does phone voting via QR. Creating new external accounts or paying for SaaS platforms is overkill. Skip.
- **Multiplier scoring (1x → 2x → 3x points per round)** — Not confirmed by verified sources. App has no multiplier logic. Skip.
- **Audience answer submission ("guess the #1 answer")** — Spelling validation is complex to build in 2 days. Skip.
- **Computer-vision crowd analysis or ML cheer meter** — Not feasible in 2 days. Skip.

---

## Part 2: How to Handle Survey Answers (Without Surveying 100 People)

### The Real TV Show (Context Only)

Family Feud surveys exactly 100 people per question (now via Applied Research West, a polling firm). Each answer is worth points equal to the number of people who said it. Answers appearing on the board were said by at least 2 people minimum. This is the gold standard—but is not practical for a student event.

### For Your Club Event: A Simpler Approach

**The club's events team is already surveying students.** According to the tech lead, they take top answers from actual student responses. Here's how to use that:

#### How It Works
1. **Survey size**: 20–50 student responses is fine for a party game (not statistical rigor, just enough to rank answers by popularity).
2. **Points = respondent count**: If 8 students said "scrolling" and 5 said "sleep," then "scrolling" is worth 8 points and "sleep" is worth 5 points. Simple, fair, honest.
3. **Minimum threshold**: Drop any answer given by only 1 person (matches the real show's rule). This filters out joke answers and one-offs.
4. **Board size**: Show the top 5–8 answers per question (not all 50 possible answers).
5. **Grouping similar answers**: If students said "scrolling," "scroll," and "TikTok scrolling," combine them under one entry ("scrolling") and add the counts. The host decides in real-time if a team's guess matches a grouped answer.

#### Why This Works
- It's real data from real students (honest).
- 20–50 people provides enough variance to rank answers meaningfully.
- Points are transparent (no arbitrary weights).
- Respects the game's survey-based nature without requiring a formal polling firm.

### If Survey Results Arrive Late or Incomplete

**Plan in advance; pick one:**

**Option A (Recommended): Quick Poll of the Room**
- Before the event (or while people arrive), ask the room each question and let everyone call out or write ONE answer; a helper tallies on paper (e.g., "scrolling: 6, sleep: 4, gaming: 3").
- Counts are typed into the app's Questions & data editor before each round starts.
- Announce to the audience: "We're building the board with a quick poll of this room."
- **Pros:** Honest, no external tools, preserves the survey mechanic, audience buys in.
- **Cons:** Less polished than pre-surveyed; requires a helper and 30 minutes of prep time.

**Option B: Placeholder Demo Data (Clearly Labeled)**
- Before the event, prepare 3–5 plausible answers per question as backup (e.g., "scrolling," "sleep," "gaming" for "name something students do instead of studying").
- Load into the game with a clear on-screen label: "DEMO: INVENTED RESULTS."
- Play normally, treating it as a warm-up or example round.
- **Pros:** Minimal prep; controls pacing.
- **Cons:** Less engagement because answers aren't from a real survey; **must clearly label to avoid dishonesty**.

### Do NOT Invent Weights

Do not randomly adjust answer values or invent popularity weights for a real event. This is dishonest to the audience. **Demo data is acceptable only if clearly labeled.** Real answers should reflect actual student survey counts.

---

## Part 3: What to Clarify with the Tech Lead

Send a message like this before you run the event:

---

Hey! Quick questions about the Family Feud setup. (a) The face-off uses physical USB buzzers—what are we using exactly (USB cable, wireless set with receiver, brand/model)? Can we do a quick test run before Tuesday? (b) When will the events team's survey results be ready, and what format (answer text + how many students said it)? Roughly how many students are being surveyed? (c) If results are late or sketchy, can we either run a quick hand-vote poll of the room that day, or load a clearly labelled demo pack ("DEMO: INVENTED RESULTS")? (d) Just confirming the game is a web app on the laptop shown on the projector (phones join via QR to vote in the crowd poll, not to type answers or control the board). That cool? (e) Who's hosting and who's running the laptop? Thanks!

---

---

## Part 4: What's Already Built (Don't Re-Implement)

The app already has:
- Moderator console with undo
- Projector board with Blue Ice theme
- QR join for phones
- Crowd-assist poll (phones vote on host-typed guesses, never hidden answers)
- Original theme tune + sound effects with mute
- Between-rounds scoreboard
- Final winner screen
- 3 default rounds, no multipliers, 3 strikes + one steal
- "ALREADY ON THE BOARD" rule (no strike, no points)
- Buzzer face-off: keyboard-style USB buzzers are learned by pressing them (Session tab), a manual "who was first" button is the fallback for buzzers that cannot connect, and the winner picks play or pass

**NOT yet built:** Fast Money, countdown timer, audience prediction voting, per-player names, host script cards.

---

## Part 5: Key Facts for Newcomers to Family Feud

**The core mechanic**: A survey tells you what real people said. Teams guess answers from that survey. Each correct guess wins points equal to how many people said it. First team to guess a #1 answer controls the round. Three strikes = you lose control and the other team gets a "steal" attempt.

**Why it's fun**: The reveal (who gets it right, what were people actually thinking) is the suspense. The survey is the truth that can't be debated.

**Your event's twist**: You're using real student answers (20–50 people surveyed), not 100. This is smaller but legitimate for a party game. Transparency about sample size matters; lying about it doesn't.

**Judging calls matter**: The host's judgment on borderline answers (is "couch" the same as "sofa"?) is final. Establish this upfront to avoid 2-minute disputes.

---

## Summary: The Checklist (2-Day Timeline)

**Today (or Day 1)**
- [ ] Coordinator reviews 16 survey questions for sensitive topics; flags 1–2 to re-word
- [ ] Check with tech lead on survey data timeline and format
- [ ] Prepare host guide (1 page: rules, pacing, answer key)
- [ ] Source 3–5 small prizes for "steal from audience" moments
- [ ] Identify host and board operator; brief them on roles

**Tomorrow / Event Day Morning**
- [ ] Receive final survey data from events team OR prepare live polling plan
- [ ] Load answers into app; test scoring on one question
- [ ] Print host guide; laminate if possible
- [ ] Set up equipment (laptop, projector, microphone, buzzers); test all
- [ ] Write 3–4 host patter prompts (for breaks and between rounds)

**Event Day (30 Min Before)**
- [ ] Sound check: host mic, board visibility, buzzer sounds
- [ ] Verify board operator knows the app
- [ ] Brief host on judging criteria statement (say at event start)
- [ ] Brief timekeeper on 3–4 min per question
- [ ] Audience arrives; start

---

## Sources & Verified Facts

**Survey methodology**: The real show surveys 100 people (now via Applied Research West). 20 to 50 respondents is a practical suggestion for amateur events, not a sourced fact. — *Verified: Strong National Museum of Play, Screen Rant.*

**Judging**: Host has final say on borderline answers. Consistency across both teams throughout the game matters. — *Verified: Family Feud rules, Richard House Guide.*

**Sound/visibility failures**: Audio/visibility are the #1 reasons live events flop. Test 30 min before event. — *Verified: Quizado, Panacea Co.*

**Pacing**: 3–4 min per question keeps rounds moving; events over 90 min lose audience energy. — *Verified: Quizado, Family Feud Team Building Guide.*

**Buzzers**: USB keyboard buzzers work reliably in browser when the moderator window is focused (browsers deliver keyboard events only to the focused window). The app warns when the moderator window is not focused. Deterministic tie-breaking (e.g., "Player 1 wins on simultaneous presses") is more reliable than sub-20ms timing. — *Verified: MDN Web Docs, browser keyboard event behavior.*

**Fast Money**: Official rules are 20 sec (Player 1) + 25 sec (Player 2), 5 questions, 200 combined points to win, duplicate-answer rule enforced. For a club event, a simpler 3-question 15-second variant is acceptable if pre-seeded answers are tied to your 16 survey questions. — *Verified: Family Feud Fast Money Rules.*

---

## Final Note: The Difference Between "Demo" and "Real"

If survey data fails completely, it's acceptable to use placeholder demo answers **if clearly labeled on screen as "DEMO: INVENTED RESULTS"** throughout the event. The audience should always know whether answers came from a real student survey or were prepared in advance as examples.

Inventing weights (e.g., "we scored scrolling 12 points because it sounds trendy") is not acceptable for a real event. Points should reflect actual respondent counts. If you don't have real data, use one of the two fallback options above.

---

*Report compiled: 4 October 2026*  
*For: GDG Family Feud event, Tuesday 6 October 2026, UOBD*
