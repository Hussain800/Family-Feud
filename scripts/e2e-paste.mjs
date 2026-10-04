// Pasting survey rows from a spreadsheet: check, errors, load, merge, and the loaded question is playable.
// Needs the dev stack running (pnpm run dev) and Chrome installed.   Run: pnpm run e2e:paste
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
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
host.on("pageerror", (e) => errors.push(e.message));

await host.goto(`${BASE}/host`);
await host.waitForSelector(".chip--ready", { timeout: 20000 });
const room = (await text(host, ".chip--ready")).match(/ROOM ([A-Z0-9]{4})/)?.[1];
await screen.goto(`${BASE}/screen/${room}`);
await screen.waitForSelector(".lobby");
await host.click("button:has-text('Reset to empty event template')").catch(() => {});
if (await host.locator("button:has-text('CONFIRM')").count()) await host.click("button:has-text('CONFIRM')");
await host.click("role=tab[name='Questions & data']");
await host.click("button:has-text('Reset to empty event template')");
await host.click("button:has-text('CONFIRM')");

const paste = async (rows) => {
  await host.fill("textarea[aria-label='Spreadsheet rows']", rows);
  await host.click("button:has-text('Check these rows')");
};

await paste("1\tSleeping\t23%\n17\tNope\t3");
check("bad rows are reported by line and the load button stays off", /Line 1.*whole number/.test(await text(host, ".alert")) && (await host.locator("button:has-text('Load these results')").isDisabled()));

await paste("Question number\tAnswer\tNumber of students\n1\tScrolling social media\t23\ttiktok; reels\n1\tSleeping\t16\n1\tWatching videos\t11\n1\tGaming\t7");
check("good rows preview with the fixed question wording", /Name something students do instead of studying/.test(await text(host, ".alert--notice")) && /Sleeping 16/.test(await text(host, ".alert--notice")));
await host.screenshot({ path: `${OUT}paste-1-preview.png`, fullPage: true });
await host.click("button:has-text('Load these results')");
await sleep(300);
check("loading says how many questions and the pack shows 1 of 16 ready", /Loaded 1 question/.test(await text(host)) && /1 of 16 questions ready/.test(await text(host)), await text(host, ".panel"));
check("the pack is an event pack, not demo", !/DEMO: INVENTED/.test(await text(host)));

await paste("3\tTraffic\t26\n3\tOversleeping\t17");
await host.click("button:has-text('Load these results')");
await sleep(300);
check("pasting another question adds to the first instead of replacing it", /2 of 16 questions ready/.test(await text(host)));

await host.click("role=tab[name='Play']");
check("the question list shows each pasted question ready with its answer count", /READY · 4/.test(await text(host, ".qrow:has-text('q01')")) && /READY · 2/.test(await text(host, ".qrow:has-text('q03')")));
await host.locator(".qrow", { hasText: "q01" }).locator("button:has-text('Start round')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Skip face-off')");
await host.keyboard.press("2");
await sleep(400);
check("the pasted answers play: reveal shows the text and the count on the projector", /Sleeping/.test(await text(screen, ".tile--shown")) && (await text(screen, ".mid__pot")) === "16");
check("the projector never shows the demo label for pasted results", !/DEMO:/.test(await text(screen)));

await browser.close();
if (errors.length) console.log("page errors:\n" + errors.join("\n"));
console.log(failed ? `\n${failed} check(s) failed` : "\nall paste checks passed");
process.exit(failed || errors.length ? 1 : 0);
