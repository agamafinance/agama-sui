// Agama × Sui — the private-credit vault basket that backs agUSD.
//
// When an LP swaps USDC → agUSD, the incoming USDC is not idle: the Allocation
// Engine routes it across these six curated private-credit vaults (Tenka & Qiro)
// according to each vault's target allocation. agUSD is therefore a claim on a
// diversified, yield-bearing basket — this file is the single source of truth
// for that basket (used by the confidential flow UI and the dashboard).
//
// Allocations sum to 100% (2500+1000+1500+2500+1000+1500 = 10000 bps).

export type Curator = "Tenka" | "Qiro Finance";
export type Tranche = "Senior secured" | "Mezzanine" | "Diversified";

export interface VaultSpec {
  id: string;
  curator: Curator;
  name: string;        // e.g. "Flagship Vault"
  strategy: string;    // e.g. "ABF Senior"
  allocBps: number;    // target allocation, 2500 = 25%
  aprLowBps: number;   // APY range low (== high when a single figure)
  aprHighBps: number;
  redemption: string;  // "Weekly" | "Monthly" | "Quarterly" | "Per deal"
  capacityUsd: number; // maximum capacity
  lockup: string;      // "1 Month" | "6 Months" | "Deal term" | …
  tranche: Tranche;
}

export const AGAMA_VAULTS: VaultSpec[] = [
  {
    id: "tenka-flagship", curator: "Tenka", name: "Flagship Vault", strategy: "ABF Senior",
    allocBps: 2500, aprLowBps: 800, aprHighBps: 900, redemption: "Weekly",
    capacityUsd: 500_000_000, lockup: "1 Month", tranche: "Senior secured",
  },
  {
    id: "tenka-highyield", curator: "Tenka", name: "High Yield Vault", strategy: "ABF Mezz",
    allocBps: 1000, aprLowBps: 1500, aprHighBps: 2000, redemption: "Monthly",
    capacityUsd: 200_000_000, lockup: "6 Months", tranche: "Mezzanine",
  },
  {
    id: "tenka-dealbydeal", curator: "Tenka", name: "Deal-by-Deal", strategy: "DealVaults",
    allocBps: 1500, aprLowBps: 700, aprHighBps: 1500, redemption: "Per deal",
    capacityUsd: 300_000_000, lockup: "Deal term", tranche: "Diversified",
  },
  {
    id: "qiro-payment", curator: "Qiro Finance", name: "Payment Financing Vault",
    strategy: "Short Term Payment Receivables",
    allocBps: 2500, aprLowBps: 1400, aprHighBps: 1400, redemption: "Weekly",
    capacityUsd: 25_000_000, lockup: "1-3 Months", tranche: "Senior secured",
  },
  {
    id: "qiro-privatecredit", curator: "Qiro Finance", name: "Private Credit Vault",
    strategy: "Diversified Credit Fund Subscription",
    allocBps: 1000, aprLowBps: 1300, aprHighBps: 1300, redemption: "Monthly",
    capacityUsd: 10_000_000, lockup: "3 Months", tranche: "Diversified",
  },
  {
    id: "qiro-institutional", curator: "Qiro Finance", name: "Institutional Credit Vault",
    strategy: "Institutional Lender Financing Deals",
    allocBps: 1500, aprLowBps: 1200, aprHighBps: 1200, redemption: "Quarterly",
    capacityUsd: 15_000_000, lockup: "6 Months", tranche: "Senior secured",
  },
];

/** Blended (allocation-weighted) target APY in bps, using range midpoints. */
export function blendedApyBps(): number {
  return Math.round(
    AGAMA_VAULTS.reduce((s, v) => s + ((v.aprLowBps + v.aprHighBps) / 2) * (v.allocBps / 10_000), 0),
  );
}

/** Split a USD amount across the basket by target allocation. */
export function allocateUsd(amountUsd: number): { spec: VaultSpec; amountUsd: number }[] {
  return AGAMA_VAULTS.map((spec) => ({ spec, amountUsd: (amountUsd * spec.allocBps) / 10_000 }));
}

/** Human APY label: "8-9%" for a range, "14%" for a single figure. */
export function aprLabel(v: VaultSpec): string {
  const lo = v.aprLowBps / 100, hi = v.aprHighBps / 100;
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`;
}

/** Compact capacity label: "$500M", "$25M". */
export function capacityLabel(v: VaultSpec): string {
  return v.capacityUsd >= 1e9 ? `$${v.capacityUsd / 1e9}B` : `$${Math.round(v.capacityUsd / 1e6)}M`;
}
