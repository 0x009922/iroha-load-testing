import { ApiTelemetry, HttpTransport } from '@iroha/client'
import Emittery from 'emittery'
import { Status } from '@iroha/core/data-model'
import { effectScope, onScopeDispose, reactive } from 'vue'
import { whenever } from '@vueuse/core'

export type Metrics = {
  blocks: number
  transactions: number
  // what else?
}

function setup(
  torii: URL,
  interval: number,
  events: EventsSingle,
) {
  const api = new ApiTelemetry(new HttpTransport(torii))

  async function collect() {
    try {
      const data = await api.status()
      events.emit('status', data)
    } catch {
      // console.error("failed to get status:", err)
    }
  }

  collect()
  const id = setInterval(collect, interval)

  onScopeDispose(() => clearInterval(id))
}

type EventsSingle = Emittery<{ status: Status }>
export type Events = Emittery<
  {
    status: { peer: string; data: Status }
    'genesis-committed': undefined
  }
>

export function useMetrics(
  peers: { torii: URL; name: string }[],
  interval: number,
): Disposable & { events: Events } {
  const events: Events = new Emittery()
  const scope = effectScope()

  scope.run(() => {
    const waitingGenesis = reactive(new Set<string>(peers.map((x) => x.name)))

    events.on('status', (status) => {
      if (status.data.blocks >= 1n) waitingGenesis.delete(status.peer)
    })

    whenever(
      () => waitingGenesis.size === 0,
      () => events.emit('genesis-committed'),
    )

    for (const peer of peers) {
      const e: EventsSingle = new Emittery()
      e.on(
        'status',
        (status) => events.emit('status', { peer: peer.name, data: status }),
      )
      setup(peer.torii, interval, e)
    }
  })

  return {
    [Symbol.dispose]() {
      scope.stop()
    },
    events,
  }
}
