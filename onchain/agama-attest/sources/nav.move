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
/// A NAV whose epoch is not strictly newer than the last accepted one — blocks
/// replay / rollback of a previously-valid attestation.
const E_STALE_ATTESTATION: u64 = 2;

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
        enclave_pubkey: vector[],
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
    // Replay / rollback guard: only strictly-newer attestations are accepted, so
    // a captured (nav, epoch, signature) tuple can't be re-posted to roll back.
    assert!(epoch > registry.latest_epoch, E_STALE_ATTESTATION);
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

// === Tests ===
// Signature vectors are produced off-chain (Ed25519 over bcs(nav)||bcs(epoch))
// from a fixed test key, then verified on-chain by the same code that runs in
// production — so these prove the real verification path, not a mock.

#[test_only] use sui::test_scenario as ts;
#[test_only] public fun init_for_testing(ctx: &mut TxContext) { init(ctx) }
#[test_only] const ADMIN: address = @0xA11CE;
#[test_only] const T_PUBKEY: vector<u8> = vector[121, 181, 86, 46, 143, 230, 84, 249, 64, 120, 177, 18, 232, 169, 139, 167, 144, 31, 133, 58, 230, 149, 190, 215, 224, 227, 145, 11, 173, 4, 150, 100];
#[test_only] const T_SIG_100_5: vector<u8> = vector[173, 194, 12, 175, 61, 47, 97, 177, 86, 101, 211, 185, 192, 240, 251, 146, 189, 86, 83, 64, 106, 21, 164, 180, 79, 63, 77, 77, 232, 171, 5, 197, 185, 112, 108, 86, 112, 54, 113, 14, 213, 120, 122, 39, 243, 150, 73, 166, 178, 252, 150, 155, 28, 38, 155, 153, 86, 252, 59, 72, 191, 76, 48, 8];
#[test_only] const T_SIG_110_6: vector<u8> = vector[122, 7, 204, 140, 169, 26, 72, 248, 24, 171, 70, 86, 27, 11, 73, 52, 103, 195, 75, 44, 186, 101, 155, 213, 95, 173, 213, 209, 38, 100, 170, 153, 249, 201, 246, 53, 57, 216, 182, 22, 27, 143, 192, 88, 44, 196, 151, 177, 78, 2, 216, 110, 239, 85, 82, 77, 34, 123, 128, 95, 245, 215, 217, 15];

#[test]
fun valid_then_monotonic() {
    let mut sc = ts::begin(ADMIN);
    init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    let mut reg = sc.take_shared<AttestationRegistry>();
    set_enclave_key(&mut reg, T_PUBKEY, sc.ctx());
    post_attested_nav(&mut reg, 100, 5, T_SIG_100_5);
    assert!(reg.latest_nav_cents == 100 && reg.updates == 1, 0);
    post_attested_nav(&mut reg, 110, 6, T_SIG_110_6); // strictly newer epoch → accepted
    assert!(reg.latest_nav_cents == 110 && reg.updates == 2, 1);
    ts::return_shared(reg);
    sc.end();
}

#[test, expected_failure(abort_code = E_BAD_ATTESTATION)]
fun forged_rejected() {
    let mut sc = ts::begin(ADMIN);
    init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    let mut reg = sc.take_shared<AttestationRegistry>();
    set_enclave_key(&mut reg, T_PUBKEY, sc.ctx());
    let forged = vector[7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7];
    post_attested_nav(&mut reg, 100, 5, forged); // signature doesn't verify → abort
    abort 42
}

#[test, expected_failure(abort_code = E_STALE_ATTESTATION)]
fun replay_rejected() {
    let mut sc = ts::begin(ADMIN);
    init_for_testing(sc.ctx());
    sc.next_tx(ADMIN);
    let mut reg = sc.take_shared<AttestationRegistry>();
    set_enclave_key(&mut reg, T_PUBKEY, sc.ctx());
    post_attested_nav(&mut reg, 100, 5, T_SIG_100_5);      // accepted
    post_attested_nav(&mut reg, 100, 5, T_SIG_100_5);      // same epoch replayed → abort
    abort 42
}

#[test, expected_failure(abort_code = E_NOT_ADMIN)]
fun non_admin_cannot_set_key() {
    let mut sc = ts::begin(ADMIN);
    init_for_testing(sc.ctx());
    sc.next_tx(@0xBAD);
    let mut reg = sc.take_shared<AttestationRegistry>();
    set_enclave_key(&mut reg, T_PUBKEY, sc.ctx()); // wrong sender → abort
    abort 42
}
