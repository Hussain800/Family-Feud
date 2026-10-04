// Failure behaviour: relay down, browser storage failing, a rejected import, and the answer editor.
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

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
// Refuse every realtime connection, as if the relay or the Wi-Fi were gone.
await ctx.routeWebSocket(/socket\.io/, (ws) => ws.close());
await ctx.route(/\/socket\.io\//, (r) => r.abort());
const host = await ctx.newPage();
const screen = await ctx.newPage();

await host.goto(`${BASE}/host`);
await host.waitForSelector(".chip", { timeout: 15000 });
await sleep(2500);
check("host shows the relay as not ready", !/RELAY ROOM/.test(await text(host, ".chips")), await text(host, ".chips"));
await screen.goto(`${BASE}/screen/local`);
await screen.waitForSelector(".lobby", { timeout: 10000 });
check("projector opens on /screen/local without a room code", true);
check("projector says phone joining is unavailable instead of showing a dead QR", /unavailable|Connecting/i.test(await text(screen, ".lobby__right")), await text(screen, ".lobby__right"));

await host.click("role=tab[name='Questions & data']");
await host.click("button:has-text('Load demo pack')");
await host.click("button:has-text('CONFIRM')");
await host.click("role=tab[name='Play']");
await host.locator(".qrow", { hasText: "q10" }).locator("button:has-text('Start round')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Begin guessing')");
await host.locator(".answer").nth(0).locator("button").click();
await sleep(500);
check("local reveal works with no relay and reaches the projector", /Pizza/.test(await text(screen, ".tile--shown")) && (await text(screen, ".mid__pot")) === "28");
check("crowd assist is disabled with an honest reason", await host.locator("button:has-text('Open poll')").isDisabled() && /relay is offline/i.test(await text(host, ".poll-host")));
check("host banner explains the relay is offline", /RELAY OFFLINE|CONNECTING/i.test(await text(host)));
await host.keyboard.press("2");
await host.click("button:has-text('End round early')");
await host.click("button:has-text('CONFIRM')");
await host.click("button:has-text('Award')");
await sleep(300);
check("award and score work offline", Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")) > 0);
check("progress still saves locally", /SAVED/.test(await text(host, ".chips")));

// ---------- browser storage fails ----------
const bad = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
await bad.addInitScript(() => {
  Storage.prototype.setItem = () => {
    throw new Error("QuotaExceededError");
  };
});
const h2 = await bad.newPage();
await h2.goto(BASE + "/host");
await h2.waitForSelector(".chips");
await sleep(800);
check("STORAGE: a failing browser store shows NOT SAVED and an UNSAVED warning at once", /NOT SAVED/.test(await text(h2, ".chips")) && /UNSAVED/.test(await text(h2)), await text(h2, ".chips"));
await h2.click("role=tab[name='Questions & data']");
await h2.click("button:has-text('Load demo pack')");
await h2.click("button:has-text('CONFIRM')");
await h2.click("role=tab[name='Play']");
await h2.locator(".qrow", { hasText: "q10" }).locator("button:has-text('Start round')").click();
await h2.click("button:has-text('Show the board')");
await h2.click("button:has-text('Begin guessing')");
await h2.locator(".answer").nth(0).locator("button").click();
check("STORAGE: the live game keeps working in memory", (await text(h2, ".round__meta")).includes("Pot 28"));
await h2.click("role=tab[name='Session']");
const [dl] = await Promise.all([h2.waitForEvent("download", { timeout: 5000 }), h2.click("button:has-text('Export private backup')")]);
check("STORAGE: an export backup is still offered and downloads", /session-backup.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
await bad.close();

// ---------- a rejected import changes nothing; the editor builds a playable question ----------
const ctx2 = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const h3 = await ctx2.newPage();
const s3 = await ctx2.newPage();
await h3.goto(BASE + "/host");
await h3.waitForSelector(".chips");
await s3.goto(BASE + "/screen/local");
await h3.click("role=tab[name='Questions & data']");
const before = await text(h3, ".panel");
await h3.fill('[aria-label="Pack JSON"]', JSON.stringify({ schemaVersion: 1, packId: "x", title: "Rewritten", purpose: "event", questions: [{ id: "q01", category: "Student Life", prompt: "CHANGED WORDING", status: "ready", survey: { source: "s", respondents: null, responseMode: "unconfirmed", collectedAt: null, note: "" }, answers: [{ id: "a", rank: 1, text: "A", count: 0, aliases: [] }] }] }));
await h3.click("button:has-text('Validate and load')");
const rejected = await text(h3, ".alert");
check("IMPORT: invalid data is rejected with specific errors", /Import rejected/.test(rejected) && /prompt differs/.test(rejected) && /count must be a positive integer/.test(rejected), rejected.slice(0, 200));
check("IMPORT: the active pack is unchanged after a rejected import", (await text(h3, ".panel")) === before && !(await text(h3)).includes("Rewritten"));
await h3.fill('[aria-label="Pack JSON"]', "{ not json");
await h3.click("button:has-text('Validate and load')");
check("IMPORT: broken JSON is reported, not thrown", /not valid JSON/i.test(await text(h3, ".alert")));

// a pending question previews with six empty lines and no scores
await h3.click("role=tab[name='Play']");
await h3.locator(".qrow", { hasText: "q08" }).locator("button:has-text('Preview layout')").click();
await sleep(500);
check("PREVIEW: a pending question shows its exact prompt with six empty lines and no points", (await s3.locator(".tile").count()) === 6 && (await s3.locator(".tile--shown").count()) === 0 && /Name something people complain about during a Dubai summer\./.test(await text(s3, ".board__q")) && /TEMPLATE PREVIEW/.test(await text(s3, ".board")));
check("PREVIEW: it cannot start a scored round (no Start round button on a pending question)", (await h3.locator(".qrow", { hasText: "q08" }).locator("button:has-text('Start round')").count()) === 0);
await snap(s3, "19-template-preview-1920x1080");
await h3.locator(".qrow", { hasText: "q08" }).locator("button:has-text('Hide preview')").click();
await h3.click("role=tab[name='Questions & data']");

// the projector's sound controls: explicit unlock, mute, volume
await s3.click("button:has-text('ENABLE SOUND')");
await sleep(300);
check("SOUND: ENABLE SOUND (a user gesture) unlocks the audio context and reports SOUND READY", /SOUND READY/.test(await text(s3, ".screen-bar")), await text(s3, ".screen-bar"));
await s3.click("button:has-text('MUTE')");
check("SOUND: mute is available and toggles", /UNMUTE/.test(await text(s3, ".screen-bar")));

// answer editor: enter real-looking results for q05 by hand and confirm them
await h3.locator("select").first().selectOption("q05");
await h3.click("button:has-text('Add answer')"); // a pending question starts with no rows
await h3.fill('[aria-label="Answer 1"]', "Cram notes");
await h3.fill('[aria-label="Count 1"]', "40");
await h3.click("button:has-text('Add answer')");
await h3.fill('[aria-label="Answer 2"]', "Panic");
await h3.fill('[aria-label="Count 2"]', "30");
await h3.click("button:has-text('Add answer')");
await h3.fill('[aria-label="Answer 3"]', "Panic ");
await h3.fill('[aria-label="Count 3"]', "5");
await h3.click("button:has-text('Confirm these as event results')");
const editorAlert = h3.locator(".panel", { hasText: "Answer editor" }).locator(".alert").first();
check("EDITOR: a duplicate label is flagged and nothing is saved", /Not saved/.test(await editorAlert.innerText()) && /duplicates/.test(await editorAlert.innerText()), (await editorAlert.innerText()).slice(0, 160));
await h3.click('[aria-label="Remove answer 3"]');
await h3.fill('[aria-label="Aliases 1"]', "revise, cramming");
await h3.fill("input[placeholder^='e.g.']", "events team survey sheet");
await h3.click("button:has-text('Confirm these as event results')");
await h3.waitForSelector("text=Saved. This question is ready");
await h3.click("role=tab[name='Play']");
const q5 = h3.locator(".qrow", { hasText: "q05" });
check("EDITOR: the confirmed question becomes READY with two answers", /READY · 2/.test(await q5.innerText()), await q5.innerText());
await q5.locator("button:has-text('Start round')").click();
await h3.click("button:has-text('Show the board')");
await h3.click("button:has-text('Begin guessing')");
check("EDITOR: the new question plays, and the projector shows two concealed tiles", (await s3.locator(".tile").count()) === 2 && !/Cram|Panic/.test(await text(s3, ".board")));
check("EDITOR: counts keep their supplied values (not scaled to 100)", /40/.test(await text(h3, ".answers")) && /30/.test(await text(h3, ".answers")));
await h3.click("role=tab[name='Questions & data']");
await h3.click("button:has-text('Load demo pack')");
await h3.click("button:has-text('CONFIRM')");
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
await n1.waitForSelector("text=Join with a code", { timeout: 8000 }).then(() => check("NAV: an unknown path falls back to the landing page", true), () => check("NAV: an unknown path falls back to the landing page", false));
const n2 = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await n2.goto(BASE + "/screen/ZZZZ");
check("NAV: a projector with no moderator window says so", /Waiting for the moderator/.test(await text(n2)));
await nav.close();
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nfailure-mode checks passed");
process.exit(failed ? 1 : 0);
