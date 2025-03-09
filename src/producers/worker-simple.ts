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
import { pooledMap } from '@std/async/pool'
import { z } from 'zod'
import { delay } from '@std/async/delay'

const params = await workerReceiveParams()

const extraParamsSchema = z.object({ tps: z.number(), chunk: z.number() })
const extraParams = extraParamsSchema.parse(
  params.extra,
)

export type ExtraParams = z.input<typeof extraParamsSchema>

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

async function fireRandomTransaction(client: Client) {
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

const POOL_LIMIT = 50

function* rotateClients() {
  let i = 0
  while (true) {
    yield { i, client: clients[i] }
    i = (i + 1) % clients.length
  }
}


let j = 0
for (const { i, client } of rotateClients()) {
  await Array.fromAsync({ length: 10 }, async () => {
    try {
      await fireRandomTransaction(client)
    } catch {}
  })
  workerLog('submitted', { client: i, num: 10 })

  await delay(250)
  // if (++j > 30) {
  //   j = 0
  //   await delay(10_000)
  // }
}

// let total = 0

// setInterval(async () => {
//   // console.time('chunk')
//   for await (
//     const _ of pooledMap(
//       POOL_LIMIT,
//       rangeGen(extraParams.chunk),
//       async () => {
//         try {
//           await fireRandomTransaction()
//           total++
//         } catch {
//           // ignore
//         }
//       },
//     )
//   ) {
//     // no op
//   }
//   // console.timeEnd('chunk')
// }, 1000 / (extraParams.tps / extraParams.chunk))

// setInterval(() => {
//   workerLog('transactions submitted', { count: total })
// }, 500)
