/**
 * Agama × zkLogin — LP onboarding with no seed phrase (login with Google).
 *
 * The real zkLogin flow, headless where it can be:
 *   1. ephemeral keypair + max epoch + randomness → a nonce (real)
 *   2. a Google OAuth URL carrying that nonce (real — the LP clicks it)  [browser]
 *   3. Google returns a JWT bound to the nonce                            [browser]
 *   4. derive the LP's zkLogin Sui address from (JWT iss/aud/sub + salt)  (real)
 *   5. sign txs with the ephemeral key + a ZK proof (Mysten prover)       [browser]
 *
 * Steps 1 and 4 are verified here; the Google login (2–3) is the browser step,
 * and needs a Google OAuth client id. No private key / seed phrase for the LP.
 *
 * Run:  pnpm exec tsx zklogin-demo.mts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { generateNonce, generateRandomness, getExtendedEphemeralPublicKey, jwtToAddress } from '@mysten/sui/zklogin';
import { toBase64 } from '@mysten/sui/utils';

const base = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://fullnode.testnet.sui.io:443' });

// 1. Ephemeral key + max epoch + randomness → nonce (all real).
const ephemeral = Ed25519Keypair.generate();
const state: any = await base.core.getReferenceGasPrice ? null : null;
const sys = await (await fetch('https://sui-testnet-rpc.publicnode.com', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'suix_getLatestSuiSystemState', params: [] }) })).json();
const maxEpoch = Number(sys.result.epoch) + 2;
const randomness = generateRandomness();
const nonce = generateNonce(ephemeral.getPublicKey(), maxEpoch, randomness);
const extPub = getExtendedEphemeralPublicKey(ephemeral.getPublicKey());

console.log('=== zkLogin onboarding (step 1 — real) ===');
console.log('  ephemeral pubkey (extended):', extPub.slice(0, 24), '…');
console.log('  maxEpoch                    :', maxEpoch);
console.log('  nonce (into the OAuth req)  :', nonce);

// 2. Google OAuth login URL carrying the nonce (the LP clicks this).
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '<your-google-oauth-client-id>.apps.googleusercontent.com';
const REDIRECT = process.env.ZKLOGIN_REDIRECT ?? 'http://localhost:5178';
const loginUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=id_token&redirect_uri=${encodeURIComponent(REDIRECT)}&scope=openid+email&nonce=${nonce}`;
console.log('\n=== step 2 — Google login (browser) ===');
console.log('  ' + loginUrl.slice(0, 120) + '…');

// 4. Derive the LP's zkLogin address from the JWT (real derivation).
//    A real Google login returns this JWT; here we use a Google-shaped payload
//    to show the deterministic address derivation (iss/aud/sub + salt → address).
const salt = process.env.ZKLOGIN_SALT ?? '129390038577185583942388216820280642146';
function b64url(o: unknown) { return toBase64(new TextEncoder().encode(JSON.stringify(o))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
const jwtPayload = { iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: '10769150350006150715', email: 'lp@agama.finance', nonce };
const jwt = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(jwtPayload)}.sig`;
const zkAddress = jwtToAddress(jwt, salt, false);

console.log('\n=== step 4 — LP zkLogin address (real derivation) ===');
console.log('  from (iss, aud, sub, salt) → Sui address:');
console.log('  ' + zkAddress);
console.log('\n✓ The LP onboards with Google — no seed phrase. Address is derived from the');
console.log('  OAuth identity + salt; txs are signed by the ephemeral key + a ZK proof.');
