/**
 * End-to-end test of the Agama × Sui Spheres demo, driven through a real
 * browser (Chromium via Playwright). Asserts the privacy invariants that make
 * or break the pitch, and captures screenshots at each beat.
 *
 * Run (dev server must be up on :5178):  node e2e.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5178/";
const SHOTS = "e2e-shots";
mkdirSync(SHOTS, { recursive: true });

let pass = 0, fail = 0;
const fails = [];
function ok(cond, label) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; fails.push(label); console.log(`  ✗ ${label}`); }
}
function section(t) { console.log(`\n[${t}]`); }

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errors = [];
// Ignore network/resource noise from the live on-chain panel (external RPC);
// we only care about app-logic errors here.
const isNetworkNoise = (t) => /Failed to load resource|net::ERR|ERR_|status of (4|5)\d\d/i.test(t);
page.on("console", (m) => { if (m.type() === "error" && !isNetworkNoise(m.text())) errors.push(m.text()); });
page.on("pageerror", (e) => { if (!isNetworkNoise(String(e))) errors.push(String(e)); });

await page.goto(URL, { waitUntil: "networkidle" });

// helpers
const btn = (name) => page.getByRole("button", { name, exact: true });
const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
async function chip(label) { await page.getByRole("button", { name: label, exact: true }).click(); }
// read a stat card value by its label
async function stat(label) {
  const card = page.locator(".stat", { has: page.locator(".stat-k", { hasText: label }) });
  return (await card.locator(".stat-v").innerText()).trim();
}
async function visibleRows() {
  // count LP position rows in the private pane table body
  const t = page.locator(".pane.private table.tbl").first();
  if (await t.count() === 0) return 0;
  return await t.locator("tbody tr").count();
}

section("0 — Initial load");
ok((await page.title()) === "Agama × Sui Spheres", "page title correct");
ok(await page.getByRole("heading", { name: /Agama/ }).isVisible(), "header visible");
ok((await stat("agUSD supply")) === "$0", "initial agUSD supply is $0");
ok((await page.locator(".pane.private .empty").first().isVisible()), "public viewer sees empty positions initially");
ok(errors.length === 0, "no console errors on load");
await shot("00-initial");

section("1 — Deposits move the PUBLIC twin");
await btn("Deposit · Alice $100k").click();
await btn("Deposit · Bob $50k").click();
ok((await stat("agUSD supply")) === "$150,000", "supply = $150,000 after two deposits");
ok((await stat("NAV (backing)")) === "$150,000", "NAV = $150,000");
ok((await stat("Coverage")) === "100.0%", "coverage exactly 100%");
await shot("01-after-deposits-public-view");

section("2 — The PRIVACY toggle (the money shot)");
// default viewer is Public → zero positions
ok((await visibleRows()) === 0, "PUBLIC viewer sees 0 positions");
await chip("Alice (LP)");
ok((await visibleRows()) === 1, "Alice sees exactly 1 position (her own)");
await shot("02a-alice-view");
await chip("Agama Risk");
ok((await visibleRows()) === 2, "Agama Risk sees both positions");
const agamaText = await page.locator(".pane.private").innerText();
ok(/Maple/.test(agamaText) && /Qiro/.test(agamaText), "Agama sees vault internals (originators)");
await shot("02b-agama-view");
await chip("Public / Sui");
ok((await visibleRows()) === 0, "back to PUBLIC → 0 positions again");
// data region of the private pane (tables + empty state), NOT the viewer chips
const dataText = await page.locator(".pane.private .empty, .pane.private table.tbl").allInnerTexts();
const dataJoined = dataText.join(" ");
ok(!/Maple/.test(dataJoined) && !/Qiro/.test(dataJoined), "public viewer sees no vault originators");
// and the public twin (right pane) never contains a name/amount
const publicPane = await page.locator(".pane.public").innerText();
ok(!/alice/i.test(publicPane) && !/\bbob\b/i.test(publicPane), "public twin has no LP identity");

section("3 — Bounded authority (rejections with reasons)");
await btn("Deposit · KYC-denied ⛔").click();
const flash1 = await page.locator(".flash").innerText().catch(() => "");
ok(/KYC/.test(flash1), "KYC-denied deposit is rejected with a reason");
ok((await stat("agUSD supply")) === "$150,000", "supply unchanged after blocked deposit");
await shot("03-kyc-rejected");

section("4 — Allocation & concentration cap");
await btn("Allocate → Senior").click();
await btn("Allocate → Junior").click();
await btn("Allocate → Junior (over cap)").click();
const flash2 = await page.locator(".flash").innerText().catch(() => "");
ok(/concentration cap/i.test(flash2), "over-cap allocation rejected with cap reason");
await shot("04-cap-rejected");

section("5 — Yield → NAV → coverage → sagUSD");
const rateBefore = parseFloat(await stat("sagUSD rate"));
await btn("Accrue yield").click();
const navAfter = await stat("NAV (backing)");
const covAfter = parseFloat((await stat("Coverage")).replace("%", ""));
const rateAfter = parseFloat(await stat("sagUSD rate"));
ok(navAfter !== "$150,000", `NAV rose after yield (now ${navAfter})`);
ok(covAfter > 100, `coverage now above 100% (${covAfter}%)`);
ok(rateAfter > rateBefore, `sagUSD redeem rate rose (${rateBefore} → ${rateAfter})`);
await shot("05-after-yield");

section("6 — Redeem burns supply, positions stay private");
await btn("Redeem · Alice $40k").click();
ok((await stat("agUSD supply")) === "$110,000", "supply burned to $110,000 after redeem");
await chip("Public / Sui");
ok((await visibleRows()) === 0, "positions still invisible to public after redeem");
const proofsOk = await page.locator(".proofs li.ok").count();
ok(proofsOk >= 2, "public proofs still green (fully backed / caps)");
await shot("06-after-redeem");

section("7 — No runtime errors across the whole flow");
ok(errors.length === 0, `zero console/page errors (saw ${errors.length})`);
if (errors.length) console.log("   errors:", errors.slice(0, 5));

await browser.close();
console.log(`\n==== E2E: ${pass} passed, ${fail} failed ====`);
if (fails.length) console.log("FAILED:", fails.join(" | "));
process.exit(fail > 0 ? 1 : 0);
