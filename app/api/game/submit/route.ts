import { gameStore } from "@/lib/server/game-store"
import { sseBroker } from "@/lib/server/sse-broker"
import type { SubmitRequestBody } from "@/lib/shared/types"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubmitRequestBody
    const result = await gameStore.submit(body)

    sseBroker.broadcast("leaderboard_updated", result.snapshot)
    sseBroker.broadcast("submission_received", {
      userName: result.player.userName,
      submittedWord: result.player.submittedWord,
      submittedAt: result.player.submittedAt,
      bestSimilarity: result.player.bestSimilarity,
      tryCount: result.player.tryCount,
      submitOrder: result.player.submitOrder,
    })

    return Response.json({
      ok: true,
      player: result.player,
      snapshot: result.snapshot,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "제출 처리 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}