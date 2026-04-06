import { gameStore } from "@/lib/server/game-store"
import { sseBroker } from "@/lib/server/sse-broker"

export const runtime = "nodejs"

export async function POST() {
  await gameStore.endGameEarly()
  const snapshot = gameStore.getSnapshot()
  await gameStore.persistCurrentState()
  sseBroker.broadcast("game_state_changed", snapshot)
  sseBroker.broadcast("leaderboard_updated", snapshot)

  return Response.json({ ok: true, snapshot })
}