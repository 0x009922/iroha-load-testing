import { Client } from '@iroha/client'
import { workerLog, workerReceiveParams } from './mod.ts'
import { AssetDefinitionId, AssetId, Executable, InstructionBox, Name } from '@iroha/core/data-model'
import { delay } from '@std/async/delay'

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

function* rotateClients() {
  let i = 0
  while (true) {
    yield { i, client: clients[i] }
    i = (i + 1) % clients.length
  }
}

const AMOUNT = 10
const DELAY = 250
for (const { i, client } of rotateClients()) {
  const stats = { ok: 0, err: 0 }
  await Array.fromAsync({ length: AMOUNT }, async () => {
    try {
      await fireRandomTransaction(client)
      stats.ok++
    } catch {
      stats.err++
    }
  })
  workerLog('submitted', { client: i, num: AMOUNT, ...stats })

  await delay(DELAY)
}
