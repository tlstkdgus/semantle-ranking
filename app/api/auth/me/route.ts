import { getSessionUser } from "@/lib/server/user-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const username = getSessionUser(request)
  if (!username) {
    return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 })
  }
  return Response.json({ ok: true, username })
}
