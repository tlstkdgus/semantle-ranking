export const runtime = "nodejs"

export async function POST(request: Request) {
  const adminPassword = process.env.ADMIN_PASSWORD
  if (!adminPassword) {
    return Response.json({ ok: true, message: "비밀번호 미설정 — 인증 불필요" })
  }

  const body = await request.json()
  const password = String(body.password ?? "")

  if (password !== adminPassword) {
    return Response.json({ ok: false, message: "비밀번호가 틀렸습니다." }, { status: 401 })
  }

  const res = Response.json({ ok: true })
  res.headers.set(
    "Set-Cookie",
    `admin_token=${adminPassword}; Path=/; HttpOnly; SameSite=Strict; Max-Age=86400`,
  )
  return res
}
