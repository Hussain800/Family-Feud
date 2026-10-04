// One phone loses its connection mid-poll. The board must carry on and the phone must recover its accepted vote.
// Needs the dev stack (pnpm run dev). Run: node scripts/e2e-phone-drop.mjs
import { chromium } from "playwright-core";
import { io } from "socket.io-client";

const BASE = process.env.FEUD_URL ?? "http://localhost:5173";
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail && !ok ? `  -> ${detail}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel = "body") => page.locator(sel).first().innerText();

const browser = await chromium.launch({ channel: "chrome", headless: true });
const hostCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const host = await hostCtx.newPage();
const screen = await hostCtx.newPage();
const phone = await phoneCtx.newPage();

// Proxy the phone's realtime socket so the test can cut it and later allow it again.
let blocked = false;
const live = new Set();
await phoneCtx.routeWebSocket(/socket\.io/, (ws) => {
  if (blocked) return void ws.close();
  const server = ws.connectToServer();
  live.add(ws);
  ws.onClose(() => live.delete(ws));
  void server;
});
// After a refused upgrade the client may fall back to HTTP long-polling, so cut that too.
await phoneCtx.route(/\/socket\.io\//, (r) => (blocked ? r.abort() : r.continue()));
const cut = () => {
  blocked = true;
  live.forEach((w) => w.close());
};

await host.goto(`${BASE}/host`);
await host.waitForSelector(".chip--ready", { timeout: 20000 });
const room = (await text(host, ".chip--ready")).match(/ROOM ([A-Z0-9]{4})/)[1];
await screen.goto(`${BASE}/screen/${room}`);
await phone.goto(`${BASE}/play/${room}`);
await phone.waitForSelector("text=You’re in", { timeout: 15000 });

await host.click("role=tab[name='Questions & data']");
await host.click("button:has-text('Load demo pack')");
await host.click("button:has-text('CONFIRM')");
await host.click("role=tab[name='Play']");
await host.locator(".qrow", { hasText: "q10" }).locator("button:has-text('Start round')").click();
await host.click("button:has-text('Show the board')");
await host.click("button:has-text('Begin guessing')");
for (const [i, v] of ["Pizza", "Shawarma", "Burgers"].entries()) await host.fill(`[aria-label="Suggested guess ${i + 1}"]`, v).catch(async () => { await host.click("button:has-text('Add guess')"); await host.fill(`[aria-label="Suggested guess ${i + 1}"]`, v); });
await host.selectOption("select", "45");
await host.click("button:has-text('Open poll')");
await phone.waitForSelector(".phone__opt");
await phone.locator(".phone__opt").nth(1).click();
await phone.waitForSelector("text=VOTE RECEIVED");
check("phone has an accepted vote before the drop", true);

// A: a poll-neutral drop. The vote must be recovered and not counted twice.
cut();
const reconnecting = await phone.waitForSelector("text=Reconnecting", { timeout: 20000 }).then(() => true, () => false);
check("RECOVERY: a dropped phone shows Reconnecting (not a blank or broken page)", reconnecting, (await text(phone)).slice(0, 100));
await host.click("role=tab[name='Session']");
await host.click("role=tab[name='Play']");
check("the moderator console stays responsive while the phone is away", (await host.locator(".poll-live").count()) === 1);
blocked = false;
await phone.click("button:has-text('Try now')").catch(() => {});
const back = await phone.waitForSelector("text=VOTE RECEIVED", { timeout: 30000 }).then(() => true, () => false);
check("RECOVERY: the phone rejoins and recovers its accepted vote", back, (await text(phone)).slice(0, 120));
await sleep(500);
check("the host counts the returning phone once", /PHONES 1\/16/.test(await text(host, ".chips")), await text(host, ".chips"));
const live2 = await text(host, ".poll-live");
check("the returning phone did not add a second ballot", /1 of 1 connected phones have voted/.test(live2), live2);

// B: a drop during which the host reveals an answer. That changes the round, so the poll is cancelled, clearly.
cut();
await phone.waitForSelector("text=Reconnecting", { timeout: 20000 });
await host.locator(".answer").nth(0).locator("button").click();
await sleep(500);
check("the board and projector keep working while the phone is away", /Pizza/.test(await text(screen, ".tile--shown")) && (await text(screen, ".mid__pot")) === "28");
check("the host is told the poll was cancelled because the round changed", /Poll cancelled/.test(await text(host)), (await text(host)).slice(0, 200));
blocked = false;
await phone.click("button:has-text('Try now')").catch(() => {});
const waiting = await phone.waitForSelector("text=You’re in", { timeout: 30000 }).then(() => true, () => false);
check("RECOVERY: the returning phone is not left on a dead ballot", waiting, (await text(phone)).slice(0, 120));

// C: the room is full (16 phones). The 17th phone gets an honest screen and the game is unaffected.
const RELAY = process.env.AIRJAM_URL ?? "http://localhost:4000";
const fillers = [];
for (let i = 0; i < 15; i++) {
  const sk = io(RELAY, { transports: ["websocket"], forceNew: true });
  await new Promise((r) => sk.on("connect", r));
  const ack = await new Promise((r) => sk.timeout(4000).emit("controller:join", { roomId: room, controllerId: `filler-${String(i).padStart(2, "0")}`, deviceId: `device-filler-${i}-xxxx` }, (e, a) => r(e ? { timeout: true } : a)));
  if (!ack.ok) console.log("      filler", i, "refused:", JSON.stringify(ack));
  fillers.push(sk);
}
await sleep(500);
check("the room shows 16 of 16 phones", /PHONES 16\/16/.test(await text(host, ".chips")), await text(host, ".chips"));
const lateCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const late = await lateCtx.newPage();
await late.goto(`${BASE}/play/${room}`);
const full = await late.waitForSelector("text=This room is full", { timeout: 15000 }).then(() => true, () => false);
check("PHONE LIMIT: the 17th phone sees 'This room is full' instead of a broken page", full, (await text(late)).slice(0, 140));
check("PHONE LIMIT: the board is unaffected by a refused phone", (await host.locator(".answer").count()) > 0);
fillers.forEach((f) => f.close());
await lateCtx.close();
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nphone-drop checks passed");
process.exit(failed ? 1 : 0);
