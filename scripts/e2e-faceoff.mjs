// Face-off with keyboard buzzers: moderator + projector in one context, real key presses, real projector page.
// Needs the dev stack running (pnpm run dev) and Chrome installed.   Run: pnpm run e2e:faceoff
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const host = await ctx.newPage();
const screen = await ctx.newPage();
const pageErrors = [];
for (const [n, p] of [["host", host], ["screen", screen]]) p.on("pageerror", (e) => pageErrors.push(`${n}: ${e.message}`));
const snap = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });

await host.goto(`${BASE}/host`);
await host.waitForSelector(".chip--ready", { timeout: 20000 });
const room = (await text(host, ".chip--ready")).match(/ROOM ([A-Z0-9]{4})/)?.[1];
await host.evaluate(() => localStorage.removeItem("ff.buzzers.v1"));
await screen.goto(`${BASE}/screen/${room}`);
await screen.waitForSelector(".lobby", { timeout: 10000 });

await host.click("role=tab[name='Questions & data']");
await host.click('button:has-text("Load demo pack")');
await host.click("button:has-text('CONFIRM')");
await host.click("role=tab[name='Play']");

const startRound = async (qid) => {
  await host.locator(".qrow", { hasText: qid }).locator("button:has-text('Start round')").click();
  if (await host.locator("button:has-text('CONFIRM')").count()) await host.click("button:has-text('CONFIRM')");
};
const foText = async () => (await screen.locator(".fo__text").count()) ? text(screen, ".fo__text") : "";
const tags = async () => [await text(screen, ".s-foot .team:nth-child(1) .team__tag"), await text(screen, ".s-foot .team:nth-child(3) .team__tag")];
const scores = async () => [Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")), Number(await text(screen, ".s-foot .team:nth-child(3) .team__score"))];

// ---------- round 1 (q10: Pizza 28, Shawarma 19, Burgers 14, Noodles 8, Dessert 5) ----------
await startRound("q10");
await screen.waitForSelector(".intro");
await host.click("button:has-text('Show the board')");
await screen.waitForSelector(".board");
check("board_ready offers the face-off and a skip", (await host.locator("button:has-text('Start face-off')").count()) === 1 && (await host.locator("button:has-text('Skip face-off')").count()) === 1);
await host.click("button:has-text('Start face-off')");
await screen.waitForSelector(".fo");
check("projector explains the face-off before the buzzers open", /ONE PLAYER FROM EACH TEAM/.test(await foText()));

await host.keyboard.press("q");
await sleep(250);
check("a buzzer pressed before the host opens them does nothing", /ONE PLAYER FROM EACH TEAM/.test(await foText()));
check("keys are not shortcuts either: nothing revealed", (await screen.locator(".tile--shown").count()) === 0);

await host.click("button:has-text('Open buzzers')");
await sleep(250);
check("opening shows BUZZERS LIVE and lights both team lamps", /BUZZERS LIVE/.test(await foText()) && (await tags()).every((t) => t === "BUZZER LIVE"), JSON.stringify(await tags()));
await snap(screen, "faceoff-1-buzzers-live");

await host.keyboard.press("p");
await host.keyboard.press("q"); // second buzzer, even a millisecond later
await sleep(250);
check("first buzz wins; the other is ignored", /TEAM B BUZZED FIRST/.test(await foText()), await foText());
check("projector team lamps show who is up", (await tags())[1] === "BUZZED FIRST" && (await tags())[0].trim() === "", JSON.stringify(await tags()));
await snap(screen, "faceoff-2-buzzed");

await host.keyboard.press("1"); // Pizza, the top answer
await sleep(300);
check("top answer wins on the spot and asks play or pass", /TEAM B WINS THE FACE-OFF: PLAY OR PASS/.test(await foText()), await foText());
check("face-off reveal is on the board and in the pot (28)", (await screen.locator(".tile--shown").count()) === 1 && (await text(screen, ".mid__pot")) === "28");
await snap(screen, "faceoff-3-play-or-pass");

await host.click("button:has-text('PASSES to')");
await sleep(300);
check("pass: control goes to Team A and the room is told", /TEAM B PASSES/.test(await text(screen, ".mid__note")) && (await tags())[0] === "ON THE BOARD", `${await text(screen, ".mid__note")} ${JSON.stringify(await tags())}`);
check("the face-off bar is gone once play starts", (await screen.locator(".fo").count()) === 0);

await host.keyboard.press("2"); // Shawarma 19
await sleep(300);
check("Team A reveals one more answer: pot 47", (await text(screen, ".mid__pot")) === "47");
await host.click("button:has-text('End round early')");
await host.click("button:has-text('CONFIRM')");
await host.click("button:has-text('Award 47 to Team A')");
await sleep(300);
const afterR1 = await scores();
check("the team that passed gets nothing; the controlling team takes the whole pot", afterR1[0] === 47 && afterR1[1] === 0, JSON.stringify(afterR1));
await host.click("button:has-text('Next round')");

// ---------- round 2 (q01: Scrolling 23, Sleeping 16, Watching videos 11, ...) ----------
await startRound("q01");
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Start face-off')");
await host.keyboard.press("b");
await sleep(200);
check("B opens the buzzers", /BUZZERS LIVE/.test(await foText()));
await host.keyboard.press("q");
await sleep(200);
await host.keyboard.press("x");
await sleep(200);
check("a miss gives the other team a go and costs no strike", /TEAM B: YOUR ANSWER/.test(await foText()) && (await screen.locator(".strike--on").count()) === 0, await foText());
await host.keyboard.press("x");
await sleep(250);
check("both missing says so", /BOTH MISSED/.test(await foText()) && /BOTH MISSED/.test(await text(screen, ".mid__note")), `${await foText()} / ${await text(screen, ".mid__note")}`);
await host.keyboard.press("b");
await sleep(200);
await host.keyboard.press("p");
await sleep(200);
await host.keyboard.press("2"); // Sleeping 16, not the top answer
await sleep(250);
check("a lower answer hands the other team a go", /TEAM A: YOUR ANSWER/.test(await foText()), await foText());
await host.keyboard.press("1"); // Scrolling 23 beats 16
await sleep(300);
check("the higher survey count wins the face-off", /TEAM A WINS THE FACE-OFF/.test(await foText()) && (await text(screen, ".mid__pot")) === "39", `${await foText()} pot ${await text(screen, ".mid__pot")}`);
await host.click("button:has-text('Team A PLAYS')");
await sleep(250);
check("play keeps control with the winner", /TEAM A PLAYS/.test(await text(screen, ".mid__note")) && (await tags())[0] === "ON THE BOARD");
await host.click("button:has-text('End round early')");
await host.click("button:has-text('CONFIRM')");
await host.click("button:has-text('Award 39 to Team A')");
await host.click("button:has-text('Next round')");

// ---------- buzzer setup, Space-bar buzzer, manual fallback (q03) ----------
await host.click("role=tab[name='Session']");
await host.click(".buzz:nth-child(1) button:has-text('Learn')");
await host.keyboard.press("p"); // already Team B's
check("a key that is already the other team's buzzer is refused", /already/i.test(await text(host, "p.warn[role=alert]")));
await host.keyboard.press("Space");
await sleep(200);
check("learning a key stores it", /SPACE/.test(await text(host, ".buzz:nth-child(1) .buzz__key")) && (await host.evaluate(() => localStorage.getItem("ff.buzzers.v1"))).includes("Space"));
await host.keyboard.press("Space");
await sleep(200);
check("pressing a learned buzzer lights its lamp (test mode)", /BUZZ DETECTED/.test(await text(host, ".buzz:nth-child(1) .buzz__lamp")));
await host.click("role=tab[name='Play']");

await startRound("q03");
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Start face-off')");
await host.click("button:has-text('Open buzzers')");
await host.keyboard.press("q"); // Q is no longer a buzzer for anyone
await sleep(200);
check("an unmapped key no longer buzzes", /BUZZERS LIVE/.test(await foText()));
await host.locator("button:has-text('Undo last')").focus();
await host.keyboard.press("Space");
await sleep(300);
check("a Space-bar buzzer buzzes and does not click the focused button", /TEAM A BUZZED FIRST/.test(await foText()), await foText());
await host.click("button:has-text('Open buzzers')"); // accidental buzz: the host re-opens
await sleep(200);
check("re-opening after an accidental buzz clears it", /BUZZERS LIVE/.test(await foText()));
await host.click("button:has-text('Team B buzzed first')");
await sleep(250);
check("manual fallback: the host can record who was first", /TEAM B BUZZED FIRST/.test(await foText()));

await snap(host, "faceoff-4-host-console");

// reload: mapping survives
await host.reload();
await host.waitForSelector(".chip--ready", { timeout: 20000 });
check("buzzer keys survive a reload", (await host.evaluate(() => localStorage.getItem("ff.buzzers.v1"))).includes("Space"));
await host.evaluate(() => localStorage.removeItem("ff.buzzers.v1"));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length || pageErrors.length ? 1 : 0);
