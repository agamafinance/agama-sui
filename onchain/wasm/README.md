# Confidential-transfer crypto (bulletproofs wasm)

The amount-hiding used by confidential agUSD (range proofs over ristretto255)
runs client-side in WebAssembly. This directory vendors the **prebuilt** wasm so
the crypto runs on any host — no build toolchain needed.

```bash
node onchain/wasm/proof-test.mjs
# value=100000000  commitment=…  proof=672B  verify=true
# value=999999     commitment=…  proof=672B  verify=true
# proof-A against commitment-B (must be false): false
# ✓ Bulletproofs + ristretto255 run locally
```

## Why it's vendored (the build problem)

`@contra/bulletproofs-wasm` pulls `fastcrypto` (with `features = ["wasm"]`).
`fastcrypto` is monolithic, so enabling it compiles its BLS modules too, which
depend on **`blst`** (a C library) — even though the range-proof binding never
uses it. `blst`'s C is compiled to `wasm32-unknown-unknown` by `cc-rs`, and
**Apple's clang has no WebAssembly backend**:

```
error: unable to create target:
'No available targets are compatible with triple "wasm32-unknown-unknown"'
```

## The fix

Build the wasm inside a Linux container — its clang **does** have the wasm
target (this is what Mysten's CI does). The resulting `.wasm` is
platform-independent, so it then runs under Node on macOS unchanged.

```bash
docker run --rm -v "$PWD":/w -w /w rust:1-bookworm bash docker-build.sh
```

`docker-build.sh` installs clang + the wasm target + wasm-pack and emits
`nodejs/` and `web/` (both committed here). Verified: the full SDK crypto suite
passes locally afterwards (`pnpm --dir ts-sdk vitest run test/unit` → 56/56).

Alternatives that also work: `brew install llvm` + `CC_wasm32_unknown_unknown`
pointing at LLVM's clang; or any Linux/CI runner.
