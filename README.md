# Agama × Sui Spheres

Private-credit vaults running on the **Sui Spheres pattern**: LP deposits are
private objects inside a Sphere; the public network on Sui sees only a redacted
twin of the synthetic dollar (agUSD) — aggregate supply, NAV, coverage, and
green proofs — never a name, an amount, or which tranche.

The pattern mirrors Mysten Labs' own Spheres demos
(github.com/abhinavg6). There is no public Spheres SDK yet, so — exactly like
Mysten's PM does — the Sphere is simulated locally behind a single seam
(`publicTwin()` + the `visible*` getters in `src/sphere.ts`). When a real
Spheres SDK lands, only that seam is reimplemented against the Sphere/Mainnet
RPC; nothing else changes.

## On-chain (real, deployed)

The seam is not just simulated — the public projection is **live on Sui**:

- **Confidential agUSD — Sui devnet** (`onchain/DEVNET.md`): agUSD as a
  Confidential Token on Mysten's Confidential Transfers framework — balances and
  transfer amounts hidden with **Twisted ElGamal + ZK**, KYC-whitelist-gated
  register, auditor viewing-key + freeze/seize. Package
  `0x466f40a0…159138e0`, `ConfidentialToken<AGUSD>` `0x0adc7586…81f971f`.
- **agUSD + sagUSD — Sui testnet** (`onchain/TESTNET.md`): the prize-qualifying
  public layer. **agUSD** is a Regulated Coin (KYC denylist) with a shared
  `BackingProof` (verified `coverage_bps = 10200` = 102%). **sagUSD** is the
  yield-bearing staked agUSD — an ERC-4626-style `StakingVault` where
  stake/unstake are priced at NAV (not 1:1) and the Allocation Engine books
  yield via `accrue_yield`. Verified end-to-end: stake 100 agUSD → accrue yield →
  unstake **120 agUSD** (`onchain/sagusd-demo.mts`). Package `0x1a4a046b…7f3c0d30`.
- **The seam, made real** (`onchain/seam.ts`): drives the Sphere, computes the
  twin, and posts it into the on-chain `BackingProof` — private positions stay
  in the Sphere, only the aggregate proof crosses.
  `node --experimental-strip-types onchain/seam.ts`
- **The amount-hiding crypto, running locally** (`onchain/wasm/`): the
  bulletproofs / ristretto255 range proofs behind confidential agUSD, prebuilt
  to WebAssembly and runnable with no toolchain — `node onchain/wasm/proof-test.mjs`
  (generates + verifies a ZK range proof over a hidden amount). The full SDK
  crypto suite passes locally (56/56). See `onchain/wasm/README.md` for the
  build (Apple clang has no wasm target; built via Linux clang in Docker).
- **The full confidential flow, verified on devnet** (`onchain/confidential-demo.mts`):
  a fresh KYC-whitelisted LP registers, mints agUSD, wraps it into its shielded
  balance and merges — the amount is stored on-chain as ElGamal ciphertexts and
  recovered only with the viewing key (decrypts to `100.00 agUSD`). Every step is
  a real devnet transaction. See `onchain/CONFIDENTIAL-DEMO.md` for the run + digests.

Move sources: `onchain/agusd-move/` (devnet confidential) and
`onchain/agusd-testnet/` (testnet regulated). Built with the `sui@devnet` /
`sui@testnet` toolchains via `suiup` (the confidential build needs the devnet
`rangeproofs` native).

## Run

```bash
npm install
npm run dev      # → http://localhost:5178   (clickable split-screen demo)
npm run smoke    # → 24 passed, 0 failed      (headless proof of the core)
npm run build    # → type-checks + production bundle
```

## What the demo shows

- **Left — inside the Sphere (private):** toggle the viewer (Public / Alice /
  Bob / Agama Risk) and watch the *same* system reveal a different slice.
  Public sees zero positions; an LP sees only their own; Agama sees positions
  it's ACL'd on — with **no operator god-view**.
- **Right — public on Sui:** the redacted twin. agUSD supply, NAV, coverage,
  sagUSD redeem rate, a backing commitment, and proofs. A privacy-contrast strip
  spells out what stays hidden vs. what the public can still verify.
- **Controls** drive real state: deposit (mints agUSD), a KYC-denied attempt,
  allocate (concentration-cap enforced), accrue yield (NAV + sagUSD rate rise),
  redeem (burns supply). An append-only audit log tags each event private/public.

## Files

| File | Role |
|---|---|
| `src/sphere.ts` | the core — the Sphere that **enforces** ACL reads, bounded authority, the solvency invariant, and builds the public twin. Single source of truth. |
| `src/App.tsx` | the split-screen UI. |
| `smoke.ts` | headless test over the same core (24 assertions). |

## Two privacy problems, two tools

Hiding a synthetic dollar's activity is really two orthogonal problems, and
this repo uses the right tool for each:

| Need | Tool | Status |
|---|---|---|
| Hide **amounts / balances** of the token on-chain | **Confidential Transfers** (Twisted ElGamal + ZK) | ✅ live, devnet (`onchain/agusd-move`) |
| Hide **who / positions / deal-data / allocation** across parties | **Sphere** (permissioned env + ACL) + Seal + Nautilus | 🟡 simulated (no public SDK yet) |
| Publicly **prove solvency** without revealing positions | Regulated Coin + on-chain `BackingProof` | ✅ live, testnet (`onchain/agusd-testnet`) |

A Sphere hides the multi-party underwriting workflow; Confidential Transfers
hides the dollar's amounts. Together: the vault is private, the dollar is
private, and solvency is publicly provable.

## Credits & license

- The confidential Move modules (`onchain/agusd-move/`) are derived from
  [MystenLabs/confidential-transfers](https://github.com/MystenLabs/confidential-transfers)
  (`closed_loop` example), Apache-2.0.
- The Sphere pattern mirrors [abhinavg6](https://github.com/abhinavg6)'s public
  Sui Spheres demos (Mysten Labs).
- Licensed under Apache-2.0 (see `LICENSE`, `NOTICE`).
