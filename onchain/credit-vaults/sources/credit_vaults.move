// Agama x Sui — the six curated private-credit vaults (Tenka & Qiro) as real
// on-chain objects, so each vault has its own verifiable page on Suiscan.
module credit_vaults::credit_vaults;

use std::string::{Self, String};

/// One curated private-credit vault. Shared so anyone can read it on-chain.
public struct CreditVault has key {
    id: UID,
    curator: String,
    name: String,
    strategy: String,
    alloc_bps: u64,       // target allocation of agUSD backing (2500 = 25%)
    apy_bps: u64,         // headline APY midpoint (850 = 8.5%)
    apy_label: String,    // e.g. "8-9% target APY"
    redemption: String,
    capacity_usd: u64,
    lockup: String,
    tranche: String,
    deployed_usd: u64,    // starts at 0
}

fun new(
    curator: vector<u8>, name: vector<u8>, strategy: vector<u8>,
    alloc_bps: u64, apy_bps: u64, apy_label: vector<u8>, redemption: vector<u8>,
    capacity_usd: u64, lockup: vector<u8>, tranche: vector<u8>, ctx: &mut TxContext,
) {
    transfer::share_object(CreditVault {
        id: object::new(ctx),
        curator: string::utf8(curator),
        name: string::utf8(name),
        strategy: string::utf8(strategy),
        alloc_bps,
        apy_bps,
        apy_label: string::utf8(apy_label),
        redemption: string::utf8(redemption),
        capacity_usd,
        lockup: string::utf8(lockup),
        tranche: string::utf8(tranche),
        deployed_usd: 0,
    });
}

/// Publish-time: create the six curated vaults as shared objects.
fun init(ctx: &mut TxContext) {
    // Tenka — institutional private credit
    new(b"Tenka", b"Flagship Vault", b"ABF Senior", 2500, 850, b"8-9% target APY", b"Weekly", 500000000, b"1 Month", b"Senior secured", ctx);
    new(b"Tenka", b"High Yield Vault", b"ABF Mezz", 1000, 1750, b"15-20% target APY", b"Monthly", 200000000, b"6 Months", b"Mezzanine", ctx);
    new(b"Tenka", b"Deal-by-Deal", b"DealVaults", 1500, 1100, b"7-15% target APY", b"Per deal", 300000000, b"Deal term", b"Diversified", ctx);
    // Qiro Finance — curated private credit
    new(b"Qiro Finance", b"Payment Financing Vault", b"Short Term Payment Receivables", 2500, 1400, b"14% APY", b"Weekly", 25000000, b"1-3 Months", b"Senior secured", ctx);
    new(b"Qiro Finance", b"Private Credit Vault", b"Diversified Credit Fund Subscription", 1000, 1300, b"13% APY", b"Monthly", 10000000, b"3 Months", b"Diversified", ctx);
    new(b"Qiro Finance", b"Institutional Credit Vault", b"Institutional Lender Financing Deals", 1500, 1200, b"12% APY", b"Quarterly", 15000000, b"6 Months", b"Senior secured", ctx);
}
