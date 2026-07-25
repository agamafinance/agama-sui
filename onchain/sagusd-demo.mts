/**
 * sagUSD — yield-bearing staked agUSD, live on Sui testnet (unified package).
 * A FRESH staker each run (so it only unstakes its OWN shares): mint agUSD →
 * stake → issuer books a yield of 10% of the vault → unstake at the new NAV.
 * Run:  AGAMA_KEY=suiprivkey1... pnpm exec tsx sagusd-demo.mts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';

const PKG = '0x9c98876d3baceb06ee51ac787f989397d589f25cb2bd25076819c279f686dffc';
const POOL = '0x593ab3affff12565d50fb8a4432605e623f175e811febdb86fe62e99d6c3ad19';
const USDC_T = '0x7b2a9f519648b3c5c806dc072920f2bef20070dc25e77d1415ce52c28f52f8ac';
const VAULT = '0xb75d1f795617fe7634f2124f3dec4def3229c51e41ec659ca64902823024e7a8';
const YIELD_CAP = '0xd9af80d259e9110192b6ce33a66dcdf26a0e830c604e00ed11f00613a179975d';
const AGUSD = `${PKG}::agusd::AGUSD`;
const SAGUSD = `${PKG}::sagusd::SAGUSD`;

const admin = Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const staker = Ed25519Keypair.generate();
const S = staker.toSuiAddress();
const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

async function exec(l: string, signer: Ed25519Keypair, b: (t: Transaction) => any) {
  const tx = new Transaction(); await b(tx); tx.setSender(signer.toSuiAddress());
  const r: any = await base.core.signAndExecuteTransaction({ transaction: tx, signer, include: { effects: true, objectTypes: true } });
  if (r.FailedTransaction) throw new Error(l + ': ' + r.FailedTransaction.status?.error?.message);
  await base.core.waitForTransaction({ result: r }); console.log(`  ✓ ${l}  (${r.Transaction.digest.slice(0, 10)}…)`);
}
async function coins(owner: string, type: string) { const c: any = await base.core.listCoins({ owner, coinType: type }); return c.objects as any[]; }
const sum = (os: any[]) => os.reduce((s, o) => s + BigInt(o.balance ?? 0), 0n);
async function vaultAssets(): Promise<number> {
  const res = await fetch('https://sui-testnet-rpc.publicnode.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getObject', params: [VAULT, { showContent: true }] }) });
  const j: any = await res.json();
  return Number(j?.result?.data?.content?.fields?.assets ?? 0);
}

console.log('fresh staker:', S, '\n');

await exec('admin funds staker + mints it 100 agUSD', admin, (t) => {
  const [g] = t.splitCoins(t.gas, [100_000_000n]); t.transferObjects([g], S);
  const u = t.moveCall({ target: `${PKG}::usdc::faucet`, arguments: [t.object(USDC_T), t.pure.u64(100_000_000n)] });
  const a = t.moveCall({ target: `${PKG}::agusd::mint`, arguments: [t.object(POOL), u] });
  t.transferObjects([a], S);
});
const agCoin = (await coins(S, AGUSD))[0];
await exec('staker stakes 100 agUSD → sagUSD', staker, (t) => {
  const sag = t.moveCall({ target: `${PKG}::sagusd::stake`, arguments: [t.object(VAULT), t.object(agCoin.objectId ?? agCoin.id)] });
  t.transferObjects([sag], S);
});
const gotShares = sum(await coins(S, SAGUSD));

const assets = await vaultAssets();
const yieldAmt = Math.max(Math.round(assets * 0.10), 1_000_000);
await exec(`issuer books +${(yieldAmt / 1e6).toFixed(2)} agUSD yield (10% of vault)`, admin, (t) => {
  const u = t.moveCall({ target: `${PKG}::usdc::faucet`, arguments: [t.object(USDC_T), t.pure.u64(BigInt(yieldAmt))] });
  const a = t.moveCall({ target: `${PKG}::agusd::mint`, arguments: [t.object(POOL), u] });
  t.moveCall({ target: `${PKG}::sagusd::accrue_yield`, arguments: [t.object(YIELD_CAP), t.object(VAULT), a] });
});

const sagCoin = (await coins(S, SAGUSD))[0];
await exec('staker unstakes ITS sagUSD → agUSD (NAV-priced)', staker, (t) => {
  const a = t.moveCall({ target: `${PKG}::sagusd::unstake`, arguments: [t.object(VAULT), t.object(sagCoin.objectId ?? sagCoin.id)] });
  t.transferObjects([a], S);
});
const out = sum(await coins(S, AGUSD));

console.log('\n=== RESULT ===');
console.log('  staked   : 100.00 agUSD  →', (Number(gotShares) / 1e6).toFixed(2), 'sagUSD');
console.log('  yield    : issuer booked ~10% of the vault (no new shares → NAV rises)');
console.log('  unstaked :', (Number(out) / 1e6).toFixed(2), 'agUSD  (NAV-priced, NOT 1:1)');
console.log('\n✓ sagUSD is yield-bearing: 100 agUSD in →', (Number(out) / 1e6).toFixed(2), 'agUSD out. Live on testnet.');
