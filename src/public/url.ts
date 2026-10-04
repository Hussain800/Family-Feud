/** True when a join link points at this machine only, so a phone could never open it. */
export const isLocalOnly = (url: string | null): boolean => {
  try {
    const h = new URL(url ?? "").hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  } catch {
    return true;
  }
};

export const hostOf = (url: string | null): string => {
  try {
    return new URL(url ?? "").host;
  } catch {
    return "";
  }
};

export const roomUrl = (code: string): string => `/controller?room=${encodeURIComponent(code)}`;
