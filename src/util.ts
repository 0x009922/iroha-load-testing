import { KeyPair } from '@iroha/core/crypto'
import { AccountId, DomainId } from '@iroha/core/data-model'

export type AccountPrep = { key: KeyPair; id: AccountId }

export function randomAccount(domain: DomainId): AccountPrep {
  const key = KeyPair.random()
  const id = new AccountId(key.publicKey(), domain)
  return { key, id }
}
