export const runtime = "nodejs"

export async function POST() {
  const res = Response.json({ ok: true })
  res.headers.set("Set-Cookie", "admin_token=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")
  return res
}
