// Probes the local Air Jam server with raw socket.io clients: room limit, role boundaries, host takeover.
// Run with the dev server up:  pnpm run probe
import { io } from "socket.io-client";

const URL = process.env.AIRJAM_URL ?? "http://localhost:4000";
const results = [];
const log = (name, value) => {
  results.push([name, value]);
  console.log(`${name.padEnd(58)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
};

const connect = () =>
  new Promise((resolve, reject) => {
    const s = io(URL, { transports: ["websocket"], forceNew: true });
    s.on("connect", () => resolve(s));
    s.on("connect_error", reject);
  });
const ack = (s, ev, payload, ms = 3000) =>
  new Promise((resolve) =>
    s.timeout(ms).emit(ev, payload, (err, a) => resolve(err ? { timeout: true } : a)),
  );
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const host = await connect();
log("host bootstrap", await ack(host, "host:bootstrap", { hostSessionKind: "game" }));
const tooMany = await ack(host, "host:createRoom", { maxPlayers: 17 });
log("createRoom maxPlayers=17 (SDK schema cap is 16)", tooMany);
const room = await ack(host, "host:createRoom", { maxPlayers: 16 });
const roomId = room.roomId;
log("createRoom maxPlayers=16", { ok: room.ok, roomId, roomIdLength: roomId?.length, maxPlayers: room.maxPlayers });

// host records every action rpc it receives and acks it
const seen = [];
host.on("airjam:action_rpc", (payload, cb) => {
  seen.push({ action: payload.actionName, actor: payload.actor });
  cb?.({ ok: true, status: "accepted", source: "host" });
});
host.on("airjam:state_sync_request", () => {});

// join 16 controllers, then a 17th
const phones = [];
const joinResults = [];
for (let i = 1; i <= 17; i++) {
  const s = await connect();
  const id = `probe-c${String(i).padStart(2, "0")}`;
  const a = await ack(s, "controller:join", { roomId, controllerId: id, deviceId: `device-${id}-xxxx`, nickname: `P${i}` });
  joinResults.push({ i, ok: a?.ok, code: a?.code });
  phones.push({ s, id });
}
log("controllers 1-16 joined", joinResults.slice(0, 16).every((r) => r.ok));
log("controller 17 join result", joinResults[16]);

// role boundary: ordinary action rpc vs host_action_rpc from a phone
const rogue = phones[0];
const viaController = await ack(rogue.s, "controller:action_rpc", { roomId, actionName: "publish", payload: { x: 1 }, storeDomain: "default" });
const viaHostChannel = await ack(rogue.s, "controller:host_action_rpc", { roomId, actionName: "publish", payload: { x: 1 }, storeDomain: "default" });
log("phone -> controller:action_rpc  (ack)", viaController);
log("phone -> controller:host_action_rpc (ack)", viaHostChannel);
log("host saw actors", seen.map((x) => `${x.action}:${x.actor.role}/${x.actor.id}`));
const reservedA = await ack(rogue.s, "controller:action_rpc", { roomId, actionName: "_publish", payload: {}, storeDomain: "default" });
const reservedB = await ack(rogue.s, "controller:host_action_rpc", { roomId, actionName: "_publish", payload: {}, storeDomain: "default" });
log("phone -> _publish via controller channel", reservedA.reason ?? reservedA);
log("phone -> _publish via host channel", reservedB.reason ?? reservedB);

// host-only socket events from a phone socket
let syncReceived = false;
phones[1].s.on("airjam:state_sync", (p) => { if (p?.data?.__rogue) syncReceived = true; });
rogue.s.emit("host:state_sync", { roomId, data: { __rogue: true }, storeDomain: "default", revision: 999 });
await wait(400);
log("phone emits host:state_sync reaches other phones", syncReceived);
log("phone host:removeController victim", await ack(rogue.s, "host:removeController", { roomId, controllerId: phones[1].id }));
log("phone host:resetRoom", await ack(rogue.s, "host:resetRoom", { roomId }));

// second host tries to take over an existing room
const host2 = await connect();
log("host2 bootstrap", (await ack(host2, "host:bootstrap", { hostSessionKind: "game" })).ok);
log("host2 host:reconnect to existing room", await ack(host2, "host:reconnect", { roomId }));
const rogueSync = [];
phones[2].s.on("airjam:state_sync", (p) => rogueSync.push(p?.data));
host2.emit("host:state_sync", { roomId, data: { __hijack: true }, storeDomain: "default", revision: 1000 });
await wait(400);
log("host2 state_sync reached phones", rogueSync.some((d) => d?.__hijack));

// the window after the real host drops: can another host adopt the room? (local dev runs with auth disabled)
host.close();
await wait(600);
log("host2 host:reconnect after the real host dropped", await ack(host2, "host:reconnect", { roomId }));

for (const p of phones) p.s.close();
host2.close();
await wait(200);
process.exit(0);
