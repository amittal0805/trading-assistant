import { NextRequest, NextResponse } from "next/server";

// Basic-auth gate for the whole app. Active only when APP_PASSWORD is set
// (e.g. on Render). Local dev without the env var is unaffected.
export function middleware(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) return NextResponse.next();

  // Allow external cron schedulers to trigger the EOD snapshot with ?key=
  if (
    req.nextUrl.pathname === "/api/eod" &&
    req.nextUrl.searchParams.get("key") === password
  ) {
    return NextResponse.next();
  }

  const user = process.env.APP_USER ?? "trader";
  const expected = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

  if (req.headers.get("authorization") === expected) return NextResponse.next();

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Trading Assistant"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
