#!/usr/bin/env bash
# Build the contra bulletproofs wasm inside a Linux container (clang has the
# WebAssembly target; Apple clang does not). Produces platform-independent
# nodejs/ + web/ artifacts usable by node on any host.
set -euo pipefail

echo "[1/4] apt clang"
apt-get update -qq && apt-get install -y -qq clang curl >/dev/null

echo "[2/4] rust wasm target"
rustup target add wasm32-unknown-unknown >/dev/null

echo "[3/4] wasm-pack"
curl -sSfL https://rustwasm.github.io/wasm-pack/installer/init.sh | sh >/dev/null 2>&1
export PATH="/usr/local/cargo/bin:$HOME/.cargo/bin:/root/.cargo/bin:$PATH"
command -v wasm-pack || cargo install wasm-pack -q

echo "[4/4] build nodejs + web"
wasm-pack build --target nodejs --release --out-dir nodejs --no-pack && rm -f nodejs/.gitignore
wasm-pack build --target web    --release --out-dir web    --no-pack && rm -f web/.gitignore
echo "DONE. artifacts:"; ls -la nodejs web
