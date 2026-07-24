// Agama × Sui — agUSD, a private-credit-backed synthetic dollar.
// SPDX-License-Identifier: Apache-2.0

/// agUSD — a pool-backed synthetic dollar, swappable 1:1 with its USDC reserve.
/// A shared `Pool` object custodies the deposited USDC and owns the agUSD
/// `TreasuryCap`, so the supply invariant always holds:
///
///     pool.usdc_reserve.value() == total agUSD in circulation
///
/// This is the public (visible-amount) layer. Wrapping agUSD into its
/// confidential variant (`confidential_agusd`) is what hides balances and
/// transfer amounts on-chain. Mirrors the `closed_loop::pbu` pattern from the
/// Confidential Transfers repo, renamed to Agama's economics.
module agusd::agusd;

use agusd::usdc::USDC;
use sui::{balance::{Self, Balance}, coin::{Self, Coin, TreasuryCap}, coin_registry};

/// One-time witness for the agUSD coin type.
public struct AGUSD has drop {}

/// Shared swap pool. Holds USDC reserve and owns the agUSD TreasuryCap so
/// agUSD can be minted/burned on demand against the reserve.
public struct Pool has key {
    id: UID,
    usdc_reserve: Balance<USDC>,
    agusd_treasury: TreasuryCap<AGUSD>,
}

/// Capability held by the agUSD issuer/deployer (Agama). Authorizes privileged
/// setup — notably initializing the confidential variant.
public struct AgusdAdminCap has key, store { id: UID }

fun init(witness: AGUSD, ctx: &mut TxContext) {
    let (initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        6,
        b"agUSD".to_string(),
        b"Agama Dollar".to_string(),
        b"Private-credit backed synthetic dollar".to_string(),
        b"".to_string(),
        ctx,
    );
    initializer.finalize_and_delete_metadata_cap(ctx);
    transfer::share_object(Pool {
        id: object::new(ctx),
        usdc_reserve: balance::zero<USDC>(),
        agusd_treasury: treasury_cap,
    });
    transfer::public_transfer(AgusdAdminCap { id: object::new(ctx) }, ctx.sender());
}

/// Deposit `usdc` into the pool and mint an equal-value `Coin<AGUSD>` (mint).
public fun mint(pool: &mut Pool, usdc: Coin<USDC>, ctx: &mut TxContext): Coin<AGUSD> {
    let amount = usdc.value();
    pool.usdc_reserve.join(usdc.into_balance());
    coin::mint(&mut pool.agusd_treasury, amount, ctx)
}

/// Burn `agusd` and withdraw an equal-value `Coin<USDC>` from the pool (redeem).
public fun redeem(pool: &mut Pool, agusd: Coin<AGUSD>, ctx: &mut TxContext): Coin<USDC> {
    let amount = coin::burn(&mut pool.agusd_treasury, agusd);
    coin::from_balance(pool.usdc_reserve.split(amount), ctx)
}

/// Public backing proof: the USDC reserve currently held. Anyone can read this
/// to verify agUSD is fully backed — without seeing any individual position.
public fun reserve_value(pool: &Pool): u64 {
    pool.usdc_reserve.value()
}

/// Expose the agUSD `TreasuryCap` to sibling modules (needed by
/// `confidential_agusd` for confidential-token setup + policy).
public(package) fun treasury_mut(pool: &mut Pool): &mut TreasuryCap<AGUSD> {
    &mut pool.agusd_treasury
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext): AgusdAdminCap {
    let cap = coin::create_treasury_cap_for_testing<AGUSD>(ctx);
    transfer::share_object(Pool {
        id: object::new(ctx),
        usdc_reserve: balance::zero<USDC>(),
        agusd_treasury: cap,
    });
    AgusdAdminCap { id: object::new(ctx) }
}
