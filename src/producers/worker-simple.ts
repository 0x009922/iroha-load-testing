import { Client } from '@iroha/client'
import { workerLog, workerReceiveParams } from './mod.ts'
import { AssetDefinitionId, AssetId, Executable, InstructionBox, Name } from '@iroha/core/data-model'
import { delay, pooledMap } from '@std/async'

const params = await workerReceiveParams()

const clients = params.peers.map((peer) =>
  new Client({
    chain: params.chain,
    toriiBaseURL: peer,
    authority: params.account.id,
    authorityPrivateKey: params.account.key.privateKey()
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

const TXS = 1000
const DELAY = 5000
const ROUNDS = 500

for (let i = 0; i < ROUNDS; i++) {
 await Array.fromAsync(pooledMap(30, lazyRange(TXS), async () => {


    try {await fireRandomTransaction(clients.at(0)!)} catch {}
  })) 
  await delay(DELAY)
  console.log('finish round', i + 1)
}

