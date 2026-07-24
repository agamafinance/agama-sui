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
- **Regulated agUSD + BackingProof — Sui testnet** (`onchain/TESTNET.md`): the
  prize-qualifying public layer. Regulated Coin (KYC denylist) + a shared
  `BackingProof`. Package `0x61b4933a…99b5291`, proof `0x4255963c…d7549b90`
  (verified reading `coverage_bps = 10200` = 102%).
- **The seam, made real** (`onchain/seam.ts`): drives the Sphere, computes the
  twin, and posts it into the on-chain `BackingProof` — private positions stay
  in the Sphere, only the aggregate proof crosses.
  `node --experimental-strip-types onchain/seam.ts`

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
