import { gameStore } from "@/lib/server/game-store"
import { sseBroker } from "@/lib/server/sse-broker"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const userName = String(body.userName ?? "").trim()
    console.log(request);

    if (!userName) {
      return Response.json({ ok: false, message: "userName은 필수입니다." }, { status: 400 })
    }

    const player = gameStore.wait(userName)
    const snapshot = gameStore.getSnapshot()

    sseBroker.broadcast("leaderboard_updated", snapshot)
    sseBroker.broadcast("player_waiting", {
      userName: player.userName,
      status: player.status,
      waitingAt: player.waitingAt,
    })

    return Response.json({
      ok: true,
      player: {
        userName: player.userName,
        status: player.status,
        waitingAt: player.waitingAt,
      },
      snapshot,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "대기 처리 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json()
    const userName = String(body.userName ?? "").trim()

    if (!userName) {
      return Response.json({ ok: false, message: "userName은 필수입니다." }, { status: 400 })
    }

    const player = gameStore.waitCancel(userName)
    const snapshot = gameStore.getSnapshot()

    sseBroker.broadcast("leaderboard_updated", snapshot)

    return Response.json({
      ok: true,
      player: {
        userName: player.userName,
        status: player.status,
        waitingAt: player.waitingAt,
      },
      snapshot,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "대기 취소 처리 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}