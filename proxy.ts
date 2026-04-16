import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ── 참가자 페이지 보호 ──────────────────────────────────────
  if (pathname === "/") {
    const userToken = request.cookies.get("user_token")?.value
    if (!userToken) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // ── 관리자 페이지 보호 ──────────────────────────────────────
  const adminPassword = process.env.ADMIN_PASSWORD
  if (adminPassword && pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("admin_token")?.value
    if (token !== adminPassword) {
      const loginUrl = new URL("/admin/login", request.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/admin/:path*"],
}
