// Agama × Sui — test USDC backing token.
// SPDX-License-Identifier: Apache-2.0

/// USDC — the reserve asset backing agUSD in this demo. A regulated coin (the
/// issuer holds a per-address denylist + global pause via
/// `sui::coin::deny_list_v2_*`) with a permissionless `faucet` so anyone can
/// mint test USDC to try the flow. Mirrors the `bu_token::bu` test-token shape
/// from the Confidential Transfers repo.
module agusd::usdc;

use sui::{coin::{Self, Coin, TreasuryCap}, coin_registry};

/// One-time witness for the USDC coin type.
public struct USDC has drop {}

/// Shared object holding the TreasuryCap so minting is open (test faucet).
public struct UsdcTreasury has key {
    id: UID,
    cap: TreasuryCap<USDC>,
}

fun init(witness: USDC, ctx: &mut TxContext) {
    let (mut initializer, treasury_cap) = coin_registry::new_currency_with_otw(
        witness,
        6,
        b"USDC".to_string(),
        b"USD Coin (test)".to_string(),
        b"Test USDC reserve backing agUSD".to_string(),
        b"".to_string(),
        ctx,
    );
    // Regulated: issuer can denylist / pause — the compliance surface a real
    // stablecoin reserve needs.
    let deny_cap = initializer.make_regulated(true, ctx);
    initializer.finalize_and_delete_metadata_cap(ctx);
    transfer::public_transfer(deny_cap, ctx.sender());
    transfer::share_object(UsdcTreasury { id: object::new(ctx), cap: treasury_cap });
}

/// Mint `amount` base units of test USDC to the caller. Open to anyone.
public fun faucet(treasury: &mut UsdcTreasury, amount: u64, ctx: &mut TxContext): Coin<USDC> {
    coin::mint(&mut treasury.cap, amount, ctx)
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(USDC {}, ctx)
}
