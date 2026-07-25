/**
 * USDC → confidential agUSD, DIRECT (one atomic tx).
 * The public agUSD coin is minted and wrapped in the SAME PTB, so the LP never
 * holds a public agUSD balance — from their side it's "USDC in → private agUSD".
 * (A one-time KYC register is still needed once, like opening an account.)
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
const AGUSD_PKG='0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab';
const POOL='0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67';
const USDC_TREASURY='0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d';
const CT='0x7cb730a0ee23a1d014b481930c893134a3942d39c623d9a4dd01022e70975bf2';
const WHITELIST='0x6b2b8a3e2b85d5e5b7fb6ce557e31e1adf4d9e1c3b1d7b301c125cd3466cd9ae';
const WL_ADMIN_CAP='0x8d1d9d823c04117cc7d46516fb6d85c58eaf114aeac69eaa1111364e6b81d20a';
const AGUSD_TYPE=`${AGUSD_PKG}::agusd::AGUSD`; const AMOUNT=100_000_000n;
const pkgCfg={packageId:CONTRA_PKG,accountRegistryId:ACCOUNT_REGISTRY,tokenRegistryId:TOKEN_REGISTRY};
const admin=Ed25519Keypair.fromSecretKey(process.env.AGAMA_KEY!);
const lp=Ed25519Keypair.generate(); const LP=lp.toSuiAddress();
const base=new SuiGrpcClient({network:'testnet',baseUrl:'https://fullnode.testnet.sui.io:443'});
const client=base.$extend(contra({packageConfig:pkgCfg,table:DiscreteLogTable.create(16)}));
const ta=new TokenAccount(LP,AGUSD_TYPE,pkgCfg);
async function exec(l,signer,build){const tx=new Transaction();await build(tx);tx.setSender(signer.toSuiAddress());const r=await base.core.signAndExecuteTransaction({transaction:tx,signer,include:{effects:true,objectTypes:true}});if(r.FailedTransaction)throw new Error(l+': '+r.FailedTransaction.status?.error?.message);await base.core.waitForTransaction({result:r});console.log(`  ✓ ${l}  (${r.Transaction.digest.slice(0,10)}…)`);}
console.log('fresh LP:',LP,'\n');
// one-time KYC onboarding
await exec('onboard: fund + KYC-whitelist',admin,(t)=>{const[g]=t.splitCoins(t.gas,[200_000_000n]);t.transferObjects([g],LP);t.moveCall({target:`${AGUSD_PKG}::confidential_agusd::add_to_whitelist`,arguments:[t.object(WL_ADMIN_CAP),t.object(WHITELIST),t.pure.address(LP)]});});
await exec('onboard: create + register account',lp,(t)=>{const a=t.add(client.contra.newAccount({owner:LP}));t.add(client.contra.shareAccount({account:a}));});
await exec('onboard: register (KYC-gated)',lp,(t)=>{t.moveCall({target:`${AGUSD_PKG}::confidential_agusd::register`,arguments:[t.object(CT),t.object(WHITELIST),t.object(client.contra.getAccountId(LP)),point(ta.publicKey.toBytes())]});});
// THE DIRECT STEP: USDC → agUSD → wrap, all in ONE tx
await exec('USDC → cagUSD  (mint + wrap, ONE atomic tx)',lp,(t)=>{
  const usdc=t.moveCall({target:`${AGUSD_PKG}::usdc::faucet`,arguments:[t.object(USDC_TREASURY),t.pure.u64(AMOUNT)]});
  const ag=t.moveCall({target:`${AGUSD_PKG}::agusd::mint`,arguments:[t.object(POOL),usdc]});     // agUSD created…
  t.add(client.contra.wrap({coin:ag,receiver:LP,tokenType:AGUSD_TYPE}));                          // …and wrapped, same tx
});
await exec('merge → active encrypted balance',lp,async(t)=>{t.add(await client.contra.updateBalance({tokenAccount:ta,merge:true}));});
const bal=await client.contra.getBalance(ta);
console.log('\n=== RESULT ===');
console.log('  LP never held a public agUSD coin — USDC went straight to a confidential balance.');
console.log('  confidential balance (decrypted with viewing key):',bal.balance.amount.toString(),'(=',(Number(bal.balance.amount)/1e6).toFixed(2),'agUSD)');
console.log('\n✓ USDC → cagUSD directly, one atomic tx. Public agUSD existed only transiently inside the tx.');
