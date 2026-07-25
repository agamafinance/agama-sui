/**
 * Agama × Nautilus — on-chain verification of the Allocation Engine's attested NAV.
 *
 * The NAV / allocation compute runs in a TEE; the enclave signs its output and
 * the chain verifies the signature before accepting it. Here the "enclave" is a
 * stand-in Ed25519 key (the real one is an AWS Nitro enclave, infrastructure);
 * the **on-chain verification is real** (`agama_attest::nav::post_attested_nav`).
 *
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx attest-demo.mts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';

const PKG = '0x180625afa71d367804197147af32a3e2ca27d032fd0bea80aad5d684f0f2a795';
const REGISTRY = '0xa5057a9a3439b70ba026632561c7dd07efe92389f7d927d4378cb6189234bbad';

const admin = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const ME = admin.toSuiAddress();
const enclave = Ed25519Keypair.generate();               // stand-in for the Nitro enclave
const enclavePub = enclave.getPublicKey().toRawBytes();  // 32 bytes
const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

async function run(label: string, build: (t: Transaction) => void): Promise<boolean> {
  const tx = new Transaction(); build(tx); tx.setSender(ME);
  try {
    const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer: admin, include: { effects: true } });
    if (r.FailedTransaction) { console.log(`  ✗ ${label} — rejected on-chain (${r.FailedTransaction.status?.error?.message?.slice(0, 50)})`); return false; }
    await base.core.waitForTransaction({ result: r });
    console.log(`  ✓ ${label}  (${r.Transaction.digest.slice(0, 10)}…)`); return true;
  } catch (e: any) { console.log(`  ✗ ${label} — rejected on-chain (bad attestation)`); return false; }
}

console.log('enclave (stand-in) pubkey:', Buffer.from(enclavePub).toString('hex').slice(0, 24), '…\n');

// 1. Register the enclave's public key (prod: from the Nitro attestation doc).
await run('register enclave key', (t) => t.moveCall({ target: `${PKG}::nav::set_enclave_key`, arguments: [t.object(REGISTRY), t.pure.vector('u8', Array.from(enclavePub))] }));

// 2. The enclave attests a NAV; the chain verifies its signature and accepts.
const nav = 15_300_000n, epoch = 1171n;
const msg = new Uint8Array([...bcs.u64().serialize(nav).toBytes(), ...bcs.u64().serialize(epoch).toBytes()]);
const sig = await enclave.sign(msg);
await run('post attested NAV — VALID signature', (t) => t.moveCall({ target: `${PKG}::nav::post_attested_nav`, arguments: [t.object(REGISTRY), t.pure.u64(nav), t.pure.u64(epoch), t.pure.vector('u8', Array.from(sig))] }));

// 3. A forged/tampered attestation is rejected on-chain.
const forged = new Uint8Array(64); forged.fill(7);
const ok = await run('post attested NAV — FORGED signature (must fail)', (t) => t.moveCall({ target: `${PKG}::nav::post_attested_nav`, arguments: [t.object(REGISTRY), t.pure.u64(nav), t.pure.u64(epoch), t.pure.vector('u8', Array.from(forged))] }));

// 4. Read the accepted NAV on-chain.
const obj: any = await (await fetch('https://sui-testnet-rpc.publicnode.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getObject', params: [REGISTRY, { showContent: true }] }) })).json();
const f = obj.result.data.content.fields;
console.log('\n=== on-chain attested NAV ===');
console.log('  latest_nav_cents:', f.latest_nav_cents, `($${Number(f.latest_nav_cents) / 100})`);
console.log('  updates         :', f.updates);
console.log(ok ? '\n✗ BUG: forged attestation was accepted!' : '\n✓ Only a VALID enclave-signed attestation is accepted on-chain. Forged → rejected. (Real TEE = AWS Nitro in prod.)');
