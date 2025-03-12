import { Client } from '@iroha/client'
import { workerLog, workerReceiveParams } from './mod.ts'
import { AssetDefinitionId, AssetId, Executable, InstructionBox, Name } from '@iroha/core/data-model'
import { delay, pooledMap } from '@std/async'

const params = await workerReceiveParams()

const clients = params.peers.map((peer) =>
  new Client({
    chain: params.chain,
    toriiBaseURL: peer,
    accountDomain: params.account.id.domain,
    accountKeyPair: params.account.key,
  })
)

const asset = new AssetDefinitionId(new Name('test'), params.account.id.domain)

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

function* lazyRange(len: number) {
  for (let i = 0; i < len; i++) yield i
}

const TXS_START = 25
const TXS_INC = 25
let amount = TXS_START

const DELAY = 250
while (true) {
  const stats = { ok: 0, err: 0 }
  await Array.fromAsync(clients, async (client) => {
    await Array.fromAsync(pooledMap(10, lazyRange(amount), async () => {
      try {
        await fireRandomTransaction(client)
        stats.ok++
      } catch {
        stats.err++
      }
    }))
  })
  workerLog('submitted', { num: stats.ok + stats.err, ...stats })
  amount += TXS_INC

  await delay(DELAY)
}
