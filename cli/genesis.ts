import * as types from '@iroha/core/data-model'
import { getCodec } from '@iroha/core/codec'
import { useIrohaCodec, useKagami } from './iroha-bin.ts'
import { AccountPrep, randomAccount } from './util.ts'

export async function generateGenesis(
  params: {
    kagami: string
    codec: string
    chain: string
    // genesisKeyPair: KeyPair
    executorPath: string
    peers: { torii: string; publicKey: string }[]
  },
): Promise<{
  block: types.SignedBlock
  account: AccountPrep
  genesisKeyPair: types.KeyPair
}> {
  const DOMAIN = new types.Name('wonderland')
  const asset = new types.AssetDefinitionId(new types.Name('gold'), DOMAIN)
  const adminAccount = randomAccount(DOMAIN)
  const genesisKeyPair = types.KeyPair.random()

  const instructions: types.InstructionBox[] = []
  // const a: types.CanRegisterAssetDefinition = { domain}

  instructions.push(
    types.InstructionBox.Register.Domain({
      id: DOMAIN,
      logo: null,
      metadata: [],
    }),
    types.InstructionBox.Register.AssetDefinition({
      id: asset,
      type: types.AssetType.Numeric({ scale: 0 }),
      mintable: types.Mintable.Infinitely,
      logo: null,
      metadata: [],
    }),
    types.InstructionBox.Register.Account({
      id: adminAccount.id,
      metadata: [],
    }),
    ...[
      { name: 'CanSetParameters', payload: types.Json.fromValue(null) },
      {
        name: 'CanRegisterAssetDefinition',
        payload: types.Json.fromValue({ domain: DOMAIN.value }),
      },
    ].map((object) =>
      types.InstructionBox.Grant.Permission({
        object,
        destination: adminAccount.id,
      })
    ),
  )

  const block = await useKagami(params.kagami).signGenesis(
    JSON.stringify({
      chain: params.chain,
      executor: params.executorPath,
      instructions: await useIrohaCodec(params.codec).scaleToJson(
        'Vec<InstructionBox>',
        types.Vec.with(getCodec(types.InstructionBox)).encode(instructions),
      ),
      topology: params.peers.map((x) => x.publicKey),
      wasm_dir: '/whichever',
      wasm_triggers: [],
    }),
    genesisKeyPair,
  )

  return {
    block,
    account: adminAccount,
    genesisKeyPair,
  }
}
