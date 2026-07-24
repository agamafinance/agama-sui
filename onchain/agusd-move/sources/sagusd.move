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

public struct SAGUSD has drop {}

public struct StakingVault has key {
    id: UID,
    assets: Balance<AGUSD>,
    treasury: TreasuryCap<SAGUSD>,
}

/// Capability for the Allocation Engine to book vault yield.
public struct YieldCap has key, store { id: UID }

fun init(witness: SAGUSD, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,
        b"sagUSD",
        b"Staked Agama Dollar",
        b"Yield-bearing staked agUSD; value accrues with private-credit vaults",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
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
