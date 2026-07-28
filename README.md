# Agama × Sui

A confidential private credit synthetic dollar on Sui. You mint **cagUSD** one to
one from USDC, stake it into yield bearing **csagUSD**, and every balance and
transfer amount stays hidden on chain with **Sui Confidential Transfers**. Deals,
identities and allocations stay private too, via Seal, Walrus and the Sui Spheres
pattern.

**Live on Sui testnet:** https://app.agama.finance/sui

## What it does

* **Mint cagUSD** one to one from USDC. The synthetic dollar, with the amount
  encrypted on chain (Twisted ElGamal + ZK). A competitor sees a ciphertext,
  never your balance.
* **Stake into csagUSD** to earn real yield from curated private credit. Priced at
  the vault NAV, and confidential too.
* **Transfer confidentially** with a zero knowledge range proof generated in the
  browser. Only the sender and receiver learn the amount.
* **Seal a private LP document** (side letter, allocation terms) with threshold
  MPC and store it on Walrus. Only you, or the Agama allowlist, can decrypt it.
* **Log in with Google** via zkLogin (Enoki). No seed phrase.
* **Six curated credit vaults** (Tenka and Qiro) as real on chain objects, each
  verifiable on Suiscan.

## Built on Sui

| Tech | What we use it for |
|---|---|
| **Confidential Transfers** | Hidden amounts. cagUSD/csagUSD balances are ElGamal ciphertexts on chain |
| **Seal** | Private LP deal docs, encrypted with threshold MPC |
| **Walrus** | Decentralized storage of the sealed documents |
| **Sui Spheres** | LP anonymity, so the *who* never crosses on chain (simulated, no public SDK) |
| **zkLogin (Enoki)** | Sign in with Google, no seed phrase |
| **Move + coin_registry** | agUSD, sagUSD and 6 on chain credit vault objects |

## On chain (Sui testnet)

All real, all on Sui testnet. Full ID list and verification in
[`onchain/DEPLOYMENT.md`](onchain/DEPLOYMENT.md).

* **Tokens, one package** (`onchain/agusd-move/`): **agUSD** (pool backed one to
  one with USDC), **sagUSD** (yield bearing `StakingVault`, stake/unstake priced at
  NAV with `accrue_yield`), and the **confidential agUSD / sagUSD** (balances and
  transfer amounts hidden with Twisted ElGamal + ZK, KYC whitelist gated register).
* **Six credit vaults** (`onchain/credit-vaults/`): a `credit_vaults` Move package
  whose init creates six shared `CreditVault` objects (Tenka Flagship, High Yield,
  Deal by Deal, Qiro Payment, Private Credit, Institutional). Each is its own
  object on Suiscan.
* **Confidential flow, verified** (`onchain/confidential-demo.mts`): KYC whitelisted
  LP, register, wrap, merge, decrypt. The amount lives on chain as ElGamal
  ciphertexts, recovered only with the viewing key.
* **Seal access control, verified** (`onchain/seal-demo.mts`): an LP document is
  Seal encrypted. The owner and the Agama allowlist decrypt; a rival is denied by
  the MPC committee (`seal_approve` on chain).
* **sagUSD yield, verified** (`onchain/sagusd-demo.mts`): stake 100 agUSD, accrue
  yield, unstake 120 agUSD (NAV 1.0 to 1.2).

`agusd-move` pulls Mysten's
[confidential-transfers](https://github.com/MystenLabs/confidential-transfers)
framework (`contra`) as a pinned git dependency, so the confidential layer builds
reproducibly.

## The app (`front/`)

The Next.js front for the live demo. Route `/sui` is the Sui product: Earn, Faucet
and Portfolio wired to testnet, plus the inline confidential flow (derive viewing
key, KYC gated account, confidential deposit/stake/transfer, and the Seal deal
doc). Slush and Google zkLogin for the wallet.

```bash
cd front
pnpm install
pnpm dev        # → http://localhost:3005/sui
```

## Move contracts

The Move packages build and unit test from a fresh clone:

```bash
cd onchain/agusd-move    && sui move test   # backing invariant (mint/redeem 1:1) + sagUSD NAV
cd onchain/agama-seal    && sui move test   # Seal seal_approve: owner / allowlist / stranger / bad id
cd onchain/credit-vaults && sui move build  # the six on chain credit vault objects
```

## Privacy: what is real, what is simulated

Hiding a synthetic dollar is really two problems, and this repo uses the right
tool for each. See [`ANONYMITY.md`](ANONYMITY.md) for the honest threat model.

| Need | Tool | Status |
|---|---|---|
| Hide **amounts / balances** on chain | Confidential Transfers (Twisted ElGamal + ZK) | Real, testnet |
| Control **who can read** private deal data | Seal (threshold MPC + `seal_approve`) | Real, testnet |
| **Anonymity** of LPs (hide the *who*) | Sui Spheres | Simulated (no public SDK yet) |
| Publicly **prove solvency** without revealing positions | Regulated coin + on chain proof | Real, testnet |

Confidentiality of amounts is real (Confidential Transfers). Anonymity of
identities (Spheres) is simulated everywhere, including the deployed app, because
Mysten has not shipped a public Spheres SDK. We follow the reference pattern from
Mysten's own PM, [Abhinav Garg (@abhinavg6)](https://github.com/abhinavg6/sui-spheres-supplychain-finance),
whose repo is itself simulated locally, and wire it onto real Confidential
Transfers, Seal and Walrus.

## Credits & license

* Confidential Move modules derived from
  [MystenLabs/confidential-transfers](https://github.com/MystenLabs/confidential-transfers), Apache-2.0.
* Sui Spheres pattern from
  [Abhinav Garg (@abhinavg6)](https://github.com/abhinavg6/sui-spheres-supplychain-finance),
  Product Manager at Mysten Labs.
* Licensed under Apache-2.0 (see `LICENSE`, `NOTICE`).
