import { gameStore } from "@/lib/server/game-store"
import { sseBroker } from "@/lib/server/sse-broker"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const body = await request.json()
  const scheduledStartAt = Number(body.scheduledStartAt)
  const durationMinutes = Number(body.durationMinutes)

  if (!Number.isFinite(scheduledStartAt)) {
    return Response.json({ ok: false, message: "scheduledStartAt은 숫자여야 합니다." }, { status: 400 })
  }

  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return Response.json({ ok: false, message: "durationMinutes는 0보다 큰 숫자여야 합니다." }, { status: 400 })
  }

  gameStore.setGame({ scheduledStartAt, durationMinutes })

  const snapshot = gameStore.getSnapshot()
  await gameStore.persistCurrentState()
  sseBroker.broadcast("game_state_changed", snapshot)
  sseBroker.broadcast("leaderboard_updated", snapshot)

  return Response.json({ ok: true, snapshot })
}