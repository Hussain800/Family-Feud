// Face-off with standalone buzzers: the judges call who was first, the host taps that team.
// Moderator + projector in one context, real clicks and key presses, real projector page.
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
const foText = async () => ((await screen.locator(".fo__text").count()) ? text(screen, ".fo__text") : "");
const tags = async () => [(await text(screen, ".s-foot .team:nth-child(1) .team__tag")).trim(), (await text(screen, ".s-foot .team:nth-child(3) .team__tag")).trim()];
const scores = async () => [Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")), Number(await text(screen, ".s-foot .team:nth-child(3) .team__score"))];
const tap = (team) => host.click(`button:has-text('Team ${team} buzzed first')`);

// ---------- round 1 (q10: Pizza 28, Shawarma 19, Burgers 14, Noodles 8, Dessert 5) ----------
await startRound("q10");
await screen.waitForSelector(".intro");
check("the question screen does not name a starting team", !/STARTS/.test(await text(screen, ".intro")) && /FACE-OFF NEXT/.test(await text(screen, ".intro")));
await host.click("button:has-text('Show the board')");
await screen.waitForSelector(".board");
check("the board offers the face-off, a skip, and no keyboard-buzzer controls", (await host.locator("button:has-text('Start face-off')").count()) === 1 && (await host.locator("button:has-text('Skip face-off')").count()) === 1 && (await host.locator("text=/Open buzzers|Learn/").count()) === 0);
await host.click("button:has-text('Start face-off')");
await screen.waitForSelector(".fo");
check("projector explains the face-off", /ONE PLAYER FROM EACH TEAM/.test(await foText()));
check("the console has one big tap per team", (await host.locator("button:has-text('buzzed first')").count()) === 2);
await snap(screen, "faceoff-1-start");

await host.keyboard.press("q");
await host.keyboard.press("p");
await sleep(250);
check("stray keys do nothing (there are no keyboard buzzers)", /ONE PLAYER FROM EACH TEAM/.test(await foText()) && (await screen.locator(".tile--shown").count()) === 0);

await tap("B");
await sleep(250);
check("tapping Team B shows who buzzed first", /TEAM B BUZZED FIRST/.test(await foText()), await foText());
check("projector team lamps show who is up", (await tags())[1] === "BUZZED FIRST" && (await tags())[0] === "", JSON.stringify(await tags()));
await snap(screen, "faceoff-2-buzzed");

await tap("A"); // wrong tap corrected before anyone answered
await sleep(200);
check("a wrong tap can be corrected before anyone answers", /TEAM A BUZZED FIRST/.test(await foText()), await foText());
await tap("B");
await sleep(200);

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
await tap("A");
await sleep(200);
await host.keyboard.press("x");
await sleep(200);
check("a miss gives the other team a go and costs no strike", /TEAM B: YOUR ANSWER/.test(await foText()) && (await screen.locator(".strike--on").count()) === 0, await foText());
check("the team up next is lit on the projector", (await tags())[1] === "ANSWERS NEXT" && (await tags())[0] === "MISSED", JSON.stringify(await tags()));
await host.keyboard.press("x");
await sleep(250);
check("both missing says so", /BOTH MISSED/.test(await foText()) && /BOTH MISSED/.test(await text(screen, ".mid__note")), `${await foText()} / ${await text(screen, ".mid__note")}`);
await tap("B"); // the next two players: the next tap starts the next attempt
await sleep(200);
check("the next tap starts the next attempt", /TEAM B BUZZED FIRST/.test(await foText()), await foText());
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

// ---------- round 3: skipping the face-off, with the starting team switched ----------
await startRound("q03");
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Skipping?')");
await sleep(200);
await host.click("button:has-text('Skip face-off, begin guessing')");
await sleep(250);
check("skip: the switched team is on the board and play starts", (await tags())[1] === "ON THE BOARD" && (await screen.locator(".fo").count()) === 0, JSON.stringify(await tags()));
await snap(host, "faceoff-4-host-console");

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length || pageErrors.length ? 1 : 0);
