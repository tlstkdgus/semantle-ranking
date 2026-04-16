import { gameStore } from "@/lib/server/game-store"
import { getSessionUser } from "@/lib/server/user-store"
import { sseBroker } from "@/lib/server/sse-broker"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const userName = getSessionUser(request)
    if (!userName) {
      return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 })
    }

    const result = await gameStore.cancelSubmit(userName)
    sseBroker.broadcast("leaderboard_updated", result.snapshot)
    sseBroker.broadcast("submission_cancelled", { userName: result.player.userName })

    return Response.json({ ok: true, player: result.player, snapshot: result.snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "제출 취소 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}
