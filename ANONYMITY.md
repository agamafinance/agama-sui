# Anonymity & Confidentiality — the honest threat model

The point of Agama is privacy. This document says exactly what is private, what is
not, and against whom — with reproducible on-chain evidence. No hand-waving.

## TL;DR

| Property | Who it hides from | Status |
|---|---|---|
| **Amounts** of positions / balances | competitors, public | ✅ real, on-chain (Confidential Transfers) |
| **Deal data** (originator, borrower, terms) | competitors, public | ✅ real, on-chain (Seal + Walrus) |
| **Identities & the transaction graph** | competitors, public, the chain | ✅ via the **Sphere** boundary (simulated — see below) |
| Everything | the **Sphere operator** (Agama) & the **regulator** | ❌ visible **by design** (KYC / auditability) |

**Confidential ≠ anonymous.** We separate the two on purpose:
- **Confidentiality** hides *amounts and deals* — done on the public chain with real Sui crypto.
- **Anonymity** hides *who and the links between them* — done by the **Sphere**, so individual
  activity never touches the public chain; only an attested aggregate does.

## The two layers

```
                    ┌──────────────── INSIDE the Sphere (private) ────────────────┐
   LP joins ──────► │  deposits · allocations · positions · the LP↔vault graph    │
   (governed        │  role-based visibility: an LP sees only its own position,   │
    membership)     │  the operator sees the book (for compliance), the public    │
                    │  sees NOTHING                                               │
                    └───────────────────────────┬─────────────────────────────────┘
                                                 │  only SELECTED OUTCOMES cross
                                                 ▼
                    ┌──────────────── OUTSIDE — the public Sui chain ─────────────┐
                    │  the attested aggregate: supply, NAV, coverage 102%,        │
                    │  a commitment binding the TOTALS — no LP, no amount, no      │
                    │  count, no graph  →  BackingProof (real, on testnet)        │
                    └─────────────────────────────────────────────────────────────┘
```

1. **Sui Spheres — anonymity.** A Sphere is a controlled environment where known,
   governed participants transact privately; *"inside a Sphere coordination happens
   privately; outside, only selected outcomes are made visible"* (Sui Foundation).
   Individual LP activity lives inside — so from the outside there is no person to trace.
2. **Confidential Transfers — amount privacy at the public boundary.** When value does
   cross onto the public L1 (minting/holding public agUSD), amounts are encrypted
   (Twisted ElGamal + ZK). This is the belt-and-suspenders for the public crossing.
3. **Seal + Walrus — deal confidentiality.** Term sheets / originator data are Seal-encrypted
   and stored on Walrus; only the owner or the Agama allowlist can decrypt.

## The Sphere anonymity property — proven, not asserted

The outside view is a **pure function of the aggregates** (`nav`, `supply`, redeem rate).
It does not depend on *who* the LPs are, *how many* there are, or *how* the backing is
split. So the map `private book → outside view` is **many-to-one**: you cannot invert it
to recover a person.

`anon.ts` proves this as **indistinguishability** — three different books produce a
byte-identical outside view:

```
book A: alice 500k · bob 300k · carol 200k   (3 LPs)
book B: xavier 400k · yara 400k · zoe 200k   (3 LPs, other names + split)
book C: one_whale 1,000k                     (1 LP, same total)
        → all three yield the SAME outside view: supply $1,000,000 · coverage 100% · 0xda336bb9
```

Run it: `npm run anon` (21 assertions). Role-based visibility inside is asserted too:
the public sees zero positions, an LP sees only its own, one LP cannot see another,
and the operator sees the book (the documented trust assumption).

## What an outside observer actually sees — reproducible evidence

`onchain/privacy-audit.mts` deposits and transfers on **real testnet**, then reads the
txs back from a **public RPC** and prints what is legible. This is the honest picture of
the *public-chain* layer (i.e. when you do NOT use the Sphere boundary):

| Action on the public chain | What an observer reads |
|---|---|
| Deposit (wrap) USDC → cagUSD | depositor address ✅ · amount `100 agUSD` ✅ **visible** |
| Confidential transfer LP → Bob | amount ❌ **hidden** · but sender + receiver + the link ✅ **visible** |

This is why the anonymity must come from the **Sphere** (keep the activity off the public
chain), not from Confidential Transfers alone (which hides amounts, not identities).

## Trust assumptions — stated plainly

- **The Sphere operator (Agama) sees the full book.** Anonymity here is *from the outside
  world*, not *from the operator*. That is the correct model for regulated private credit:
  the operator must KYC and the regulator must be able to audit.
- **KYC binds identity off-chain.** A participant is known to the operator; they are just
  not exposed to competitors or the public chain.
- This is **not** trustless, Zcash-style anonymity. It is *institutional anonymity*:
  invisible to the market, accountable to the regulator.

## Real vs simulated — no overclaiming

- **Sui Spheres is an announced design preview** (Sui Foundation, May 2026): governed
  participation, role-based visibility, selected public outcomes. It has **no public SDK
  or testnet** yet — it is being built with a handful of design partners. So our Sphere
  (`src/sphere.ts`) is a **faithful simulation** of that model: no god-view, role-gated
  reads, and an aggregate-only boundary. The anonymity property is enforced *by
  construction* and proven in `anon.ts`.
- **Real and on testnet today:** the `BackingProof` the Sphere publishes, the Confidential
  Transfers (amounts), Seal + Walrus (deal docs), and the Nautilus-attested NAV.

## Roadmap to stronger anonymity

- **When Spheres ships:** run the private book inside a real Sphere — the simulation seam
  (`outsideView()` + `onchain/seam.ts`) is the exact surface a Spheres SDK would replace.
- **Optional trustless layer** (if we ever want anonymity *from the operator too*):
  stealth addresses per LP + a shielded entry so deposit amounts don't leak at the public
  crossing + a relayer for gas/IP. This trades away the KYC/auditability story, so it is a
  deliberate product choice, not a default.
