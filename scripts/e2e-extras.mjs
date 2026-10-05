// Tie-break round and the countdown timer, through the moderator console and the projector window.
// Needs the dev stack running (pnpm run dev) and Chrome installed.   Run: pnpm run e2e:extras
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const host = await ctx.newPage();
const screen = await ctx.newPage();
const errors = [];
for (const [n, p] of [["host", host], ["screen", screen]]) p.on("pageerror", (e) => errors.push(`${n}: ${e.message}`));

await host.goto(`${BASE}/host`);
await host.waitForSelector(".host__head");
await host.click(".offer button:has-text('Skip')");
await screen.goto(`${BASE}/screen/local`);
await screen.click("button:has-text('Continue muted')");
await screen.waitForSelector(".lobby");
await host.click("role=tab[name='Setup']");
await host.click('button:has-text("Load demo pack")');
await host.click("button:has-text('Confirm')");

const startRound = async (n) => {
  await host.locator(".q").filter({ has: host.locator(".q__num", { hasText: new RegExp(`^Question ${n}$`) }) }).locator("button:has-text('Start')").click();
  if (await host.locator("button:has-text('Confirm')").count()) await host.click("button:has-text('Confirm')");
};
const confirm = async (label) => {
  await host.click(`button:has-text("${label}")`);
  await host.click("button:has-text('Confirm')");
};

// ---------- a one-round match that ends level (0 to 0) ----------
await host.fill("input[type=number]", "1"); // Setup: rounds per game
await host.click("role=tab[name='Live']");
await startRound(10);
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Skip the face-off')");
await host.click("button:has-text('Team A plays first')");
await confirm("End round early");
await host.click("button:has-text('Give 0 points to Team A')");
await host.click("button:has-text('Finish the game')");
await screen.waitForSelector(".final");
check("a level match ends as a tie on the projector", /tie/i.test(await text(screen, ".final__head")), await text(screen, ".final__head"));
check("the console offers a tie-break only for a level match", (await host.locator("button:has-text('Play a tie-break round')").count()) === 1);

await host.click("button:has-text('Play a tie-break round')");
await sleep(300);
check("the projector says all square and that the tie-break is next", /All square/.test(await text(screen, ".final")) && /TIE-BREAK IS NEXT/.test(await text(screen, ".final")), await text(screen, ".final"));
check("the question list says Tie-break round", /Tie-break round: choose a question/.test(await text(host, "[data-tour='questions'] .card__h")), await text(host, "[data-tour='questions'] .card__h"));
await screen.screenshot({ path: `${OUT}extras-1-tiebreak-next.png` });

await startRound(1);
await screen.waitForSelector(".intro");
check("the question intro calls it TIE-BREAK, not round 2 of 2", /TIE-BREAK/.test(await text(screen, ".intro")) && !/ROUND 2 OF 2/.test(await text(screen)), await text(screen, ".intro"));
await host.click("button:has-text('Show the board')");
await screen.waitForSelector(".board");
check("the board header says TIE-BREAK", /TIE-BREAK/.test(await text(screen, ".s-head__mid")), await text(screen, ".s-head__mid"));
await host.click("button:has-text('Start the face-off')");
check("a tie-break has its own face-off", (await screen.locator(".fo").count()) === 1);
await host.click("text=Team A won"); // the hosts' straight call
await host.click("button:has-text('Team A plays')");

// ---------- countdown timer ----------
await host.click(".timer button:has-text('10s')");
await sleep(400);
const n = Number(await text(screen, ".s-timer__n"));
check("a 10 s timer shows on the projector, counting down", n >= 8 && n <= 10, String(n));
check("the round line gives way to the timer", (await screen.locator(".s-head__round").count()) === 0);
await screen.screenshot({ path: `${OUT}extras-2-timer.png` });
await host.click(".timer button:has-text('Stop')");
await sleep(300);
check("Stop timer removes it", (await screen.locator(".s-timer").count()) === 0 && /TIE-BREAK/.test(await text(screen, ".s-head__mid")));

await host.click(".timer button:has-text('5s')");
await sleep(5900);
check("at zero the projector shows TIME", /TIME/.test(await text(screen, ".s-timer__n")), await text(screen, ".s-timer__n"));
await screen.screenshot({ path: `${OUT}extras-3-time-up.png` });
await host.keyboard.press("1");
await sleep(400);
check("anything happening in the round (a reveal) clears the timer", (await screen.locator(".s-timer").count()) === 0 && (await screen.locator(".tile--shown").count()) === 1);

await host.click(".timer button:has-text('30s')");
await sleep(300);
check("a timer can be started again after that", (await screen.locator(".s-timer").count()) === 1);
await confirm("End round early");
await sleep(300);
check("ending the round clears the timer", (await screen.locator(".s-timer").count()) === 0);
await host.click("button:has-text('Give 23 points to Team A')");
await host.click("button:has-text('Finish the game')");
await screen.waitForSelector(".final");
check("the tie-break decides the match: Team A wins", /Team A wins/.test(await text(screen, ".final__head")), await text(screen, ".final__head"));
check("a decided match offers no tie-break", (await host.locator("button:has-text('Play a tie-break round')").count()) === 0);

await browser.close();
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
console.log(failed ? `\n${failed} check(s) failed` : "\nall extras checks passed");
process.exit(failed || errors.length ? 1 : 0);
