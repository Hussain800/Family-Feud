// The event rehearsal: a three-round match with the REAL event pack, played through the moderator console with the
// synchronized projector watching, then the next teams in Yellow/Green and Black/White (and reversed).
//
//   node scripts/e2e-event.mjs                 (1920x1080)        VIEW=1366x768 node scripts/e2e-event.mjs
//
// Needs the private pack (python scripts/workbook_to_pack.py <workbook>) and the dev server. It runs in a fresh, isolated
// browser context at a local origin: nothing it does touches the moderator laptop's own saved game. Real-data
// screenshots go to private/rehearsal/ (git-ignored). The committed colour screenshots come from the invented practice pack.
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PACK_FILE = `${ROOT}private/event-pack.json`; // the converter's output: the reference the browser import is checked against
const WORKBOOK = `${ROOT}private/family_feud_board.xlsx`; // what the moderator actually chooses in Setup
if (!existsSync(PACK_FILE) || !existsSync(WORKBOOK)) {
  console.log("SKIPPED: private/event-pack.json and private/family_feud_board.xlsx are not both here. Copy the workbook into private/ and run: python scripts/workbook_to_pack.py private/family_feud_board.xlsx");
  process.exit(2);
}
const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
const [VW, VH] = (process.env.VIEW ?? "1920x1080").split("x").map(Number);
const PRIVATE = `${ROOT}private/rehearsal/`;
const PUBLIC = `${ROOT}docs/screenshots/`;
mkdirSync(PRIVATE, { recursive: true });
mkdirSync(PUBLIC, { recursive: true });

const pack = JSON.parse(readFileSync(PACK_FILE, "utf8"));
const Q = (n) => pack.questions.find((q) => q.id === `w${String(n).padStart(2, "0")}`);
const pts = (n) => Q(n).answers.map((a) => a.count); // the workbook's Points column
const sum = (a) => a.reduce((x, y) => x + y, 0);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();
// a team's box is filled with its colour: its colour variable is set and the background is a gradient of it
const fillOf = (page, sel) => page.locator(sel).first().evaluate((el) => { const cs = getComputedStyle(el); return { tab: cs.getPropertyValue("--tab").trim().toLowerCase(), filled: /linear-gradient/.test(cs.backgroundImage) }; });
const isFilled = async (page, sel, hex) => { const f = await fillOf(page, sel); return f.tab === hex && f.filled; };

// ---------- expected values, worked out from the points column and the rules, not from the app ----------
// The workbook rounds votes / 32 * 100 half up (12.5 -> 13). Recomputed here as a second, independent check of the pack.
const halfUp = (votes) => Math.floor((votes * 200 + 32) / 64);
const REFERENCE = [[5, 82], [7, 87], [5, 81], [6, 82], [5, 90], [5, 87], [5, 63], [5, 81], [5, 82], [5, 80], [5, 85], [5, 78], [5, 87], [5, 84]];
check("the pack holds 14 questions and 73 answers", pack.questions.length === 14 && sum(pack.questions.map((q) => q.answers.length)) === 73);
check("every answer's points are the half-up rounding of its votes out of 32", pack.questions.every((q) => q.answers.every((a) => a.count === halfUp(a.votes))));
check("answer counts and points totals match the workbook audit, question by question", pack.questions.every((q, i) => q.answers.length === REFERENCE[i][0] && sum(q.answers.map((a) => a.count)) === REFERENCE[i][1]), JSON.stringify(pack.questions.map((q) => [q.answers.length, sum(q.answers.map((a) => a.count))])));
check("the bag question has seven answers and the food question six", Q(2).answers.length === 7 && Q(4).answers.length === 6);
check("workbook question 8 keeps its two 25-point answers tied, in source order", pts(8)[0] === 25 && pts(8)[1] === 25);

const P1 = pts(2); // round 1: the bag question, Team Red clears the board
const P2 = pts(4); // round 2: the food question, three strikes, Team Blue steals
const P3 = pts(1); // round 3: the studying question, three strikes, Team Red's steal fails
const pot1 = sum(P1); // every answer on the board
const pot2 = P2[0] + P2[1] + P2[2]; // face-off top answer, one team-turn answer, and the answer that steals
const pot3 = P3[0] + P3[1] + P3[2]; // both face-off answers and one team-turn answer
const CORRECTION = -10; // a penalty applied to Team Red by hand
const expectRed = pot1 + CORRECTION;
const expectBlue = pot2 + pot3;
const winner = expectRed === expectBlue ? null : expectRed > expectBlue ? "Team Red" : "Team Blue";
console.log(`expected: round 1 ${pot1} to Red, round 2 ${pot2} to Blue (steal), round 3 ${pot3} to Blue (failed steal), correction ${CORRECTION} to Red -> Red ${expectRed}, Blue ${expectBlue}, winner ${winner ?? "tie"}`);

// ---------- browser ----------
const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];
const fresh = async () => {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const host = await ctx.newPage();
  const screen = await ctx.newPage();
  for (const [n, p] of [["host", host], ["screen", screen]]) p.on("pageerror", (e) => pageErrors.push(`${n}: ${e.message}`));
  return { ctx, host, screen };
};
const shot = (page, dir, name) => page.screenshot({ path: `${dir}${name}-${VW}x${VH}.png` });

const spy = (screen) => screen.evaluate(() => {
  window.__msgs = [];
  window.__flashes = [];
  const ch = new BroadcastChannel("gdg-ff-public");
  ch.onmessage = (e) => window.__msgs.push(JSON.stringify(e.data));
  new MutationObserver((list) => {
    for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains("flash")) window.__flashes.push(n.className + "|" + n.textContent);
  }).observe(document.body, { childList: true, subtree: true });
});

// ======================================================================================================
// PART A: the real pack, three rounds, then the next teams
// ======================================================================================================
const { ctx, host, screen } = await fresh();
await host.goto(`${BASE}/host`);
await screen.goto(`${BASE}/screen/local`);
await screen.click("button:has-text('Continue muted')");
await host.waitForSelector(".host__head");
await sleep(600);
await host.click(".offer button:has-text('Skip')").catch(() => {});
await spy(screen);

const q = (label) => host.locator(".q").filter({ has: host.locator(".q__num", { hasText: new RegExp(`^${label}$`) }) });
const scoresHost = async () => (await host.locator(".score__num").allInnerTexts()).map(Number);
const scoresScreen = async () => [Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")), Number(await text(screen, ".s-foot .team:nth-child(3) .team__score"))];
const pot = () => text(screen, ".mid__pot");
const strikesOn = () => screen.locator(".strike--on").count();
const flashes = () => screen.evaluate(() => window.__flashes.slice());
const lastCue = () => screen.locator(".screen-page").getAttribute("data-last-cue");
const cues = async () => Number(await screen.locator(".screen-page").getAttribute("data-cues"));
const tags = () => screen.locator(".team__tag").allInnerTexts().then((t) => t.map((x) => x.trim()));
const step = () => text(host, ".step");
const wrongAnswer = async () => { await host.click("button:has-text('Wrong answer')"); await sleep(800); };
const pick = async (a, b, scope = "live") => {
  await host.locator(`input[name="${scope}-A"][value="${a}"]`).check({ force: true });
  await host.locator(`input[name="${scope}-B"][value="${b}"]`).check({ force: true });
};
const resumeHost = async () => { await host.reload(); await host.click("button:has-text('Resume the game')"); await sleep(500); };
const reloadScreen = async () => { await screen.reload(); await screen.click("button:has-text('Continue muted')"); await spy(screen); await sleep(500); };

// --- the load-data state, then the import ---
check("a browser with no event pack says so plainly and lists no questions", /No event questions on this laptop yet/.test(await text(host, ".live__main")) && (await host.locator(".qlist").count()) === 0);
check("nothing is loaded automatically: no demo label, no invented data", (await host.locator(".alert--demo").count()) === 0 && (await screen.locator(".demo-banner").count()) === 0);
await host.click("button:has-text('Load the answers in Setup')");
await host.setInputFiles('input[aria-label="Choose the answers workbook or a pack file"]', WORKBOOK); // the Excel file itself, as the moderator will
const staged = await text(host, ".alert--notice");
check("the file is checked and summarised before anything changes: 14 questions, 73 answers", /Event pack checked: 14 questions, 73 answers/.test(staged), staged.slice(0, 160));
check("nothing is loaded until the import is confirmed", /No questions loaded/.test(await text(host, ".packline")));
await host.click("button:has-text('Load this pack')");
await host.click("button:has-text('Confirm')");
await sleep(300);
check("the event pack is active: 14 questions, 73 answers, labelled as the event pack", /Event pack/.test(await text(host, ".packline")) && /14 questions, 73 answers/.test(await text(host, ".packline")), await text(host, ".packline"));
const stored = await host.evaluate(() => JSON.parse(localStorage.getItem("ff.pack.v1")));
const sameAsConverter = stored.questions.length === pack.questions.length && stored.questions.every((sq, i) => {
  const pq = pack.questions[i];
  return sq.id === pq.id && sq.prompt === pq.prompt && sq.answers.length === pq.answers.length && sq.answers.every((sa, k) => ["id", "rank", "text", "count", "votes", "notes"].every((f) => sa[f] === pq.answers[k][f]));
});
check("the pack read from the Excel file in the browser equals the one the converter verified against every source cell", sameAsConverter);
await host.click("role=tab[name='Live']");
const rows = await host.locator(".q__num").allInnerTexts();
check("the question picker holds exactly the workbook's 14 questions, numbered as the workbook numbers them", rows.length === 14 && rows.every((r, i) => r === `Question ${i + 1}`), JSON.stringify(rows));
check("question 2 reads as the workbook's bag question, not the old template's", /almost every student's bag/.test(await q("Question 2").innerText()) && /complain about during a Dubai summer/.test(await q("Question 6").innerText()) && /almost every student has on their phone/.test(await q("Question 10").innerText()));
check("genuine event data carries no demo banner on the console or the projector", (await host.locator(".alert--demo").count()) === 0 && (await screen.locator(".demo-banner").count()) === 0);
check("the long label in question 7 is flagged to the moderator, not shrunk", /Long answers may wrap/.test(await q("Question 7").innerText()));
await pick("red", "blue");
await sleep(300);
check("Team Red and Team Blue are named on the console and the projector, their boxes filled with the team colours", JSON.stringify(await host.locator(".score__name").allInnerTexts()) === '["Team Red","Team Blue"]' && /TEAM RED/.test(await text(screen, ".lobby__teams")) && /TEAM BLUE/.test(await text(screen, ".lobby__teams")) && (await isFilled(screen, ".lobby__team:nth-of-type(1)", "#d93a2f")) && (await isFilled(screen, ".lobby__team:nth-of-type(2)", "#4ea1ff")) && (await isFilled(host, ".score__team:nth-child(1)", "#d93a2f")));
await shot(host, PRIVATE, "a1-console-lobby");
await shot(screen, PRIVATE, "a2-projector-lobby");

// --- ROUND 1: seven answers. The hosts overrule their own first call. Red plays and clears the board. ---
await q("Question 2").locator("button:has-text('Start')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Start the face-off')");
await host.click("button:has-text('Team Red buzzed first')");
await host.keyboard.press("3"); // Red's answer: the third-ranked one
await sleep(300);
check("the face-off pays the answered points into the pot (not votes)", (await pot()) === String(P1[2]), `${await pot()} vs ${P1[2]}`);
await host.keyboard.press("1"); // Blue's answer: the top one
await sleep(300);
check("the console suggests the higher answer and leaves the call to the hosts", /Over to the hosts/.test(await step()) && /By the survey, Team Blue wins/.test(await step()), await step());
check("the projector never names a winner before the hosts call it", /OVER TO THE HOSTS/.test(await text(screen, ".fo")));
check("the pot after both face-off answers is the sum of their points", (await pot()) === String(P1[2] + P1[0]));
await host.click("button:has-text('Team Blue wins the face-off')");
await host.click("text=Wrong call? Team Red won");
check("a wrong call is corrected before play: Team Red won", /Team Red won the face-off/.test(await step()), await step());
await host.click("button:has-text('Team Red plays')");
await sleep(400);
check("Team Red plays, with a banner and a PLAYING label on its team card", (await flashes()).some((f) => /TEAM RED PLAYS/.test(f)) && (await tags())[0] === "PLAYING", JSON.stringify(await tags()));
const cuesBeforeStrike = await cues();
await wrongAnswer();
check("a wrong answer shows one red X and marks the first strike", (await strikesOn()) === 1 && (await lastCue()) === "strike" && (await flashes()).some((f) => /flash--x/.test(f)));
await host.keyboard.press("u");
await sleep(400);
check("Undo takes the strike back, silently", (await strikesOn()) === 0 && (await cues()) === cuesBeforeStrike + 1, `${await strikesOn()} ${await cues()}`);
for (const k of ["2", "4", "5", "6"]) { await host.keyboard.press(k); await sleep(250); }
check("six of seven answers are on the board; the projector shows only those", (await screen.locator(".tile--shown").count()) === 6 && (await screen.locator(".tile").count()) === 7);
await shot(screen, PRIVATE, "a3-projector-bag-question-seven-answers");
await shot(host, PRIVATE, "a4-console-bag-question");
await host.keyboard.press("7");
await sleep(500);
check("clearing the board: the pot is the sum of the seven points, 87 for the workbook's bag question", (await pot()) === String(pot1) && pot1 === 87, `${await pot()} vs ${pot1}`);
// refresh the moderator and the projector in the middle of a settled round
await resumeHost();
await reloadScreen();
check("after refreshing both, the board, the pot and both team identities are still there", (await screen.locator(".tile--shown").count()) === 7 && (await pot()) === String(pot1) && /Team Red/.test(await text(screen, ".s-foot .team:nth-child(1)")) && /Team Blue/.test(await text(screen, ".s-foot .team:nth-child(3)")) && (await isFilled(screen, ".s-foot .team:nth-child(1)", "#d93a2f")) && (await isFilled(screen, ".s-foot .team:nth-child(3)", "#4ea1ff")));
check("a reloaded projector replays no sound or effect", (await cues()) === 0 && (await flashes()).length === 0);
const awardBtn = host.locator(`button:has-text('Give ${pot1} points to Team Red')`);
await awardBtn.click({ clickCount: 2, delay: 0 });
await sleep(400);
check("a double click on Award gives the points once: Red 87, Blue 0", JSON.stringify(await scoresHost()) === JSON.stringify([pot1, 0]), JSON.stringify(await scoresHost()));
const stillOffered = await host.locator("button:has-text('Next question')").count();
console.log(`INFO  after the double click on Award, Next question was ${stillOffered ? "still offered (the second click landed before it)" : "already used by the second click"}`);
if (stillOffered) await host.click("button:has-text('Next question')");
await sleep(300);
check("Red's score reads 87 on the projector's between-rounds board", /87/.test(await text(screen, ".final")), await text(screen, ".final"));
check("the interlude shows both team plates filled with their colours", (await isFilled(screen, ".final .plate:nth-child(1)", "#d93a2f")) && (await isFilled(screen, ".final .plate:nth-child(2)", "#4ea1ff")));

// --- ROUND 2: six answers. Red plays, three strikes, Blue steals successfully. ---
await q("Question 4").locator("button:has-text('Start')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Start the face-off')");
await host.click("button:has-text('Team Red buzzed first')");
await host.keyboard.press("1"); // the top answer
await sleep(300);
check("the top answer: the console suggests it and still waits for the hosts", /By the survey, Team Red wins/.test(await step()) && /found the top answer/.test(await step()), await step());
await host.click("button:has-text('Team Red wins the face-off')");
await host.click("button:has-text('Team Red plays')");
await host.keyboard.press("2");
await sleep(300);
await host.keyboard.press("5");
await sleep(300);
const potBeforeUndo = await pot();
await host.keyboard.press("u");
await sleep(300);
check("Undo takes back the last reveal: that tile is hidden again and the pot drops by its points", (await pot()) === String(P2[0] + P2[1]) && potBeforeUndo === String(P2[0] + P2[1] + P2[4]) && (await screen.locator(".tile--shown").count()) === 2, `${await pot()} ${potBeforeUndo}`);
await wrongAnswer();
await wrongAnswer();
await wrongAnswer();
await sleep(1500); // the third strike's X, then the steal banner
check("three strikes open the steal for Team Blue", /Team Blue/.test(await step()) && /steal/.test(await step()) && (await strikesOn()) === 3 && (await flashes()).some((f) => /STEAL!/.test(f)), await step());
check("the projector marks Blue as STEALING", (await tags())[1] === "STEALING", JSON.stringify(await tags()));
await shot(screen, PRIVATE, "a5-projector-steal-six-answers");
await resumeHost();
await reloadScreen();
check("after refreshing in the middle of a steal, the strikes, pot and identities are unchanged", (await strikesOn()) === 3 && (await pot()) === String(P2[0] + P2[1]) && /STEALING/.test((await tags())[1]) && /Team Blue/.test(await text(screen, ".s-foot .team:nth-child(3)")));
await host.keyboard.press("3"); // Blue's steal is on the board
await sleep(500);
check("a steal that is on the board takes the whole pot, steal answer included", (await pot()) === String(pot2), `${await pot()} vs ${pot2}`);
check("Blue is told the points are theirs", /Team Blue/.test(await step()) && /stole the round/.test(await step()), await step());
await host.click(`button:has-text('Give ${pot2} points to Team Blue')`);
await sleep(300);
check(`the steal pays Blue ${pot2} and Red keeps 87`, JSON.stringify(await scoresHost()) === JSON.stringify([pot1, pot2]), JSON.stringify(await scoresHost()));
await host.click("button:has-text('Next question')");
// manual score correction, and its Undo
await host.click("button:has-text('Adjust score')");
await host.click(".adjust__team:has-text('Team Blue')");
await host.click(".adjust__amounts button:has-text('+5')");
check("a manual correction moves one score", JSON.stringify(await scoresHost()) === JSON.stringify([pot1, pot2 + 5]));
await host.keyboard.press("u");
await sleep(200);
check("Undo reverses the correction", JSON.stringify(await scoresHost()) === JSON.stringify([pot1, pot2]));
await host.click(".adjust__team:has-text('Team Red')");
await host.click(".adjust__amounts button:has-text('−10')");
await host.click("button:has-text('Done adjusting')");
check("a −10 penalty on Team Red stays", JSON.stringify(await scoresHost()) === JSON.stringify([expectRed, pot2]) , JSON.stringify(await scoresHost()));

// --- ROUND 3: five answers. Blue buzzes first; Red's answer is higher and Red passes. Blue plays, three strikes, Red's steal fails. ---
await q("Question 1").locator("button:has-text('Start')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Start the face-off')");
await host.click("button:has-text('Team Blue buzzed first')");
await host.keyboard.press("2"); // Blue hits the second answer
await sleep(300);
await host.keyboard.press("1"); // Red hits the top answer
await sleep(300);
check("the higher answer is the survey's suggestion: Team Red", /By the survey, Team Red wins/.test(await step()) && /answer scores higher/.test(await step()), await step());
await host.click("button:has-text('Team Red wins the face-off')");
await host.click("button:has-text('Team Red passes')");
await sleep(400);
check("Red passes: Blue plays, and the room is told", (await flashes()).some((f) => /TEAM RED PASSES/.test(f)) && (await tags())[1] === "PLAYING", JSON.stringify(await tags()));
await host.keyboard.press("3");
await sleep(300);
check("the pot is the three revealed answers' points", (await pot()) === String(pot3), `${await pot()} vs ${pot3}`);
await wrongAnswer();
await wrongAnswer();
await wrongAnswer();
await sleep(1500); // the third strike's X and the steal banner come first
await wrongAnswer(); // Red's one steal guess is wrong
await sleep(300);
check("a failed steal: the steal ends and Blue keeps the points", /Steal missed/.test(await step()) && /keeps the points/.test(await step()) && (await lastCue()) === "stealMiss", `${await step()} / cue ${await lastCue()}`);
await host.click(`button:has-text('Give ${pot3} points to Team Blue')`);
await sleep(300);
check(`the failed steal leaves ${pot3} with Blue: Red ${expectRed}, Blue ${expectBlue}`, JSON.stringify(await scoresHost()) === JSON.stringify([expectRed, expectBlue]), JSON.stringify(await scoresHost()));
await host.click("button:has-text('Finish the game')");
await screen.waitForSelector(".final");
const finalText = await text(screen, ".final");
check(`the final screen names the winner by the totals: ${winner ?? "a tie"}, ${expectRed} to ${expectBlue}`, winner ? new RegExp(`${winner} wins`).test(finalText) && finalText.includes(String(expectRed)) && finalText.includes(String(expectBlue)) : /tie/i.test(finalText), finalText.replace(/\n/g, " | "));
check("the console says the same", winner ? new RegExp(`${winner} wins, ${Math.max(expectRed, expectBlue)} to ${Math.min(expectRed, expectBlue)}`).test(await text(host, ".over")) : true, await text(host, ".over"));
await shot(screen, PRIVATE, "a6-projector-final-red-blue");
await shot(host, PRIVATE, "a7-console-game-over");

// --- what the projector was ever sent ---
const sent = (await screen.evaluate(() => window.__msgs.join("\n"))) + "\n";
// round 2 revealed answers 1, 2 and 3, and briefly 5 (taken back with Undo); round 3 revealed 1, 2 and 3
const neverShown = [...Q(4).answers.filter((_, i) => i === 3 || i === 5), ...Q(1).answers.filter((_, i) => i > 2)];
check("answers that were never revealed were never sent to the projector", neverShown.length === 4 && neverShown.every((a) => !sent.includes(JSON.stringify(a.text))), neverShown.filter((a) => sent.includes(JSON.stringify(a.text))).map((a) => a.text).join());
// a note that is word for word an answer's own label can only be told apart by where it sits, so those are skipped
const labels = new Set(pack.questions.flatMap((qq) => qq.answers.map((a) => a.text)));
const leakedNotes = pack.questions.flatMap((qq) => qq.answers).filter((a) => a.notes && !labels.has(a.notes) && sent.includes(JSON.stringify(a.notes))).map((a) => a.notes);
check("the moderator-only notes were never sent, for any answer", leakedNotes.length === 0 && !/"notes"/.test(sent), leakedNotes.join(" || "));
check("votes and the survey source were never sent", !/"votes"|events_team_workbook|respondents/.test(sent));

// --- the next teams: Yellow/Green. The pack and the used-question history stay. ---
await host.locator('input[name="over-A"][value="yellow"]').check({ force: true });
await host.locator('input[name="over-B"][value="green"]').check({ force: true });
await host.click("button:has-text('Start the next game: Team Yellow vs Team Green')");
await host.click("button:has-text('Confirm')");
await sleep(400);
check("next teams: Team Yellow and Team Green, scores 0, round 1 again", JSON.stringify(await host.locator(".score__name").allInnerTexts()) === '["Team Yellow","Team Green"]' && JSON.stringify(await scoresHost()) === "[0,0]" && /Round 1 of 3/.test(await text(host, ".live__main")));
check("next teams keep the imported pack: still 14 questions", (await host.locator(".q__num").count()) === 14);
check("questions 1, 2 and 4 are marked as used in an earlier game, and 3 is not", (await q("Question 1").locator(".tag").innerText()) === "Used in an earlier game" && (await q("Question 2").locator(".tag").innerText()) === "Used in an earlier game" && (await q("Question 4").locator(".tag").innerText()) === "Used in an earlier game" && (await q("Question 3").locator(".tag").count()) === 0);
check("a used question can still be played if the hosts choose", await q("Question 1").locator("button:has-text('Start')").isEnabled());

// --- presentation passes: one short round per colour pair, with the X and the winner banner ---
const presentation = async (a, b, [A, B], dir, tag, question) => {
  await q(`Question ${question}`).locator("button:has-text('Start')").click();
  if (await host.locator("button:has-text('Confirm: start anyway')").count()) await host.click("button:has-text('Confirm: start anyway')"); // a long label asks first
  await host.click("button:has-text('Show the board')");
  await host.click("button:has-text('Start the face-off')");
  await host.click(`button:has-text('${A} buzzed first')`);
  await host.keyboard.press("1");
  await sleep(250);
  await host.click(`button:has-text('${A} wins the face-off')`);
  await host.click(`button:has-text('${A} plays')`);
  await sleep(1300); // let the play banner clear
  await host.keyboard.press("2");
  await sleep(400);
  await shot(screen, dir, `${tag}-board-${a}-${b}`);
  await host.click("button:has-text('Wrong answer')");
  await sleep(160);
  const f = await flashes();
  check(`${tag}: the red X is drawn and is not the team colour (${A} playing)`, f.some((x) => /flash--x/.test(x)) && (await screen.locator(".flash--x .flash__x").count()) >= 1);
  await shot(screen, dir, `${tag}-red-x-${a}-${b}`);
  await sleep(1100);
  const ts = await tags();
  check(`${tag}: the team card says PLAYING and the written name stays beside the colour`, ts[0] === "PLAYING" && new RegExp(A).test(await text(screen, ".s-foot .team:nth-child(1)")) && new RegExp(B).test(await text(screen, ".s-foot .team:nth-child(3)")), JSON.stringify(ts));
  await host.click("button:has-text('End round early')");
  await host.click("button:has-text('Confirm')");
  await host.click("button:has-text('Give')");
  await sleep(500);
  await shot(screen, dir, `${tag}-award-banner-${a}-${b}`);
  await sleep(1500);
  await host.click("button:has-text('Next question')");
  await host.click("button:has-text('Finish the game now')");
  await host.click("button:has-text('Confirm')");
  await screen.waitForSelector(".final");
  const final = await text(screen, ".final");
  check(`${tag}: the winner banner names ${A}`, new RegExp(`${A} wins`).test(final), final.replace(/\n/g, " | "));
  await shot(screen, dir, `${tag}-final-${a}-${b}`);
};
await presentation("yellow", "green", ["Team Yellow", "Team Green"], PRIVATE, "b-real", 7);
await host.locator('input[name="over-A"][value="black"]').check({ force: true });
await host.locator('input[name="over-B"][value="white"]').check({ force: true });
await host.click("button:has-text('Start the next game: Team Black vs Team White')");
await host.click("button:has-text('Confirm')");
await sleep(300);
await shot(screen, PRIVATE, "b-real-lobby-black-white");
await presentation("black", "white", ["Team Black", "Team White"], PRIVATE, "c-real", 5);
await host.locator('input[name="over-A"][value="white"]').check({ force: true });
await host.locator('input[name="over-B"][value="black"]').check({ force: true });
await host.click("button:has-text('Start the next game: Team White vs Team Black')");
await host.click("button:has-text('Confirm')");
await sleep(300);
await shot(screen, PRIVATE, "c-real-lobby-white-black");
await presentation("white", "black", ["Team White", "Team Black"], PRIVATE, "d-real", 9);
await host.locator('input[name="over-A"][value="red"]').check({ force: true });
await host.locator('input[name="over-B"][value="blue"]').check({ force: true });
await host.click("button:has-text('Start the next game: Team Red vs Team Blue')");
await host.click("button:has-text('Confirm')");
await sleep(300);
check("after three more pairs the pack is still the event pack, 14 questions, with the earlier games' questions marked", (await host.locator(".q__num").count()) === 14 && (await host.evaluate(() => JSON.parse(localStorage.getItem("ff.pack.v1")).questions.length)) === 14 && (await host.locator(".tag", { hasText: "Used in an earlier game" }).count()) >= 6);
await ctx.close();

// ======================================================================================================
// PART B: the committed colour screenshots, from the invented practice pack only
// ======================================================================================================
{
  const { ctx, host: h, screen: s } = await fresh();
  await h.goto(`${BASE}/host`);
  await s.goto(`${BASE}/screen/local`);
  await s.click("button:has-text('Continue muted')");
  await h.waitForSelector(".host__head");
  await sleep(500);
  await h.click(".offer button:has-text('Skip')").catch(() => {});
  await h.click("role=tab[name='Setup']");
  await h.click('button:has-text("Load practice pack")');
  await h.click("button:has-text('Confirm')");
  await h.click("role=tab[name='Live']");
  const ALL = ["red", "blue", "yellow", "green", "black", "white"];
  const PAIRS = [["red", "blue", "Team Red", "Team Blue", "colours-red-blue"], ["yellow", "green", "Team Yellow", "Team Green", "colours-yellow-green"], ["black", "white", "Team Black", "Team White", "colours-black-white"], ["white", "black", "Team White", "Team Black", "colours-white-black"]];
  const checked = (side) => h.evaluate((n) => document.querySelector(`input[name="live-${n}"]:checked`)?.value ?? null, side);
  const setPair = async (a, b) => {
    const curB = await checked("B");
    if (curB !== b) {
      // a colour the first team still holds cannot go to the second: park the first team on a free one
      if ((await checked("A")) === b) await h.locator(`input[name="live-A"][value="${ALL.find((c) => c !== a && c !== b && c !== curB)}"]`).check({ force: true });
      await h.locator(`input[name="live-B"][value="${b}"]`).check({ force: true });
    }
    if ((await checked("A")) !== a) await h.locator(`input[name="live-A"][value="${a}"]`).check({ force: true });
  };
  for (const [i, [a, b, A, B, tag]] of PAIRS.entries()) {
    await setPair(a, b);
    await sleep(300);
    await shot(s, PUBLIC, `${tag}-lobby`);
    await h.locator(".q button:has-text('Start')").first().click();
    await h.click("button:has-text('Show the board')");
    await h.click("button:has-text('Start the face-off')");
    await h.click(`button:has-text('${A} buzzed first')`);
    await h.keyboard.press("1");
    await sleep(250);
    await h.click(`button:has-text('${A} wins the face-off')`);
    await h.click(`button:has-text('${A} plays')`);
    await sleep(1400);
    await h.keyboard.press("2");
    await sleep(500);
    await shot(s, PUBLIC, `${tag}-board`);
    await shot(h, PUBLIC, `${tag}-console`);
    await h.click("button:has-text('End round early')");
    await h.click("button:has-text('Confirm')");
    await h.click("button:has-text('Give')");
    await h.click("button:has-text('Next question')");
    await h.click("button:has-text('Finish the game now')");
    await h.click("button:has-text('Confirm')");
    await s.waitForSelector(".final");
    await shot(s, PUBLIC, `${tag}-final`);
    const [na, nb, NA, NB] = PAIRS[(i + 1) % PAIRS.length];
    await h.locator(`input[name="over-A"][value="${na}"]`).check({ force: true });
    await h.locator(`input[name="over-B"][value="${nb}"]`).check({ force: true });
    await h.click(`button:has-text('Start the next game: ${NA} vs ${NB}')`);
    await h.click("button:has-text('Confirm')");
    await sleep(200);
  }
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length || pageErrors.length ? 1 : 0);
