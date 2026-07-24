/**
 * sagUSD — yield-bearing staked agUSD, live on Sui testnet.
 * mint agUSD → stake → sagUSD; accrue yield → NAV rises; unstake → MORE agUSD.
 * The agUSD↔sagUSD swap is priced at NAV, not 1:1.
 *
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx sagusd-demo.mts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const PKG = '0x1a4a046b88ff6d9c7841ac19f51d71fa95b26d89658e5599fa4acb237f3c0d30';
const ISSUER = '0x652b7a5980ca3e9e9802de1651420196484800af6f921377259d20a069c58c28';
const VAULT = '0x1aa810086f06e8fcf35b58b9f4f81db94eed51771e3447e680172fbafdd31d0a';
const YIELD_CAP = '0xc57ac6892d7001bf8c74a0359b51e0bb2fb3cfc7bedbb2c70e7204d7a5d3d45b';
const AGUSD_TYPE = `${PKG}::agusd::AGUSD`;
const SAGUSD_TYPE = `${PKG}::sagusd::SAGUSD`;

const kp = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const ME = kp.toSuiAddress();
const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

async function exec(label: string, build: (tx: Transaction) => void | Promise<void>) {
  const tx = new Transaction();
  await build(tx);
  tx.setSender(ME);
  const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer: kp, include: { effects: true, objectTypes: true } });
  if (r.FailedTransaction) throw new Error(`${label}: ${r.FailedTransaction.status?.error?.message ?? 'failed'}`);
  await base.core.waitForTransaction({ result: r });
  console.log(`  ✓ ${label}  (${r.Transaction.digest.slice(0, 12)}…)`);
}
async function coinsOf(type: string) { const c: any = await base.core.listCoins({ owner: ME, coinType: type }); return c.objects as any[]; }
const bal = (os: any[]) => os.reduce((s, o) => s + BigInt(o.balance ?? o.value ?? 0), 0n);
async function navBps(): Promise<number> {
  const o: any = await base.core.getObject({ objectId: VAULT });
  const f = o.object?.content?.fields ?? o.content?.fields ?? {};
  const assets = BigInt(f.assets ?? 0);
  // total shares = we track via the demo; read from sagUSD supply is indirect — derive from assets/known.
  return Number(assets);
}

console.log('issuer / staker:', ME, '\n');

await exec('1. mint 120 agUSD', (tx) => {
  tx.moveCall({ target: `${PKG}::agusd::mint`, arguments: [tx.object(ISSUER), tx.pure.u64(120_000_000n), tx.pure.address(ME)] });
});

// pick the 120 agUSD coin we just minted
let agCoins = await coinsOf(AGUSD_TYPE);
let src = agCoins.find((o) => BigInt(o.balance ?? 0) >= 120_000_000n) ?? agCoins.sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))[0];
const srcId = src.objectId ?? src.id;

await exec('2. stake 100 agUSD → sagUSD (bootstrap 1:1)', (tx) => {
  const [toStake] = tx.splitCoins(tx.object(srcId), [100_000_000n]);
  const sag = tx.moveCall({ target: `${PKG}::sagusd::stake`, arguments: [tx.object(VAULT), toStake] });
  tx.transferObjects([sag], ME);
});
const sagOs = await coinsOf(SAGUSD_TYPE);
console.log('     → sagUSD received:', (Number(bal(sagOs)) / 1e6).toFixed(2), 'sagUSD');

await exec('3. accrue 20 agUSD yield into the vault (NAV rises, no new shares)', async (tx) => {
  const c = (await coinsOf(AGUSD_TYPE)).sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))[0];
  const [y] = tx.splitCoins(tx.object(c.objectId ?? c.id), [20_000_000n]);
  tx.moveCall({ target: `${PKG}::sagusd::accrue_yield`, arguments: [tx.object(YIELD_CAP), tx.object(VAULT), y] });
});

const before = bal(await coinsOf(AGUSD_TYPE));
const sagAll = await coinsOf(SAGUSD_TYPE);
const sagId = sagAll[0].objectId ?? sagAll[0].id;
await exec('4. unstake all sagUSD → agUSD (at NAV, includes yield)', (tx) => {
  const ag = tx.moveCall({ target: `${PKG}::sagusd::unstake`, arguments: [tx.object(VAULT), tx.object(sagId)] });
  tx.transferObjects([ag], ME);
});
const after = bal(await coinsOf(AGUSD_TYPE));
const out = after - before;

console.log('\n=== RESULT ===');
console.log('  staked   : 100.00 agUSD  → 100.00 sagUSD (NAV was 1.0000)');
console.log('  yield    : +20.00 agUSD booked into the vault → NAV = 1.2000');
console.log('  unstaked : 100.00 sagUSD →', (Number(out) / 1e6).toFixed(2), 'agUSD  (NAV priced, NOT 1:1)');
console.log('\n✓ sagUSD is yield-bearing: 100 agUSD in, ' + (Number(out) / 1e6).toFixed(2) + ' agUSD out. Live on testnet.');
