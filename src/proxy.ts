import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "www.webresume.tech";
const REDIRECT_HOSTS = new Set(["webresume.tech"]);

export function proxy(request: NextRequest) {
  const hostHeader = request.headers.get("host") ?? "";
  const host = hostHeader.split(":")[0].toLowerCase();

  if (REDIRECT_HOSTS.has(host)) {
    const url = request.nextUrl.clone();
    url.protocol = "https";
    url.host = CANONICAL_HOST;

    return NextResponse.redirect(url, 301);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/:path*"],
};