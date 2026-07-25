/**
 * Agama × Walrus + Seal — private deal docs, decentralized but confidential.
 *
 * A deal document (term sheet / originator data) is:
 *   1. encrypted with Seal (threshold MPC, bound to policy + owner),
 *   2. stored on Walrus testnet (decentralized storage — the blob is public),
 *   3. retrieved by anyone (the bytes are public),
 *   4. but only DECRYPTABLE by the owner or the Agama allowlist — a rival who
 *      pulls the same blob is denied by the Seal committee.
 *
 * This is the canonical Seal + Walrus pattern: Walrus holds the ciphertext,
 * Seal controls who can read it. Both on Sui testnet.
 *
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx walrus-seal-demo.mts
 */
import { SealClient, SessionKey } from '@mysten/seal';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';

const SEAL_PKG = '0x9cdf639d51a0be9d7e03aefe5aa8f463e9715a17d2fc97745e10b8dd3dc725a8';
const POLICY = '0x786325d84d2fd6a26fd641fd24d5bde715bea6cd88efca422202061860b9e08c';
const KEY_SERVERS = [
  '0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75',
  '0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8',
];
const WALRUS_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=1';
const WALRUS_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space/v1/blobs/';

const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const freshSeal = () => new SealClient({ suiClient: base as any, serverConfigs: KEY_SERVERS.map((objectId) => ({ objectId, weight: 1 })), verifyKeyServers: false });

const agama = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!); // on the allowlist
const alice = Ed25519Keypair.generate();  // the LP the deal belongs to
const rival = Ed25519Keypair.generate();  // must not be able to read

function identity(owner: string): string {
  const p = fromHex(POLICY.slice(2)); const o = fromHex(owner.slice(2));
  const out = new Uint8Array(p.length + o.length); out.set(p, 0); out.set(o, p.length);
  return toHex(out);
}
async function decryptAs(who: string, kp: Ed25519Keypair, ownerId: string, ct: Uint8Array): Promise<string> {
  const seal = freshSeal();
  const sk = await SessionKey.create({ address: kp.toSuiAddress(), packageId: SEAL_PKG, ttlMin: 10, suiClient: base as any });
  const { signature } = await kp.signPersonalMessage(sk.getPersonalMessage());
  await sk.setPersonalMessageSignature(signature);
  const tx = new Transaction();
  tx.moveCall({ target: `${SEAL_PKG}::access::seal_approve`, arguments: [tx.pure.vector('u8', Array.from(fromHex(identity(ownerId)))), tx.object(POLICY)] });
  const txBytes = await tx.build({ client: base as any, onlyTransactionKind: true });
  try { return `✓ ${who} read the doc → ${new TextDecoder().decode(await seal.decrypt({ data: ct, sessionKey: sk, txBytes }))}`; }
  catch (e: any) { return `✗ ${who} got the blob but CANNOT read it (${e?.constructor?.name ?? 'error'})`; }
}

// 1. Encrypt the deal document with Seal.
const dealDoc = JSON.stringify({ deal: 'Senior Private Credit', originator: 'Maple', borrower: 'ACME Corp', faceValue: '$100,000', apr: '9%', ltv: '65%' });
const { encryptedObject } = await freshSeal().encrypt({ threshold: KEY_SERVERS.length, packageId: SEAL_PKG, id: identity(alice.toSuiAddress()), data: new TextEncoder().encode(dealDoc) });
console.log('deal doc (plaintext):', dealDoc);
console.log('Seal-encrypted:', encryptedObject.length, 'bytes\n');

// 2. Store the ciphertext on Walrus testnet (decentralized storage).
const put = await fetch(WALRUS_PUBLISHER, { method: 'PUT', body: encryptedObject });
const pj: any = await put.json();
const blobId = pj.newlyCreated?.blobObject?.blobId ?? pj.alreadyCertified?.blobId;
console.log('stored on Walrus testnet → blobId:', blobId);

// 3. Retrieve from Walrus (the bytes are PUBLIC — anyone can fetch them).
const got = await fetch(WALRUS_AGGREGATOR + blobId);
const retrieved = new Uint8Array(await got.arrayBuffer());
console.log('retrieved from Walrus:', retrieved.length, 'bytes (public blob)\n');

// 4. Only the owner / Agama allowlist can actually read it.
console.log(await decryptAs('Alice (owner) ', alice, alice.toSuiAddress(), retrieved));
console.log(await decryptAs('Agama risk    ', agama, alice.toSuiAddress(), retrieved));
console.log(await decryptAs('Rival LP      ', rival, alice.toSuiAddress(), retrieved));

console.log('\n✓ Deal doc lives on Walrus (decentralized, public bytes) — but only Seal-authorized parties can read it. Both on testnet.');
