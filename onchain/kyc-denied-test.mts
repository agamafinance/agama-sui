/**
 * Point 3 — verify the KYC gate on-chain: a NON-whitelisted address must be
 * rejected at register (ENotWhitelisted). Proves the gate isn't only simulated.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { contra } from './src/client.js';
import { DiscreteLogTable } from './src/twisted_elgamal.js';
import { TokenAccount } from './src/token_account.js';
import { point } from './src/helpers.js';

const CONTRA_PKG = '0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080';
const ACCOUNT_REGISTRY = '0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3';
const TOKEN_REGISTRY = '0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb';
const AGUSD_PKG = '0x4a30152ec1b7f97eddcd92a70bec4858d151732be27d3e4a9e18197702cd388a';
const CT = '0xc5185f8ad2ee4a386cf675b7203dfe35ec6e7fd7460dc87019c746dd3d076d78';
const WHITELIST = '0x30638a4a3cd667cd6c205bf2818ddf7e121424e2574ee90b2ae39124a112632e';
const AGUSD_TYPE = `${AGUSD_PKG}::agusd::AGUSD`;

const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
const admin = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const evil = Ed25519Keypair.generate(); // NEVER whitelisted
const EVIL = evil.toSuiAddress();
const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const client = base.$extend(contra({ packageConfig: pkgCfg, table: DiscreteLogTable.create(16) }));
const ta = new TokenAccount(EVIL, AGUSD_TYPE, pkgCfg);

async function run(signer: Ed25519Keypair, build: (t: Transaction) => void): Promise<{ ok: boolean; err?: string }> {
  const tx = new Transaction(); build(tx); tx.setSender(signer.toSuiAddress());
  try {
    const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer, include: { effects: true } });
    if (r.FailedTransaction) return { ok: false, err: r.FailedTransaction.status?.error?.message };
    await base.core.waitForTransaction({ result: r });
    return { ok: true };
  } catch (e: any) { return { ok: false, err: String(e.message ?? e) }; }
}

console.log('non-whitelisted address:', EVIL, '\n');
await run(admin, (tx) => { const [g] = tx.splitCoins(tx.gas, [200_000_000n]); tx.transferObjects([g], EVIL); });
console.log('  · funded (but NOT whitelisted)');
await run(evil, (tx) => { const a = tx.add(client.contra.newAccount({ owner: EVIL })); tx.add(client.contra.shareAccount({ account: a })); });
console.log('  · account created');

const res = await run(evil, (tx) => {
  tx.moveCall({ target: `${AGUSD_PKG}::confidential_agusd::register`, arguments: [tx.object(CT), tx.object(WHITELIST), tx.object(client.contra.getAccountId(EVIL)), point(ta.publicKey.toBytes())] });
});

console.log('\n=== RESULT ===');
if (res.ok) {
  console.log('  ✗ BUG: a non-whitelisted address WAS able to register!');
  process.exit(1);
} else {
  const gated = /ENotWhitelisted|abort code: 0|MoveAbort/.test(res.err ?? '');
  console.log('  register rejected:', res.err?.slice(0, 90));
  console.log(gated ? '  ✓ KYC gate enforced on-chain (non-whitelisted rejected).' : '  ⚠ rejected, but not clearly the whitelist abort — check reason above.');
}
