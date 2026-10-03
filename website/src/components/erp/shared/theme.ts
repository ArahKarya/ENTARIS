/*
 * Theme preference (ported from the ERP•AI site theme-boot.js + theme-toggle.js).
 * Light is the default. An explicit "dark" choice expires after 6 hours (DARK_MAX_MS), stamped in
 * `entaris-theme-dark-at`. The preference lives in both a cookie and localStorage, like the source.
 */
export type ErpTheme = "light" | "dark";

const STORAGE_KEY = "entaris-theme";
const DARK_AT_KEY = `${STORAGE_KEY}-dark-at`;
const DARK_MAX_MS = 6 * 60 * 60 * 1000;
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const isTheme = (v: string | null): v is ErpTheme => v === "light" || v === "dark";

function getCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(name: string, value: string, maxAge: number) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax`;
}
function deleteCookie(name: string) {
  document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
}
function getStore(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function setStore(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) — cookie still holds the preference */
  }
}
function deleteStore(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
function clearPreference() {
  deleteCookie(STORAGE_KEY);
  deleteCookie(DARK_AT_KEY);
  deleteStore(STORAGE_KEY);
  deleteStore(DARK_AT_KEY);
}

/** Resolves the stored preference exactly like theme-toggle.js `getResolvedPreference`. */
export function resolveTheme(): { theme: ErpTheme; explicit: boolean } {
  const cookiePref = getCookie(STORAGE_KEY);
  const storedPref = getStore(STORAGE_KEY);
  let pref: ErpTheme | null = null;
  if (isTheme(cookiePref)) pref = cookiePref;
  else {
    if (cookiePref) deleteCookie(STORAGE_KEY);
    if (isTheme(storedPref)) pref = storedPref;
    else {
      if (storedPref) deleteStore(STORAGE_KEY);
      if (storedPref || cookiePref) {
        deleteCookie(DARK_AT_KEY);
        deleteStore(DARK_AT_KEY);
      }
    }
  }
  if (pref === "dark") {
    const raw = getCookie(DARK_AT_KEY) || getStore(DARK_AT_KEY);
    const ts = raw ? parseInt(raw, 10) : NaN;
    if (Number.isNaN(ts)) {
      const now = String(Date.now());
      setCookie(DARK_AT_KEY, now, COOKIE_MAX_AGE);
      setStore(DARK_AT_KEY, now);
    } else if (Date.now() - ts > DARK_MAX_MS) {
      clearPreference();
      return { theme: "light", explicit: false };
    }
    return { theme: "dark", explicit: true };
  }
  if (pref === "light") {
    deleteCookie(DARK_AT_KEY);
    deleteStore(DARK_AT_KEY);
    return { theme: "light", explicit: true };
  }
  return { theme: "light", explicit: false };
}

/** Persists an explicit choice (theme-toggle.js `setTheme`). */
export function persistTheme(theme: ErpTheme) {
  setCookie(STORAGE_KEY, theme, COOKIE_MAX_AGE);
  setStore(STORAGE_KEY, theme);
  if (theme === "dark") {
    const now = String(Date.now());
    setCookie(DARK_AT_KEY, now, COOKIE_MAX_AGE);
    setStore(DARK_AT_KEY, now);
  } else {
    deleteCookie(DARK_AT_KEY);
    deleteStore(DARK_AT_KEY);
  }
}

/*
 * External store so React can read the stored preference without a setState-in-effect:
 * the server snapshot is "light" (the source's default); the client snapshot is resolved once.
 */
type ThemeState = { theme: ErpTheme; explicit: boolean };
const SERVER_STATE: ThemeState = { theme: "light", explicit: false };
let current: ThemeState | null = null;
const listeners = new Set<() => void>();

export const themeStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ThemeState {
    if (!current) current = resolveTheme();
    return current;
  },
  getServerSnapshot(): ThemeState {
    return SERVER_STATE;
  },
  set(theme: ErpTheme) {
    persistTheme(theme);
    current = { theme, explicit: true };
    listeners.forEach((l) => l());
  },
};
