// Agama × Sui — on-chain verification of the Allocation Engine's attested NAV.
// SPDX-License-Identifier: Apache-2.0

/// The Nautilus pattern, Sui side. Agama's Allocation Engine / NAV computation
/// runs off-chain in a Trusted Execution Environment (TEE). The enclave signs
/// its output; this module **verifies the signature on-chain** before accepting
/// the NAV — turning the "black box" risk engine into an attested, auditable
/// input.
///
/// What's real here: the on-chain Ed25519 verification of the attestation. In
/// production the signer is a real **Nautilus (AWS Nitro) enclave** whose key /
/// PCR measurements are registered on-chain; here `enclave_pubkey` is set to a
/// stand-in key (the enclave itself is infrastructure).
module agama_attest::nav;

use sui::ed25519;

const E_NOT_ADMIN: u64 = 0;
const E_BAD_ATTESTATION: u64 = 1;

/// Shared registry: the enclave's public key + the latest attested NAV.
public struct AttestationRegistry has key {
    id: UID,
    enclave_pubkey: vector<u8>,   // in prod: registered from the Nitro attestation
    latest_nav_cents: u64,
    latest_epoch: u64,
    updates: u64,
    admin: address,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(AttestationRegistry {
        id: object::new(ctx),
        enclave_pubkey: vector::empty(),
        latest_nav_cents: 0,
        latest_epoch: 0,
        updates: 0,
        admin: ctx.sender(),
    });
}

/// Register the enclave's public key (prod: derived from the Nitro attestation
/// document + PCR measurements).
public fun set_enclave_key(registry: &mut AttestationRegistry, pubkey: vector<u8>, ctx: &TxContext) {
    assert!(ctx.sender() == registry.admin, E_NOT_ADMIN);
    registry.enclave_pubkey = pubkey;
}

/// The enclave signs `bcs(nav_cents) || bcs(epoch)`; the chain verifies that
/// signature against the registered enclave key before accepting the NAV.
/// A forged or tampered attestation is rejected on-chain.
public fun post_attested_nav(
    registry: &mut AttestationRegistry,
    nav_cents: u64,
    epoch: u64,
    signature: vector<u8>,
) {
    let msg = message_bytes(nav_cents, epoch);
    assert!(ed25519::ed25519_verify(&signature, &registry.enclave_pubkey, &msg), E_BAD_ATTESTATION);
    registry.latest_nav_cents = nav_cents;
    registry.latest_epoch = epoch;
    registry.updates = registry.updates + 1;
}

fun message_bytes(nav_cents: u64, epoch: u64): vector<u8> {
    let mut m = sui::bcs::to_bytes(&nav_cents);
    m.append(sui::bcs::to_bytes(&epoch));
    m
}

public fun latest_nav_cents(r: &AttestationRegistry): u64 { r.latest_nav_cents }
public fun updates(r: &AttestationRegistry): u64 { r.updates }
