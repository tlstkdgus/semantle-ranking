import { gameStore } from "@/lib/server/game-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  return Response.json({
    ok: true,
    snapshot: gameStore.getSnapshot(),
  })
}