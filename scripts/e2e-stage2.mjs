// Stage 2 of the end-to-end match: crowd-assist poll, role attacks, privacy sentinel, recovery, final, layouts.
export async function stage2(c) {
  const { RELAY, io, host, screen, p1, p2, p1Ctx, snap, sleep, text, check, reveal, startRound, scores, room } = c;

  // ---------- round 2: q01 with crowd assist, plus role attacks over raw sockets ----------
  await host.click("button:has-text('Next round')");
  await screen.waitForSelector(".final");
  check("BETWEEN ROUNDS: the projector shows a scoreboard (AFTER ROUND 1 OF 3, Team B leads), not the join page", /AFTER ROUND 1 OF 3/.test(await text(screen, ".final")) && /Team B leads/.test(await text(screen, ".final")) && (await screen.locator(".lobby").count()) === 0);
  await snap(screen, "20-between-rounds-1920x1080");
  await snap(host, "17-host-question-picker-1920x1080");
  await startRound("q01");
  await host.click("button:has-text('Show the board')");
  await host.click("button:has-text('Skipping?')"); // the face-off is skipped here: Team B starts
  await host.click("button:has-text('Begin guessing')");
  check("six-answer board is a single column", (await screen.locator(".board__slots.cols-1").count()) === 1 && (await screen.locator(".tile").count()) === 6);

  // a hostile socket joins as a controller and records everything the relay sends it
  const attacker = io(RELAY, { transports: ["websocket"], forceNew: true });
  await new Promise((r) => attacker.on("connect", r));
  const frames = [];
  attacker.onAny((ev, ...args) => frames.push(JSON.stringify([ev, args])));
  const joined = await new Promise((r) =>
    attacker.timeout(4000).emit("controller:join", { roomId: room, controllerId: "probe-attacker-1", deviceId: "device-attacker-0001", nickname: "attacker" }, (e, a) => r(e ? { timeout: true } : a)),
  );
  check("a third (raw socket) controller can join the room", joined.ok === true, JSON.stringify(joined));
  const rpc = (ev, actionName, payload) =>
    new Promise((r) => attacker.timeout(4000).emit(ev, { roomId: room, actionName, payload, storeDomain: "default" }, (e, a) => r(e ? { timeout: true } : a)));

  // compose the poll
  await host.fill('[aria-label="Suggested guess 1"]', "Scrolling");
  await host.fill('[aria-label="Suggested guess 2"]', "Sleeping");
  await host.click("button:has-text('Add guess')");
  await host.fill('[aria-label="Suggested guess 3"]', "Gaming");
  await host.selectOption("select", "45");
  await host.click("button:has-text('Open poll')");
  await p1.waitForSelector(".phone__opt", { timeout: 6000 });
  await p2.waitForSelector(".phone__opt", { timeout: 6000 });
  check("both phones receive the ballot", (await p1.locator(".phone__opt").count()) === 3 && (await p2.locator(".phone__opt").count()) === 3);
  await sleep(600);
  check("projector shows the crowd-assist panel with no counts while open", (await screen.locator(".poll").count()) === 1 && (await screen.locator(".poll__votes").count()) === 0);
  await snap(p1, "08-phone-ballot-390x844");
  await snap(host, "18-host-poll-live-1920x1080");
  await snap(screen, "09-poll-open-1920x1080");

  // phone 1 double-taps; phone 2 votes once
  await p1.locator(".phone__opt").nth(0).dblclick();
  await p1.waitForSelector("text=VOTE RECEIVED", { timeout: 6000 });
  check("VOTING: phone 1 sees VOTE RECEIVED after the host acknowledged (double tap = one vote)", true);
  await p2.locator(".phone__opt").nth(0).click();
  await p2.waitForSelector("text=VOTE RECEIVED", { timeout: 6000 });
  await snap(p2, "10-phone-vote-received-390x844");

  // attacker: spoofed host-role RPCs must not work; one honest vote and its retries behave
  let pollInfo = null;
  for (let i = frames.length - 1; i >= 0 && !pollInfo; i--) {
    const m = frames[i].match(/"poll":\{"id":"([^"]+)","status":"open","options":\[\{"id":"([^"]+)"[^\]]*?\{"id":"([^"]+)"[^\]]*?\{"id":"([^"]+)"/);
    if (m) pollInfo = { id: m[1], o: [m[2], m[3], m[4]] };
  }
  check("phones are told the poll id and option ids through the replicated store", !!pollInfo);
  const vote = (ev, opt, extra = {}) => rpc(ev, "castVote", { pollId: pollInfo.id, optionId: opt, requestId: "r1", ...extra });
  const asHost = await vote("controller:host_action_rpc", pollInfo.o[2]);
  check("ROLE: castVote sent on the spoofed host channel is rejected", asHost.ok === false && asHost.reason === "forbidden", JSON.stringify(asHost));
  const publishA = await rpc("controller:action_rpc", "_publish", { snapshot: { rev: 9e15, phase: "HACKED" } });
  const publishB = await rpc("controller:host_action_rpc", "_publish", { snapshot: { rev: 9e15, phase: "HACKED" } });
  check("ROLE: host-only _publish is refused on both RPC channels", publishA.reason === "reserved_action" && publishB.reason === "reserved_action", JSON.stringify([publishA, publishB]));
  const noReveal = await rpc("controller:host_action_rpc", "reveal", { answerId: "x" });
  const noScore = await rpc("controller:host_action_rpc", "AWARD", {});
  check("ROLE: reveal / score / reset actions do not exist on the network surface", noReveal.reason === "action_not_found" && noScore.reason === "action_not_found", JSON.stringify([noReveal, noScore]));
  const v1 = await vote("controller:action_rpc", pollInfo.o[2]);
  const v2 = await vote("controller:action_rpc", pollInfo.o[2], { requestId: "r2" });
  const v3 = await vote("controller:action_rpc", pollInfo.o[0]);
  const v4 = await rpc("controller:action_rpc", "castVote", { pollId: "stale-poll", optionId: pollInfo.o[0] });
  const v5 = await rpc("controller:action_rpc", "castVote", { pollId: pollInfo.id, optionId: "nope" });
  const v6 = await rpc("controller:action_rpc", "castVote", { pollId: pollInfo.id });
  check("VOTING: first vote accepted, same-choice retry confirmed, different choice already_voted", v1.ok && v2.ok && v2.result?.status === "duplicate" && v3.reason === "already_voted", JSON.stringify([v1, v2, v3]));
  check("VOTING: stale poll, unknown option and malformed payload are rejected", v4.reason === "stale_poll" && v5.reason === "unknown_option" && v6.reason === "invalid", JSON.stringify([v4, v5, v6]));
  await sleep(500);
  const live = await text(host, ".poll-live");
  check("VOTING: host counts 3 voters (phone 1 once, phone 2, raw controller once)", /3 of 3 connected phones have voted/.test(live), live);
  check("ROLE: the projector snapshot was not replaced by the spoofed publish", !(await text(screen)).includes("HACKED"));

  // phone refresh mid-poll keeps its identity and recovers its accepted status
  await p1.reload();
  const recovered = await p1.waitForSelector("text=VOTE RECEIVED", { timeout: 10000 }).then(() => true, () => false);
  check("RECOVERY: a refreshed phone keeps its identity and recovers its accepted vote", recovered, recovered ? "" : (await text(p1)).slice(0, 120));
  const afterRefresh = await text(host, ".poll-live");
  check("RECOVERY: the refresh did not add a second ballot", /3 of \d connected phones have voted/.test(afterRefresh), afterRefresh);

  await host.click("button:has-text('Close poll now')");
  await p1.waitForSelector("text=Voting closed", { timeout: 6000 });
  await screen.waitForSelector(".poll__votes");
  const res = (await text(screen, ".poll__opts")).replace(/\s+/g, " ");
  check("closed poll shows aggregate totals 2 / 0 / 1", /Scrolling 2/.test(res) && /Sleeping 0/.test(res) && /Gaming 1/.test(res), res);
  await sleep(700);
  await snap(screen, "11-poll-results-1920x1080");
  await snap(p1, "12-phone-poll-closed-390x844");
  check("the poll never revealed an answer or changed the pot", (await screen.locator(".tile--shown").count()) === 0 && (await text(screen, ".mid__pot")) === "0");
  const lateVote = await vote("controller:action_rpc", pollInfo.o[1], { requestId: "late" });
  check("VOTING: a vote arriving after closing is rejected", lateVote.reason === "closed" || lateVote.reason === "already_voted", JSON.stringify(lateVote));
  await host.click("button:has-text('Clear poll')");
  const waiting = await p1.waitForSelector("text=You’re in", { timeout: 5000 }).then(() => true, () => false);
  check("clearing the poll returns phones to waiting", waiting);

  // team B clears the board
  for (let i = 1; i <= 6; i++) await reveal(i);
  await sleep(400);
  check("clearing every answer ends the round with pot 63", (await text(screen, ".mid__pot")) === "63");
  await host.click("button:has-text('Award 63 to Team B')");
  await sleep(300);
  let s = await scores();
  check("clear-board award: Team B 42 + 63 = 105", s[0] === 0 && s[1] === 105, JSON.stringify(s));
  await host.keyboard.press("u");
  await sleep(300);
  s = await scores();
  check("UNDO reverses exactly the recorded award (Team B back to 42)", s[1] === 42, JSON.stringify(s));
  await host.click("button:has-text('Award 63 to Team B')");
  await sleep(300);
  s = await scores();
  check("re-award after undo lands once (105)", s[1] === 105, JSON.stringify(s));

  // projector refresh does not re-award anything
  await screen.reload();
  await screen.waitForSelector(".tile--shown", { timeout: 8000 });
  s = await scores();
  check("RECOVERY: projector reload restores the board with the same scores", s[0] === 0 && s[1] === 105, JSON.stringify(s));
  await host.click("button:has-text('Next round')");

  // ---------- round 3: privacy sentinel in a freshly imported private pack ----------
  const SENT = { text: "ZZSENTINEL-TEXT-93f1c", alias: "ZZSENTINEL-ALIAS-7a2e", note: "ZZSENTINEL-NOTE-11bd", count: 7771913 };
  const priv = {
    schemaVersion: 1,
    packId: "private-e2e",
    title: "Private e2e pack",
    purpose: "event",
    questions: [
      {
        id: "q02",
        category: "Student Life",
        prompt: "Name something you’d find in almost every student’s bag.",
        status: "ready",
        survey: { source: "events_team_csv", respondents: null, responseMode: "unconfirmed", collectedAt: null, note: SENT.note },
        answers: [
          { id: "p-open", rank: 1, text: "Laptop", count: 9000001, aliases: [] },
          { id: "p-hidden", rank: 2, text: SENT.text, count: SENT.count, aliases: [SENT.alias] },
          { id: "p-hidden2", rank: 3, text: "Water bottle", count: 9, aliases: ["flask"] },
        ],
        approval: null,
      },
    ],
  };
  await host.click("role=tab[name='Questions & data']");
  await host.evaluate(() => { const d = document.querySelector("details"); if (d) d.open = true; });
  await host.fill('[aria-label="Pack JSON"]', JSON.stringify(priv));
  await host.click("button:has-text('Validate and load')");
  await host.waitForSelector("text=Pack loaded");
  await host.click("role=tab[name='Play']");
  const p1Frames = [];
  const cdp = await p1Ctx.newCDPSession(p1);
  await cdp.send("Network.enable");
  cdp.on("Network.webSocketFrameReceived", (e) => p1Frames.push(e.response.payloadData));
  await p1.reload(); // so its socket is captured from the start of the session
  await p1.waitForSelector("text=You’re in", { timeout: 10000 });
  frames.length = 0;
  await startRound("q02");
  await host.click("button:has-text('Show the board')");
  await host.click("button:has-text('Begin guessing')");
  await host.locator(".answer").nth(0).locator("button").click(); // reveal Laptop only
  await sleep(900);
  const secrets = [SENT.text, SENT.alias, SENT.note, String(SENT.count), "flask", "Water bottle", "p-hidden"];
  const leakIn = (label, blob) => check(`PRIVACY: ${label} holds no unrevealed answer, alias, count or survey note`, !secrets.some((x) => blob.includes(x)), secrets.find((x) => blob.includes(x)));
  leakIn("projector DOM text", await text(screen));
  leakIn("projector HTML", await screen.content());
  leakIn("phone HTML", await p1.content());
  leakIn("phone websocket frames", p1Frames.join("\n"));
  leakIn("raw controller socket traffic", frames.join("\n"));
  leakIn("phone localStorage", JSON.stringify(await p1.evaluate(() => ({ ...localStorage }))));
  const phoneJs = await p1.evaluate(() => performance.getEntriesByType("resource").map((e) => e.name));
  let assetLeak = "";
  const assetUrls = phoneJs.filter((u) => /\.(js|ts|tsx|json|css|mjs)(\?|$)/.test(u));
  for (const url of assetUrls) {
    const body = await (await p1.request.get(url)).text().catch(() => "");
    const hit = secrets.filter((x) => x.startsWith("ZZSENTINEL") || x === String(SENT.count) || x === "p-hidden").find((x) => body.includes(x)); // generic words like "flask" legitimately occur in vendor code
    if (hit) assetLeak += ` "${hit}" in ${url};`;
  }
  check(`PRIVACY: none of ${assetUrls.length} script/style/json assets served to a phone contains the sentinel`, !assetLeak, assetLeak);
  check("PRIVACY: the revealed answer and its count are public", (await text(screen, ".tile--shown")).includes("Laptop") && (await text(screen, ".mid__pot")) === "9000001");
  check("PRIVACY: the private pack sits only in the moderator's local storage", (await host.evaluate(() => localStorage.getItem("ff.pack.v1") ?? "")).includes(SENT.text));
  await host.keyboard.press("2"); // reveal the sentinel now; only then may it appear, and its alias still must not
  await sleep(600);
  check("PRIVACY: a revealed secret appears on screen, its alias still does not", (await text(screen)).includes(SENT.text) && !(await screen.content()).includes(SENT.alias));
  await host.click("button:has-text('End round early')");
  await host.click("button:has-text('CONFIRM')");
  await host.click("button:has-text('Award')");
  await sleep(300);

  // ---------- finish ----------
  await host.click("button:has-text('Finish match')");
  await screen.waitForSelector(".final", { timeout: 6000 });
  const final = (await text(screen, ".final")).replace(/\s+/g, " ");
  check("the match ends with a visible result", /wins|tie/i.test(final), final);
  await sleep(500);
  await snap(screen, "13-final-1920x1080");

  // ---------- host refresh: resume offered ----------
  await host.reload();
  await host.waitForSelector(".modal", { timeout: 8000 });
  check("RECOVERY: a host refresh offers Resume", (await text(host, ".modal")).includes("Resume the saved match"));
  await snap(host, "14-host-resume-1920x1080");
  await host.click("button:has-text('Resume match')");
  await sleep(600);
  check("RECOVERY: resume restores the finished match and its scores", /match over/i.test(await text(host)));

  // ---------- layout variety at three projector sizes ----------
  const long = {
    schemaVersion: 1,
    packId: "layout-test",
    title: "Layout test",
    purpose: "event",
    questions: [
      {
        id: "q07",
        category: "Campus",
        prompt: "Name something you’d expect to find at a university event.",
        status: "ready",
        survey: { source: "layout_test", respondents: null, responseMode: "unconfirmed", collectedAt: null, note: "" },
        answers: [["Free branded merchandise and notebooks for everyone", 40], ["Pizza", 33], ["Coffee", 30], ["Name badges", 24], ["Posters", 19], ["Music", 15], ["Photo booth", 12], ["Speeches", 9], ["Raffle prizes", 6], ["Games", 3]].map(([t, n], i) => ({ id: `L${i}`, rank: i + 1, text: t, count: n, aliases: [] })),
        approval: null,
      },
      {
        id: "q09",
        category: "Dubai",
        prompt: "Name a place you’d take a friend who is visiting Dubai.",
        status: "ready",
        survey: { source: "layout_test", respondents: null, responseMode: "unconfirmed", collectedAt: null, note: "" },
        answers: [{ id: "S0", rank: 1, text: "Burj Khalifa", count: 61, aliases: [] }],
        approval: null,
      },
    ],
  };
  await host.click("role=tab[name='Session']");
  await host.click("button:has-text('Start a new match')");
  await host.click("button:has-text('CONFIRM')");
  await host.click("role=tab[name='Questions & data']");
  await host.evaluate(() => { const d = document.querySelector("details"); if (d) d.open = true; });
  await host.fill('[aria-label="Pack JSON"]', JSON.stringify(long));
  await host.click("button:has-text('Validate and load')");
  await host.click("role=tab[name='Play']");
  const row = host.locator(".qrow", { hasText: "q07" });
  check("the host is warned about a long label before the round starts", (await row.innerText()).includes("Long labels may wrap"));
  await row.locator("button:has-text('Start round')").click();
  await host.click("button:has-text('CONFIRM')");
  await host.click("button:has-text('Show the board')");
  await host.click("button:has-text('Begin guessing')");
  for (let k = 1; k <= 10; k++) await host.keyboard.press(k === 10 ? "0" : String(k));
  await sleep(600);
  check("a ten-answer board uses two columns of five", (await screen.locator(".board__slots.cols-2 .slots").count()) === 2 && (await screen.locator(".tile").count()) === 10);
  for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 720]]) {
    await screen.setViewportSize({ width: w, height: h });
    await sleep(500);
    await snap(screen, `15-board-10-answers-${w}x${h}`);
  }
  await screen.setViewportSize({ width: 1920, height: 1080 });
  await host.click("button:has-text('Award')");
  await host.click("button:has-text('Next round')").catch(() => {});
  await host.locator(".qrow", { hasText: "q09" }).locator("button:has-text('Start round')").click();
  await host.click("button:has-text('Show the board')");
  await host.click("button:has-text('Begin guessing')");
  await sleep(500);
  check("a one-answer board renders a single tile", (await screen.locator(".tile").count()) === 1);
  await snap(screen, "16-board-1-answer-1920x1080");
  attacker.close();
  console.log("\n(stage 2 complete)");
}
