// Shared server-side helpers for talking to NSE (nseindia.com).
//
// NSE rejects bare API calls, so we prime cookies from the site with browser-like
// headers, then reuse them on the JSON endpoints. Cookies are cached and
// re-primed on 401/403.

const NSE_HOME = "https://www.nseindia.com/market-data/live-market-indices";

export const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

let cookieJar = { cookie: "", ts: 0 };
const COOKIE_TTL = 5 * 60_000;

async function primeCookies(force = false): Promise<string> {
  if (!force && cookieJar.cookie && Date.now() - cookieJar.ts < COOKIE_TTL) return cookieJar.cookie;
  const r = await fetch(NSE_HOME, {
    headers: { ...BROWSER_HEADERS, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
    cache: "no-store",
  });
  const setCookies: string[] =
    (r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
    (r.headers.get("set-cookie") ? [r.headers.get("set-cookie") as string] : []);
  const cookie = setCookies
    .map((c) => c.split(";")[0])
    .filter(Boolean)
    .join("; ");
  cookieJar = { cookie, ts: Date.now() };
  return cookie;
}

/** GET a NSE JSON API path with cookie priming + one retry on auth failure. */
export async function nseFetchJson<T>(apiUrl: string): Promise<T> {
  const doFetch = (cookie: string) =>
    fetch(apiUrl, {
      headers: { ...BROWSER_HEADERS, Accept: "application/json, text/plain, */*", Referer: NSE_HOME, Cookie: cookie },
      cache: "no-store",
    });

  let cookie = await primeCookies();
  let res = await doFetch(cookie);
  if (res.status === 401 || res.status === 403) {
    cookie = await primeCookies(true);
    res = await doFetch(cookie);
  }
  if (!res.ok) {
    const err = new Error(`NSE responded ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/** Parse NSE's comma-formatted numeric strings (and plain numbers) safely. */
export const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return isFinite(n) ? n : NaN;
};
