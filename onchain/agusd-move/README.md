# agUSD — the unified Move package (Sui testnet)

One package holds the whole on-chain system. Live IDs in
[`../DEPLOYMENT.md`](../DEPLOYMENT.md).

- `usdc.move` — test USDC reserve (regulated coin + faucet).
- `agusd.move` — pool-backed agUSD (1:1 with USDC), plus the shared
  `BackingProof` the Sphere posts its attested twin into.
- `sagusd.move` — sagUSD: yield-bearing `StakingVault`; stake/unstake priced at
  NAV (not 1:1); `accrue_yield` for the Allocation Engine.
- `confidential_agusd.move` — KYC-whitelist-gated confidential variant on the
  Confidential Transfers framework (amounts hidden with Twisted ElGamal + ZK).

The `agusd`/`usdc` layer is adapted from the `closed_loop` example in
[MystenLabs/confidential-transfers](https://github.com/MystenLabs/confidential-transfers)
(Apache-2.0).

## Build / deploy (reproduce)

Everything is on **testnet** — which supports the `rangeproofs` (bulletproofs)
native the confidential framework needs (verified by publishing `contra` to
testnet). No devnet required.

```bash
suiup install sui@testnet && suiup default set sui@testnet

# 1. publish the contra framework to testnet (once)
git clone https://github.com/MystenLabs/confidential-transfers
cd confidential-transfers/move
sui client switch --env testnet && sui client publish --skip-dependency-verification

# 2. drop this package under apps/, link contra locally, publish
cp -r /path/to/agama-sphere/onchain/agusd-move confidential-transfers/apps/agusd/move
cd confidential-transfers/apps/agusd/move
sui client publish --skip-dependency-verification
# then confidential_agusd::setup_and_keep(AgusdAdminCap, Pool, contra TokenRegistry)
```
