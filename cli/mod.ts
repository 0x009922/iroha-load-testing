import * as types from '@iroha/core/data-model'
import { run as runServer } from './state-api.ts'
import * as R from 'remeda'
import { ensureDir } from '@std/fs'
import * as path from '@std/path'
import * as colors from '@std/fmt/colors'
import * as TOML from '@std/toml'
import { startPeer } from './iroha-bin.ts'
import { useMetrics } from './metrics.ts'
import { useLogger } from './logger.ts'
import { kpToJson } from './shared.ts'
import { start } from './producers/mod.ts'
import { generateGenesis } from './genesis.ts'
import { getCodec } from '@iroha/core/codec'
import { delay } from '@std/async/delay'

const RUN_TIME = new Date().toISOString()
const START_PORT = 8010
const RUN_DIR = `./run/${RUN_TIME}`
const BIN_KAGAMI = path.resolve('../iroha/target/release/', 'kagami')
const BIN_IROHAD = path.resolve('../iroha/target/release/', 'irohad')
const BIN_CODEC = path.resolve('../iroha/target/release/', 'iroha_codec')
const EXECUTOR_PATH = path.resolve('../iroha/defaults/executor.wasm')
const CHAIN = 'perf'
const PEERS = 4
const METRICS_INTERVAL = 300
const LOG_FILTER = 'info,iroha_core::queue=trace'

const peers = R.times(PEERS, (i) => {
  const kp = types.KeyPair.random()
  const portApi = i * 2 + START_PORT
  const portP2p = i * 2 + START_PORT + 1
  const label = `peer_${i}`
  const isGenesis = i === 0
  const publicAddress = `localhost:${portP2p}`
  const toriiURL = new URL(`http://localhost:${portApi}`)
  const env: Record<string, string> = {
    P2P_ADDRESS: publicAddress,
    P2P_PUBLIC_ADDRESS: publicAddress,
    API_ADDRESS: `localhost:${portApi}`,
    PUBLIC_KEY: kp.publicKey().multihash(),
    PRIVATE_KEY: kp.privateKey().multihash(),
    KURA_STORE_DIR: path.join(RUN_DIR, `store_${label}`),
  }
  return { kp, portApi, label, isGenesis, env, publicAddress, toriiURL }
})

const { block: genesisBlock, genesisKeyPair, account: adminAccount } =
  await generateGenesis({
    kagami: BIN_KAGAMI,
    codec: BIN_CODEC,
    executorPath: EXECUTOR_PATH,
    peers: peers.map((x) => ({
      publicKey: x.kp.publicKey().multihash(),
      torii: x.toriiURL.href,
    })),
    chain: CHAIN,
  })

const sharedConfig = {
  chain: CHAIN,
  genesis: { public_key: genesisKeyPair.publicKey().multihash() },
  trusted_peers: peers.map((x) =>
    `${x.kp.publicKey().multihash()}@${x.publicAddress}`
  ),
  logger: {
    level: LOG_FILTER,
    format: 'json',
  },
  snapshot: { mode: 'disabled' },
  queue: { capacity: 5000 },
}

console.log('  ' + colors.green(`create ${colors.bold(RUN_DIR)}`))
await ensureDir(RUN_DIR)
await Deno.writeTextFile(
  path.join(RUN_DIR, 'run.json'),
  JSON.stringify(
    {
      date: RUN_TIME,
      genesisKeyPair: kpToJson(genesisKeyPair),
      peers: peers.map((x) => ({
        ...R.omit(x, ['kp']),
        keyPair: kpToJson(x.kp),
      })),
    },
    null,
    2,
  ),
)
const configPath = path.join(RUN_DIR, 'iroha_shared.toml')
await Deno.writeTextFile(configPath, TOML.stringify(sharedConfig))

const genesisPath = path.join(RUN_DIR, 'genesis.scale')
await Deno.writeFile(
  genesisPath,
  getCodec(types.SignedBlock).encode(genesisBlock),
)

await using logger = await useLogger(path.join(RUN_DIR, 'log.json'))
await using api = runServer({
  peers: peers.map((x) => ({
    name: x.label,
    blocks: 0,
    transactions: { accepted: 0, rejected: 0 },
    running: false,
    queue: 0,
    peers: 0,
    viewChanges: 0,
  })),
})
const log = (msg: string, payload?: unknown) => {
  logger.emit(msg, payload)
  api.sendLog({
    date: new Date().toISOString(),
    msg: `${msg} ${Deno.inspect(payload, { colors: false, depth: 1 })}`,
  })
}

const peersSpawned = peers.map((peer) => {
  const envs = { ...peer.env }
  if (peer.isGenesis) envs.GENESIS = genesisPath

  const spawned = startPeer({
    bin: BIN_IROHAD,
    configPath: configPath,
    envs,
    stdoutPath: path.join(RUN_DIR, `${peer.label}_stdout.json`),
    stderrPath: path.join(RUN_DIR, `${peer.label}_stderr`),
  })

  spawned.events.on('exit', ({ code }) => {
    log('peer exited', { peer: peer.label, code })
    api.updateStatus(peer.label, { running: false })
  })

  spawned.events.on('msg', (msg) => {
    log('peer message', { msg, peer: peer.label })
  })

  log(`started peer`, { peer: peer.label })
  api.updateStatus(peer.label, { running: true })

  return spawned
})

await using _peersCleanup = {
  [Symbol.asyncDispose]: async () => {
    await Promise.all(peersSpawned.map((x) => x[Symbol.asyncDispose]()))
  },
}

using metrics = useMetrics(
  peers.map((x) => ({ name: x.label, torii: x.toriiURL })),
  METRICS_INTERVAL,
)

metrics.events.on('status', ({ peer, data }) => {
  log('gathered metrics', { peer, data })
  api.updateStatus(peer, {
    blocks: Number(data.blocks),
    transactions: {
      accepted: Number(data.txsAccepted),
      rejected: Number(data.txsRejected),
    },
    queue: Number(data.queueSize),
    peers: Number(data.peers),
    viewChanges: Number(data.viewChanges),
  })
})

log('set up done, waiting for genesis...')
await metrics.events.once('genesis-committed')

log('starting producer...')
using producer = start(
  new URL('./producers/worker-simple.ts', import.meta.url),
  {
    chain: CHAIN,
    peers: peers.map((x) => x.toriiURL),
    account: adminAccount,
  },
)

producer.events.on('log', ({ msg, payload }) => log(`Worker: ${msg}`, payload))

await delay(1_000_000_000)
