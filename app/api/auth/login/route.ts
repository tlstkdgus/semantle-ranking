import { userStore, makeUserCookie } from "@/lib/server/user-store"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const username = String(body.username ?? "").trim()
    const password = String(body.password ?? "")

    const token = await userStore.login(username, password)

    const res = Response.json({ ok: true, username })
    res.headers.set("Set-Cookie", makeUserCookie(token))
    return res
  } catch (error) {
    const message = error instanceof Error ? error.message : "로그인에 실패했습니다."
    return Response.json({ ok: false, message }, { status: 401 })
  }
}
