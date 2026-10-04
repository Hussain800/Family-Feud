// crypto.randomUUID needs a secure context; the console may be opened over a LAN http address.
export const newId = (): string =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/[^\w-]/g, "").slice(0, 36);
