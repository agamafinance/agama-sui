# Agama on Sui — single-network deployment (testnet, LIVE)

**Everything runs on one network: Sui testnet.** One package holds the whole
system — test USDC, agUSD (pool-backed 1:1), a `BackingProof`, sagUSD (yield-
bearing staking), and the KYC-gated **confidential** agUSD (amounts hidden with
Twisted ElGamal + ZK). This makes it a real end-to-end demo: run it on
localhost, deploy the UI to Vercel, everything reads/writes the same chain.

> Testnet supports the Confidential Transfers `rangeproofs` (bulletproofs)
> native — verified by publishing the `contra` framework to testnet. So the
> confidential layer no longer needs devnet; the earlier devnet deployment is
> superseded by this unified testnet one.

Deployed by `0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4`.

## Live object IDs (all testnet)

| What | Object ID |
|---|---|
| **Confidential Transfers framework (`contra`)** | `0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080` |
| contra `TokenRegistry` | `0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb` |
| contra `AccountRegistry` | `0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3` |
| **agUSD package (usdc + agusd + sagusd + confidential)** | `0x9c98876d3baceb06ee51ac787f989397d589f25cb2bd25076819c279f686dffc` |
| agUSD `Pool` (USDC reserve, 1:1) | `0x593ab3affff12565d50fb8a4432605e623f175e811febdb86fe62e99d6c3ad19` |
| test `UsdcTreasury` (faucet) | `0x7b2a9f519648b3c5c806dc072920f2bef20070dc25e77d1415ce52c28f52f8ac` |
| `AgusdAdminCap` | `0xdfef46553fb3a1598adacb6b6e7a2dc35840e6cfcb0f320eb9560fb34bbafbb5` |
| **`BackingProof`** (the Sphere seam) | `0xd9f6edacb75cd17bc3ebf1220c806dfb5d6f4e9067cd509c21260ceeb7a8fe72` |
| **`StakingVault`** (sagUSD) | `0xb75d1f795617fe7634f2124f3dec4def3229c51e41ec659ca64902823024e7a8` |
| `YieldCap` (Allocation Engine) | `0xd9af80d259e9110192b6ce33a66dcdf26a0e830c604e00ed11f00613a179975d` |
| **`ConfidentialToken<AGUSD>`** | `0xd372b544af6ee21d3ce08dd94211f684bde55558dfbeed32decd8407a5c51d44` |
| KYC `Whitelist` | `0xfeb070017344698c1afb84b85bb5a4b5c3e455056620a5e478c7f230b1ff39d1` |
| `WhitelistAdminCap` (compliance) | `0xc392f63bf4eedade8f852760afd8d8af1b2cfb81d070371f010d8caf78d5a02e` |

Explorer: `https://suiscan.xyz/testnet/object/<id>`

## Verified end-to-end (all testnet)

- **Confidential** (`onchain/confidential-demo.mts`): KYC-whitelist → register →
  wrap → merge → decrypt = **100.00 agUSD**. Amounts stored as ElGamal
  ciphertexts; recovered only with the viewing key. Bulletproof generated
  locally (`onchain/wasm/`).
- **sagUSD** (`onchain/sagusd-demo.mts`): stake 100 agUSD → accrue yield →
  unstake **120 agUSD** (NAV 1.0 → 1.2, swap not 1:1).
- **Seam** (`onchain/seam.ts`): Sphere twin → on-chain `BackingProof`
  (coverage **102%**).
- **UI** reads all three live via public RPC (no wallet): BackingProof 102% ·
  sagUSD NAV 1.2000 · ConfidentialToken.

## Move source

`onchain/agusd-move/sources/` — `usdc.move`, `agusd.move` (pool + BackingProof),
`sagusd.move` (yield vault), `confidential_agusd.move` (KYC-gated). Built with
the testnet toolchain (`sui@testnet` via suiup — testnet has the `rangeproofs`
native).

## The three tokens

| Token | What | Backed by |
|---|---|---|
| **agUSD** | synthetic dollar, 1:1 | USDC reserve; confidential variant hides amounts |
| **sagUSD** | yield-bearing share | staked agUSD + accrued vault yield (NAV-priced) |
| **confidential agUSD** | amount-hidden agUSD | same, ElGamal-encrypted balances |

## Seal — real role-based access control (testnet)

The Sphere's "who can see what" is no longer only simulated: private position /
deal data is encrypted with **Seal** (threshold MPC + on-chain policy), and the
Seal key-server committee only releases the decryption key after dry-running
`agama_seal::access::seal_approve` on testnet.

| What | Object ID |
|---|---|
| **agama_seal package** | `0x9cdf639d51a0be9d7e03aefe5aa8f463e9715a17d2fc97745e10b8dd3dc725a8` |
| **`AccessPolicy`** (Agama allowlist) | `0x786325d84d2fd6a26fd641fd24d5bde715bea6cd88efca422202061860b9e08c` |
| `AccessAdminCap` (compliance) | `0x947fe6f7b303804b404481aba63cb9a5cad7a4aa1697996d77622eb8dd92623d` |
| Seal key servers (Mysten testnet, threshold 2) | `0x73d05d62…356db75`, `0xf5d14a81…591623c8` |

Verified (`onchain/seal-demo.mts`): a position encrypted for Alice —
- **Alice (owner)** → ✓ decrypts
- **Agama risk team** (on the allowlist) → ✓ decrypts
- **Rival LP** → ✗ **DENIED by the Seal committee** (`NoAccessError`)

This runs on the **same network** (testnet) as Confidential Transfers — a single
coherent deployment (Mysten's own reference splits Seal/Contra across networks).

## Walrus — decentralized private deal docs (Seal + Walrus)

Deal documents (term sheets, originator data) are encrypted with **Seal**, then
stored on **Walrus** testnet (decentralized storage). The blob is public bytes,
but only Seal-authorized parties can read the content.

Verified (`onchain/walrus-seal-demo.mts`): a deal doc encrypted → stored on
Walrus (`blobId` returned) → retrieved by anyone → but only **owner** and
**Agama allowlist** decrypt; a **rival pulls the same blob and cannot read it**
(`NoAccessError`). Canonical Seal + Walrus pattern, both on testnet.

- Walrus testnet publisher: `https://publisher.walrus-testnet.walrus.space`
- Walrus testnet aggregator: `https://aggregator.walrus-testnet.walrus.space`
