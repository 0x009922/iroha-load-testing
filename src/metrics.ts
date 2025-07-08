import { HttpTransport, WebSocketAPI, TelemetryAPI } from '@iroha/client'
import Emittery from 'emittery'
import * as types from '@iroha/core/data-model'
import { effectScope, getCurrentScope, onScopeDispose, reactive, watch } from 'vue'
import { assert } from '@std/assert/assert'
import { useTask, wheneverFulfilled, wheneverRejected } from '@vue-kakuyaku/core'

export type Metrics = {
  blocks: number
  transactions: number
  // what else?
}

// function useIntervalFn(fn: () => void, interval: number)

function useEvents(
  params: {
    ws: WebSocketAPI
    filters: types.EventFilterBox[]
    handler: (event: types.EventBox) => void
  },
) {
  const scope = getCurrentScope()
  assert(scope)

  const task = useTask(() =>
    params.ws.events({
      filters: params.filters,
    })
  )

  wheneverRejected(task.state, (err) => {
    console.debug('events failure', err)
  })

  wheneverFulfilled(task.state, (handle) => {
    handle.ee.on('event', params.handler)

    scope.run(() => {
      onScopeDispose(() => handle.stop())
    })
  })

  function reconnect() {
    if (!task.state.fulfilled && !task.state.pending) task.run()
  }

  reconnect()
  const id = setInterval(reconnect, 1_000)
  onScopeDispose(() => clearInterval(id))
}

function setup(
  peer: string,
  torii: URL,
  interval: number,
  events: Events,
) {
  const api = new TelemetryAPI(new HttpTransport(torii))
  const ws = new WebSocketAPI(torii)

  useEvents({
    ws,
    filters: [
      types.EventFilterBox.Pipeline.Transaction({
        status: null,
        blockHeight: null,
        hash: null,
      }),
    ],
    handler: (event) => {
      assert(event.kind === 'Pipeline' && event.value.kind === 'Transaction')
      events.emit('transaction-status', {
        peer,
        tx: event.value.value.hash.payload.hex(),
        status: event.value.value.status.kind,
      })
    },
  })

  async function collect() {
    try {
      const data = await api.status()
      events.emit('status', { peer, data })
    } catch {
      // no op
    }
  }

  collect()
  const id = setInterval(collect, interval)
  onScopeDispose(() => clearInterval(id))
}

export type Events = Emittery<
  {
    status: { peer: string; data: types.Status }
    'transaction-status': {
      peer: string
      tx: string
      status: types.TransactionStatus['kind']
    }
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

    watch(
      () => waitingGenesis.size === 0,
      (flag) => flag && events.emit('genesis-committed'),
    )

    for (const peer of peers) {
      setup(peer.name, peer.torii, interval, events)
    }
  })

  return {
    [Symbol.dispose]() {
      scope.stop()
    },
    events,
  }
}
