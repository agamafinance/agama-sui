// Agama × Sui — agUSD public layer (testnet).
// SPDX-License-Identifier: Apache-2.0

/// agUSD — the public, prize-qualifying layer of the Agama synthetic dollar.
///
/// A **Regulated Coin**: the issuer holds a `DenyCapV2` to run a per-address
/// KYC denylist and a global pause — the compliance surface an institutional
/// stablecoin needs. Minting is issuer-gated. A shared `BackingProof` object
/// is the **seam** from the private side (the Sphere): the allocation engine
/// posts its attested NAV, supply, coverage, and a backing commitment here, so
/// anyone can verify agUSD is fully backed **without seeing any position**.
///
/// This is the testnet counterpart of the confidential agUSD deployed on
/// devnet (`onchain/agusd-move`): same dollar, different privacy tool
/// (denylist + public backing proof here; Twisted-ElGamal amount-hiding there).
module agusd_testnet::agusd;

use sui::coin::{Self, TreasuryCap, DenyCapV2};

/// One-time witness.
public struct AGUSD has drop {}

/// Issuer capability (Agama) — custodies the `TreasuryCap` so only Agama mints.
public struct Issuer has key, store {
    id: UID,
    treasury: TreasuryCap<AGUSD>,
}

/// Public, on-chain proof of backing. Updated by the issuer from the private
/// side's attested figures. The only thing that crosses from the Sphere.
public struct BackingProof has key {
    id: UID,
    nav_cents: u64,
    supply_cents: u64,
    coverage_bps: u64,
    /// Commitment binding this proof to the private NAV (hex, no position data).
    commitment: vector<u8>,
    updated_epoch: u64,
}

fun init(witness: AGUSD, ctx: &mut TxContext) {
    let (treasury, deny_cap, metadata) = coin::create_regulated_currency_v2(
        witness,
        6,
        b"agUSD",
        b"Agama Dollar",
        b"Private-credit backed synthetic dollar",
        option::none(),
        true, // allow global pause
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(deny_cap, ctx.sender()); // KYC denylist control
    transfer::share_object(BackingProof {
        id: object::new(ctx),
        nav_cents: 0,
        supply_cents: 0,
        coverage_bps: 10_000,
        commitment: b"",
        updated_epoch: 0,
    });
    transfer::public_transfer(Issuer { id: object::new(ctx), treasury }, ctx.sender());
}

/// Issuer mints `amount` agUSD to a (KYC-approved) recipient.
public fun mint(issuer: &mut Issuer, amount: u64, recipient: address, ctx: &mut TxContext) {
    let c = coin::mint(&mut issuer.treasury, amount, ctx);
    transfer::public_transfer(c, recipient);
}

/// Issuer burns returned agUSD (redeem side).
public fun burn(issuer: &mut Issuer, c: coin::Coin<AGUSD>): u64 {
    coin::burn(&mut issuer.treasury, c)
}

/// The Sphere seam: publish the attested backing figures + commitment. Coverage
/// is recomputed on-chain from nav/supply so the proof can't claim more than
/// the numbers imply.
public fun publish_backing(
    _issuer: &Issuer,
    proof: &mut BackingProof,
    nav_cents: u64,
    supply_cents: u64,
    commitment: vector<u8>,
    ctx: &TxContext,
) {
    proof.nav_cents = nav_cents;
    proof.supply_cents = supply_cents;
    proof.coverage_bps = if (supply_cents == 0) 10_000 else nav_cents * 10_000 / supply_cents;
    proof.commitment = commitment;
    proof.updated_epoch = ctx.epoch();
}

/// Read the current coverage in basis points (10_000 = 100%). Public.
public fun coverage_bps(proof: &BackingProof): u64 {
    proof.coverage_bps
}

/// Is agUSD fully backed? Public, anyone can verify.
public fun is_fully_backed(proof: &BackingProof): bool {
    proof.coverage_bps >= 10_000
}
