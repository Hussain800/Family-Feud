// The quick guide: offered once, skippable, remembered, replayable, never interrupting a match, never touching the game.
// Needs the web app running (pnpm run dev) and Chrome installed.   Run: pnpm run e2e:guide
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();
const VIEW = { width: 1366, height: 768 };

const browser = await chromium.launch({ channel: "chrome", headless: true });
const pageErrors = [];
const fresh = async () => {
  const ctx = await browser.newContext({ viewport: VIEW });
  const host = await ctx.newPage();
  host.on("pageerror", (e) => pageErrors.push(e.message));
  await host.goto(`${BASE}/host`);
  await host.waitForSelector(".host__head");
  await sleep(800);
  return { ctx, host };
};
const offer = (host) => host.locator(".offer");
const pop = (host) => host.locator(".guide__pop");
const inView = async (host) => {
  const b = await pop(host).boundingBox();
  return b && b.x >= 0 && b.y >= 0 && b.x + b.width <= VIEW.width && b.y + b.height <= VIEW.height;
};

// ---------- first visit, Skip, remembered ----------
{
  const { ctx, host } = await fresh();
  check("first visit offers the guide", (await offer(host).count()) === 1 && /Learn the controls in about a minute/.test(await text(host, ".offer")));
  await host.screenshot({ path: `${OUT}guide-0-offer-1366x768.png` });
  await host.click(".offer button:has-text('Skip')");
  check("Skip closes the offer", (await offer(host).count()) === 0);
  await host.reload();
  await sleep(800);
  check("a skipped guide is not offered again after a refresh", (await offer(host).count()) === 0);
  check("the Quick guide button stays available", (await host.locator("[data-tour='guide']").count()) === 1);
  await ctx.close();
}

// ---------- complete the guide on an empty console ----------
{
  const { ctx, host } = await fresh();
  await host.click(".offer button:has-text('Start guide')");
  await pop(host).waitFor();
  check("step 1 of 5 spotlights Open projector", /Step 1 of 5/.test(await text(host, ".guide__pop")) && /audience screen/.test(await text(host, ".guide__h")));
  const spot = await host.locator(".guide__spot").boundingBox();
  const btn = await host.locator("[data-tour='projector']").boundingBox();
  check("the spotlight surrounds the real control", !!spot && !!btn && spot.x <= btn.x && spot.y <= btn.y && spot.x + spot.width >= btn.x + btn.width && spot.y + spot.height >= btn.y + btn.height);
  check("the Next button has focus", await host.evaluate(() => document.activeElement?.textContent === "Next"));
  await host.screenshot({ path: `${OUT}guide-1-step1-1366x768.png` });
  const positions = [await inView(host)];
  await host.click(".guide__pop button:has-text('Next')");
  check("step 2 points at the question list", /Step 2 of 5/.test(await text(host, ".guide__pop")) && (await host.locator(".guide__spot").count()) === 1 && /Physical buzzers need no phones/.test(await text(host, ".guide__pop")));
  positions.push(await inView(host));
  await host.keyboard.press("Tab");
  await host.keyboard.press("Tab");
  await host.keyboard.press("Tab");
  check("Tab stays inside the popover", await host.evaluate(() => !!document.activeElement?.closest(".guide__pop")));
  await host.click(".guide__pop button:has-text('Next')");
  check("step 3 with no face-off on screen shows a read-only example instead", /Step 3 of 5/.test(await text(host, ".guide__pop")) && /example/i.test(await text(host, ".guide__example")) && (await host.locator(".guide__spot").count()) === 0 && (await host.locator(".guide__example button").count()) === 0);
  positions.push(await inView(host));
  await host.click(".guide__pop button:has-text('Back')");
  check("Back returns to step 2", /Step 2 of 5/.test(await text(host, ".guide__pop")));
  await host.click(".guide__pop button:has-text('Next')");
  await host.click(".guide__pop button:has-text('Next')");
  check("step 4 explains Reveal, Wrong answer and Undo", /Step 4 of 5/.test(await text(host, ".guide__pop")) && /Reveal/.test(await text(host, ".guide__pop")) && /Undo/.test(await text(host, ".guide__pop")));
  positions.push(await inView(host));
  await host.click(".guide__pop button:has-text('Next')");
  check("step 5 ends with Done and points at Adjust score", /Step 5 of 5/.test(await text(host, ".guide__pop")) && (await host.locator(".guide__pop button:has-text('Done')").count()) === 1 && (await host.locator(".guide__spot").count()) === 1);
  positions.push(await inView(host));
  check("every popover stays inside a 1366x768 window", positions.every(Boolean), JSON.stringify(positions));
  await host.click(".guide__pop button:has-text('Done')");
  check("Done closes the guide", (await host.locator(".guide").count()) === 0);
  await host.reload();
  await sleep(800);
  check("a finished guide is not offered again", (await offer(host).count()) === 0);
  await host.click("[data-tour='guide']");
  await pop(host).waitFor();
  check("Quick guide replays from step 1", /Step 1 of 5/.test(await text(host, ".guide__pop")));
  await host.keyboard.press("Escape");
  check("Escape exits immediately", (await host.locator(".guide").count()) === 0);
  check("focus returns to the Quick guide button", await host.evaluate(() => document.activeElement?.getAttribute("data-tour") === "guide"));
  await ctx.close();
}

// ---------- during a live round: real targets, and nothing reaches the game or the projector ----------
{
  const { ctx, host } = await fresh();
  const screen = await ctx.newPage();
  await screen.goto(`${BASE}/screen/local`);
  await screen.click("button:has-text('Continue muted')");
  await host.click(".offer button:has-text('Skip')");
  await host.click("role=tab[name='Setup']");
  await host.click('button:has-text("Load demo pack")');
  await host.click("button:has-text('Confirm')");
  await host.click("role=tab[name='Live']");
  await host.locator(".q button:has-text('Start')").first().click();
  await host.click("button:has-text('Show the board')");
  await host.click("button:has-text('Start the face-off')");
  await host.click("button:has-text('Team A buzzed first')");
  await sleep(400);
  await sleep(2500); // let the relay status settle so only game changes could move the revision
  await screen.evaluate(() => {
    window.__revs = [];
    const ch = new BroadcastChannel("gdg-ff-public");
    ch.onmessage = (e) => { if (e.data.kind === "snapshot") window.__revs.push(e.data.snapshot.rev); };
  });
  await sleep(2500);
  const revBefore = await screen.evaluate(() => Math.max(...window.__revs));
  const before = { pot: await text(screen, ".mid__pot"), shown: await screen.locator(".tile--shown").count(), cues: await screen.locator(".screen-page").getAttribute("data-cues"), saved: await host.evaluate(() => localStorage.getItem("ff.session.v1")) };
  await host.click("[data-tour='guide']");
  await pop(host).waitFor();
  for (const k of ["x", "1", "u", "2"]) await host.keyboard.press(k);
  await host.mouse.click(60, 740); // where Wrong answer sits, under the overlay
  await host.click(".guide__pop button:has-text('Next')");
  await host.click(".guide__pop button:has-text('Next')");
  check("mid-round, step 3 spotlights the real face-off controls", /Step 3 of 5/.test(await text(host, ".guide__pop")) && (await host.locator(".guide__spot").count()) === 1 && (await host.locator(".guide__example").count()) === 0);
  await host.screenshot({ path: `${OUT}guide-3-faceoff-live-1366x768.png` });
  await host.click(".guide__pop button:has-text('Next')");
  check("step 4 spotlights the real answer list", (await host.locator(".guide__spot").count()) === 1);
  await host.click(".guide__pop button:has-text('Exit')");
  await sleep(600);
  const after = { pot: await text(screen, ".mid__pot"), shown: await screen.locator(".tile--shown").count(), cues: await screen.locator(".screen-page").getAttribute("data-cues"), saved: await host.evaluate(() => localStorage.getItem("ff.session.v1")) };
  check("keys and clicks during the guide changed nothing in the game", JSON.stringify(before) === JSON.stringify(after), `${JSON.stringify(before).slice(0, 120)} vs ${JSON.stringify(after).slice(0, 120)}`);
  const revs = await screen.evaluate(() => [...new Set(window.__revs)]);
  check("the projector's board revision never moved while the guide was open", revs.length === 1 && revs[0] === revBefore, JSON.stringify(revs));
  check("the guide never appears on the projector", (await screen.locator(".guide, .guide__pop, .offer").count()) === 0);
  await host.keyboard.press("1");
  await sleep(300);
  check("after the guide, the controls work again", (await screen.locator(".tile--shown").count()) === before.shown + 1);

  // a resumed match is never interrupted, even on a laptop that never saw the guide
  await host.evaluate(() => localStorage.removeItem("ff.guide.v1"));
  await host.reload();
  await host.waitForSelector(".modal");
  check("with a saved match, the console offers Resume and not the guide", (await offer(host).count()) === 0);
  await host.click("button:has-text('Resume the game')");
  await sleep(500);
  check("after resuming, the guide still does not interrupt", (await offer(host).count()) === 0 && (await host.locator(".guide").count()) === 0);
  await ctx.close();
}

// ---------- an empty autosave is not a match ----------
{
  const { ctx, host } = await fresh();
  await host.locator(".names input").first().fill("Foxes");
  await host.locator(".names input").first().press("Enter");
  await host.evaluate(() => localStorage.removeItem("ff.guide.v1"));
  await host.reload();
  await sleep(800);
  check("a saved setup with no match under way still gets the offer", (await host.locator(".modal").count()) === 0 && (await offer(host).count()) === 1);
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length || pageErrors.length ? 1 : 0);
