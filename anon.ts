/**
 * Anonymity proof for the Agama × Sui Spheres core.
 * Same source of truth as the UI (imports ./src/sphere.ts).
 * Run: node --experimental-strip-types anon.ts
 *
 * The claim under test: "from outside the Sphere, you cannot trace a person."
 * We prove it as INDISTINGUISHABILITY — the map (private book -> outside view)
 * is many-to-one, so the outside view does not determine who deposited, how
 * many LPs there are, or how the backing is split.
 */
import { AgamaSphere, PUBLIC } from "./src/sphere.ts";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}
function section(t: string) { console.log(`\n[${t}]`); }

// Two Spheres, SAME total backing ($1,000,000), but different LP identities
// AND a different split. An outside observer must not be able to tell them apart.
function build(book: [string, number][]): AgamaSphere {
  const s = new AgamaSphere();
  s.addVault({ id: "v-senior", name: "Senior Private Credit", aprBps: 900, concentrationCap: 0.7, originator: "Maple", borrower: "ACME Corp", riskRating: "A" });
  for (const [lp, amt] of book) s.deposit(lp, amt);
  s.allocate("v-senior", 600_000_00);
  return s;
}

const A = build([["alice", 500_000_00], ["bob", 300_000_00], ["carol", 200_000_00]]);      // 3 LPs
const B = build([["xavier", 400_000_00], ["yara", 400_000_00], ["zoe", 200_000_00]]);       // different names + split
const C = build([["one_whale", 1_000_000_00]]);                                             // a single LP, same total

const va = JSON.stringify(A.outsideView());
const vb = JSON.stringify(B.outsideView());
const vc = JSON.stringify(C.outsideView());

section("1 — INDISTINGUISHABILITY: different books, identical outside view");
console.log("  book A: alice 500k · bob 300k · carol 200k   (3 LPs)");
console.log("  book B: xavier 400k · yara 400k · zoe 200k    (3 LPs, other names + split)");
console.log("  book C: one_whale 1,000k                      (1 LP, same total)");
ok(va === vb, "A and B produce a BYTE-IDENTICAL outside view");
ok(va === vc, "even a single-whale book (C) is indistinguishable from A");
ok(JSON.parse(va).agusd_supply_cents === 1_000_000_00, "outside view shows only the aggregate supply ($1,000,000)");
console.log("  → the outside view is a pure function of the totals; the split & identities are unrecoverable.");

section("2 — the outside view carries NO identity, count, or amount");
for (const name of ["alice", "bob", "carol", "xavier", "yara", "zoe", "one_whale"]) {
  ok(!va.includes(name) && !vc.includes(name), `no "${name}" anywhere in the outside view`);
}
ok(A.boundaryLeaks().length === 0, "boundaryLeaks() is empty — no member identity crosses");
ok(!va.includes("50000000") && !va.includes("30000000"), "no per-LP amount in the outside view");
ok(!/"member|count":\s*3/.test(va), "the number of LPs never crosses the boundary");

section("3 — role-based visibility INSIDE the Sphere");
ok(A.visiblePositions(PUBLIC).length === 0, "a non-member / the public sees ZERO positions");
ok(A.visiblePositions("alice").length === 1, "alice sees only her OWN position");
ok(A.visiblePositions("bob").filter((p) => p.lp === "alice").length === 0, "bob CANNOT see alice's position (LP↔LP anonymity)");
ok(A.visiblePositions("mallory").length === 0, "an outside rival sees nothing at all");
ok(A.visiblePositions("agama-risk").length === 3, "the operator sees the book (documented trust assumption — for compliance)");

section("4 — what an observer CAN still verify (solvency, without identities)");
const v = A.outsideView();
ok(v.coverage_ratio >= 1, "outside observer can verify agUSD is fully backed");
ok(v.proofs.find((p) => p.key === "within_caps")?.ok === true, "…and that concentration caps hold");
ok(v.backing_commitment.startsWith("0x"), "…against a published commitment binding the totals");

console.log("\n  ┌─ what the WORLD sees ────────────────────────────────┐");
console.log(`  │  supply $${(v.agusd_supply_cents / 100).toLocaleString()}  ·  coverage ${(v.coverage_ratio * 100).toFixed(1)}%  ·  ${v.backing_commitment}  │`);
console.log("  └──────────────────────────────────────────────────────┘");
console.log("     (no LP, no amount, no count, no graph — three different books look identical)");

console.log(`\n==== ${passed} passed, ${failed} failed ====`);
if (failed > 0) process.exit(1);
