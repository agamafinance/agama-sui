# agUSD — Regulated Coin + Backing Proof (Sui testnet, LIVE)

The **prize-qualifying public layer** of agUSD, deployed on **Sui testnet**
(the track requires testnet/mainnet). A **Regulated Coin** (issuer holds a
`DenyCapV2` KYC denylist + global pause), issuer-gated mint, and a shared
`BackingProof` object — the **seam** the private side (Sphere) posts its
attested NAV / supply / coverage / commitment into. Anyone can verify agUSD is
fully backed on-chain without seeing a single position.

Deployed by `0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4`.

## Live object IDs (testnet)

| What | Object ID |
|---|---|
| **agUSD package** | `0x61b4933a81752e1a60c0ada65338208603d86f2480bb68e5bbd72937a99b5291` |
| `Issuer` (mint cap, Agama) | `0x2e9714300f500cef1ed7aa9f9f8382b02a58bbbac1d698739d38da724a1c38a0` |
| **`BackingProof`** (shared — the Sphere seam) | `0x4255963ccf1bc10c8ae750e7e17c262bda335ffcc48ae026b88ced83d7549b90` |
| `DenyCapV2<AGUSD>` (KYC denylist) | `0x4bf5163b102634254a1bd9da1dedede720986d9ee047fe5dd165fac013a7dab9` |

Explorer: `https://suiscan.xyz/testnet/object/0x4255963ccf1bc10c8ae750e7e17c262bda335ffcc48ae026b88ced83d7549b90`

## Verified working (on-chain)

- `mint(issuer, 150000000, me)` → 150 agUSD minted. ✅
- `publish_backing(nav=153000000, supply=150000000, commitment=0x1f4cf7b1)` → ✅
- On-chain `BackingProof` now reads: `coverage_bps = 10200` (**102%**), `nav_cents=153000000`, `supply_cents=150000000`, commitment `H0z3sQ==` (base64 of 0x1f4cf7b1). Coverage is computed **inside the contract** from nav/supply — the proof can't overstate backing.

## Move source

`onchain/agusd-testnet/sources/agusd.move` — built with the testnet toolchain
(`sui@testnet` via suiup). No confidential deps → builds on the stable framework.

## Two agUSD deployments, two privacy tools

| Layer | Network | Hides | Status |
|---|---|---|---|
| **Confidential agUSD** | devnet | transfer **amounts** (Twisted ElGamal + ZK) | `onchain/DEVNET.md` |
| **Regulated agUSD + BackingProof** | testnet | nothing (public, KYC denylist) — the verifiable public projection | this file |

The private **who/positions/allocation** layer is the Sphere simulation
(`agama-sphere/`). The seam script (`onchain/seam.ts`) posts the Sphere's
attested twin into the testnet `BackingProof`.
