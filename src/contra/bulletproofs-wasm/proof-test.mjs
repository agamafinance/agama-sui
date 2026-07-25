import * as bp from "./nodejs/contra_bulletproofs_wasm.js";
const dst = new TextEncoder().encode("agama-demo");
const blinding = new Uint8Array(32); blinding[0] = 7;

// two different hidden amounts, both proven in range without revealing them
for (const value of [100_000_000n, 999_999n]) {
  const res = bp.rangeProof(value, blinding, 64, dst);
  const ok = bp.verifyRangeProof(res.proof, res.commitment, 64, dst);
  console.log(`value=${value}  commitment=${Buffer.from(res.commitment).toString("hex").slice(0,24)}…  proof=${res.proof.length}B  verify=${ok}`);
}

// wrong proof must NOT verify (guard against the throw path too)
const a = bp.rangeProof(100_000_000n, blinding, 64, dst);
const b = bp.rangeProof(999_999n, blinding, 64, dst);
let mismatch;
try { mismatch = bp.verifyRangeProof(a.proof, b.commitment, 64, dst); }
catch { mismatch = false; }
console.log("proof-A against commitment-B (must be false):", mismatch);
console.log("\n✓ Bulletproofs + ristretto255 run LOCALLY on macOS — the amount-hiding crypto is unblocked.");
