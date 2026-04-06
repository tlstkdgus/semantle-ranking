import { NextResponse } from "next/server"
import { gameStore } from "@/lib/server/game-store"

export async function POST() {
  try {
    const snapshot = await gameStore.reset()

    return NextResponse.json({
      ok: true,
      snapshot,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "초기화 중 오류가 발생했습니다.",
      },
      { status: 500 },
    )
  }
}