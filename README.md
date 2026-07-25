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

## On-chain (real, all on Sui testnet)

**Everything runs on one network — Sui testnet — in one Move package.** Full ID
list + verification in [`onchain/DEPLOYMENT.md`](onchain/DEPLOYMENT.md).

- **The three tokens, one package** (`onchain/agusd-move/`): **agUSD** (pool-backed
  1:1 with USDC), **sagUSD** (yield-bearing `StakingVault`, stake/unstake priced at
  NAV — not 1:1 — with `accrue_yield` for the Allocation Engine), and the
  **confidential agUSD** (Confidential Token — balances & transfer amounts hidden
  with **Twisted ElGamal + ZK**, KYC-whitelist-gated register, issuer freeze/seize via a held ManagementCap).
  Package `0x9c98876d…f686dffc`.
- **The seam, made real** (`onchain/seam.ts`): drives the Sphere, computes the twin,
  and posts it into the on-chain `BackingProof` (coverage **102%**) — private
  positions stay in the Sphere, only the aggregate crosses.
- **Confidential flow, verified** (`onchain/confidential-demo.mts`): fresh
  KYC-whitelisted LP → register → wrap → merge → decrypt = **100.00 agUSD**. The
  amount lives on-chain as ElGamal ciphertexts, recovered only with the viewing key.
- **Seal access control, verified** (`onchain/seal-demo.mts`): an LP position is Seal-encrypted; **owner** and **Agama allowlist** decrypt, a **rival is denied by the MPC committee** (`seal_approve` on-chain). Real role-based access — same testnet as Confidential Transfers.
- **sagUSD yield, verified** (`onchain/sagusd-demo.mts`): stake 100 agUSD → accrue
  yield → unstake **120 agUSD** (NAV 1.0 → 1.2).
- **The amount-hiding crypto runs locally** (`onchain/wasm/`): prebuilt bulletproofs
  wasm — `node onchain/wasm/proof-test.mjs`. Full SDK crypto suite passes (56/56).
  See `onchain/wasm/README.md` (Apple clang has no wasm target; built via Docker).

The **UI reads all of it live** from testnet via public RPC (no wallet) — the
"Live on Sui" panel shows BackingProof 102%, sagUSD NAV 1.2000, and the
ConfidentialToken, side by side with the simulation.

## Run

```bash
npm install
npm run dev      # → http://localhost:5178   (clickable split-screen demo)
npm run smoke    # → 24 passed, 0 failed      (headless proof of the core)
npm run anon     # → 21 passed, 0 failed      (anonymity: different books, one identical outside view)
npm run build    # → type-checks + production bundle
```

**Move contracts.** All three packages build and unit-test from a fresh clone — **10 Move tests**:

```bash
cd onchain/agusd-move   && sui move test   # backing invariant (mint/redeem 1:1) + sagUSD NAV 100→110   (2)
cd onchain/agama-attest && sui move test   # Nautilus: valid / forged / replay / non-admin              (4)
cd onchain/agama-seal   && sui move test   # Seal seal_approve: owner / allowlist / stranger / bad-id    (4)
```

`agusd-move` pulls Mysten's [confidential-transfers](https://github.com/MystenLabs/confidential-transfers)
framework (`contra`) as a pinned git dependency, so the confidential layer builds reproducibly.
The `onchain/*.mts` flow scripts are run from inside a confidential-transfers SDK checkout (they import its TS SDK).

**Privacy is the point.** For the honest threat model — what is anonymous, what is only
confidential, and against whom — see **[`ANONYMITY.md`](ANONYMITY.md)**. Short version:
the **Sphere** hides *who* (identities & the graph never touch the public chain), while
**Confidential Transfers** and **Seal** hide *amounts* and *deal data* at the public
crossing. `onchain/privacy-audit.mts` reads a real testnet tx back to show exactly what
an observer can and cannot see.

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
| `anon.ts` | anonymity proof — indistinguishability of the outside view (21 assertions). |
| `ANONYMITY.md` | the honest threat model: what's anonymous vs confidential, and against whom. |

## Two privacy problems, two tools

Hiding a synthetic dollar's activity is really two orthogonal problems, and
this repo uses the right tool for each:

| Need | Tool | Status |
|---|---|---|
| Hide **amounts / balances** of the token on-chain | **Confidential Transfers** (Twisted ElGamal + ZK) | ✅ real, testnet (`onchain/agusd-move`) |
| Control **who can read** private positions / deal-data | **Seal** (threshold MPC + on-chain `seal_approve`) | ✅ real, testnet (`onchain/seal-demo.mts`) |
| The full **multi-party permissioned environment** | **Sui Spheres** | 🟡 simulated (no public SDK yet) |
| Publicly **prove solvency** without revealing positions | Regulated Coin + on-chain `BackingProof` | ✅ real, testnet (`onchain/agusd-move`) |

Two of the three privacy needs are met by **real Sui primitives on testnet** —
Confidential Transfers (amounts) and Seal (access control). Only the full Spheres
*environment* is simulated, because it has no public SDK yet. This mirrors Mysten's
own most-advanced reference (Helm), which also uses real Confidential Transfers +
Seal and simulates the orchestration — except we run **both on one network**.
Together: the vault is private, the dollar is private, and solvency is publicly
provable.

## Credits & license

- The confidential Move modules (`onchain/agusd-move/`) are derived from
  [MystenLabs/confidential-transfers](https://github.com/MystenLabs/confidential-transfers)
  (`closed_loop` example), Apache-2.0.
- The Sphere pattern mirrors [abhinavg6](https://github.com/abhinavg6)'s public
  Sui Spheres demos (Mysten Labs).
- Licensed under Apache-2.0 (see `LICENSE`, `NOTICE`).
