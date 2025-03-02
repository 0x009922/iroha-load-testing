import { assert } from '@std/assert/assert'
import { ApiMsg, LogMsg, PeerNameStatus, PeerStatus } from './shared.ts'

export interface PeersStatus {
  peers: PeerNameStatus[]
}

interface Client {
  send: (msg: ApiMsg) => void
}

export function run(init: PeersStatus): AsyncDisposable & {
  setStatus: (state: PeersStatus) => void
  updateStatus: (peer: string, status: Partial<PeerStatus>) => void
  sendLog: (msg: LogMsg) => void
  abort: () => Promise<void>
} {
  const status = init
  const clients = new Set<Client>()

  function broadcast(msg: ApiMsg) {
    for (const i of clients) i.send(msg)
  }

  const server = Deno.serve((req) => {
    if (req.headers.get('upgrade') != 'websocket') {
      return new Response(null, { status: 501 })
    }

    const { socket, response } = Deno.upgradeWebSocket(req)
    const client: Client = {
      send: (msg) => {
        socket.send(JSON.stringify(msg))
      },
    }
    clients.add(client)

    socket.addEventListener('open', () => {
      console.log('a client connected!')
      client.send({ t: 'status', status: status })
    })

    socket.addEventListener('message', (event) => {
      if (event.data === 'ping') {
        socket.send('pong')
      }
    })

    socket.addEventListener('close', () => {
      console.log('disconnected')
      clients.delete(client)
    })

    return response
  })

  return {
    setStatus: (value) => {
      status.peers = value.peers
      broadcast({ t: 'status', status })
    },
    updateStatus: (peer, statusUpdate) => {
      const found = status.peers.find((x) => x.name === peer)
      assert(found)
      Object.assign(found, statusUpdate)
      broadcast({ t: 'status', status })
    },
    sendLog: (msg) => {
      broadcast({ t: 'log', ...msg })
    },
    abort: () => server.shutdown(),
    async [Symbol.asyncDispose]() {
      await server.shutdown()
    },
  }
}
