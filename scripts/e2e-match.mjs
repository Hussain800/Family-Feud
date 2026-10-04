// End-to-end match: moderator + projector in one browser context, each phone in its own isolated context.
// Needs the dev stack running (pnpm run dev) and Chrome installed.   Run: pnpm run e2e
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { io } from "socket.io-client";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
const RELAY = process.env.AIRJAM_URL ?? "http://localhost:4000";
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
const mk = (opts) => browser.newContext(opts);

// ---------- contexts ----------
const hostCtx = await mk({ viewport: { width: 1920, height: 1080 } });
const host = await hostCtx.newPage();
const screen = await hostCtx.newPage();
const phoneOpts = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const p1Ctx = await mk(phoneOpts);
const p2Ctx = await mk(phoneOpts);
const p1 = await p1Ctx.newPage();
const p2 = await p2Ctx.newPage();
const pageErrors = [];
for (const [n, p] of [["host", host], ["screen", screen], ["phone1", p1], ["phone2", p2]]) {
  p.on("pageerror", (e) => pageErrors.push(`${n}: ${e.message}`));
}

const snap = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });

// ---------- boot ----------
await host.goto(`${BASE}/host`);
await host.waitForSelector(".chip--ready", { timeout: 20000 });
const room = (await text(host, ".chip--ready")).match(/ROOM ([A-Z0-9]{4})/)?.[1];
check("host creates a 4-character room", !!room, room);
await screen.goto(`${BASE}/screen/${room}`);
await screen.waitForSelector(".lobby", { timeout: 10000 });
check("projector shows lobby with room code", (await text(screen)).includes(room));
await sleep(1200);
await snap(screen, "01-lobby-1920x1080");

// phone 1 via QR-style alias, phone 2 via manual /join entry
await p1.goto(`${BASE}/play/${room}`);
await p1.waitForSelector("text=You’re in", { timeout: 15000 });
await p2.goto(`${BASE}/join`);
await p2.fill("#room", room);
await p2.click("text=Join");
await p2.waitForSelector("text=You’re in", { timeout: 15000 });
check("phone 1 joins through /play/:code and phone 2 through /join", true);
await sleep(500);
check("host counts 2 connected phones", /PHONES 2\/16/.test(await text(host)));
check("projector shows 2 phones connected", /2 phones connected/i.test(await text(screen)));
await snap(p1, "02-phone-waiting-390x844");

// ---------- demo pack ----------
await host.click("role=tab[name='Questions & data']");
const confirm = async (page, label) => {
  await page.click(`button:has-text("${label}")`);
  await page.click("button:has-text('CONFIRM')");
};
await confirm(host, "Load demo pack");
await sleep(300);
check("host shows DEMO label", (await text(host)).includes("DEMO: INVENTED RESULTS"));
check("projector shows DEMO label", (await text(screen)).includes("DEMO: INVENTED RESULTS"));
check("phone shows DEMO label", await p1.waitForSelector("text=DEMO: INVENTED RESULTS", { timeout: 4000 }).then(() => true, () => false));
await host.click("role=tab[name='Play']");

// ---------- round 1: q10, five answers ----------
const startRound = async (qid) => {
  const row = host.locator(".qrow", { hasText: qid });
  const btn = row.locator("button:has-text('Start round')");
  await btn.click();
  if (await host.locator("button:has-text('CONFIRM')").count()) await host.click("button:has-text('CONFIRM')");
};
await startRound("q10");
await screen.waitForSelector(".intro");
check("question intro shows the exact prompt and no answers", (await text(screen, ".intro")).includes("Name something you would order at 2 a.m.") && !/Pizza|Shawarma/.test(await text(screen)));
await snap(screen, "03-intro-1920x1080");
await host.click("button:has-text('Show the board')");
await screen.waitForSelector(".board");
check("concealed board shows five hidden slots and no points", (await screen.locator(".tile").count()) === 5 && (await screen.locator(".tile--shown").count()) === 0 && !/Pizza|Shawarma|Burgers|Noodles|Dessert|28|19/.test(await text(screen, ".board")));
await snap(screen, "04-board-concealed-5-1920x1080");
await host.click("button:has-text('Begin guessing')");

const reveal = (n) => host.locator(".answer").nth(n - 1).locator("button").click();
await reveal(1);
await sleep(400);
check("reveal shows text and count on projector, pot 28", /Pizza/.test(await text(screen, ".tile--shown")) && (await text(screen, ".mid__pot")) === "28");
await host.keyboard.press("1");
await sleep(300);
check("repeat reveal adds nothing (ALREADY ON THE BOARD)", (await text(screen, ".mid__pot")) === "28" && /ALREADY ON THE BOARD/.test(await text(screen, ".mid__note")));
await snap(screen, "05-board-first-reveal-1920x1080");

// double click on strike is one strike; deliberate later clicks add more
const strike = host.locator("button:has-text('Add strike')");
await strike.dblclick();
await sleep(200);
check("double click adds exactly one strike", (await screen.locator(".strike--on").count()) === 1);
await sleep(800);
await strike.click();
await sleep(800);
await host.keyboard.down("x"); await host.keyboard.down("x"); await host.keyboard.up("x"); // held key repeats are ignored
await sleep(300);
check("three deliberate strikes enter steal", (await text(screen, ".team--active .team__tag")) === "STEALING" || /STEAL/.test(await text(screen, ".mid__note")), await text(screen, ".mid__note"));
await snap(screen, "06-steal-1920x1080");

await reveal(3); // steal success: Burgers 14
await sleep(300);
check("steal success reveals one answer; pot 42", (await text(screen, ".mid__pot")) === "42");
const scores = async () => [Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")), Number(await text(screen, ".s-foot .team:nth-child(3) .team__score"))];
await host.click("button:has-text('Award 42 to Team B')");
await sleep(300);
const afterAward = await scores();
check("award gives Team B 42 and Team A 0", afterAward[0] === 0 && afterAward[1] === 42, JSON.stringify(afterAward));
await snap(screen, "07-awarded-1920x1080");

const { stage2 } = await import("./e2e-stage2.mjs");
await stage2({ BASE, RELAY, io, host, screen, p1, p2, p1Ctx, p2Ctx, snap, sleep, text, check, reveal, startRound, scores, room, browser, mk, phoneOpts });

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length ? 1 : 0);
