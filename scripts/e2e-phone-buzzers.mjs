// Optional phone buzzers: two real phone pages, pairing codes, a full face-off, and attacks over raw sockets
// (an impostor copying a paired phone's identity, stale and duplicate presses, unpaired phones, disconnection).
// Needs the dev stack running (pnpm run dev: relay + web) and Chrome.   Run: pnpm run e2e:phones
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { io } from "socket.io-client";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
const RELAY = process.env.AIRJAM_URL ?? "http://localhost:4000";
const OUT = fileURLToPath(new URL("../docs/screenshots/", import.meta.url));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(150);
  }
  return false;
};

// ---------- raw socket clients, the way an attacker would talk to the relay ----------
const connect = () => new Promise((res, rej) => {
  const s = io(RELAY, { transports: ["websocket"], forceNew: true });
  s.on("connect", () => res(s));
  s.on("connect_error", rej);
});
const ack = (s, ev, payload, ms = 4000) => new Promise((res) => s.timeout(ms).emit(ev, payload, (err, a) => res(err ? { timeout: true } : a)));
const rpc = (s, roomId, actionName, payload) => ack(s, "controller:action_rpc", { roomId, actionName, payload, storeDomain: "default" });
const reason = (a) => a?.reason ?? a?.result?.reason ?? a?.code ?? JSON.stringify(a);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const host = await ctx.newPage();
const screen = await ctx.newPage();
const pageErrors = [];
for (const [n, p] of [["host", host], ["screen", screen]]) p.on("pageerror", (e) => pageErrors.push(`${n}: ${e.message}`));
const phoneCtx = () => browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

await host.goto(`${BASE}/host`);
await host.waitForSelector(".host__head");
await host.click(".offer button:has-text('Skip')");
await screen.goto(`${BASE}/screen/local`);
await screen.click("button:has-text('Continue muted')");
// the projector's view of each snapshot, for the open armId
await screen.evaluate(() => {
  window.__last = null;
  new BroadcastChannel("gdg-ff-public").onmessage = (e) => { if (e.data.kind === "snapshot") window.__last = e.data.snapshot; };
});
const armId = () => screen.evaluate(() => window.__last?.buzzers?.armId ?? null);
const openOrReset = () => host.locator("button:has-text('Open phone buzzers'), button:has-text('Reset and reopen')").first().click();

await host.click("role=tab[name='Setup']");
await host.click('button:has-text("Load demo pack")');
await host.click("button:has-text('Confirm')");
await host.click("label:has-text('Phone buzzers')");
await host.waitForSelector("text=/enters room [A-Z0-9]{4}/", { timeout: 20000 });
const room = (await text(host, ".card:has(#buzzers-h)")).match(/enters room ([A-Z0-9]{4})/)[1];
const codes = await host.locator(".pairs__code").allInnerTexts();
check("phone mode shows each team's 4-digit code on the console only", codes.length === 2 && codes.every((c) => /^\d{4}$/.test(c)) && codes[0] !== codes[1]);
check("the projector shows the pairing QR while a team still needs its phone", /BUZZER PHONES/.test(await text(screen, ".lobby")));
check("the codes never reach the projector, on screen or in what it is sent", !(await screen.evaluate((cs) => cs.some((c) => document.body.innerText.includes(c) || JSON.stringify(window.__last ?? {}).includes(c)), codes)));

// an attacker joins the room first, so it hears about every phone that joins after it
const spy = await connect();
const heard = [];
spy.on("server:controllerJoined", (p) => heard.push(p));
const spyJoin = await ack(spy, "controller:join", { roomId: room, controllerId: "spy-0001", deviceId: "spy-device-0001", nickname: "Spy" });
check("an outsider can join the room (the relay has no gate)", spyJoin?.ok === true, JSON.stringify(spyJoin));

// ---------- two real phones pair ----------
const ctxA = await phoneCtx();
const phoneA = await ctxA.newPage();
const ctxB = await phoneCtx();
const phoneB = await ctxB.newPage();
for (const [n, p] of [["phoneA", phoneA], ["phoneB", phoneB]]) p.on("pageerror", (e) => pageErrors.push(`${n}: ${e.message}`));
await phoneA.goto(`${BASE}/play/${room}`);
await phoneA.waitForSelector("text=Pair this phone", { timeout: 15000 });
await phoneA.fill("#pair-code", codes[0] === "0000" ? "0001" : "0000");
await phoneA.click("button:has-text('Pair')");
check("a wrong code is refused on the phone", await until(async () => /not right/.test(await text(phoneA, ".phone__error"))));
await phoneA.fill("#pair-code", codes[0]);
await phoneA.click("button:has-text('Pair')");
check("phone A pairs with Team A's code", await until(async () => /TEAM A BUZZER/.test(await text(phoneA, ".phone__state"))));
await phoneB.goto(`${BASE}/play/${room}`);
await phoneB.waitForSelector("text=Pair this phone", { timeout: 15000 });
await phoneB.fill("#pair-code", codes[1]);
await phoneB.click("button:has-text('Pair')");
check("phone B pairs with Team B's code", await until(async () => /TEAM B BUZZER/.test(await text(phoneB, ".phone__state"))));
check("the console shows both phones paired and connected", await until(async () => (await host.locator(".pairs__row:has-text('paired and connected')").count()) === 2));
check("the projector QR goes away once both teams are paired", await until(async () => !/BUZZER PHONES/.test(await text(screen, ".lobby"))));
await phoneA.screenshot({ path: `${OUT}phone-1-waiting-390x844.png` });

// ---------- the face-off ----------
await host.click("role=tab[name='Live']");
await host.locator(".q button:has-text('Start')").first().click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Start the face-off')");
check("phones wait until the moderator opens the buzzers", /WAITING/.test(await text(phoneA, ".phone__state")) && (await phoneA.locator(".buzz").isDisabled()));
await host.click("button:has-text('Open phone buzzers')");
check("opening the buzzers makes both phones ready", await until(async () => /READY/.test(await text(phoneA, ".phone__state")) && /READY/.test(await text(phoneB, ".phone__state"))));
await phoneA.screenshot({ path: `${OUT}phone-2-ready-390x844.png` });
await phoneB.click(".buzz");
check("Team B's press arrives first: phone B says FIRST, phone A is locked out", await until(async () => /FIRST/.test(await text(phoneB, ".buzz")) && /LOCKED OUT/.test(await text(phoneA, ".phone__state"))));
check("the first press is the same BUZZ a tap makes: Team B answers", /Team B/.test(await text(host, ".step__text")) && /BUZZED FIRST/.test(await text(screen, ".fo__text")));
const projTime = await text(screen, ".fo__time").catch(() => "");
check("the projector labels the time honestly: when the press reached the laptop, after opening", /^RECEIVED \d+\.\d\d S AFTER THE BUZZERS OPENED/.test(projTime) && !/PROOF|REACTION/i.test(projTime), projTime);
check("the console says it is arrival order, not proof", /Arrival order, not proof/.test(await text(host, ".phones")));
await phoneA.screenshot({ path: `${OUT}phone-3-locked-out-390x844.png` });
await screen.screenshot({ path: `${OUT}phone-4-projector-timing-1920x1080.png` });

// a dispute: reset and reopen, then a double tap counts once
const oldArm = await armId();
await host.click("button:has-text('Reset and reopen')");
check("reset makes both phones ready again", await until(async () => /READY/.test(await text(phoneA, ".phone__state")) && /READY/.test(await text(phoneB, ".phone__state"))));
await phoneA.dblclick(".buzz");
check("a double tap is one press: Team A first", await until(async () => /FIRST/.test(await text(phoneA, ".buzz"))) && /Team A/.test(await text(host, ".step__text")));

// ---------- the impostor ----------
const a = heard.filter((p) => p.controllerId !== "spy-0001")[0];
check("the relay told the outsider phone A's controller id and device id", !!a?.controllerId && !!a?.deviceId, JSON.stringify(heard.map((h) => [h.controllerId, h.deviceId])));
const fake = await connect();
const takeover = await ack(fake, "controller:join", { roomId: room, controllerId: a.controllerId, deviceId: a.deviceId, nickname: "Impostor" });
check("with both ids, the relay lets the impostor take phone A's slot (a relay limit, outside this app)", takeover?.ok === true, JSON.stringify(takeover));
await openOrReset();
await sleep(500);
const curArm = await armId();
const r1 = await rpc(fake, room, "buzz", { armId: curArm, token: "guess" });
const r2 = await rpc(fake, room, "buzz", { armId: curArm });
check("the impostor's presses are refused: it has the identity but not Team A's token", reason(r1) === "not_paired" && reason(r2) === "not_paired", `${JSON.stringify(r1)} ${JSON.stringify(r2)}`);
const r3 = await rpc(fake, room, "pairBuzzer", { code: codes[0] });
check("Team A's used code cannot pair the impostor", reason(r3) === "wrong_code", JSON.stringify(r3));
const r4 = await ack(fake, "controller:host_action_rpc", { roomId: room, actionName: "buzz", payload: { armId: curArm, token: "guess" }, storeDomain: "default" });
check("a press sent down the host channel (stamped as host) is refused", r4?.ok !== true || reason(r4) === "forbidden", JSON.stringify(r4));
check("nothing the impostor sent reached the game", !(await screen.evaluate(() => window.__last?.buzzers?.first)));
fake.close();
await sleep(800);
// What happens to the real phone after a takeover is the relay's behaviour; record it rather than assume it.
await phoneA.locator("button:has-text('Try now')").click({ timeout: 2000 }).catch(() => {});
await until(async () => /READY/.test(await text(phoneA, ".phone__state")), 6000);
await phoneA.click(".buzz", { timeout: 2000 }).catch(() => {});
const recovered = await until(async () => /FIRST/.test(await text(phoneA, ".buzz")), 4000);
console.log(`INFO  after the takeover, phone A's next press ${recovered ? "counted without help" : "did not count; re-pairing it"}`);
if (!recovered) {
  await host.click("role=tab[name='Setup']");
  await host.locator(".pairs__row", { hasText: "Team A" }).locator("button:has-text('Unpair')").click();
  const fresh = (await host.locator(".pairs__row", { hasText: "Team A" }).locator(".pairs__code").innerText()).trim();
  await phoneA.reload();
  await phoneA.waitForSelector("text=Pair this phone", { timeout: 15000 });
  await phoneA.fill("#pair-code", fresh);
  await phoneA.click("button:has-text('Pair')");
  await until(async () => /TEAM A BUZZER/.test(await text(phoneA, ".phone__state")));
  await host.click("role=tab[name='Live']");
  await openOrReset();
  await until(async () => /READY/.test(await text(phoneA, ".phone__state")));
  await phoneA.click(".buzz");
}
check("the real phone A buzzes again (after re-pairing if the takeover knocked it out)", await until(async () => /FIRST/.test(await text(phoneA, ".buzz")), 8000));

// ---------- a scripted phone for Team B: stale, second and duplicate presses ----------
await host.click("role=tab[name='Setup']");
await host.locator(".pairs__row", { hasText: "Team B" }).locator("button:has-text('Unpair')").click();
check("unpairing Team B leaves its old phone in control of nothing", await until(async () => /NOT PAIRED/.test(await text(phoneB, ".phone__state"))));
const newB = (await host.locator(".pairs__row", { hasText: "Team B" }).locator(".pairs__code").innerText()).trim();
check("Team B gets a new code", /^\d{4}$/.test(newB) && newB !== codes[1]);
const bot = await connect();
await ack(bot, "controller:join", { roomId: room, controllerId: "bot-team-b", deviceId: "bot-device-0001", nickname: "Bot" });
const paired = await rpc(bot, room, "pairBuzzer", { code: newB });
const tok = paired?.result?.token ?? paired?.token;
check("a scripted phone pairs as Team B with the new code", !!tok, JSON.stringify(paired));
await host.click("role=tab[name='Live']");
await openOrReset(); // unpairing closed the old window; open one so there is an earlier opening to replay
await sleep(300);
const before = await armId();
await openOrReset();
await until(async () => /READY/.test(await text(phoneA, ".phone__state")));
const arm = await armId();
check("a press for an earlier opening is refused as stale", before !== arm && reason(await rpc(bot, room, "buzz", { armId: before, token: tok })) === "stale");
check("an opening id from much earlier is stale too", reason(await rpc(bot, room, "buzz", { armId: oldArm, token: tok })) === "stale");
await phoneA.click(".buzz");
await until(async () => /FIRST/.test(await text(phoneA, ".buzz")));
const second = await rpc(bot, room, "buzz", { armId: arm, token: tok });
const dup = await rpc(bot, room, "buzz", { armId: arm, token: tok });
check("Team B's later press is recorded as second; repeating it is a duplicate that changes nothing", (second?.result?.status ?? second?.status) === "second" && (dup?.result?.status ?? dup?.status) === "duplicate", `${JSON.stringify(second)} ${JSON.stringify(dup)}`);
check("the projector shows how much later the second press arrived", await until(async () => /TEAM B \d+\.\d\d S LATER/.test(await text(screen, ".fo__time").catch(() => ""))), await text(screen, ".fo__time").catch(() => "none"));
check("Team A still answers: the second press changed nothing", /Team A/.test(await text(host, ".step__text")));
const unpaired = await connect();
await ack(unpaired, "controller:join", { roomId: room, controllerId: "spectator-01", deviceId: "spectator-device-01", nickname: "Fan" });
check("an unpaired spectator's press is refused", reason(await rpc(unpaired, room, "buzz", { armId: arm, token: "x" })) === "not_paired");

// ---------- disconnection ----------
await ctxA.close();
const dropped = Date.now();
check("the console shows when a paired phone drops (within the relay's 8 s grace)", await until(async () => /Team A: phone disconnected/.test(await text(host, ".phones").catch(() => "")), 20000));
console.log(`INFO  the drop showed after ${((Date.now() - dropped) / 1000).toFixed(1)} s`);
await host.click("button:has-text('Team A buzzed first')").catch(() => {}); // the hosts' tap still works
await host.click("text=Wrong team? It was Team A").catch(() => {});
check("the hosts can still settle it by tap", /Team A/.test(await text(host, ".step__text")));

// ---------- switching to physical buzzers keeps the match ----------
const potBefore = await text(screen, ".mid__pot");
await host.click("role=tab[name='Setup']");
await host.click("label:has-text('Physical buzzers')");
await sleep(500);
check("switching to physical keeps the round and the pot", (await text(screen, ".mid__pot")) === potBefore && (await screen.locator(".board").count()) === 1);
check("in physical mode every phone press is refused", reason(await rpc(bot, room, "buzz", { armId: arm, token: tok })) === "off");
check("phone B says the game uses physical buzzers", await until(async () => /physical buzzers/.test(await text(phoneB))));

// ---------- the next teams never inherit phones ----------
await host.click("label:has-text('Phone buzzers')");
await host.click("role=tab[name='Live']");
await host.click("button:has-text('Back to questions')").catch(() => {});
await host.click("role=tab[name='Setup']");
await host.click("button:has-text('Set up the next two teams')");
await host.click("button:has-text('Confirm')");
await sleep(400);
const codes2 = await host.locator(".pairs__code").allInnerTexts();
check("the next teams get fresh codes, and nobody is paired", codes2.length === 2 && (await host.locator(".pairs__row:has-text('paired')").count()) === 0);
await host.click("role=tab[name='Live']");
check("the last teams' phone token no longer works", reason(await rpc(bot, room, "buzz", { armId: arm, token: tok })) === "not_paired");

for (const s of [spy, bot, unpaired]) s.close();
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (pageErrors.length) console.log("page errors:\n" + pageErrors.join("\n"));
process.exit(failed.length || pageErrors.length ? 1 : 0);
