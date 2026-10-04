// One public address for everything: the Air Jam relay (sockets) and the built game (dist/) on a single port.
// Used on Render (see render.yaml) or any machine with Node. Build first: pnpm run build.   Run: pnpm run serve
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createAirJamServer } from "@air-jam/server";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
if (!existsSync(join(DIST, "index.html"))) {
  console.error("dist/ is missing. Run `pnpm run build` first.");
  process.exit(1);
}

// A production Node process makes Air Jam demand app registration. This club game runs its own relay with no
// accounts, so say so out loud rather than failing to start. The relay only ever sees the public board state.
if (!process.env.AIR_JAM_AUTH_MODE) {
  process.env.AIR_JAM_AUTH_MODE = "disabled";
  console.warn("AIR_JAM_AUTH_MODE not set: running the relay with app authentication disabled.");
}

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

const server = createAirJamServer();
// Added after the relay's own routes (/health) and before its 404: any other GET is the game or one of its client-side routes.
server.app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  let path;
  try {
    path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  } catch {
    return res.status(400).end();
  }
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) return res.status(403).end();
  if (!(existsSync(file) && statSync(file).isFile())) {
    if (extname(path)) return next(); // a missing asset is a real 404
    file = join(DIST, "index.html"); // /host, /screen/ABCD, /join ... are routes inside the app
  }
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.setHeader("Cache-Control", file.includes(`${sep}assets${sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");
  createReadStream(file).pipe(res);
});

const port = await server.start(Number(process.env.PORT) || 4000);
console.log(`Family Feud is up on port ${port}: the game and the relay share it.`);
