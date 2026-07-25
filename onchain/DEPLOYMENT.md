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
| **agUSD package** (usdc + agusd + sagusd + confidential) | `0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab` |
| agUSD Pool (USDC reserve, 1:1) | `0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67` |
| test UsdcTreasury (faucet) | `0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d` |
| AgusdAdminCap | `0x23acc1554383c35f92d864e0cf012f9cf184072b6aedd8aed3bc67034f3e2c05` |
| **BackingProof** (the Sphere seam) | `0x0af97dc270fbfbb6f9083b49c5ee63cded60e18e397affb1919858f3a015ca73` |
| **StakingVault** (sagUSD) | `0x29b9146405de04894f1a9e932ed7544965dd934e1460fb63bc524fb699344bc8` |
| YieldCap | `0xfa9cf1deae18e06d1cf2ffcef24a51392dd30e5b9770ee6245bee241ff2303fa` |
| **ConfidentialToken<AGUSD>** | `0x7cb730a0ee23a1d014b481930c893134a3942d39c623d9a4dd01022e70975bf2` |
| KYC Whitelist | `0x6b2b8a3e2b85d5e5b7fb6ce557e31e1adf4d9e1c3b1d7b301c125cd3466cd9ae` |
| WhitelistAdminCap | `0x8d1d9d823c04117cc7d46516fb6d85c58eaf114aeac69eaa1111364e6b81d20a` |
| ManagementCap<AGUSD> (issuer freeze/seize) | `0xfc3a7366e4821915176c27dbcbff391ff52a167c9cfc81770fe6fca6cc589b1c` |

## Seal — access control

| What | Object ID |
|---|---|
| **agama_seal package** | `0x78e24bc0a7e5de42d5a6f93dc8d254f75986e4cfab6ea95946680755ecb41ed6` |
| **AccessPolicy** (allowlist) | `0x6983f5ea3f67811beb06ef956a1c457b5fdd979992a753313080c8e8df1792f1` |
| AccessAdminCap | `0xe82340aaff1468ce85e9606ecac08fc9503c972d4983b8ad8548dc3c081da432` |
| Seal key servers (Mysten testnet, threshold 2) | `0x73d05d62…356db75`, `0xf5d14a81…591623c8` |

## Nautilus — attested NAV verifier

| What | Object ID |
|---|---|
| **agama_attest package** | `0x180625afa71d367804197147af32a3e2ca27d032fd0bea80aad5d684f0f2a795` |
| **AttestationRegistry** | `0xa5057a9a3439b70ba026632561c7dd07efe92389f7d927d4378cb6189234bbad` |

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
