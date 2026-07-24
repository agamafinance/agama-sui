# Confidential agUSD (Move, devnet)

agUSD as a **Confidential Token** on Mysten Labs' Confidential Transfers
framework (`contra`). Amounts and balances are hidden on-chain via Twisted
ElGamal + zero-knowledge proofs; `register` is KYC-whitelist-gated.

- `usdc.move` — test USDC reserve (regulated coin + faucet).
- `agusd.move` — pool-backed agUSD, 1:1 with USDC (`mint` / `redeem`).
- `confidential_agusd.move` — KYC-gated confidential variant + `setup_and_keep`.

Adapted from the `closed_loop` example in
[MystenLabs/confidential-transfers](https://github.com/MystenLabs/confidential-transfers)
(Apache-2.0).

## Live deployment

Deployed and initialized on **Sui devnet** — object IDs and the publish
transactions are in [`../DEVNET.md`](../DEVNET.md). The confidential build needs
the devnet `rangeproofs` (bulletproofs) native.

## Build / deploy (reproduce)

The `contra` framework must be available as a local dependency (see the `contra`
entry in `Move.toml`). To reproduce:

```bash
# 1. devnet toolchain (stable homebrew CLI lacks `rangeproofs`)
suiup install sui@devnet && suiup default set sui@devnet

# 2. get the framework, drop this package under apps/
git clone https://github.com/MystenLabs/confidential-transfers
cp -r onchain/agusd-move confidential-transfers/apps/agusd/move   # contra = ../../../move

# 3. build & publish (devnet resets often — republish contra if the pinned
#    package id is gone, then this package on top)
cd confidential-transfers/apps/agusd/move
sui client switch --env devnet && sui client faucet
sui client publish --skip-dependency-verification
```
