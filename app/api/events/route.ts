import { sseBroker } from "@/lib/server/sse-broker"
import { gameStore } from "@/lib/server/game-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const clientId = sseBroker.addClient(controller)
      const snapshot = gameStore.getSnapshot()

      controller.enqueue(
        new TextEncoder().encode(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`),
      )

      const abort = () => {
        sseBroker.removeClient(clientId)
        try {
          controller.close()
        } catch {}
      }

      request.signal.addEventListener("abort", abort)
    },
    cancel() {},
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}