# Confidential agUSD — end-to-end demo (verified on devnet)

`confidential-demo.mts` runs the full confidential flow against the **live
devnet deployment** (`DEVNET.md`): a fresh, KYC-whitelisted LP mints agUSD,
wraps it into its shielded balance, and merges — the balance is stored on-chain
as **ElGamal ciphertexts** and recovered only with the LP's **viewing key**.

## Verified run

```
fresh LP          : 0x81cd289196a63953cb35218d233b335732e113e8968a9b6819281f3829e2b39b
ElGamal viewing pk: 3060943a258142bc176e8ed6 …

  ✓ 1. admin funds LP gas + KYC-whitelists it        (ANGRDexWX1yU…)
  ✓ 2. LP creates its confidential Account           (Gen8b5KvjDnA…)
  ✓ 3. LP registers TokenAccount (KYC-gated register)(ChttJ644qdf5…)
  ✓ 4. LP faucets USDC → mints 100000000 agUSD       (EkSbPf4CcbhU…)
  ✓ 5. LP wraps agUSD → confidential balance         (3kpJ64APz5Zn…)
  ✓ 6. LP merges → active encrypted balance          (Gq1Wwaan7Y1E…)
      (bulletproof generated locally)

=== RESULT ===
On-chain, the balance lives as ElGamal ciphertexts — no plaintext amount is stored.
Recovered with the viewing key (SDK-side decryption):
  active balance : 100000000 (= 100.00 agUSD)

✓ Amount hidden on-chain, recovered only with the key.
```

Every step is a real devnet transaction (digests above). Re-runnable: each run
uses a fresh LP, so there is no stale state.

## What it proves

- **Amounts are hidden on-chain.** The balance is four Twisted-ElGamal
  ciphertexts, not a `u64`. Only the holder's key decrypts it.
- **The range proof runs locally.** Step 6 generates a bulletproof client-side
  using the wasm from `onchain/wasm/` (built via Docker — Apple clang can't
  target wasm; see that folder's README).
- **KYC gating works.** Registration only succeeds for a whitelisted address
  (`confidential_agusd::register` checks the shared `Whitelist`).

## Run it

The script imports the Confidential Transfers TypeScript SDK, so it runs from
inside a checkout of that repo:

```bash
git clone https://github.com/MystenLabs/confidential-transfers
cd confidential-transfers
# build the bulletproofs wasm once (or copy the prebuilt one from onchain/wasm/)
docker run --rm -v "$PWD/utils/bulletproofs-wasm":/w -w /w rust:1-bookworm \
  bash -c 'apt-get update -qq && apt-get install -y -qq clang curl && \
           rustup target add wasm32-unknown-unknown && \
           curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh && \
           wasm-pack build --target nodejs --release --out-dir nodejs --no-pack'
cd ts-sdk && pnpm install && pnpm add -D tsx
cp /path/to/agama-sphere/onchain/confidential-demo.mts .
AGAMA_KEY=suiprivkey1... pnpm exec tsx confidential-demo.mts
```

`AGAMA_KEY` is the agUSD issuer key (holds the `WhitelistAdminCap`); it funds
and KYC-whitelists the ephemeral LP each run.
