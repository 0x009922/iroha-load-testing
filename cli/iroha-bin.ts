import * as types from '@iroha/core/data-model'
import { assert } from '@std/assert'
import Emittery from 'emittery'
import { getCodec } from '@iroha/core'

export interface Kagami {
  signGenesis: (json: string, key: types.KeyPair) => Promise<types.SignedBlock>
}

export interface IrohaCodec {
  scaleToJson: (type: string, data: Uint8Array) => Promise<unknown>
}

export function useKagami(bin: string): Kagami {
  return {
    signGenesis: async (json, key) => {
      const genesisJsonPath = await Deno.makeTempFile()
      await Deno.writeTextFile(genesisJsonPath, json)

      const { code, stdout } = await new Deno.Command(bin, {
        args: [
          `genesis`,
          `sign`,
          genesisJsonPath,
          `--public-key`,
          key.publicKey().multihash(),
          `--private-key`,
          key.privateKey().multihash(),
        ],
        stderr: 'inherit',
        stdout: 'piped',
        stdin: 'null',
      }).output()
      assert(code === 0, `kagami exited with non-zero code`)

      const block = getCodec(types.SignedBlock).decode(stdout)

      return block
    },
  }
}

export function useIrohaCodec(bin: string): IrohaCodec {
  return {
    scaleToJson: async (type, scale) => {
      const child = new Deno.Command(bin, {
        args: ['scale-to-json', '--type', type],
        stdin: 'piped',
        stdout: 'piped',
        stderr: 'inherit',
      }).spawn()

      const writer = child.stdin.getWriter()
      await writer.write(scale)
      await writer.close()
      const { code, stdout } = await child.output()
      assert(code === 0, `kagami exited with non-zero code`)

      const text = new TextDecoder().decode(stdout)
      const json = JSON.parse(text)
      return json
    },
  }
}

export interface StartPeerReturn {
  /**
   * Kill peer's process
   */
  kill: () => Promise<void>

  /**
   * Check for alive status
   */
  isAlive: () => boolean

  events: Emittery<{ exit: { code: number }; msg: string }>
}

/**
 * Start network with a single peer.
 *
 * **Note:** Iroha binary must be pre-built.
 */
export function startPeer(params: {
  bin: string
  configPath: string
  envs: Record<string, string>
  stdoutPath: string
  stderrPath: string
}): StartPeerReturn & AsyncDisposable {
  const events: StartPeerReturn['events'] = new Emittery()

  const child = new Deno.Command(params.bin, {
    args: ['--config', params.configPath],
    env: params.envs,
    stdin: 'null',
    stderr: 'piped',
    stdout: 'piped',
  }).spawn()
  let isAlive = true

  const outputs = [params.stdoutPath, params.stderrPath].map((x) =>
    Deno.openSync(x, { create: true, append: true })
  )

  // TODO: detect something in stderr
  const pipes = Promise.allSettled([
    child.stdout.pipeTo(outputs[0].writable),
    child.stderr.pipeTo(outputs[1].writable),
  ])

  pipes.then(async (results) => {
    isAlive = false
    if (results.some((x) => x.status === 'rejected')) {
      events.emit('msg', 'some pipe rejected')
    }
    const { code } = await child.output()
    events.emit('exit', { code })
  })

  async function kill() {
    if (!isAlive) return
    child.kill()
    await pipes
  }

  return {
    kill,
    isAlive: () => isAlive,
    events,
    [Symbol.asyncDispose]: kill,
  }
}
