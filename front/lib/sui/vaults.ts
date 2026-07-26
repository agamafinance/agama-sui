// The private-credit basket that backs agUSD on Sui. Reuses the exact curator
// metadata from the Stellar surface (same Tenka + Qiro vaults) and adds the
// on-app target allocation used by the Allocation Engine when USDC is swapped.
export { CREDIT_VAULTS, CURATORS, QIRO, TENKA, vaultByName, vaultBySlug } from '@/lib/stellar/vaults';
export type { Curator, CreditVault } from '@/lib/stellar/vaults';

// Target allocation of the swapped USDC across the basket (bps, sum = 10000).
export const ALLOC_BPS: Record<string, number> = {
  'Flagship Vault': 2500,
  'High Yield Vault': 1000,
  DealVaults: 1500,
  'Payment Financing Vault': 2500,
  'Private Credit Vault': 1000,
  'Institutional Credit Vault': 1500,
};

// APY midpoints (bps) per vault, to compute the blended headline APY.
const APY_BPS: Record<string, number> = {
  'Flagship Vault': 850,
  'High Yield Vault': 1750,
  DealVaults: 1100,
  'Payment Financing Vault': 1400,
  'Private Credit Vault': 1300,
  'Institutional Credit Vault': 1200,
};

/** Allocation-weighted blended target APY, e.g. "12.13%". */
export function blendedApy(): string {
  const bps = Object.keys(ALLOC_BPS).reduce(
    (s, name) => s + (APY_BPS[name] * ALLOC_BPS[name]) / 10_000,
    0,
  );
  return `${(bps / 100).toFixed(2)}%`;
}
