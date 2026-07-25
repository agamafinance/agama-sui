/**
 * sagUSD — yield-bearing staked agUSD, live on Sui testnet (unified package).
 * mint agUSD (USDC→pool) → stake → accrue yield → NAV rises → unstake → MORE agUSD.
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx sagusd-demo.mts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const PKG = '0x9c98876d3baceb06ee51ac787f989397d589f25cb2bd25076819c279f686dffc';
const POOL = '0x593ab3affff12565d50fb8a4432605e623f175e811febdb86fe62e99d6c3ad19';
const USDC_TREASURY = '0x7b2a9f519648b3c5c806dc072920f2bef20070dc25e77d1415ce52c28f52f8ac';
const VAULT = '0xb75d1f795617fe7634f2124f3dec4def3229c51e41ec659ca64902823024e7a8';
const YIELD_CAP = '0xd9af80d259e9110192b6ce33a66dcdf26a0e830c604e00ed11f00613a179975d';
const AGUSD = `${PKG}::agusd::AGUSD`;
const SAGUSD = `${PKG}::sagusd::SAGUSD`;

const kp = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const ME = kp.toSuiAddress();
const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

async function exec(l: string, b: (t: Transaction) => any) {
  const tx = new Transaction(); await b(tx); tx.setSender(ME);
  const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer: kp, include: { effects: true, objectTypes: true } });
  if (r.FailedTransaction) throw new Error(l + ': ' + r.FailedTransaction.status?.error?.message);
  await base.core.waitForTransaction({ result: r }); console.log(`  ✓ ${l}  (${r.Transaction.digest.slice(0, 12)}…)`);
}
async function coins(type: string) { const c: any = await base.core.listCoins({ owner: ME, coinType: type }); return c.objects as any[]; }
const sum = (os: any[]) => os.reduce((s, o) => s + BigInt(o.balance ?? 0), 0n);

console.log('staker:', ME, '\n');

await exec('1. faucet 120 USDC → mint 120 agUSD', (t) => {
  const usdc = t.moveCall({ target: `${PKG}::usdc::faucet`, arguments: [t.object(USDC_TREASURY), t.pure.u64(120_000_000n)] });
  const ag = t.moveCall({ target: `${PKG}::agusd::mint`, arguments: [t.object(POOL), usdc] });
  t.transferObjects([ag], ME);
});
const src = (await coins(AGUSD)).sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))[0];
await exec('2. stake 100 agUSD → sagUSD (bootstrap 1:1)', (t) => {
  const [s] = t.splitCoins(t.object(src.objectId ?? src.id), [100_000_000n]);
  const sag = t.moveCall({ target: `${PKG}::sagusd::stake`, arguments: [t.object(VAULT), s] });
  t.transferObjects([sag], ME);
});
console.log('     → sagUSD received:', (Number(sum(await coins(SAGUSD))) / 1e6).toFixed(2), 'sagUSD');
await exec('3. accrue 20 agUSD yield into the vault (NAV rises)', async (t) => {
  const c = (await coins(AGUSD)).sort((a, b) => Number(BigInt(b.balance) - BigInt(a.balance)))[0];
  const [y] = t.splitCoins(t.object(c.objectId ?? c.id), [20_000_000n]);
  t.moveCall({ target: `${PKG}::sagusd::accrue_yield`, arguments: [t.object(YIELD_CAP), t.object(VAULT), y] });
});
const before = sum(await coins(AGUSD));
const sagId = (await coins(SAGUSD))[0].objectId ?? (await coins(SAGUSD))[0].id;
await exec('4. unstake all sagUSD → agUSD (NAV priced, includes yield)', (t) => {
  const ag = t.moveCall({ target: `${PKG}::sagusd::unstake`, arguments: [t.object(VAULT), t.object(sagId)] });
  t.transferObjects([ag], ME);
});
const out = sum(await coins(AGUSD)) - before;
console.log('\n=== RESULT ===');
console.log('  staked   : 100.00 agUSD into the vault');
console.log('  yield    : +20.00 agUSD booked (no new shares → NAV per share rises)');
console.log('  unstaked : 100.00 sagUSD →', (Number(out) / 1e6).toFixed(2), 'agUSD  (NAV priced, NOT 1:1)');
console.log('\n✓ sagUSD is yield-bearing: 100 agUSD in,', (Number(out) / 1e6).toFixed(2), 'agUSD out. Live on testnet.');
