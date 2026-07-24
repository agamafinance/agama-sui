/**
 * Confidential agUSD — live on Sui devnet.
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

const CONTRA_PKG = '0x2b5cd3982ebe5cbf244bf73f4b995764dac30847400361244426145dc686eb4f';
const ACCOUNT_REGISTRY = '0xec30a3a87e8c77c8c2c2417ae923658bd46bcfa8fe457d958290cb6112cf1330';
const TOKEN_REGISTRY = '0x750370c126bf8ea3f846d5f910162afc2050e2c5667ef833bc29ffd4e6cedaae';
const AGUSD_PKG = '0x466f40a01ecb81048174fdc4e2971776b61f6c569990b2ada9657fdd159138e0';
const POOL = '0x17554400fbccab1e3df8dee0c36052be5be77f12b32f8b1eb694f798ed4af7ae';
const USDC_TREASURY = '0xa662e769720c70a63a1a5f0d6382b1919039f7adf8073c228b8987296c18441a';
const CT = '0x0adc7586504f5a71be687fc90d30b8be0c174be4014eb58319c05ca921eff71c';
const WHITELIST = '0x5d664fb268db88b4e081bed343589ff60b4d21114421d8bbceabb219e8c73cb2';
const WL_ADMIN_CAP = '0x71408e781d4428aadb889a6fa42713a7cd258676a55ddd7532d54918b50844c1';
const AGUSD_TYPE = `${AGUSD_PKG}::agusd::AGUSD`;
const AMOUNT = 100_000_000n; // 100 agUSD (6dp) — the secret amount

const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
const admin = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const lp = Ed25519Keypair.generate(); // a fresh, KYC'd LP each run
const LP = lp.toSuiAddress();
const base = new SuiGrpcClient({ network: 'devnet', baseUrl: 'https://fullnode.devnet.sui.io:443' });
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
console.log('\n✓ Amount hidden on-chain, recovered only with the key. Confidential agUSD, live on devnet.');
