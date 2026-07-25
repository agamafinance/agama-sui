# Agama on Sui — deployment (all on testnet, LIVE)

**Everything runs on one network: Sui testnet.** Fresh clean deployment. The
whole system — test USDC, agUSD (pool-backed 1:1), a `BackingProof`, sagUSD
(yield-bearing staking), the KYC-gated **confidential** agUSD (amounts hidden,
Twisted ElGamal + ZK), **Seal** access control, **Walrus** deal docs, and a
**Nautilus** attestation verifier.

Deployed by `0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4`.

## Core — agUSD unified package

| What | Object ID |
|---|---|
| Confidential Transfers framework (contra) | `0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080` |
| contra TokenRegistry | `0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb` |
| contra AccountRegistry | `0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3` |
| **agUSD package** (usdc + agusd + sagusd + confidential) | `0x4a30152ec1b7f97eddcd92a70bec4858d151732be27d3e4a9e18197702cd388a` |
| agUSD Pool (USDC reserve, 1:1) | `0xb3ff4a8a6fb24eb818fba18ffd3e0194c10dbd1bc9d8f466fc213a7910d79665` |
| test UsdcTreasury (faucet) | `0xed327ab657d953ae8d6c588b0aa5918c273b840d296c4436265187194d005f90` |
| AgusdAdminCap | `0x9cc7133b57f8d8951f17735114072eed6f80a874e77582c08f3baea12f2d2c3a` |
| **BackingProof** (the Sphere seam) | `0x842891aa47a4ef08cd370c3fcd186eef4084bfa55c74f02ef9ea0a6d9173ff23` |
| **StakingVault** (sagUSD) | `0x1ff050b03e180879d7ec14c3d6f496dee165f155e85f7c2f240e5e8d2c67bbe8` |
| YieldCap | `0xabb69e3642b2a9a39f37e6da134946447e8f42230ad6b4838f16cddfd96c637c` |
| **ConfidentialToken<AGUSD>** | `0xc5185f8ad2ee4a386cf675b7203dfe35ec6e7fd7460dc87019c746dd3d076d78` |
| KYC Whitelist | `0x30638a4a3cd667cd6c205bf2818ddf7e121424e2574ee90b2ae39124a112632e` |
| WhitelistAdminCap | `0x7ae75506d0a8c92d999973c6fbe9ca1a04d95839af67c4fa989fa96f9804918b` |

## Seal — access control

| What | Object ID |
|---|---|
| **agama_seal package** | `0xde73c6741a37f0576e198994b1f62fda77bbda091f8eb472685aea5aa91eba67` |
| **AccessPolicy** (allowlist) | `0xc109bcd23f09d5d1395cd774b69f033d5544d295fb7f72f26ab5734822ba1c33` |
| AccessAdminCap | `0x809c3406acf6ee0eea4bd01666e871e194bb3ba275a90d25df518da4f1cc19ef` |
| Seal key servers (Mysten testnet, threshold 2) | `0x73d05d62…356db75`, `0xf5d14a81…591623c8` |

## Nautilus — attested NAV verifier

| What | Object ID |
|---|---|
| **agama_attest package** | `0x476d7719489d21ecdb931abe4f9b3d1cdf680a0e79e35b572969a533f6c63e7a` |
| **AttestationRegistry** | `0x7f6e8a0dd75f36c6a43647913d4c8f1532c5ce36a2f5972bf571db0d804c64f7` |

## Walrus — deal docs

Seal-encrypted deal doc on Walrus testnet · blob `Wo6IMua_VAb3iA3fcrh75_LZXME_zyJY39DimWiQKZo`
· publisher `https://publisher.walrus-testnet.walrus.space` · aggregator `https://aggregator.walrus-testnet.walrus.space`

Explorer: `https://suiscan.xyz/testnet/object/<id>`

## The Sui stack, all on one testnet

| Layer | Tool | Status |
|---|---|---|
| Hide amounts | Confidential Transfers (ElGamal + ZK) | real |
| Control who reads positions | Seal (MPC + seal_approve) | real |
| Private deal docs storage | Walrus + Seal | real |
| Attested NAV compute | Nautilus (on-chain verify; enclave = Nitro infra) | verify real |
| LP onboarding | zkLogin (Google login = browser step) | derivation real |
| Prove solvency | BackingProof | real |
| Multi-party environment | Sui Spheres | simulated (narrative) |

## Demo scripts (onchain/*.mts, all testnet)

confidential-demo · sagusd-demo · seal-demo · walrus-seal-demo · attest-demo ·
zklogin-demo · kyc-denied-test · seam.ts. Run with
`AGAMA_KEY=suiprivkey1... pnpm exec tsx <script>` from a Confidential Transfers SDK checkout.
