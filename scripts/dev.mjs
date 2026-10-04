// Launcher for the local relay + web app, with the laptop's LAN address baked in so phones can reach it.
// Replaces `air-jam-server dev` because that wrapper spawns "pnpm" without a shell and fails on Windows.
//
//   node scripts/dev.mjs          relay on :4000 + Vite dev server on :5173 (default)
//   node scripts/dev.mjs build    production build with the LAN address baked in
//   node scripts/dev.mjs preview  relay + the production build (run `build` first)
//
// Override the address with FEUD_HOST=192.168.1.50 (or a full URL). Override the web port with VITE_PORT.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] ?? "dev";
const webPort = Number(process.env.VITE_PORT ?? 5173);
const relayPort = Number(process.env.AIR_JAM_SERVER_PORT ?? process.env.PORT ?? 4000);

const VIRTUAL = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|loopback|tailscale|zerotier|bluetooth/i;
function lanAddress() {
  const found = [];
  for (const [name, addrs] of Object.entries(networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) {
        found.push({ name, address: a.address, rank: VIRTUAL.test(name) ? 1 : 0 });
      }
    }
  }
  return found.sort((a, b) => a.rank - b.rank)[0]?.address ?? null;
}

const override = process.env.FEUD_HOST;
const ip = override ? override.replace(/^https?:\/\//, "").replace(/:\d+$/, "") : lanAddress();
const publicHost = ip ? `http://${ip}:${webPort}` : `http://localhost:${webPort}`;
const env = { ...process.env, VITE_PORT: String(webPort), VITE_AIR_JAM_PUBLIC_HOST: publicHost };
// Production has no dev proxy, so phones talk to the relay directly; both ports must be reachable.
if (mode !== "dev") env.VITE_AIR_JAM_SERVER_URL = `http://${ip ?? "localhost"}:${relayPort}`;

const relayBin = fileURLToPath(new URL("../node_modules/@air-jam/server/bin/air-jam-server.mjs", import.meta.url));
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
if (!existsSync(relayBin) || !existsSync(viteBin)) {
  console.error("Dependencies are missing. Run: pnpm install");
  process.exit(1);
}

const children = [];
const run = (label, bin, args, extraEnv = {}) => {
  const child = spawn(process.execPath, [bin, ...args], { cwd: root, env: { ...env, ...extraEnv }, stdio: ["ignore", "pipe", "pipe"] });
  const tag = (stream, out) => stream.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => out.write(`[${label}] ${l}\n`)));
  tag(child.stdout, process.stdout);
  tag(child.stderr, process.stderr);
  child.on("exit", (code) => {
    if (code && !shuttingDown) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code);
    }
  });
  children.push(child);
  return child;
};
let shuttingDown = false;
const shutdown = (code = 0) => {
  shuttingDown = true;
  children.forEach((c) => c.kill());
  setTimeout(() => process.exit(code), 200);
};
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

if (mode === "build") {
  const b = spawn(process.execPath, [viteBin, "build"], { cwd: root, env, stdio: "inherit" });
  b.on("exit", (code) => process.exit(code ?? 1));
} else {
  if (mode === "preview" && !existsSync(new URL("../dist/index.html", import.meta.url))) {
    console.error("No production build found. Run: pnpm run build:lan");
    process.exit(1);
  }
  // A dropped buzzer phone shows as disconnected after 8 s instead of the relay's 30 s default (see serve.mjs).
  run("relay", relayBin, [], { PORT: String(relayPort), AIR_JAM_CONTROLLER_RESUME_LEASE_MS: process.env.AIR_JAM_CONTROLLER_RESUME_LEASE_MS ?? "8000" });
  run("web", viteBin, mode === "preview" ? ["preview", "--host", "--port", String(webPort), "--strictPort"] : ["--host", "--port", String(webPort), "--strictPort"]);
  console.log("");
  console.log(`  Moderator console   http://localhost:${webPort}/host`);
  console.log(`  Phones join at      ${publicHost}/join`);
  console.log(`  Relay               http://localhost:${relayPort}`);
  if (!ip) console.log("  WARNING: no LAN address found. Phones cannot join until you set FEUD_HOST=<laptop IP>.");
  console.log("");
}
