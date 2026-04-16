import { userStore, clearUserCookie, getSessionUser } from "@/lib/server/user-store"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? ""
  const match = cookieHeader.match(/(?:^|;\s*)user_token=([^;]+)/)
  const token = match?.[1]
  if (token) userStore.logout(token)

  const res = Response.json({ ok: true })
  res.headers.set("Set-Cookie", clearUserCookie())
  return res
}
