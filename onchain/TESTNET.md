# agUSD + sagUSD — public layer (Sui testnet, LIVE)

The **prize-qualifying public layer**, deployed on **Sui testnet**:

- **agUSD** — a **Regulated Coin** (issuer `DenyCapV2` KYC denylist + global
  pause), issuer-gated mint, 1:1 with its USDC reserve, plus a shared
  `BackingProof` object (the seam the private Sphere posts its attested
  NAV / supply / coverage / commitment into).
- **sagUSD** — the **yield-bearing** staked agUSD. A `StakingVault` custodies
  staked agUSD and mints sagUSD **shares** (ERC-4626 style). Stake/unstake are
  priced at NAV = `total_assets / total_shares`, so the agUSD↔sagUSD swap is
  **not 1:1** once yield accrues. The Allocation Engine books private-credit
  yield via `accrue_yield`, raising the NAV for every holder.

Deployed by `0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4`.

## Live object IDs (testnet)

| What | Object ID |
|---|---|
| **package (agusd + sagusd)** | `0x1a4a046b88ff6d9c7841ac19f51d71fa95b26d89658e5599fa4acb237f3c0d30` |
| agUSD `Issuer` (mint cap) | `0x652b7a5980ca3e9e9802de1651420196484800af6f921377259d20a069c58c28` |
| agUSD `DenyCapV2` (KYC) | `0xacb6dc4ac9927de24bb7b12848d378d379d351c98461f0ea1ae6765dcebfb690` |
| **`BackingProof`** (shared — the Sphere seam) | `0x2e5546184456268acffd13abbafaf6d16140fbdd7707b0c2eea1f139382ae99a` |
| **`StakingVault`** (sagUSD, shared) | `0x1aa810086f06e8fcf35b58b9f4f81db94eed51771e3447e680172fbafdd31d0a` |
| `YieldCap` (Allocation Engine) | `0xc57ac6892d7001bf8c74a0359b51e0bb2fb3cfc7bedbb2c70e7204d7a5d3d45b` |

Explorer: `https://suiscan.xyz/testnet/object/<id>`

## Verified — sagUSD yield cycle (real testnet txs)

```
  ✓ 1. mint 120 agUSD                                       (7vXorbsWBnSG…)
  ✓ 2. stake 100 agUSD → sagUSD (bootstrap 1:1)             (3hufNSHhySBk…)
       → sagUSD received: 100.00 sagUSD
  ✓ 3. accrue 20 agUSD yield into the vault (NAV rises)     (FvMGXq36J2av…)
  ✓ 4. unstake all sagUSD → agUSD (at NAV, includes yield)  (FuJbuT8PuAQs…)

  staked   : 100.00 agUSD  → 100.00 sagUSD   (NAV 1.0000)
  yield    : +20.00 agUSD booked            → NAV 1.2000
  unstaked : 100.00 sagUSD → 120.00 agUSD    (NAV priced, NOT 1:1)
```

100 agUSD in → 120 agUSD out: sagUSD is yield-bearing. Run it:
`AGAMA_KEY=... pnpm exec tsx sagusd-demo.mts` (see `onchain/sagusd-demo.mts`).

## Verified — BackingProof (the Sphere seam)

`node --experimental-strip-types onchain/seam.ts` posts the Sphere's attested
twin here; last read `coverage_bps = 10200` (**102%**), `supply_cents=15000000`.

## Move source

`onchain/agusd-testnet/sources/` — `agusd.move` (regulated + backing proof),
`sagusd.move` (yield-bearing vault). Built with the testnet toolchain.

## Three tokens, one system

| Token | What | Backed by | Network |
|---|---|---|---|
| **agUSD** | synthetic dollar, 1:1 | USDC reserve | testnet (public) + devnet (confidential) |
| **sagUSD** | yield-bearing share | staked agUSD + accrued vault yield | testnet |
| confidential agUSD | amount-hidden agUSD | same, ElGamal-encrypted | devnet (`DEVNET.md`) |
