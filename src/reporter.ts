import { assert } from '@std/assert/assert'
import { PeerNameStatus, PeerStatus } from './shared.ts'
import { computed, effectScope, ref, watch } from 'vue'
import { tty } from 'https://deno.land/x/cliffy@v0.25.7/ansi/tty.ts'
import * as colors from '@std/fmt/colors'
import { unicodeWidth } from '@std/cli/unicode-width'

export interface PeersStatus {
  peers: PeerNameStatus[]
}

function filler(width: number, content: string) {
  const len = unicodeWidth(colors.stripAnsiCode(content))
  const fill = width - len
  return ' '.repeat(Math.max(0, fill))
}

export function createReporter(
  init: PeersStatus,
  opts: { queueCapacity: number },
): Disposable & {
  setStatus: (state: PeersStatus) => void
  updateStatus: (peer: string, status: Partial<PeerStatus>) => void
} {
  const scope = effectScope()

  const setup = scope.run(() => {
    const status = ref<PeersStatus>(init)

    const topBlock = computed(() => Math.max(...status.value.peers.map((x) => x.blocks)))

    const formatted = computed(() => {
      return status.value.peers.map((x) => {
        const peer = x.running ? colors.bgGreen(x.name) : colors.bgRed(x.name)

        const blocksStr = String(x.blocks)
        const blocksPad = filler(5, blocksStr) + blocksStr
        const blocksOk = topBlock.value - x.blocks < 2
        const blocks = blocksOk ? blocksPad : colors.red(blocksPad)

        const queueStr = String(x.queue)
        const queue = x.queue < opts.queueCapacity * 0.3
          ? queueStr
          : x.queue < opts.queueCapacity * 0.8
          ? colors.yellow(queueStr)
          : colors.red(queueStr)

        const totalTxs = x.transactions.accepted + x.transactions.rejected
        const txsStr = String(totalTxs)

        return `${filler(6, peer) + peer}   blocks: ${blocks}   queue: ${filler(5, queue) + queue}   total txs: ${
          filler(7, txsStr) + txsStr
        }`
      }).join('\n') + '\n'
    })

    function print(data: string) {
      tty.clearScreen.cursorTo(0, 0).text(data)
    }

    watch(formatted, (x) => print(x), { deep: true, immediate: true })

    return {
      setStatus: (value: PeersStatus) => status.value = value,
      updateStatus: (peer: string, value: Partial<PeerStatus>) => {
        const found = status.value.peers.find((x) => x.name === peer)
        assert(found)
        Object.assign(found, value)
      },
    }
  })
  assert(setup)

  return { ...setup, [Symbol.dispose]: () => scope.stop() }
}
