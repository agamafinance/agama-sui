/**
 * The SEAM, made real.
 *
 * Drives the (simulated) Agama Sphere private-credit state, computes the public
 * twin exactly as the UI does, then posts that attested twin — NAV, supply,
 * backing commitment — into the real on-chain `BackingProof` on Sui testnet.
 *
 * Private who/positions/allocation stay in the Sphere; only the aggregate proof
 * crosses. This is `publicTwin()` wired to Sui instead of to an in-memory read.
 *
 * Run:  node --experimental-strip-types onchain/seam.ts
 * (requires the testnet CLI on the `testnet` env, funded)
 */
import { execFileSync } from "node:child_process";
import { AgamaSphere } from "../src/sphere.ts";

const SUI = `${process.env.HOME}/.local/bin/sui`;
const PKG = "0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab";
const ADMIN = "0x9cc7133b57f8d8951f17735114072eed6f80a874e77582c08f3baea12f2d2c3a";
const PROOF = "0x0af97dc270fbfbb6f9083b49c5ee63cded60e18e397affb1919858f3a015ca73";

// --- 1. Private side: run the Sphere (nobody outside sees any of this) ---
const s = new AgamaSphere();
s.addVault({ id: "v-senior", name: "Senior Private Credit", aprBps: 900, concentrationCap: 0.7, originator: "Maple", borrower: "ACME Corp", riskRating: "A" });
s.addVault({ id: "v-junior", name: "Junior Tranche", aprBps: 1400, concentrationCap: 0.4, originator: "Qiro", borrower: "Beta LLC", riskRating: "C" });
s.deposit("alice", 100_000_00);
s.deposit("bob", 50_000_00);
s.allocate("v-senior", 90_000_00);
s.allocate("v-junior", 40_000_00);
s.accrue("v-senior", 3_000_00);

const twin = s.publicTwin();
console.log("Private Sphere state (never leaves the Sphere):");
console.log("  positions visible to public :", s.visiblePositions("*").length);
console.log("  positions Agama can see      :", s.visiblePositions("agama-risk").length);
console.log("\nAttested public twin to post:");
console.log("  nav_cents      :", twin.nav_cents);
console.log("  supply_cents   :", twin.agusd_supply_cents);
console.log("  coverage       :", (twin.coverage_ratio * 100).toFixed(2) + "%");
console.log("  commitment     :", twin.backing_commitment);

// --- 2. Cross the seam: post the twin to the on-chain BackingProof ---
console.log("\nPosting to Sui testnet BackingProof …");
const out = execFileSync(SUI, [
  "client", "call",
  "--package", PKG, "--module", "agusd", "--function", "publish_backing",
  "--args", ADMIN, PROOF, String(twin.nav_cents), String(twin.agusd_supply_cents), twin.backing_commitment,
  "--json",
], { encoding: "utf8" });
const digest = JSON.parse(out.slice(out.indexOf("{"))).digest;
console.log("  tx:", digest);

// --- 3. Public side: read it back — anyone can verify, sees no position ---
const objOut = execFileSync(SUI, ["client", "object", PROOF, "--json"], { encoding: "utf8" });
const f = JSON.parse(objOut.slice(objOut.indexOf("{"))).content;
console.log("\nOn-chain BackingProof (public, verifiable):");
console.log("  nav_cents      :", f.nav_cents);
console.log("  supply_cents   :", f.supply_cents);
console.log("  coverage_bps   :", f.coverage_bps, `(${Number(f.coverage_bps) / 100}%)`);
console.log("  fully_backed   :", Number(f.coverage_bps) >= 10000);
console.log("\n✓ Sphere private state → attested twin → live on Sui. No position crossed.");
