import { Client } from '@iroha/client'
import { workerLog, workerReceiveParams } from './mod.ts'
import { sample } from 'jsr:@std/collections@^1.0.9/sample'
import { assert } from '@std/assert/assert'
import {
  AssetDefinitionId,
  AssetId,
  AssetType,
  Executable,
  InstructionBox,
  Mintable,
  Name,
} from '@iroha/core/data-model'
import { delay } from '@std/async/delay'
import { pooledMap } from '@std/async/pool'
import { format as formatDuration } from '@std/fmt/duration'

const params = await workerReceiveParams()

const clients = params.peers.map((peer) =>
  new Client({
    chain: params.chain,
    toriiBaseURL: peer,
    accountDomain: params.account.id.domain,
    accountKeyPair: params.account.key,
  })
)

function getClient() {
  const item = sample(clients)
  assert(item)
  return item
}

const asset = new AssetDefinitionId(new Name('test'), params.account.id.domain)

workerLog('registering an asset')
await getClient().transaction(
  Executable.Instructions([
    InstructionBox.Register.AssetDefinition({
      id: asset,
      logo: null,
      metadata: [],
      mintable: Mintable.Infinitely,
      type: AssetType.Numeric({ scale: 0 }),
    }),
  ]),
).submit({ verify: true })

async function fireRandomTransaction() {
  const client = sample(clients)
  assert(client)
  await client.transaction(
    Executable.Instructions([
      InstructionBox.Mint.Asset({
        object: { scale: 0n, mantissa: BigInt(~~(Math.random() * 1_000_000)) },
        destination: new AssetId(params.account.id, asset),
      }),
    ]),
  ).submit({ verify: false })
}

function* rangeGen(count: number) {
  let i = 0
  while (i < count) yield i++
}

const TPS = 2000
const CHUNK = 200
const POOL_LIMIT = 50

let total = 0

setInterval(async () => {
  for await (
    const _ of pooledMap(
      POOL_LIMIT,
      rangeGen(CHUNK),
      async () => {
        try {
          await fireRandomTransaction()
          total++
        } catch {
          // ignore
        }
      },
    )
  ) {
    // no op
  }
}, 1000 / (TPS / CHUNK))

setInterval(() => {
  workerLog('transactions submitted', { count: total })
}, 500)
