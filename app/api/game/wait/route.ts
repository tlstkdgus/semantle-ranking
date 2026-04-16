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

    const player = gameStore.wait(userName)
    const snapshot = gameStore.getSnapshot()

    sseBroker.broadcast("leaderboard_updated", snapshot)
    sseBroker.broadcast("player_waiting", {
      userName: player.userName,
      status: player.status,
      waitingAt: player.waitingAt,
    })

    return Response.json({ ok: true, player, snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "대기 처리 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const userName = getSessionUser(request)
    if (!userName) {
      return Response.json({ ok: false, message: "로그인이 필요합니다." }, { status: 401 })
    }

    const player = gameStore.waitCancel(userName)
    const snapshot = gameStore.getSnapshot()

    sseBroker.broadcast("leaderboard_updated", snapshot)

    return Response.json({ ok: true, player, snapshot })
  } catch (error) {
    const message = error instanceof Error ? error.message : "대기 취소 처리 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}
