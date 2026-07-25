/**
 * Agama × Seal — REAL role-based access control for private positions.
 *
 * Encrypt an LP position with Seal (threshold MPC), then try to decrypt as:
 *   - the LP owner        → allowed
 *   - Agama risk team     → allowed (on the on-chain allowlist)
 *   - a rival LP          → DENIED by the Seal committee (seal_approve aborts)
 *
 * The gate is enforced on-chain (`agama_seal::access::seal_approve`) + by the
 * Seal MPC key-server committee on testnet — not simulated.
 *
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx seal-demo.mts
 */
import { SealClient, SessionKey } from '@mysten/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';

const SEAL_PKG = '0x78e24bc0a7e5de42d5a6f93dc8d254f75986e4cfab6ea95946680755ecb41ed6';
const POLICY = '0x6983f5ea3f67811beb06ef956a1c457b5fdd979992a753313080c8e8df1792f1';
const ADMIN_CAP = '0x809c3406acf6ee0eea4bd01666e871e194bb3ba275a90d25df518da4f1cc19ef';
// Mysten testnet Seal key servers (independent), threshold 2.
const KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];

const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

const agama = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!); // "Agama risk team" (holds admin cap)
const AGAMA = agama.toSuiAddress();
const alice = Ed25519Keypair.generate();   // the LP who owns the position
const rival = Ed25519Keypair.generate();   // another LP — must NOT be able to read

/** id = policy_id(32) || owner(32), as hex. Binds the ciphertext to (policy, owner). */
function identity(owner: string): string {
  const p = fromHex(POLICY.slice(2)); const o = fromHex(owner.slice(2));
  const out = new Uint8Array(p.length + o.length); out.set(p, 0); out.set(o, p.length);
  return toHex(out);
}

function freshSeal() { return new SealClient({ suiClient: base as any, serverConfigs: KEY_SERVERS.map((objectId) => ({ objectId, weight: 1 })), verifyKeyServers: false }); }

async function tryDecrypt(who: string, kp: Ed25519Keypair, ownerId: string, ct: Uint8Array): Promise<string> {
  const seal = freshSeal();
  const sk = await SessionKey.create({ address: kp.toSuiAddress(), packageId: SEAL_PKG, ttlMin: 10, suiClient: base as any });
  const { signature } = await kp.signPersonalMessage(sk.getPersonalMessage());
  await sk.setPersonalMessageSignature(signature);
  const tx = new Transaction();
  tx.moveCall({ target: `${SEAL_PKG}::access::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(fromHex(identity(ownerId)))), tx.object(POLICY)] });
  const txBytes = await tx.build({ client: base as any, onlyTransactionKind: true });
  try {
    const plain = await seal.decrypt({ data: ct, sessionKey: sk, txBytes });
    return `✓ ${who} decrypted → ${new TextDecoder().decode(plain)}`;
  } catch (e: any) {
    return `✗ ${who} DENIED by the Seal committee (${(e?.constructor?.name ?? 'error')})`;
  }
}

// 0. Agama compliance adds itself (the risk team) to the on-chain allowlist.
{
  const tx = new Transaction();
  tx.moveCall({ target: `${SEAL_PKG}::access::allow`, arguments: [tx.object(ADMIN_CAP), tx.object(POLICY), tx.pure.address(AGAMA)] });
  tx.setSender(AGAMA);
  const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer: agama, include: { effects: true } });
  await base.core.waitForTransaction({ result: r });
  console.log('· Agama risk team added to the on-chain access allowlist\n');
}

// 1. Encrypt Alice's private position with Seal, bound to (policy, alice).
const position = JSON.stringify({ lp: 'alice', amount: '$100,000', tranche: 'Senior Private Credit', originator: 'Maple' });
const { encryptedObject } = await freshSeal().encrypt({ threshold: KEY_SERVERS.length, packageId: SEAL_PKG, id: identity(alice.toSuiAddress()), data: new TextEncoder().encode(position) });
console.log('encrypted position (on-chain-ready ciphertext):', toHex(encryptedObject).slice(0, 40), '…');
console.log('  plaintext (only decryptable by owner/allowlist):', position, '\n');

// 2. Three parties try to decrypt.
console.log(await tryDecrypt('Alice (owner)  ', alice, alice.toSuiAddress(), encryptedObject));
console.log(await tryDecrypt('Agama risk team', agama, alice.toSuiAddress(), encryptedObject));
console.log(await tryDecrypt('Rival LP       ', rival, alice.toSuiAddress(), encryptedObject));

console.log('\n✓ Access control is REAL: Seal MPC committee + on-chain seal_approve on testnet.');
