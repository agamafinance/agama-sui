/**
 * Headless test for the Agama × Sui Spheres core.
 * Same source of truth as the React UI (imports ./src/sphere.ts).
 * Run: node --experimental-strip-types smoke.ts
 */
import { AgamaSphere, PUBLIC } from "./src/sphere.ts";

let passed = 0, failed = 0;
function ok(cond: boolean, label: string) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.log(`  ✗ ${label}`); }
}
function section(t: string) { console.log(`\n[${t}]`); }

const s = new AgamaSphere();
s.addVault({ id: "v-senior", name: "Senior Private Credit", aprBps: 900, concentrationCap: 0.7, originator: "Maple", borrower: "ACME Corp", riskRating: "A" });
s.addVault({ id: "v-junior", name: "Junior Tranche", aprBps: 1400, concentrationCap: 0.4, originator: "Qiro", borrower: "Beta LLC", riskRating: "C" });

section("1 — LP deposits are PRIVATE");
const alice = s.deposit("alice", 100_000_00);
const bob = s.deposit("bob", 50_000_00);
ok(alice.ok, "alice deposit accepted");
ok(bob.ok, "bob deposit accepted");
ok(s.visiblePositions(PUBLIC).length === 0, "public viewer sees ZERO positions");
ok(s.visiblePositions("alice").length === 1, "alice sees only her own position");
ok(s.visiblePositions("mallory").length === 0, "a rival LP sees nothing");
ok(s.visiblePositions("agama-risk").length === 2, "Agama risk team sees positions it's ACL'd on");
s.allocate("v-senior", 90_000_00);
s.allocate("v-junior", 40_000_00);

section("2 — The public twin leaks NOTHING per-LP");
const twin = s.publicTwin();
const j = JSON.stringify(twin);
ok(!j.includes("alice") && !j.includes("bob"), "no LP identity in public twin");
ok(!j.includes("10000000"), "no per-position amount in public twin");
ok(twin.agusd_supply_cents === 150_000_00, "public sees only aggregate supply");
ok(twin.coverage_ratio >= 1, "public can verify agUSD is fully backed");
ok(twin.backing_commitment.startsWith("0x"), "backing commitment published");
ok(s.visibleVaults(PUBLIC).length === 0, "public sees no vault internals");
ok(s.visibleVaults("agama-risk").length === 2, "Agama sees vault internals");

section("3 — Bounded authority (with reasons)");
s.denyKyc("evil");
const denied = s.deposit("evil", 1000_00);
ok(!denied.ok && /KYC/.test((denied as any).reason), "KYC deny-list rejects deposit");
const s2 = new AgamaSphere();
s2.addVault({ id: "j", name: "Junior", aprBps: 1400, concentrationCap: 0.4, originator: "Qiro", borrower: "X", riskRating: "C" });
s2.deposit("z", 100_000_00);
const capped = s2.allocate("j", 50_000_00);
ok(!capped.ok && /concentration cap/.test((capped as any).reason), "concentration cap rejects over-allocation");

section("4 — Solvency invariant");
const t2 = s.publicTwin();
ok(t2.agusd_supply_cents <= t2.nav_cents, "supply never exceeds backing");
ok(t2.proofs.find((p) => p.key === "fully_backed")?.ok === true, "fully_backed proof holds");

section("5 — Yield → NAV → sagUSD rate");
const before = s.publicTwin().sagusd_redeem_rate;
s.stake(50_000_00);
s.accrue("v-senior", 3_000_00);
const after = s.publicTwin();
ok(after.nav_cents > 150_000_00, "NAV rose with accrued yield");
ok(after.sagusd_redeem_rate > before, "sagUSD redeem rate rose");
ok(after.coverage_ratio > 1, "coverage now exceeds 100%");

section("6 — Redeem burns supply, positions stay private");
const r = s.redeem("alice", 40_000_00);
const t3 = s.publicTwin();
ok(r.ok, "alice redeems part of her position");
ok(t3.agusd_supply_cents === 110_000_00, "agUSD supply burned on redeem");
ok(s.visiblePositions(PUBLIC).length === 0, "positions still invisible after redeem");
ok(t3.coverage_ratio >= 1, "still fully backed after redeem");

console.log(`\n==== ${passed} passed, ${failed} failed ====`);
if (failed > 0) process.exit(1);
