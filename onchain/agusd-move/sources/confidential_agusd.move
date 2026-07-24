// Agama × Sui — confidential agUSD (KYC-gated).
// SPDX-License-Identifier: Apache-2.0

/// Confidential variant of agUSD.
///
/// Registration of a confidential agUSD `TokenAccount` is gated by a shared
/// `Whitelist`: only KYC-approved addresses (added by a `WhitelistAdminCap`
/// holder — Agama compliance) may `register`. Once registered, all other flows
/// (wrap, transfer, unwrap) are inherited from `contra::contra`: balances and
/// transfer amounts are hidden on-chain via Twisted ElGamal + zero-knowledge
/// proofs, while the network still guarantees no over-mint and no overdraft.
///
/// Auditor keys (optional, passed at confidential-token creation) give Agama /
/// a regulator selective viewing access for compliance.
///
/// Mirrors `closed_loop::confidential_pbu` from the Confidential Transfers repo.
module agusd::confidential_agusd;

use agusd::agusd::{Self, AgusdAdminCap, Pool, AGUSD};
use contra::{
    contra::{Self, Account, ConfidentialToken, ManagementCap, TokenRegistry},
    nizk::DdhProof
};
use sui::{group_ops::Element, ristretto255::G, vec_set::{Self, VecSet}};

// === Errors ===

const ENotWhitelisted: u64 = 0;

// === Constants ===

/// Bitmap index for the `register` operation in `contra::contra`. Must stay in
/// sync with `contra::contra::REGISTER = 0`.
const REGISTER_OP: u8 = 0;

// === Types ===

/// Witness for the permissioned `register` operation. Only this module can
/// construct it — that is what lets us enforce the KYC whitelist check.
public struct AgusdWitness has drop {}

/// Shared object holding the set of KYC-approved addresses allowed to register.
public struct Whitelist has key {
    id: UID,
    addresses: VecSet<address>,
}

/// Capability for managing the KYC `Whitelist` — held by Agama compliance.
public struct WhitelistAdminCap has key, store { id: UID }

// === Setup ===

/// Create the `ConfidentialToken<AGUSD>`, install a policy that makes
/// `register` permissioned with this module's `AgusdWitness`, share the
/// confidential token and the `Whitelist`, and return the `ManagementCap<AGUSD>`
/// and `WhitelistAdminCap` to Agama.
///
/// `auditors` is the initial set of auditor public keys (compliance viewing
/// keys); pass `vector[]` for none.
///
/// Requires `&AgusdAdminCap` so only the agUSD deployer can perform setup.
public fun setup(
    _admin: &AgusdAdminCap,
    pool: &mut Pool,
    registry: &mut TokenRegistry,
    auditors: vector<Element<G>>,
    ctx: &mut TxContext,
): (ManagementCap<AGUSD>, WhitelistAdminCap) {
    let (mut ct, management_cap) = contra::new_confidential_token<AGUSD>(
        registry,
        agusd::treasury_mut(pool),
        auditors,
        ctx,
    );
    ct.set_policy<AGUSD, AgusdWitness>(agusd::treasury_mut(pool), vector[REGISTER_OP]);
    contra::share_confidential_token(ct);

    transfer::share_object(Whitelist {
        id: object::new(ctx),
        addresses: vec_set::empty(),
    });

    (management_cap, WhitelistAdminCap { id: object::new(ctx) })
}

/// Convenience wrapper: run `setup` with no auditors and transfer both the
/// `ManagementCap<AGUSD>` and `WhitelistAdminCap` to the caller. Lets the whole
/// confidential-token init happen in a single `sui client call` (no PTB needed).
public fun setup_and_keep(
    admin: &AgusdAdminCap,
    pool: &mut Pool,
    registry: &mut TokenRegistry,
    ctx: &mut TxContext,
) {
    let (mcap, wcap) = setup(admin, pool, registry, vector[], ctx);
    transfer::public_transfer(mcap, ctx.sender());
    transfer::public_transfer(wcap, ctx.sender());
}

// === KYC whitelist management (Agama compliance) ===

public fun add_to_whitelist(_cap: &WhitelistAdminCap, whitelist: &mut Whitelist, addr: address) {
    whitelist.addresses.insert(addr);
}

public fun remove_from_whitelist(
    _cap: &WhitelistAdminCap,
    whitelist: &mut Whitelist,
    addr: address,
) {
    whitelist.addresses.remove(&addr);
}

public fun is_whitelisted(whitelist: &Whitelist, addr: address): bool {
    whitelist.addresses.contains(&addr)
}

// === Gated register ===

/// Register a confidential agUSD `TokenAccount` on `account` with public key
/// `pk`. Callable only by KYC-whitelisted addresses; the caller does not need
/// to own `account` (an issuer operator may register on behalf of KYCed users).
public fun register(
    ct: &ConfidentialToken<AGUSD>,
    whitelist: &Whitelist,
    account: &mut Account,
    pk: Element<G>,
    ctx: &mut TxContext,
) {
    assert!(whitelist.addresses.contains(&ctx.sender()), ENotWhitelisted);
    let auth = ct.authorize_with_witness(REGISTER_OP, account.owner(), AgusdWitness {});
    contra::register(account, &auth, ct, pk, option::none());
}

/// Rotate the public key of a confidential agUSD `TokenAccount`. Gated by the
/// same KYC whitelist (key rotation reuses the `REGISTER` policy slot).
public fun set_public_key(
    ct: &ConfidentialToken<AGUSD>,
    whitelist: &Whitelist,
    account: &mut Account,
    new_pk: Element<G>,
    new_handles: vector<Element<G>>,
    rekey_proof: DdhProof,
    ctx: &mut TxContext,
) {
    assert!(whitelist.addresses.contains(&ctx.sender()), ENotWhitelisted);
    let auth = ct.authorize_with_witness(REGISTER_OP, account.owner(), AgusdWitness {});
    contra::set_public_key(account, &auth, ct, new_pk, new_handles, rekey_proof, option::none());
}
