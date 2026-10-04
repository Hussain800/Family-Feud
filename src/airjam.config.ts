/**
 * Air Jam wiring. One host (the moderator page) and phone controllers.
 *
 * maxPlayers is a per-room cap sent to the server when the host creates the room. The SDK
 * protocol schema rejects anything above 16 (checked in scripts/probe-airjam.mjs), so 16 is
 * the most phones one room can hold. Phones are a crowd-assist extra; the board never needs them.
 */
import { createAirJamApp, env } from "@air-jam/sdk";
import { gameInputSchema } from "./game/input";

export const MAX_PHONES = 16;

export const airjam = createAirJamApp({
  runtime: { ...env.vite(import.meta.env), maxPlayers: MAX_PHONES },
  // The SDK builds join links as <public host>/controller?room=CODE. /join and /play/:code are
  // friendly aliases that land on the same controller (see app.tsx).
  controllerPath: "/controller",
  input: { schema: gameInputSchema },
});
