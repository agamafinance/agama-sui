/* tslint:disable */
/* eslint-disable */

/**
 * Output of a batched range proof: the single aggregate proof plus the
 * `32 * values.len()` bytes of concatenated Pedersen commitments, one per
 * input value, in order.
 */
export class BatchRangeProofResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Concatenated 32-byte commitments, in the same order as the input values.
     */
    readonly commitments: Uint8Array;
    readonly proof: Uint8Array;
}

/**
 * Output of a range proof: the serialized proof and the 32-byte compressed
 * Pedersen commitment `V = value * H + blinding * G` under fastcrypto's
 * generators.
 */
export class RangeProofResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly commitment: Uint8Array;
    readonly proof: Uint8Array;
}

/**
 * Aggregate range proof that `values[i] ∈ [0, 2^bit_size)` for every `i`,
 * using fastcrypto's `RangeProof::prove_batch`.
 *
 * `values.len()` must be a power of 2 and equal to `blindings.len() / 32`;
 * `blindings` is `32 * values.len()` bytes, each a canonical ristretto255
 * scalar. `dst` is the domain-separation tag bound into the proof transcript;
 * the verifier must supply the same tag.
 */
export function batchRangeProof(values: BigUint64Array, blindings: Uint8Array, bit_size: number, dst: Uint8Array): BatchRangeProofResult;

/**
 * Prove `value ∈ [0, 2^bit_size)` using fastcrypto's `RangeProof::prove`.
 *
 * `bit_size` must be one of 8, 16, 32, 64. `blinding` is a 32-byte canonical
 * ristretto255 scalar. `dst` is the domain-separation tag bound into the proof
 * transcript; the verifier must supply the same tag. Returns the serialized
 * proof and the 32-byte Pedersen commitment.
 */
export function rangeProof(value: bigint, blinding: Uint8Array, bit_size: number, dst: Uint8Array): RangeProofResult;

/**
 * Verify an aggregate range proof that every commitment encodes a value in
 * `[0, 2^bit_size)`, using `fastcrypto::bulletproofs::RangeProof::verify_batch`.
 *
 * `commitments` is a flat buffer of 32-byte ristretto255 points concatenated
 * in the same order the proof was generated with. The number of commitments
 * must be a power of 2 and equal to the one used when proving. `dst` must match
 * the tag used when proving.
 */
export function verifyBatchRangeProof(proof: Uint8Array, commitments: Uint8Array, bit_size: number, dst: Uint8Array): boolean;

/**
 * Verify a fastcrypto range proof that the value committed in `commitment`
 * lies in `[0, 2^bit_size)`. `dst` must match the tag used when proving.
 * Returns `true` if the proof verifies, `false` otherwise.
 */
export function verifyRangeProof(proof: Uint8Array, commitment: Uint8Array, bit_size: number, dst: Uint8Array): boolean;
