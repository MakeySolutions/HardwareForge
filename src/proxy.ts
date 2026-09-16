import { NextResponse, type NextRequest } from "next/server";
import { checkRequest, TOKEN_COOKIE } from "@/lib/guard";

/**
 * Prva brana pre kazdy request (stranky, Server Actions, API).
 * Server Actions a Route Handlers to aj tak overuju samostatne cez
 * requireAuth()/isAuthorized() - odporucanie Next.js je nespoliehat sa
 * len na proxy.
 */
export function proxy(request: NextRequest) {
  const verdict = checkRequest({
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    token: request.cookies.get(TOKEN_COOKIE)?.value,
  });

  if (!verdict.ok) {
    return new NextResponse("Access denied", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  return NextResponse.next();
}

export const config = {
  // /api/upload je vynechany: proxy bufferuje telo requestu len do 10 MB
  // a vacsi subor by potichu orezal. Upload route overuje pristup sama.
  matcher: ["/((?!api/upload).*)"],
};
