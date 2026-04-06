import { gameStore } from "@/lib/server/game-store"
import { sseBroker } from "@/lib/server/sse-broker"

export const runtime = "nodejs"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const answerWord = String(body.answerWord ?? "").trim()

    if (!answerWord) {
      return Response.json({ ok: false, message: "answerWord는 필수입니다." }, { status: 400 })
    }

    const result = await gameStore.revealAnswer(answerWord)

    sseBroker.broadcast("answer_revealed", result)

    return Response.json({
      ok: true,
      answerWord: result.answerWord,
      finalResults: result.finalResults,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "정답 등록 중 오류가 발생했습니다."
    return Response.json({ ok: false, message }, { status: 400 })
  }
}