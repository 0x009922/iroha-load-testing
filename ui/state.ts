import { useWebSocket } from '@vueuse/core'
import { reactive, ref, watch, watchEffect } from 'vue'
import { ApiMsg, PeerStatus } from '../cli/shared.ts'

interface LogMsg {
  date: string
  msg: string
}

export interface State {
  connected: boolean
  peers: (PeerStatus & { name: string })[]
  messages: LogMsg[]
}

const { status, data, open } = useWebSocket(`ws://${location.host}/ws`, {
  autoReconnect: true,
  autoConnect: false,
})

export { open as connect }

watch(data, (chunk) => {
  try {
    if (!chunk) return
    const msg: ApiMsg = JSON.parse(chunk)
    if (msg.t === 'status') {
      state.peers = msg.status.peers
    }
    if (msg.t === 'log') state.messages.push(msg)
  } catch (err) {
    console.error('cannot parse data chunk', chunk, err)
  }
}, { immediate: true })

export const state = reactive<State>({
  peers: [],
  messages: [],
  connected: false,
})

watch(status, (status) => {
  if (status === 'CLOSED') {
    state.peers = []
    state.connected = false
  } else if (status === 'OPEN') {
    state.connected = true
  }
}, { immediate: true })
