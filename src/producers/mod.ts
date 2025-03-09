import Emittery from 'emittery'
import { assert } from '@std/assert/assert'
import { deadline } from '@std/async/deadline'
import { AccountPrep } from '../util.ts'
import { AccountId, KeyPair } from '@iroha/core/data-model'
import { PrivateKey, PublicKey } from '@iroha/core/crypto'
import { JsonValue } from 'npm:type-fest@^4.33.0'

export type ProducerParams = {
  chain: string
  peers: URL[]
  account: AccountPrep
  extra?: JsonValue
}

type ProducerParamsSer = {
  chain: string
  peers: string[]
  account: string
  accountPubKey: string
  accountPrivKey: string
  extra: JsonValue
}

function paramsSer(x: ProducerParams): ProducerParamsSer {
  return {
    chain: x.chain,
    peers: x.peers.map((x) => x.href),
    account: x.account.id.toString(),
    accountPubKey: x.account.key.publicKey().multihash(),
    accountPrivKey: x.account.key.privateKey().multihash(),
    extra: x.extra ?? null,
  }
}

function paramsDe(x: ProducerParamsSer): ProducerParams {
  const key = KeyPair.fromParts(
    PublicKey.fromMultihash(x.accountPubKey),
    PrivateKey.fromMultihash(x.accountPrivKey),
  )
  return {
    chain: x.chain,
    peers: x.peers.map((x) => new URL(x)),
    account: {
      id: AccountId.parse(x.account),
      key: key,
    },
    extra: x.extra,
  }
}

export interface Producer extends Disposable {
  events: Emittery<{ log: { msg: string; payload?: unknown } }>
}

type Message = { t: 'params'; params: ProducerParamsSer } | {
  t: 'log'
  msg: string
  payload?: unknown
}

export function start(
  scriptURL: string | URL,
  params: ProducerParams,
): Producer {
  const worker = new Worker(
    scriptURL,
    { type: 'module' },
  )
  const events: Producer['events'] = new Emittery()

  worker.postMessage(
    {
      t: 'params',
      params: paramsSer(params),
    } satisfies Message,
  )
  worker.addEventListener('error', (event) => {
    console.error('worker error', event.message)
  })
  worker.addEventListener('message', (event) => {
    const msg: Message = event.data
    if (msg.t === 'log') {
      events.emit('log', { msg: msg.msg, payload: msg.payload })
    }
  })

  return {
    [Symbol.dispose]: () => {
      worker.terminate()
      events.emit('log', { msg: 'terminated' })
    },
    events,
  }
}

export function workerReceiveParams(): Promise<ProducerParams> {
  return deadline(
    new Promise((resolve) => {
      self.addEventListener('message', (event) => {
        const msg: Message = event.data
        assert(msg.t === 'params')
        resolve(paramsDe(msg.params))
      })
    }),
    5_000,
  )
}

export function workerLog(msg: string, payload?: unknown) {
  self.postMessage({ t: 'log', msg, payload } satisfies Message)
}
