import { gameStore } from "@/lib/server/game-store"
import { sseBroker } from "@/lib/server/sse-broker"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const userName = String(body.userName ?? "").trim()
    if (!userName) {
      return Response.json({ ok: false, message: "userName은 필수입니다." }, { status: 400 })
    }

    const result = await gameStore.cancelSubmit(userName)
    sseBroker.broadcast("leaderboard_updated", result.snapshot)
    sseBroker.broadcast("submission_cancelled", {
      userName: result.player.userName,
    })

    return Response.json({ ok: true, player: result.player, snapshot: result.snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "제출 취소 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}