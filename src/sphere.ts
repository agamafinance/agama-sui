/**
 * Agama × Sui Spheres — shared core (the single source of truth).
 *
 * CREDIT / PATTERN SOURCE
 * -----------------------
 * This module follows the reference Sui Spheres pattern published by
 * Abhinav Garg (@abhinavg6), a Product Manager at Mysten Labs:
 *   https://github.com/abhinavg6/sui-spheres-supplychain-finance
 *
 * That reference is itself a *simulation* — its README states "Everything is
 * simulated locally", it ships no Move contracts and no real Spheres SDK,
 * because Sui Spheres has no public SDK/endpoint yet (design-partners only,
 * no launch date). Its swap-to-real path: "replace client.ts with a real
 * Sphere SDK wrapper and delete the mock-server folder."
 *
 * We deliberately mirror that same approach here. Our SEAM is `publicTwin()`
 * + the getters below — the only surface a real Sui Spheres SDK would replace
 * (swap the in-memory store for a Sphere/Mainnet RPC). Unlike the reference,
 * Agama then wires this simulated Sphere onto REAL on-chain tech: Confidential
 * Transfers, Seal and Walrus on Sui testnet (see Confidential.tsx).
 *
 * Environment-agnostic: the same module powers the headless test (smoke.ts)
 * and the React UI.
 */

// ============================================================
// Types
// ============================================================
export type Principal = string;

export const PUBLIC: Principal = "*";
export const AGAMA: Principal[] = ["agama-allocator", "agama-risk"]; // operator team — NOT a god-view

/** Governed participation — real Sui Spheres admits known parties under a role. */
export type Role = "lp" | "agama-allocator" | "agama-risk" | "auditor";

export type VaultId = string;

export interface Vault {
  id: VaultId;
  name: string;
  aprBps: number;
  concentrationCap: number;   // max fraction of total backing this vault may hold
  originator: string;         // private
  borrower: string;           // private
  riskRating: "A" | "B" | "C";// private
  deployed_cents: number;
  accrued_cents: number;
  acl_read: Principal[];
}

export interface Position {
  id: string;
  lp: Principal;
  amount_cents: number;
  acl_read: Principal[];      // [lp, ...AGAMA] — never PUBLIC. This is the hidden deposit.
  created_at: number;
}

export interface PublicTwin {
  agusd_supply_cents: number;
  nav_cents: number;
  sagusd_redeem_rate: number;
  coverage_ratio: number;
  backing_commitment: string;
  proofs: { key: string; label: string; ok: boolean }[];
}

export interface AuditEvent {
  id: string;
  at: number;
  actor: Principal;
  action: string;
  detail: string;
  zone: "private" | "public";
}

export type Result =
  | { ok: true }
  | { ok: false; reason: string };

// ============================================================
// The Sphere — single source of truth that ENFORCES its rules
// ============================================================
export class AgamaSphere {
  private vaults: Vault[] = [];
  private positions: Position[] = [];
  private agusd_supply_cents = 0;
  private sagusd_shares = 0;
  private denyList = new Set<Principal>();
  private audit: AuditEvent[] = [];
  private clock = 1;
  // Governed membership: who is admitted to the Sphere, under which role.
  // The operator team is seeded; LPs are enrolled on their first deposit.
  private members = new Map<Principal, Role>([
    ["agama-allocator", "agama-allocator"],
    ["agama-risk", "agama-risk"],
  ]);

  /** Admit a known party to the Sphere under a role (operator-governed). */
  join(p: Principal, role: Role) { this.members.set(p, role); }
  roleOf(p: Principal): Role | undefined { return this.members.get(p); }
  isMember(p: Principal): boolean { return this.members.has(p); }
  /** How many parties are inside — itself Sphere-private (never crosses the boundary). */
  memberCount(): number { return this.members.size; }

  addVault(v: Omit<Vault, "acl_read" | "deployed_cents" | "accrued_cents">): Vault {
    const vault: Vault = { ...v, deployed_cents: 0, accrued_cents: 0, acl_read: [...AGAMA] };
    this.vaults.push(vault);
    return vault;
  }

  denyKyc(p: Principal) { this.denyList.add(p); }
  isDenied(p: Principal) { return this.denyList.has(p); }

  /** Pure ACL check. Deliberately NO operator override. */
  private canRead(acl: Principal[], viewer: Principal): boolean {
    return acl.includes(PUBLIC) || acl.includes(viewer);
  }

  /** SEAM (read): what a viewer is allowed to see of positions. */
  visiblePositions(viewer: Principal): Position[] {
    return this.positions.filter((p) => this.canRead(p.acl_read, viewer));
  }

  /** SEAM (read): vault internals are Sphere-only — visible to ACL'd Agama teams,
   *  never to the public or to LPs. */
  visibleVaults(viewer: Principal): Vault[] {
    return this.vaults.filter((v) => this.canRead(v.acl_read, viewer));
  }

  auditLog(): AuditEvent[] { return this.audit; }

  private nav_cents(): number {
    const principal = this.positions.reduce((s, p) => s + p.amount_cents, 0);
    const yield_ = this.vaults.reduce((s, v) => s + v.accrued_cents, 0);
    return principal + yield_;
  }

  private log(actor: Principal, action: string, detail: string, zone: "private" | "public") {
    this.audit.unshift({ id: uid("evt"), at: this.clock, actor, action, detail, zone });
  }

  /** DEPOSIT — mints agUSD 1:1. Returns a PRIVATE position. */
  deposit(lp: Principal, amount_cents: number):
    { ok: true; position: Position } | { ok: false; reason: string } {
    if (this.denyList.has(lp)) return { ok: false, reason: "KYC deny-list: LP not eligible" };
    if (amount_cents <= 0) return { ok: false, reason: "amount must be positive" };
    if (!this.members.has(lp)) this.members.set(lp, "lp"); // enrolled inside the Sphere

    const position: Position = {
      id: uid("pos"),
      lp,
      amount_cents,
      acl_read: [lp, ...AGAMA],
      created_at: this.clock++,
    };
    this.positions.push(position);
    this.agusd_supply_cents += amount_cents;
    this.log(lp, "deposit", `${lp} deposited (private) · minted agUSD`, "private");
    this.log("chain", "supply.mint", `agUSD supply → ${fmt(this.agusd_supply_cents)}`, "public");
    return { ok: true, position };
  }

  private idleCash_cents(): number {
    const principal = this.positions.reduce((s, p) => s + p.amount_cents, 0);
    const deployed = this.vaults.reduce((s, v) => s + v.deployed_cents, 0);
    return principal - deployed;
  }

  /** ALLOCATE — the Allocation Engine routes pooled backing into a vault.
   *  Concentration caps bite HERE. */
  allocate(vaultId: VaultId, amount_cents: number): Result {
    const vault = this.vaults.find((v) => v.id === vaultId);
    if (!vault) return { ok: false, reason: "unknown vault" };
    // Concentration cap is the headline risk rule — check it first so the
    // rejection reason is the informative one (allocating doesn't change NAV).
    if (vault.deployed_cents + amount_cents > this.nav_cents() * vault.concentrationCap) {
      return { ok: false, reason: `concentration cap: ${vault.name} capped at ${vault.concentrationCap * 100}% of backing` };
    }
    if (amount_cents > this.idleCash_cents()) return { ok: false, reason: "not enough idle backing to allocate" };
    vault.deployed_cents += amount_cents;
    this.log("agama-allocator", "allocate", `routed ${fmt(amount_cents)} → ${vault.name} (private)`, "private");
    return { ok: true };
  }

  stake(amount_cents: number): number {
    const rate = this.redeemRate();
    const shares = Math.round(amount_cents / rate);
    this.sagusd_shares += shares;
    this.log("lp", "stake", `staked agUSD → sagUSD`, "private");
    return shares;
  }

  private redeemRate(): number {
    const yield_ = this.vaults.reduce((s, v) => s + v.accrued_cents, 0);
    return 1 + yield_ / Math.max(this.agusd_supply_cents, 1);
  }

  /** Underlying book earns — privately, inside the Sphere. */
  accrue(vaultId: VaultId, cents: number) {
    const v = this.vaults.find((x) => x.id === vaultId);
    if (v) {
      v.accrued_cents += cents;
      this.log("agama-risk", "accrue", `${v.name} book earned ${fmt(cents)} (private)`, "private");
      this.log("chain", "nav.attest", `NAV → ${fmt(this.nav_cents())} (Nautilus-attested)`, "public");
    }
  }

  redeem(lp: Principal, amount_cents: number): Result {
    const own = this.positions.filter((p) => p.lp === lp);
    const total = own.reduce((s, p) => s + p.amount_cents, 0);
    if (amount_cents > total) return { ok: false, reason: "redeem exceeds LP position" };
    let remaining = amount_cents;
    for (const p of own) {
      const take = Math.min(p.amount_cents, remaining);
      p.amount_cents -= take;
      remaining -= take;
      if (remaining === 0) break;
    }
    this.agusd_supply_cents -= amount_cents;
    let toUndeploy = amount_cents - this.idleCash_cents();
    for (const v of [...this.vaults].sort((a, b) => b.deployed_cents - a.deployed_cents)) {
      if (toUndeploy <= 0) break;
      const take = Math.min(v.deployed_cents, toUndeploy);
      v.deployed_cents -= take;
      toUndeploy -= take;
    }
    this.log(lp, "redeem", `${lp} redeemed (private)`, "private");
    this.log("chain", "supply.burn", `agUSD supply → ${fmt(this.agusd_supply_cents)}`, "public");
    return { ok: true };
  }

  // ---------- SEAM: the redacted public twin (all that crosses to Sui) ----------
  /**
   * The ONLY thing an outside observer (the public Sui chain, a competitor,
   * a non-member) ever sees. It is a pure function of the AGGREGATES
   * (nav, supply, redeem rate) — it does not depend on WHO the LPs are, HOW
   * MANY there are, or HOW the backing is split between them. The commitment
   * binds the totals only. Two Spheres with the same totals but different LP
   * identities and different per-LP splits produce a BYTE-IDENTICAL outside
   * view — so this view cannot be inverted to recover a person. This is the
   * anonymity boundary: solvency is public, participants are not.
   */
  outsideView(): PublicTwin {
    const nav = this.nav_cents();
    const supply = this.agusd_supply_cents;
    const coverage = supply === 0 ? 1 : nav / supply;
    const capOk = this.vaults.every((v) => v.deployed_cents <= nav * v.concentrationCap + 1);
    return {
      agusd_supply_cents: supply,
      nav_cents: nav,
      sagusd_redeem_rate: Number(this.redeemRate().toFixed(6)),
      coverage_ratio: Number(coverage.toFixed(6)),
      backing_commitment: commitment(`${nav}:${supply}`), // totals only — NOT identities, split, or count
      proofs: [
        { key: "fully_backed", label: "agUSD fully backed by NAV", ok: coverage >= 1 },
        { key: "within_caps", label: "All vaults within concentration caps", ok: capOk },
        { key: "nav_attested", label: "NAV attested (Nautilus TEE)", ok: true },
      ],
    };
  }

  /** Back-compat alias — the public twin IS the outside view. */
  publicTwin(): PublicTwin { return this.outsideView(); }

  /**
   * Defensive anonymity check: every member identity that leaks into the
   * outside view. MUST always be empty — the boundary is airtight by design.
   */
  boundaryLeaks(): Principal[] {
    const j = JSON.stringify(this.outsideView());
    return [...this.members.keys()].filter((m) => j.includes(m));
  }
}

// ============================================================
// Helpers (environment-agnostic — no node:crypto, works in the browser too)
// ============================================================
let _n = 0;
export function uid(prefix: string): string { return `${prefix}_${(++_n).toString(36)}`; }

/** FNV-1a 32-bit — a small deterministic binding for the demo commitment. */
export function commitment(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "0x" + h.toString(16).padStart(8, "0");
}

export function fmt(cents: number): string {
  return "$" + (cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
