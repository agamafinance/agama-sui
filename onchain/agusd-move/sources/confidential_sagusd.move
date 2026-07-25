// Agama × Sui — confidential sagUSD (KYC-gated, yield-bearing, hidden balance).
// SPDX-License-Identifier: Apache-2.0

/// Confidential variant of sagUSD. Same shape as `confidential_agusd`, but for
/// the yield-bearing staked token: wrapping sagUSD into this hides the staked
/// balance on-chain (Twisted ElGamal + ZK). Reuses the SAME KYC `Whitelist` as
/// confidential agUSD, so a user approved once can hold both confidential
/// tokens. Registration is gated: caller must own the account AND be whitelisted.
module agusd::confidential_sagusd;

use agusd::sagusd::{Self, SAGUSD, StakingVault};
use agusd::agusd::AgusdAdminCap;
use agusd::confidential_agusd::{Self, Whitelist};
use contra::{
    contra::{Self, Account, ConfidentialToken, ManagementCap, TokenRegistry},
    nizk::DdhProof
};
use sui::{group_ops::Element, ristretto255::G};

const ENotWhitelisted: u64 = 0;
const ENotOwner: u64 = 1;

/// Must stay in sync with `contra::contra::REGISTER = 0`.
const REGISTER_OP: u8 = 0;

/// Witness for the permissioned `register` op — only this module constructs it.
public struct SagusdWitness has drop {}

/// Create the `ConfidentialToken<SAGUSD>`, install a policy making `register`
/// permissioned with this module's witness, share the token, and return the
/// `ManagementCap<SAGUSD>`. Uses the staking vault's `TreasuryCap<SAGUSD>`.
public fun setup(
    _admin: &AgusdAdminCap,
    vault: &mut StakingVault,
    registry: &mut TokenRegistry,
    auditors: vector<Element<G>>,
    ctx: &mut TxContext,
): ManagementCap<SAGUSD> {
    let (mut ct, management_cap) = contra::new_confidential_token<SAGUSD>(
        registry,
        sagusd::treasury_mut(vault),
        auditors,
        ctx,
    );
    ct.set_policy<SAGUSD, SagusdWitness>(sagusd::treasury_mut(vault), vector[REGISTER_OP]);
    contra::share_confidential_token(ct);
    management_cap
}

/// Convenience: setup with no auditors and transfer the `ManagementCap<SAGUSD>`
/// to the caller (single `sui client call`, no PTB).
public fun setup_and_keep(
    admin: &AgusdAdminCap,
    vault: &mut StakingVault,
    registry: &mut TokenRegistry,
    ctx: &mut TxContext,
) {
    let mcap = setup(admin, vault, registry, vector[], ctx);
    transfer::public_transfer(mcap, ctx.sender());
}

/// Register a confidential sagUSD `TokenAccount`. Caller must own `account` AND
/// be KYC-whitelisted (reuses the confidential-agUSD whitelist).
public fun register(
    ct: &ConfidentialToken<SAGUSD>,
    whitelist: &Whitelist,
    account: &mut Account,
    pk: Element<G>,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == account.owner(), ENotOwner);
    assert!(confidential_agusd::is_whitelisted(whitelist, ctx.sender()), ENotWhitelisted);
    let auth = ct.authorize_with_witness(REGISTER_OP, account.owner(), SagusdWitness {});
    contra::register(account, &auth, ct, pk, option::none());
}

/// Rotate the public key of a confidential sagUSD account (same gate).
public fun set_public_key(
    ct: &ConfidentialToken<SAGUSD>,
    whitelist: &Whitelist,
    account: &mut Account,
    new_pk: Element<G>,
    new_handles: vector<Element<G>>,
    rekey_proof: DdhProof,
    ctx: &mut TxContext,
) {
    assert!(ctx.sender() == account.owner(), ENotOwner);
    assert!(confidential_agusd::is_whitelisted(whitelist, ctx.sender()), ENotWhitelisted);
    let auth = ct.authorize_with_witness(REGISTER_OP, account.owner(), SagusdWitness {});
    contra::set_public_key(account, &auth, ct, new_pk, new_handles, rekey_proof, option::none());
}
