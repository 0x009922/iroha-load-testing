import { KeyPair, PrivateKey, PublicKey } from '@iroha/core/data-model'
import { z } from 'zod'

export interface PeerStatus {
  running: boolean
  blocks: number
  transactions: { accepted: number; rejected: number }
  queue: number
  peers: number
  viewChanges: number
}

export interface PeerNameStatus extends PeerStatus {
  name: string
}

export interface LogMsg {
  date: string
  msg: string
}

export type PeersStatus = {
  peers: PeerNameStatus[]
}

export type ApiMsg =
  | { t: 'status'; status: PeersStatus }
  | { t: 'log' } & LogMsg

export const PublicKeySchema = z.string().transform((x) =>
  PublicKey.fromMultihash(x)
).or(z.custom<PublicKey>((x): x is PublicKey => x instanceof PublicKey))

export type KeyPairJson = {
  publicKey: string
  privateKey: string
}

export const KeyPairJsonSchema = z.object({
  publicKey: z.string(),
  privateKey: z.string(),
})

export function kpToJson(kp: KeyPair): KeyPairJson {
  return {
    publicKey: kp.publicKey().multihash(),
    privateKey: kp.privateKey().multihash(),
  }
}

export function kpFromJson(json: KeyPairJson): KeyPair {
  return KeyPair.fromParts(
    PublicKey.fromMultihash(json.publicKey),
    PrivateKey.fromMultihash(json.privateKey),
  )
  // return KeyPairJsonSchema.parse(json)
}

// export function useMessageBridge<
