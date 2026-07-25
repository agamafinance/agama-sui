// Agama × Sui — real access control for private positions, via Seal.
// SPDX-License-Identifier: Apache-2.0

/// The **real** version of the Sphere's role-based visibility, using Mysten's
/// Seal (threshold MPC + on-chain policy). LP position / deal data is encrypted
/// client-side with Seal; the Seal key-server committee only releases the
/// decryption key after dry-running `seal_approve` against this policy.
///
/// Access rule: a ciphertext is bound to an identity `id = policy_id || owner`.
/// `seal_approve` passes if the requester is the position **owner**, or is on
/// the Agama **allowlist** (risk team / auditor). Everyone else is denied by
/// the committee — enforced on-chain, not simulated.
module agama_seal::access;

use sui::vec_set::{Self, VecSet};

const E_BAD_IDENTITY: u64 = 0;
const E_NO_ACCESS: u64 = 1;

/// Shared policy: the Agama access allowlist (risk team + auditor).
public struct AccessPolicy has key {
    id: UID,
    allow: VecSet<address>,
}

/// Held by Agama compliance — manages the allowlist.
public struct AccessAdminCap has key, store { id: UID }

fun init(ctx: &mut TxContext) {
    transfer::share_object(AccessPolicy { id: object::new(ctx), allow: vec_set::empty() });
    transfer::public_transfer(AccessAdminCap { id: object::new(ctx) }, ctx.sender());
}

public fun allow(_cap: &AccessAdminCap, policy: &mut AccessPolicy, who: address) {
    if (!policy.allow.contains(&who)) policy.allow.insert(who);
}

public fun disallow(_cap: &AccessAdminCap, policy: &mut AccessPolicy, who: address) {
    if (policy.allow.contains(&who)) policy.allow.remove(&who);
}

public fun is_allowed(policy: &AccessPolicy, who: address): bool {
    policy.allow.contains(&who)
}

/// Seal entrypoint — the key-server committee dry-runs this before releasing a
/// key share. `ctx.sender()` is the requester (from their SessionKey). Passes if
/// the requester owns the ciphertext (id suffix) or is on the allowlist.
///
/// `id` layout: bytes 0..32 = this policy's object id, bytes 32..64 = owner addr.
entry fun seal_approve(id: vector<u8>, policy: &AccessPolicy, ctx: &TxContext) {
    let prefix = object::id_to_bytes(&object::id(policy));
    assert!(is_prefix(&prefix, &id), E_BAD_IDENTITY);
    let sender = ctx.sender();
    let is_owner = extract_owner(&id, 32) == sender;
    assert!(is_owner || policy.allow.contains(&sender), E_NO_ACCESS);
}

fun is_prefix(prefix: &vector<u8>, id: &vector<u8>): bool {
    if (id.length() < prefix.length()) return false;
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != id[i]) return false;
        i = i + 1;
    };
    true
}

fun extract_owner(id: &vector<u8>, off: u64): address {
    let mut b = vector::empty<u8>();
    let mut i = off;
    while (i < off + 32 && i < id.length()) {
        b.push_back(id[i]);
        i = i + 1;
    };
    sui::address::from_bytes(b)
}
