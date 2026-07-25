// Agama × Sui — sagUSD, the yield-bearing staked agUSD.
// SPDX-License-Identifier: Apache-2.0

/// sagUSD — stake agUSD to receive sagUSD, a yield-bearing share token.
/// A `StakingVault` custodies staked agUSD and owns the sagUSD `TreasuryCap`.
/// sagUSD is a share of the vault (ERC-4626 style):
///
///     NAV per share = total_assets / total_shares
///
/// Stake/unstake are priced at the current NAV, so the swap is **not 1:1** once
/// yield accrues. The Allocation Engine books private-credit yield via
/// `accrue_yield`, raising total_assets without minting shares.
module agusd::sagusd;

use agusd::agusd::AGUSD;
use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin, TreasuryCap};
use sui::coin_registry;

/// Unstake attempted against an empty vault (no shares outstanding).
const EEmptyVault: u64 = 0;

public struct SAGUSD has drop {}

public struct StakingVault has key {
    id: UID,
    assets: Balance<AGUSD>,
    treasury: TreasuryCap<SAGUSD>,
}

/// Capability for the Allocation Engine to book vault yield.
public struct YieldCap has key, store { id: UID }

fun init(witness: SAGUSD, ctx: &mut TxContext) {
    let (initializer, treasury) = coin_registry::new_currency_with_otw(
        witness,
        6,
        b"sagUSD".to_string(),
        b"Staked Agama Dollar".to_string(),
        b"Yield-bearing staked agUSD; value accrues with private-credit vaults".to_string(),
        b"".to_string(),
        ctx,
    );
    initializer.finalize_and_delete_metadata_cap(ctx);
    transfer::share_object(StakingVault {
        id: object::new(ctx),
        assets: balance::zero<AGUSD>(),
        treasury,
    });
    transfer::public_transfer(YieldCap { id: object::new(ctx) }, ctx.sender());
}

/// Stake agUSD → sagUSD shares priced at the current NAV.
public fun stake(vault: &mut StakingVault, agusd: Coin<AGUSD>, ctx: &mut TxContext): Coin<SAGUSD> {
    let amount = agusd.value();
    let total_shares = coin::total_supply(&vault.treasury);
    let total_assets = vault.assets.value();
    let shares = if (total_shares == 0 || total_assets == 0) {
        amount
    } else {
        (((amount as u128) * (total_shares as u128)) / (total_assets as u128)) as u64
    };
    vault.assets.join(agusd.into_balance());
    coin::mint(&mut vault.treasury, shares, ctx)
}

/// Unstake sagUSD → agUSD at the current NAV (includes accrued yield).
public fun unstake(vault: &mut StakingVault, sagusd: Coin<SAGUSD>, ctx: &mut TxContext): Coin<AGUSD> {
    let shares = sagusd.value();
    let total_shares = coin::total_supply(&vault.treasury);
    assert!(total_shares > 0, EEmptyVault); // defensive: never divide by zero
    let total_assets = vault.assets.value();
    let assets = (((shares as u128) * (total_assets as u128)) / (total_shares as u128)) as u64;
    coin::burn(&mut vault.treasury, sagusd);
    coin::from_balance(vault.assets.split(assets), ctx)
}

/// Allocation Engine books yield: deposit agUSD without minting shares, raising
/// the NAV per share for every holder.
public fun accrue_yield(_cap: &YieldCap, vault: &mut StakingVault, yield: Coin<AGUSD>) {
    vault.assets.join(yield.into_balance());
}

/// NAV per sagUSD share in basis points (10_000 = 1.0 agUSD). Public.
public fun nav_per_share_bps(vault: &StakingVault): u64 {
    let total_shares = coin::total_supply(&vault.treasury);
    if (total_shares == 0) {
        10_000
    } else {
        (((vault.assets.value() as u128) * 10_000) / (total_shares as u128)) as u64
    }
}

public fun total_assets(vault: &StakingVault): u64 { vault.assets.value() }
public fun total_shares(vault: &StakingVault): u64 { coin::total_supply(&vault.treasury) }

// === Tests ===

#[test_only] use sui::test_scenario as ts;

#[test_only]
public fun init_for_testing(ctx: &mut TxContext): YieldCap {
    let treasury = coin::create_treasury_cap_for_testing<SAGUSD>(ctx);
    transfer::share_object(StakingVault { id: object::new(ctx), assets: balance::zero<AGUSD>(), treasury });
    YieldCap { id: object::new(ctx) }
}

/// Yield is NAV-priced, not 1:1: stake 100, book 10% yield (only possible with
/// the YieldCap — no donation path, so no inflation attack), unstake → 110.
#[test]
fun stake_accrue_unstake_gives_nav() {
    let admin = @0xA11CE;
    let mut sc = ts::begin(admin);
    let cap = init_for_testing(sc.ctx());
    sc.next_tx(admin);
    let mut vault = sc.take_shared<StakingVault>();

    let ag = coin::mint_for_testing<AGUSD>(100, sc.ctx());
    let shares = stake(&mut vault, ag, sc.ctx());
    assert!(shares.value() == 100, 0);                 // first staker mints 1:1

    let yield = coin::mint_for_testing<AGUSD>(10, sc.ctx());
    accrue_yield(&cap, &mut vault, yield);             // YieldCap-gated — the only way to add assets
    assert!(nav_per_share_bps(&vault) == 11_000, 1);   // NAV rose to 1.1

    let back = unstake(&mut vault, shares, sc.ctx());
    assert!(back.value() == 110, 2);                   // 100 in → 110 out (NAV-priced)

    coin::burn_for_testing(back);
    transfer::public_transfer(cap, admin);
    ts::return_shared(vault);
    sc.end();
}
