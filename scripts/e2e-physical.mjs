// A complete physical-buzzer game with the relay unreachable: no phones, no QR code, every realtime connection refused.
// Moderator + projector in one browser context, real clicks and key presses, real projector page.
// Needs the web app running (pnpm run dev) and Chrome installed.   Run: pnpm run e2e
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
// The relay is gone: refuse every realtime connection, as if the server or the Wi-Fi were down.
let refused = 0;
await ctx.routeWebSocket(/socket\.io/, (ws) => { refused++; ws.close(); });
await ctx.route(/\/socket\.io\//, (r) => { refused++; return r.abort(); });
const host = await ctx.newPage();
const screen = await ctx.newPage();
const pageErrors = [];
for (const [n, p] of [["host", host], ["screen", screen]]) p.on("pageerror", (e) => pageErrors.push(`${n}: ${e.message}`));
const snap = (page, name) => page.screenshot({ path: `${OUT}${name}.png` });

// Everything the projector is ever sent, and every red X / banner it draws.
const spy = async () => {
  await screen.evaluate(() => {
    window.__msgs = [];
    window.__flashes = [];
    const ch = new BroadcastChannel("gdg-ff-public");
    ch.onmessage = (e) => window.__msgs.push(JSON.stringify(e.data));
    new MutationObserver((list) => {
      for (const m of list) for (const n of m.addedNodes) if (n.classList?.contains("flash")) window.__flashes.push(n.className + "|" + n.textContent);
    }).observe(document.body, { childList: true, subtree: true });
  });
};
const cues = async () => Number(await screen.locator(".screen-page").getAttribute("data-cues"));
const lastCue = () => screen.locator(".screen-page").getAttribute("data-last-cue");
const flashes = () => screen.evaluate(() => window.__flashes.slice());
const pot = () => text(screen, ".mid__pot");
const scores = async () => [Number(await text(screen, ".s-foot .team:nth-child(1) .team__score")), Number(await text(screen, ".s-foot .team:nth-child(3) .team__score"))];
const wrong = async () => {
  await host.click("button:has-text('Wrong answer')");
  await sleep(800); // past the double-click guard, like a real second miss
};

// ---------- setup ----------
await host.goto(`${BASE}/host`);
await screen.goto(`${BASE}/screen/local`);
await screen.click("button:has-text('Continue without sound')");
await host.waitForSelector(".host__head");
await sleep(1500);
check("relay unreachable: realtime connections were attempted and refused", refused > 0, String(refused));
check("first visit offers the quick guide", /Learn the controls in about a minute/.test(await text(host)));
await host.click(".offer button:has-text('Skip')");
check("physical mode: the console shows no room code, phone count or join link", !/ROOM [A-Z0-9]{4}|PHONES \d|join link|Phones (online|offline|connecting)/i.test(await text(host)));
check("physical mode: no relay warning, because nothing needs the relay", !/offline|relay/i.test(await text(host, ".alerts").catch(() => "")));
check("physical mode: the projector lobby has no QR code or room code", (await screen.locator(".lobby").count()) === 1 && !/ROOM|BUZZER PHONES/.test(await text(screen, ".lobby")) && (await screen.locator(".lobby img[alt*='QR'], .lobby canvas, .lobby svg[class*='qr']").count()) === 0);
await snap(host, "physical-1-console-empty-1920x1080");

await host.click("role=tab[name='Setup']");
await host.click('button:has-text("Load demo pack")');
await host.click("button:has-text('Confirm')");
check("demo results stay labelled on the console", /DEMO: INVENTED RESULTS/.test(await text(host, ".alerts")));
await host.click("role=tab[name='Live']");
// typed the way a person does: one box, then click straight into the other
await host.locator(".names input").nth(0).click();
await host.keyboard.press("Control+A");
await host.keyboard.type("Foxes");
await host.locator(".names input").nth(1).click();
check("clicking from one team-name box to the other keeps the cursor there", await host.evaluate(() => document.activeElement === document.querySelectorAll(".names input")[1]));
await host.keyboard.press("Control+A");
await host.keyboard.type("Owls");
await host.keyboard.press("Tab");
await sleep(200);
check("both names are saved", JSON.stringify(await host.locator(".score__name").allInnerTexts()) === '["Foxes","Owls"]', JSON.stringify(await host.locator(".score__name").allInnerTexts()));
check("the projector shows the team names and the demo label", /FOXES/i.test(await text(screen, ".lobby__teams")) && /DEMO: INVENTED RESULTS/.test(await text(screen, ".demo-banner")), `${await text(screen, ".lobby__teams")} / ${await text(screen, ".demo-banner").catch(() => "no banner")}`);
check("questions read as Question N, with no category labels", /Question 1\b/.test(await text(host, ".qlist")) && !/\bq\d\d\b|STUDENT LIFE|EVERYDAY LIFE|PHONES & TECH|Student Life|Everyday Life/.test(await text(host, ".live__main")));
await spy();

// ---------- round 1: face-off, pass, reveals, three wrong answers, failed steal ----------
const q = (label) => host.locator(".q").filter({ has: host.locator(".q__num", { hasText: new RegExp(`^${label}$`) }) });
await q("Question 1").locator("button:has-text('Start')").click();
await screen.waitForSelector(".intro");
await host.click("button:has-text('Show the board')");
await screen.waitForSelector(".board");
check("the console lists every private answer with its points before any reveal", /Talking to friends/.test(await text(host, ".answers")) && /\b4\b/.test(await text(host, ".answers")));
check("hidden answers are not on the projector", !/Talking to friends|Scrolling|Eating/.test(await text(screen, ".board")));
await host.click("button:has-text('Start the face-off')");
await screen.waitForSelector(".fo");
await host.click("button:has-text('Owls buzzed first')");
await sleep(250);
check("a tap records the hosts' call on who buzzed first", /OWLS BUZZED FIRST/.test(await text(screen, ".fo__text")));
await host.keyboard.press("2"); // Sleeping 16: on the board but not the top answer
await sleep(300);
check("a lower face-off answer does not end the face-off: the other player answers", /Foxes/.test(await text(host, ".step__text")) && /answers next/.test(await text(host, ".step__text")) && /FOXES: YOUR ANSWER/.test(await text(screen, ".fo__text")));
let c0 = await cues();
await host.keyboard.press("x");
await sleep(300);
check("a face-off miss shows one red X and costs no strike", (await flashes()).some((f) => /flash--x\|X$/.test(f)) && (await screen.locator(".strike--on").count()) === 0);
check("the face-off miss sounded once", (await cues()) === c0 + 1 && (await lastCue()) === "faceoffMiss");
check("the console asks for the hosts' call and shows the survey's suggestion", /Over to the hosts/.test(await text(host, ".step")) && /By the survey, Owls wins/.test(await text(host, ".step")));
check("the projector waits for the hosts, without naming the survey's pick", /OVER TO THE HOSTS/.test(await text(screen, ".fo__text")));
await snap(host, "physical-2-console-hosts-call-1920x1080");
await host.click("button:has-text('Owls wins the face-off')");
await sleep(300);
check("the hosts' call starts play or pass", /PLAY OR PASS/.test(await text(screen, ".fo__text")));
await host.click("button:has-text('Owls passes')");
await sleep(300);
check("pass: Foxes play, and the projector shows the banner", /Foxes/.test(await text(host, ".score__team.is-on")) && (await flashes()).some((f) => /OWLS PASSES/.test(f)));
check("the face-off answer sits in the pot once", (await pot()) === "16");

c0 = await cues();
await host.locator(".answer", { hasText: "Scrolling social media" }).locator("button:has-text('Reveal')").click();
await sleep(900);
check("Reveal turns the tile over on the projector and sounds once", /Scrolling social media/.test(await text(screen, ".tile--shown")) && (await cues()) === c0 + 1 && (await lastCue()) === "reveal");
check("the pot adds the revealed answer (16 + 23)", (await pot()) === "39");
await host.locator(".answer", { hasText: "Scrolling social media" }).locator(".answer__on").waitFor();
check("a revealed answer cannot be revealed again from the console", (await host.locator(".answer", { hasText: "Scrolling social media" }).locator("button").count()) === 0);

await wrong();
check("first wrong answer: one red X, strike 1", (await screen.locator(".strike--on").count()) === 1);
await wrong();
await snap(screen, "physical-3-projector-red-x-1920x1080");
c0 = await cues();
await wrong();
await sleep(1300);
const fl = await flashes();
check("three wrong answers drew X, XX, XXX and then the steal banner", fl.filter((f) => /flash--x/.test(f)).map((f) => f.split("|")[1]).slice(-3).join(",") === "X,XX,XXX" && fl.some((f) => /STEAL!/.test(f)), JSON.stringify(fl));
check("the third X and the steal sounded once each", (await cues()) === c0 + 2 && (await lastCue()) === "steal");
check("the console says Owls can steal", /Owls/.test(await text(host, ".step__text")) && /steal/.test(await text(host, ".step__text")));
await snap(screen, "physical-4-projector-steal-1920x1080");
await host.click("button:has-text('Wrong answer')");
await sleep(400);
check("a missed steal shows the X and Foxes keep the points", /Foxes/.test(await text(host, ".step__text")) && /keeps the points/.test(await text(host, ".step__text")) && (await lastCue()) === "stealMiss");
await host.click("button:has-text('Give 39 points to Foxes')");
await sleep(400);
check("points go to Foxes once, with a banner", JSON.stringify(await scores()) === "[39,0]" && (await flashes()).some((f) => /FOXES \+39/.test(f)));
await host.click("button:has-text('Give 39 points')").catch(() => {});
check("there is no second award to give", JSON.stringify(await scores()) === "[39,0]" && (await host.locator("button:has-text('Give 39 points')").count()) === 0);

// corrections and Undo
c0 = await cues();
await host.click("button:has-text('Adjust score')");
await host.click(".adjust__team:has-text('Owls')");
await host.click(".adjust__amounts button:has-text('5') >> nth=0"); // -5
await sleep(300);
check("Adjust score takes 5 off Owls as a penalty", JSON.stringify(await scores()) === "[39,-5]");
await host.click("button:has-text('Undo')");
await sleep(300);
check("Undo reverses the penalty, and the projector stays quiet", JSON.stringify(await scores()) === "[39,0]" && (await cues()) === c0);
await host.click("button:has-text('Done adjusting')");
await host.locator(".answer", { hasText: "Eating" }).locator("button:has-text('Show')").click();
await sleep(300);
check("showing the rest after the award changes no score", /Eating/.test(await text(screen, ".board")) && JSON.stringify(await scores()) === "[39,0]");
const msgs = await screen.evaluate(() => window.__msgs);
check("nothing the projector was sent ever held an answer before it was revealed", !msgs.some((m) => /Talking to friends|"Gaming"|Watching videos/.test(m)), msgs.find((m) => /Talking to friends|Gaming|Watching videos/.test(m))?.slice(0, 200));

// projector reload: no replayed effects
await screen.reload();
await screen.click("button:has-text('Continue without sound')");
await screen.waitForSelector(".board");
await sleep(1500);
check("a reloaded projector shows the board and replays no sound or effect", /Scrolling social media/.test(await text(screen, ".board")) && (await cues()) === 0 && (await screen.locator(".flash").count()) === 0);
await spy();

await host.click("button:has-text('Next question')");
await screen.waitForSelector(".final");
check("between rounds the projector shows the scores", /Foxes leads/.test(await text(screen, ".final")));

// ---------- round 2: skip the face-off, end early, then a host refresh and resume ----------
await q("Question 3").locator("button:has-text('Start')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Skip the face-off')");
await host.click("button:has-text('Owls plays first')");
await sleep(200);
check("skipping the face-off lets the host pick who plays", /Owls/.test(await text(host, ".score__team.is-on")));
await host.keyboard.press("1"); // Traffic 26
await sleep(300);
await host.reload();
await host.waitForSelector(".modal");
check("a refreshed console offers to resume, and the guide does not interrupt", /Carry on with the saved game/.test(await text(host, ".modal")) && (await host.locator(".offer").count()) === 0);
await snap(host, "physical-5-console-resume-1920x1080");
await host.click("button:has-text('Resume the game')");
await sleep(500);
check("resume restores the revealed answer, pot and scores", /Traffic/.test(await text(screen, ".tile--shown")) && (await pot()) === "26" && JSON.stringify(await scores()) === "[39,0]");
await host.click("button:has-text('End round early')");
await host.click("button:has-text('Confirm')");
await host.click("button:has-text('Give 26 points to Owls')");
await sleep(300);
check("Owls get 26", JSON.stringify(await scores()) === "[39,26]");
await host.click("button:has-text('Next question')");
await host.click("button:has-text('Finish the game now')");
await host.click("button:has-text('Confirm')");
await screen.waitForSelector(".final");
check("finishing early shows the winner on both screens", /Foxes wins/.test(await text(host, ".over")) && /Foxes wins/.test(await text(screen, ".final")));
await snap(screen, "physical-6-projector-final-1920x1080");

// ---------- the next pair of teams ----------
await host.click("button:has-text('Set up the next two teams')");
await host.click("button:has-text('Confirm')");
await sleep(300);
check("next teams: fresh names, scores back to 0", JSON.stringify(await host.locator(".names input").evaluateAll((els) => els.map((e) => e.value))) === '["Team A","Team B"]' && /TEAM A/i.test(await text(screen, ".lobby__teams")) && /^0$/.test(await text(host, ".score__num")));
check("next teams keep the answers: 3 questions still ready", (await host.locator(".q button:has-text('Start')").count()) === 3);
check("questions the last teams played are marked, and still playable", (await q("Question 1").locator(".tag").innerText()) === "Used in an earlier game" && (await q("Question 1").locator("button:has-text('Start')").isEnabled()));
await snap(host, "physical-7-console-next-teams-1920x1080");

// a second console window is a critical warning, but only then
const dup = await ctx.newPage();
await dup.goto(`${BASE}/host`);
await sleep(2500);
check("a second moderator window raises a clear warning", /Another moderator window is open/.test(await text(host, ".alerts")) || /Another moderator window is open/.test(await text(dup, ".alerts")));
await dup.close();

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length || pageErrors.length ? 1 : 0);
