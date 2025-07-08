import { Bytes, KeyPair } from '@iroha/core/crypto'
import { AccountId, DomainId } from '@iroha/core/data-model'

export type AccountPrep = { key: KeyPair; id: AccountId }

let counter = 0
const SEED = [1, 5, 2, 5, 2, 5, 1, 2];

export function randomAccount(domain: DomainId): AccountPrep {
  const key = KeyPair.deriveFromSeed(Bytes.array(Uint8Array.from([...SEED, counter++])))
  const id = new AccountId(key.publicKey(), domain)
  return { key, id }
}
