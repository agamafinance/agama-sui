/**
 * Confidential agUSD — live on Sui testnet.
 *
 * A fresh LP each run: admin funds + KYC-whitelists it, then the LP registers a
 * confidential token account, mints agUSD, wraps it into the shielded balance,
 * and merges. On-chain the balance is an ElGamal ciphertext; only the LP's
 * viewing key recovers the amount.
 *
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx agama-confidential-demo.mts
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
const AGUSD_PKG = '0x9c98876d3baceb06ee51ac787f989397d589f25cb2bd25076819c279f686dffc';
const POOL = '0x593ab3affff12565d50fb8a4432605e623f175e811febdb86fe62e99d6c3ad19';
const USDC_TREASURY = '0x7b2a9f519648b3c5c806dc072920f2bef20070dc25e77d1415ce52c28f52f8ac';
const CT = '0xd372b544af6ee21d3ce08dd94211f684bde55558dfbeed32decd8407a5c51d44';
const WHITELIST = '0xfeb070017344698c1afb84b85bb5a4b5c3e455056620a5e478c7f230b1ff39d1';
const WL_ADMIN_CAP = '0xc392f63bf4eedade8f852760afd8d8af1b2cfb81d070371f010d8caf78d5a02e';
const AGUSD_TYPE = `${AGUSD_PKG}::agusd::AGUSD`;
const AMOUNT = 100_000_000n; // 100 agUSD (6dp) — the secret amount

const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
const admin = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const lp = Ed25519Keypair.generate(); // a fresh, KYC'd LP each run
const LP = lp.toSuiAddress();
const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });
const table = DiscreteLogTable.create(16);
const client = base.$extend(contra({ packageConfig: pkgCfg, table }));

async function exec(label: string, signer: Ed25519Keypair, build: (tx: Transaction) => void | Promise<void>) {
  const tx = new Transaction();
  await build(tx);
  tx.setSender(signer.toSuiAddress());
  const result: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer, include: { effects: true, objectTypes: true } });
  if (result.FailedTransaction) throw new Error(`${label}: ${result.FailedTransaction.status?.error?.message ?? 'failed'}`);
  await base.core.waitForTransaction({ result });
  console.log(`  ✓ ${label}  (${result.Transaction.digest.slice(0, 12)}…)`);
}

const tokenAccount = new TokenAccount(LP, AGUSD_TYPE, pkgCfg);
console.log('fresh LP          :', LP);
console.log('ElGamal viewing pk:', Buffer.from(tokenAccount.publicKey.toBytes()).toString('hex').slice(0, 24), '…\n');

await exec('1. admin funds LP gas + KYC-whitelists it', admin, (tx) => {
  const [gas] = tx.splitCoins(tx.gas, [200_000_000n]); // 0.2 SUI for the LP's gas
  tx.transferObjects([gas], LP);
  tx.moveCall({ target: `${AGUSD_PKG}::confidential_agusd::add_to_whitelist`, arguments: [tx.object(WL_ADMIN_CAP), tx.object(WHITELIST), tx.pure.address(LP)] });
});

await exec('2. LP creates its confidential Account', lp, (tx) => {
  const account = tx.add(client.contra.newAccount({ owner: LP }));
  tx.add(client.contra.shareAccount({ account }));
});

await exec('3. LP registers TokenAccount (KYC-gated register)', lp, (tx) => {
  tx.moveCall({ target: `${AGUSD_PKG}::confidential_agusd::register`, arguments: [tx.object(CT), tx.object(WHITELIST), tx.object(client.contra.getAccountId(LP)), point(tokenAccount.publicKey.toBytes())] });
});

await exec(`4. LP faucets USDC → mints ${AMOUNT} agUSD`, lp, (tx) => {
  const usdc = tx.moveCall({ target: `${AGUSD_PKG}::usdc::faucet`, arguments: [tx.object(USDC_TREASURY), tx.pure.u64(AMOUNT)] });
  const ag = tx.moveCall({ target: `${AGUSD_PKG}::agusd::mint`, arguments: [tx.object(POOL), usdc] });
  tx.transferObjects([ag], LP);
});

await exec('5. LP wraps agUSD → confidential balance', lp, async (tx) => {
  const coins: any = await base.core.listCoins({ owner: LP, coinType: AGUSD_TYPE });
  const [coin] = tx.splitCoins(tx.object(coins.objects[0].objectId ?? coins.objects[0].id), [AMOUNT]);
  tx.add(client.contra.wrap({ coin, receiver: LP, tokenType: AGUSD_TYPE }));
});

await exec('6. LP merges → active encrypted balance (bulletproof generated locally)', lp, async (tx) => {
  const fn = await client.contra.updateBalance({ tokenAccount, merge: true });
  tx.add(fn);
});

const bal = await client.contra.getBalance(tokenAccount);
console.log('\n=== RESULT ===');
console.log('On-chain, the balance lives as ElGamal ciphertexts — no plaintext amount is stored.');
console.log('Recovered with the viewing key (SDK-side decryption):');
console.log('  active balance :', bal.balance.amount.toString(), '(= ' + (Number(bal.balance.amount) / 1e6).toFixed(2) + ' agUSD)');
console.log('\n✓ Amount hidden on-chain, recovered only with the key. Confidential agUSD, live on testnet.');
