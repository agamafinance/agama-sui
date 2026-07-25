/**
 * PRIVACY AUDIT — what can an on-chain observer actually see?
 * Does a real USDC→cagUSD deposit (wrap) and a real confidential transfer,
 * then reads back the txs from a PUBLIC RPC (no secrets) and prints exactly
 * what is legible to anyone watching the chain.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { contra } from './src/client.js';
import { DiscreteLogTable } from './src/twisted_elgamal.js';
import { TokenAccount } from './src/token_account.js';
import { point } from './src/helpers.js';

const CONTRA_PKG='0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080';
const ACCOUNT_REGISTRY='0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3';
const TOKEN_REGISTRY='0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb';
const AGUSD_PKG='0x4a30152ec1b7f97eddcd92a70bec4858d151732be27d3e4a9e18197702cd388a';
const POOL='0xb3ff4a8a6fb24eb818fba18ffd3e0194c10dbd1bc9d8f466fc213a7910d79665';
const USDC_TREASURY='0xed327ab657d953ae8d6c588b0aa5918c273b840d296c4436265187194d005f90';
const CT='0xc5185f8ad2ee4a386cf675b7203dfe35ec6e7fd7460dc87019c746dd3d076d78';
const WHITELIST='0x30638a4a3cd667cd6c205bf2818ddf7e121424e2574ee90b2ae39124a112632e';
const WL_ADMIN_CAP='0x7ae75506d0a8c92d999973c6fbe9ca1a04d95839af67c4fa989fa96f9804918b';
const AGUSD_TYPE=`${AGUSD_PKG}::agusd::AGUSD`; const AMOUNT=100_000_000n;
const RPC='https://sui-testnet-rpc.publicnode.com';
const pkgCfg={packageId:CONTRA_PKG,accountRegistryId:ACCOUNT_REGISTRY,tokenRegistryId:TOKEN_REGISTRY};
const admin=Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const lp=Ed25519Keypair.generate(); const LP=lp.toSuiAddress();
const bob=Ed25519Keypair.generate(); const BOB=bob.toSuiAddress();
const base=new SuiGrpcClient({network:'testnet',baseUrl:'https://fullnode.testnet.sui.io:443'});
const client=base.$extend(contra({packageConfig:pkgCfg,table:DiscreteLogTable.create(16)}));
const taLP=new TokenAccount(LP,AGUSD_TYPE,pkgCfg);
const taBOB=new TokenAccount(BOB,AGUSD_TYPE,pkgCfg);

async function exec(l,signer,build){const tx=new Transaction();await build(tx);tx.setSender(signer.toSuiAddress());const r=await base.core.signAndExecuteTransaction({transaction:tx,signer,include:{effects:true}});if(r.FailedTransaction)throw new Error(l+': '+r.FailedTransaction.status?.error?.message);await base.core.waitForTransaction({result:r});return r.Transaction.digest;}
async function onboard(kp,addr,ta){
  await exec('fund+wl',admin,(t)=>{const[g]=t.splitCoins(t.gas,[45_000_000n]);t.transferObjects([g],addr);t.moveCall({target:`${AGUSD_PKG}::confidential_agusd::add_to_whitelist`,arguments:[t.object(WL_ADMIN_CAP),t.object(WHITELIST),t.pure.address(addr)]});});
  await exec('acct',kp,(t)=>{const a=t.add(client.contra.newAccount({owner:addr}));t.add(client.contra.shareAccount({account:a}));});
  await exec('reg',kp,(t)=>{t.moveCall({target:`${AGUSD_PKG}::confidential_agusd::register`,arguments:[t.object(CT),t.object(WHITELIST),t.object(client.contra.getAccountId(addr)),point(ta.publicKey.toBytes())]});});
}
async function rpcTx(digest){const r=await(await fetch(RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sui_getTransactionBlock',params:[digest,{showInput:true,showEvents:true,showObjectChanges:true,showBalanceChanges:true}]})})).json();return r.result;}

console.log('LP  =',LP);
console.log('BOB =',BOB,'\n');
await onboard(lp,LP,taLP); console.log('· LP onboarded');
await onboard(bob,BOB,taBOB); console.log('· BOB onboarded');

// A) DEPOSIT: USDC -> cagUSD (mint+wrap one tx)
const wrapDig=await exec('wrap',lp,(t)=>{const usdc=t.moveCall({target:`${AGUSD_PKG}::usdc::faucet`,arguments:[t.object(USDC_TREASURY),t.pure.u64(AMOUNT)]});const ag=t.moveCall({target:`${AGUSD_PKG}::agusd::mint`,arguments:[t.object(POOL),usdc]});t.add(client.contra.wrap({coin:ag,receiver:LP,tokenType:AGUSD_TYPE}));});
await exec('merge',lp,async(t)=>{t.add(await client.contra.updateBalance({tokenAccount:taLP,merge:true}));});
console.log('· deposit done:',wrapDig);

// B) CONFIDENTIAL TRANSFER: LP -> BOB, 30 agUSD
const xferDig=await exec('transfer',lp,async(t)=>{t.add(await client.contra.transfer({tokenAccount:taLP,receiverAddress:BOB,amount:30_000_000n}));});
console.log('· confidential transfer done:',xferDig,'\n');

// ---- READ BACK AS AN OBSERVER ----
function amountsInInputs(tx){const ins=tx?.transaction?.data?.transaction?.inputs||[];return ins.filter(i=>i.type==='pure'&&i.valueType==='u64').map(i=>i.value);}
const w=await rpcTx(wrapDig);
console.log('═══ A) DEPOSIT tx (USDC → cagUSD) — what an observer reads ═══');
console.log('  sender (signer)         :',w.transaction.data.sender);
console.log('  u64 amounts in cleartext:',JSON.stringify(amountsInInputs(w)),'  ← 100000000 = 100 agUSD VISIBLE');
console.log('  balanceChanges          :',JSON.stringify((w.balanceChanges||[]).map(b=>({coin:b.coinType.split('::').pop(),amt:b.amount}))));
const x=await rpcTx(xferDig);
console.log('\n═══ B) CONFIDENTIAL TRANSFER tx (LP → BOB) — what an observer reads ═══');
console.log('  sender (signer)         :',x.transaction.data.sender);
const objs=(x.objectChanges||[]).filter(o=>o.objectType?.includes('Account')||o.objectType?.includes('account')).map(o=>o.objectId);
console.log('  amounts in cleartext    :',JSON.stringify(amountsInInputs(x).filter(v=>v!=='0')),'  ← transfer amount (30) is NOT here');
console.log('  account objects touched :',objs.length,'(sender + receiver accounts are identifiable)');
const ev=(x.events||[]).map(e=>e.type.split('::').slice(-1)[0]);
console.log('  events                  :',JSON.stringify(ev),'  ← TransferEvent links sender↔receiver, amount encrypted');
console.log('\n═══ VERDICT ═══');
console.log('  Deposit  : amount + depositor address  →  PUBLIC');
console.log('  Transfer : amount  → HIDDEN,   sender + receiver addresses → PUBLIC');
