// Failure behaviour: relay down, browser storage failing, a rejected import, the answer editor, projector sound, odd URLs.
// Needs the web app running (pnpm run dev). Run: pnpm run e2e:failures
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const snap = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });
const open = async (page) => {
  await page.goto(`${BASE}/host`);
  await page.waitForSelector(".host__head");
  if (await page.locator(".offer").count()) await page.click(".offer button:has-text('Skip')");
};
const loadDemo = async (page) => {
  await page.click("role=tab[name='Setup']");
  await page.click("button:has-text('Load demo pack')");
  await page.click("button:has-text('Confirm')");
  await page.click("role=tab[name='Live']");
};
const row = (page, n) => page.locator(".q").filter({ has: page.locator(".q__num", { hasText: new RegExp(`^Question ${n}$`) }) });
const playSkippingFaceOff = async (page, n) => {
  await row(page, n).locator("button:has-text('Start')").click();
  await page.click("button:has-text('Show the board')");
  await page.click("button:has-text('Skip the face-off')");
  await page.click("button:has-text('Team A plays first')");
};

const browser = await chromium.launch({ channel: "chrome", headless: true });

// ---------- the relay is unreachable ----------
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
await ctx.routeWebSocket(/socket\.io/, (ws) => ws.close());
await ctx.route(/\/socket\.io\//, (r) => r.abort());
const host = await ctx.newPage();
const screen = await ctx.newPage();
await open(host);
await sleep(2500);
check("RELAY DOWN: physical mode shows no relay warning, because it needs no relay", !/relay|offline|Phones/i.test(await text(host, ".host__head")) && !/offline/i.test(await text(host, ".alerts").catch(() => "")));
await screen.goto(`${BASE}/screen/local`);
await screen.click("button:has-text('Continue muted')");
await screen.waitForSelector(".lobby", { timeout: 10000 });
check("RELAY DOWN: the projector opens on /screen/local with no QR code", !/BUZZER PHONES|ROOM/.test(await text(screen, ".lobby")));
await loadDemo(host);
await playSkippingFaceOff(host, 10);
await host.locator(".answer").nth(0).locator("button:has-text('Reveal')").click();
await sleep(500);
check("RELAY DOWN: a reveal works and reaches the projector", /Pizza/.test(await text(screen, ".tile--shown")) && (await text(screen, ".mid__pot")) === "28");
await host.keyboard.press("2");
await host.click("button:has-text('End round early')");
await host.click("button:has-text('Confirm')");
await host.click("button:has-text('Give 47 points')");
await sleep(300);
check("RELAY DOWN: points and scores work", Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")) === 47);
check("RELAY DOWN: progress still saves locally", /Saved/.test(await text(host, ".host__status")));
await host.click("role=tab[name='Setup']");
await host.click("label:has-text('Phone buzzers')");
await sleep(2500);
check("RELAY DOWN: switching to phone buzzers says plainly they are offline and to tap instead", /Phone buzzers are offline/.test(await text(host, ".alerts")) || /Phones (offline|connecting)/.test(await text(host, ".host__status")), `${await text(host, ".host__status")}`);
await host.click("label:has-text('Physical buzzers')");
check("RELAY DOWN: back on physical buzzers the warning goes away", !/Phone buzzers are offline/.test(await text(host, ".alerts").catch(() => "")));
await ctx.close();

// ---------- browser storage fails ----------
const bad = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await bad.addInitScript(() => {
  Storage.prototype.setItem = () => {
    throw new Error("QuotaExceededError");
  };
});
const h2 = await bad.newPage();
await open(h2);
await sleep(800);
check("STORAGE: a failing browser store shows Not saved and a warning at once", /Not saved/.test(await text(h2, ".host__status")) && /Not saved\./.test(await text(h2, ".alerts")), await text(h2, ".host__status"));
await loadDemo(h2);
await playSkippingFaceOff(h2, 10);
await h2.locator(".answer").nth(0).locator("button:has-text('Reveal')").click();
check("STORAGE: the live game keeps working in memory", (await text(h2, ".score__pot")) === "28");
await h2.click("role=tab[name='Setup']");
const [dl] = await Promise.all([h2.waitForEvent("download", { timeout: 5000 }), h2.click("button:has-text('Export private backup')")]);
check("STORAGE: an export backup is still offered and downloads", /session-backup.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
await bad.close();

// ---------- a rejected import changes nothing; the editor builds a playable question ----------
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const h3 = await ctx2.newPage();
const s3 = await ctx2.newPage();
await open(h3);
await s3.goto(BASE + "/screen/local");
await h3.click("role=tab[name='Setup']");
const status = () => text(h3, "#results-h + .sub");
const before = await status();
await h3.click("summary:has-text('Advanced: import a pack file')");
await h3.fill('[aria-label="Pack JSON"]', JSON.stringify({ schemaVersion: 1, packId: "x", title: "Rewritten", purpose: "event", questions: [{ id: "q01", category: "Student Life", prompt: "CHANGED WORDING", status: "ready", survey: { source: "s", respondents: null, responseMode: "unconfirmed", collectedAt: null, note: "" }, answers: [{ id: "a", rank: 1, text: "A", count: 0, aliases: [] }] }] }));
await h3.click("button:has-text('Validate and load')");
const rejected = await text(h3, ".alert:has-text('Import rejected')");
check("IMPORT: invalid data is rejected with specific errors", /prompt differs/.test(rejected) && /count must be a positive integer/.test(rejected), rejected.slice(0, 200));
check("IMPORT: the answers are unchanged after a rejected import", (await status()) === before && !(await text(h3)).includes("Rewritten"));
await h3.fill('[aria-label="Pack JSON"]', "{ not json");
await h3.click("button:has-text('Validate and load')");
check("IMPORT: broken JSON is reported, not thrown", /not valid JSON/i.test(await text(h3, ".alert:has-text('Import rejected')")));

// a question with no results previews with six empty lines and cannot start
await h3.click("role=tab[name='Live']");
await row(h3, 8).locator("button:has-text('Preview')").click();
await sleep(500);
check("PREVIEW: a question without results shows its exact prompt with six empty lines and no points", (await s3.locator(".tile").count()) === 6 && (await s3.locator(".tile--shown").count()) === 0 && /Name something people complain about during a Dubai summer\./.test(await text(s3, ".board__q")) && /TEMPLATE PREVIEW/.test(await text(s3, ".board")));
check("PREVIEW: it cannot start a scored round", (await row(h3, 8).locator("button:has-text('Start')").count()) === 0);
await snap(s3, "19-template-preview-1920x1080");
await row(h3, 8).locator("button:has-text('Hide preview')").click();

// the projector's sound: a real browser gesture unlocks it, and the console hears about it
check("SOUND: the console says the projector's sound is off until someone clicks there", await (async () => { await sleep(2500); return /Projector sound off/.test(await text(h3, ".host__status")); })());
await s3.click(".sound-gate button:has-text('Enable sound')");
await sleep(300);
check("SOUND: Enable sound closes the prompt", (await s3.locator(".sound-gate").count()) === 0);
const ui = s3.locator(".proj-ui");
const panel = () => text(s3, ".proj-ui__panel");
// the settings live in one compact panel that only shows when someone is at the projector laptop
await s3.mouse.move(300, 300);
await s3.click(".proj-ui__toggle");
check("SOUND: the settings panel says sound is on and offers a test", /SOUND ON/.test(await panel()) && /Test sound/.test(await panel()), await panel());
check("SOUND: the console sees the projector is ready", await (async () => { await sleep(2500); return /Projector ready/.test(await text(h3, ".host__status")); })(), await text(h3, ".host__status"));
await s3.click(".proj-ui__panel button:has-text('Mute')");
check("SOUND: mute toggles and the console says muted", /Unmute/.test(await panel()) && (await (async () => { await sleep(2500); return /Projector muted/.test(await text(h3, ".host__status")); })()));
await s3.click(".proj-ui__panel button:has-text('Unmute')");
await s3.click(".proj-ui__panel button:has-text('Music on')");
check("SOUND: the theme music has its own on/off switch", /Music off/.test(await panel()), await panel());
await s3.click(".proj-ui__panel button:has-text('Music off')");
await s3.mouse.move(400, 400); // pointer still over the panel area is "in use"; move away
await s3.mouse.move(640, 700);
await sleep(13500);
check("SETTINGS: left alone, the panel closes and the entry fades away", (await s3.locator(".proj-ui__panel").count()) === 0 && (await ui.evaluate((e) => getComputedStyle(e).opacity)) === "0");
const hit = await s3.evaluate(() => { const b = document.querySelector(".proj-ui__toggle").getBoundingClientRect(); const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!el?.closest(".proj-ui"); });
check("SETTINGS: hidden controls do not catch clicks", !hit);
await s3.keyboard.press("Tab");
await sleep(400);
check("SETTINGS: a key press brings the entry back for keyboard users", (await ui.evaluate((e) => getComputedStyle(e).opacity)) === "1");
await s3.focus(".proj-ui__toggle");
await s3.keyboard.press("Enter");
await sleep(5500);
check("SETTINGS: with keyboard focus inside, the panel stays", (await s3.locator(".proj-ui__panel").count()) === 1 && (await ui.evaluate((e) => getComputedStyle(e).opacity)) === "1");
await s3.keyboard.press("Enter"); // close it
await sleep(2500);
await h3.click("role=tab[name='Setup']");
check("SOUND: the console's test-sound button is live once the projector can play", await h3.locator("button:has-text('Play a test sound on the projector')").isEnabled());

// answer editor: enter results for question 5 by hand and confirm them
await h3.click("summary:has-text('Type or correct one question')");
await h3.getByLabel("Question (the wording is fixed)").selectOption("q05");
await h3.click("button:has-text('Add answer')");
await h3.fill('[aria-label="Answer 1"]', "Cram notes");
await h3.fill('[aria-label="Count 1"]', "40");
await h3.click("button:has-text('Add answer')");
await h3.fill('[aria-label="Answer 2"]', "Panic");
await h3.fill('[aria-label="Count 2"]', "30");
await h3.click("button:has-text('Add answer')");
await h3.fill('[aria-label="Answer 3"]', "Panic ");
await h3.fill('[aria-label="Count 3"]', "5");
await h3.click("button:has-text('Confirm these as event results')");
const editorAlert = await text(h3, ".alert:has-text('Not saved')");
check("EDITOR: a duplicate label is flagged and nothing is saved", /duplicates/.test(editorAlert), editorAlert.slice(0, 160));
await h3.click('[aria-label="Remove answer 3"]');
await h3.fill('[aria-label="Aliases 1"]', "revise, cramming");
await h3.fill("input[placeholder^='e.g.']", "events team survey sheet");
await h3.click("button:has-text('Confirm these as event results')");
await h3.waitForSelector("text=Saved. This question is ready");
await h3.click("role=tab[name='Live']");
check("EDITOR: the confirmed question can start", (await row(h3, 5).locator("button:has-text('Start')").count()) === 1);
await playSkippingFaceOff(h3, 5);
check("EDITOR: the new question plays, and the projector shows two hidden tiles", (await s3.locator(".tile").count()) === 2 && !/Cram|Panic/.test(await text(s3, ".board")));
check("EDITOR: points keep their supplied values (not scaled to 100)", /40/.test(await text(h3, ".answers")) && /30/.test(await text(h3, ".answers")));
await h3.click("role=tab[name='Setup']");
await h3.click("button:has-text('Load demo pack')");
await h3.click("button:has-text('Confirm')");
await h3.click("summary:has-text('Type or correct one question')"); // the Setup tab was re-opened, so the section is closed again
check("EDITOR: the demo pack is read-only so it cannot be relabelled as real", /read-only/.test(await text(h3)) && (await h3.locator("fieldset.editor[disabled]").count()) === 1);
await ctx2.close();

// ---------- direct navigation lands somewhere honest ----------
const nav = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
const n1 = await nav.newPage();
await n1.goto(BASE + "/play/ZZZZ");
await sleep(5000);
const dead = await text(n1);
check("NAV: a phone opening a room code that does not exist gets a clear message, not a blank page", /Room not found/.test(dead) && /enter a code/i.test(dead), dead.slice(0, 160));
await n1.goto(BASE + "/controller");
await n1.waitForSelector("text=No room code", { timeout: 8000 }).then(() => check("NAV: /controller with no code offers a way to enter one", true), () => check("NAV: /controller with no code offers a way to enter one", false));
await n1.goto(BASE + "/join?room=bad");
check("NAV: a malformed code on /join stays on the entry form", (await n1.locator("#room").count()) === 1);
await n1.fill("#room", "ab1");
await n1.click("button:has-text('Join')");
check("NAV: a short code is refused with guidance", /4 letters or numbers/.test(await text(n1)));
await n1.goto(BASE + "/nonsense/path");
await n1.waitForSelector("text=Moderator console", { timeout: 8000 }).then(() => check("NAV: an unknown path falls back to the landing page", true), () => check("NAV: an unknown path falls back to the landing page", false));
const n2 = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await n2.goto(BASE + "/screen/ZZZZ");
check("NAV: a projector with no moderator window says so", /Waiting for the moderator/.test(await text(n2)));
await nav.close();
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nfailure-mode checks passed");
process.exit(failed ? 1 : 0);
