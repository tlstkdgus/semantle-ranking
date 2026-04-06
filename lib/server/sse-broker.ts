type Client = {
  id: string
  controller: ReadableStreamDefaultController<Uint8Array>
}

const encoder = new TextEncoder()

class SseBroker {
  private clients = new Map<string, Client>()

  addClient(controller: ReadableStreamDefaultController<Uint8Array>) {
    const id = crypto.randomUUID()
    this.clients.set(id, { id, controller })
    this.sendToClient(id, "connected", { ok: true, clientId: id })
    return id
  }

  removeClient(id: string) {
    this.clients.delete(id)
  }

  broadcast(event: string, data: unknown) {
    const payload = this.format(event, data)
    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(payload)
      } catch {
        this.clients.delete(id)
      }
    }
  }

  heartbeat() {
    const payload = encoder.encode(`event: heartbeat\ndata: {"ts":${Date.now()}}\n\n`)
    for (const [id, client] of this.clients) {
      try {
        client.controller.enqueue(payload)
      } catch {
        this.clients.delete(id)
      }
    }
  }

  private sendToClient(id: string, event: string, data: unknown) {
    const client = this.clients.get(id)
    if (!client) return
    client.controller.enqueue(this.format(event, data))
  }

  private format(event: string, data: unknown) {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
}

declare global {
  var __gameSseBroker__: SseBroker | undefined
  var __gameSseHeartbeat__: NodeJS.Timeout | undefined
}

export const sseBroker = globalThis.__gameSseBroker__ ?? new SseBroker()

if (!globalThis.__gameSseBroker__) {
  globalThis.__gameSseBroker__ = sseBroker
}

if (!globalThis.__gameSseHeartbeat__) {
  globalThis.__gameSseHeartbeat__ = setInterval(() => {
    sseBroker.heartbeat()
  }, 15000)
}