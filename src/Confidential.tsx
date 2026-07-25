import { useEffect, useMemo, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignPersonalMessage,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, fromHex, toHex } from "@mysten/sui/utils";
import { SealClient, SessionKey } from "@mysten/seal";
import { sha512 } from "@noble/hashes/sha2.js";
import { contra } from "./contra/client";
import { DiscreteLogTable } from "./contra/twisted_elgamal";
import { TokenAccount } from "./contra/token_account";
import { GROUP_ORDER } from "./contra/ristretto255";
import { point } from "./contra/helpers";
import wasmUrl from "./contra/bulletproofs-wasm/web/contra_bulletproofs_wasm_bg.wasm?url";

// New testnet deployment (audit-hardened, confidential-enabled).
const CONTRA_PKG = "0xfe46e5ce18ba49912585f92de8da2ecdfec0fec918c74b21911628e62b974080";
const ACCOUNT_REGISTRY = "0x72e8e8a427de42849a3b5e256884972e7e7cf494603c3621a88c6639e83b62c3";
const TOKEN_REGISTRY = "0xd5c7ff228188100c8d60651e921f644ff6fc85ac3440adbb64a95a2e3ac097fb";
const AGUSD_PKG = "0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab";
const POOL = "0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67";
const USDC_TREASURY = "0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d";
const CT = "0x7cb730a0ee23a1d014b481930c893134a3942d39c623d9a4dd01022e70975bf2";
const WHITELIST = "0x6b2b8a3e2b85d5e5b7fb6ce557e31e1adf4d9e1c3b1d7b301c125cd3466cd9ae";
const AGUSD_TYPE = `${AGUSD_PKG}::agusd::AGUSD`;
// Confidential sagUSD (added by the v2 package upgrade).
const AGUSD_PKG_V2 = "0x8808bc82c8edf6ac939e428fff780c41b3529acafecdc797f67b9573285ad0b7";
const CT_SAGUSD = "0x493dee8c5f0aab2f5774f25b7b34cedded6a9930dced8e6121c3268913fac69b";
const VAULT = "0x29b9146405de04894f1a9e932ed7544965dd934e1460fb63bc524fb699344bc8";
const SAGUSD_TYPE = `${AGUSD_PKG}::sagusd::SAGUSD`;
const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
// A registered confidential account to receive a confidential transfer (demo).
const DEMO_RECIPIENT = "0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4";
// Contra reserve vaults — hold ALL wrapped coins = the aggregate confidential
// supply (readable), while individual balances stay encrypted. This is exactly
// what "the Sphere" publishes: the aggregate, never the composition.
const CONTRA_POOL_AGUSD = "0x5f5439b595d99e1f518348d1ed3fc4c9bb75560d64b691c4e47b3dc083a0ddfd";
const CONTRA_POOL_SAGUSD = "0xb0f375679d05c2adc502c34bcf8ad9582a5a32a5b49b302573759bae44caa830";
const RPC = "https://sui-testnet-rpc.publicnode.com";
// Seal (private deal docs) + Walrus (decentralized storage).
const SEAL_PKG = "0x78e24bc0a7e5de42d5a6f93dc8d254f75986e4cfab6ea95946680755ecb41ed6";
const SEAL_POLICY = "0x6983f5ea3f67811beb06ef956a1c457b5fdd979992a753313080c8e8df1792f1";
const KEY_SERVERS = ["0x73d05d62c18d9374e3ea529e8e0ed6161da1a141a94d3f76ae3fe4e99356db75", "0xf5d14a81a982144ae441cd7d64b09027f116a468bd36e7eca494f750591623c8"];
const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space/v1/blobs?epochs=1";
const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space/v1/blobs/";
// Seal identity = policy_id || owner (so seal_approve binds the doc to you).
function sealIdentity(owner: string): string {
  const p = fromHex(SEAL_POLICY.slice(2)); const o = fromHex(owner.slice(2));
  const out = new Uint8Array(p.length + o.length); out.set(p, 0); out.set(o, p.length);
  return toHex(out);
}

// FNV-1a 32-bit — the Sphere's public commitment binds the aggregate only.
function commitment(s: string): string {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "0x" + h.toString(16).padStart(8, "0");
}
async function poolBalance(pool: string, coinType: string): Promise<number> {
  const r = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "suix_getBalance", params: [pool, coinType] }) });
  return Number((await r.json())?.result?.totalBalance ?? 0);
}

type Log = { msg: string; digest?: string; ok: boolean };

// Niveau 3 — the Sphere anonymity boundary over the REAL confidential pool.
// Confidential Transfers hides the AMOUNTS; the Sphere hides the WHO: from
// outside, only the aggregate crosses, and the composition is indistinguishable.
function SpherePanel() {
  const [agg, setAgg] = useState<{ cag: number; csag: number } | null>(null);
  const [sel, setSel] = useState(0);
  useEffect(() => {
    Promise.all([poolBalance(CONTRA_POOL_AGUSD, AGUSD_TYPE), poolBalance(CONTRA_POOL_SAGUSD, SAGUSD_TYPE)])
      .then(([cag, csag]) => setAgg({ cag, csag }))
      .catch(() => {});
  }, []);
  if (!agg) return null;
  const totalCag = agg.cag / 1e6;
  const fp = commitment(`${agg.cag}:${agg.csag}`); // binds totals only — NOT the composition
  const fmt2 = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const comps = [
    { label: "3 LPs", rows: [["toi", totalCag * 0.4], ["Alice", totalCag * 0.35], ["Bob", totalCag * 0.25]] as [string, number][] },
    { label: "5 LPs égaux", rows: [1, 2, 3, 4, 5].map((i) => [`LP${i}`, totalCag / 5] as [string, number]) },
    { label: "1 whale", rows: [["whale", totalCag]] as [string, number][] },
  ];
  const cur = comps[sel];

  const S: Record<string, React.CSSProperties> = {
    card: { background: "#111c18", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18, marginTop: 14, borderLeft: "3px solid #ffd479" },
    lbl: { fontSize: 11, textTransform: "uppercase", letterSpacing: .5, color: "#7f978c" },
    chip: (on: boolean) => ({ fontSize: 12, padding: "5px 11px", borderRadius: 999, cursor: "pointer", border: "1px solid rgba(255,255,255,.14)", background: on ? "#ffd479" : "transparent", color: on ? "#06140d" : "#7f978c", fontWeight: on ? 700 : 400 }),
    box: { background: "#0e1714", border: "1px solid rgba(255,255,255,.08)", borderRadius: 10, padding: 12, marginTop: 8 },
  };

  return (
    <div style={{ maxWidth: 520, margin: "14px auto 0", padding: "0 24px" }}>
      <div style={S.card}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🔒 La Sphere — anonymat du pool</div>
        <p style={{ color: "#7f978c", fontSize: 12.5, lineHeight: 1.5, marginTop: 6 }}>
          Confidential Transfers cache les <b>montants</b>. La <b>Sphere</b> cache le <b>qui</b> : de l'extérieur,
          seul l'<b>agrégat</b> traverse — la composition (qui détient combien) reste privée.
        </p>

        <div style={S.box}>
          <span style={S.lbl}>ce que la Sphere publie (agrégat on-chain, réel)</span>
          <div style={{ fontSize: 20, fontWeight: 700, color: "#ffd479", marginTop: 4 }}>{fmt2(totalCag)} <small style={{ fontSize: 12, color: "#7f978c" }}>cagUSD</small> · <span style={{ color: "#00c805" }}>{fmt2(agg.csag / 1e6)}</span> <small style={{ fontSize: 12, color: "#7f978c" }}>csagUSD</small></div>
          <div style={{ fontSize: 12, color: "#7f978c", marginTop: 2 }}>empreinte publique <code style={{ color: "#00c805" }}>{fp}</code></div>
        </div>

        <div style={{ ...S.lbl, marginTop: 14 }}>indistinguabilité — bascule la composition, l'empreinte NE BOUGE PAS</div>
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {comps.map((c, i) => <button key={i} style={S.chip(sel === i)} onClick={() => setSel(i)}>{c.label}</button>)}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center", marginTop: 10 }}>
          <div style={S.box}>
            <span style={S.lbl}>inside (privé)</span>
            {cur.rows.map(([who, amt], i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}><span>{who}</span><b>{fmt2(amt)}</b></div>)}
          </div>
          <div style={{ color: "#7f978c", fontSize: 18, textAlign: "center" }}>→</div>
          <div style={S.box}>
            <span style={S.lbl}>outside (public)</span>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#ffd479", marginTop: 4 }}>{fmt2(totalCag)} cagUSD</div>
            <div style={{ fontSize: 11, color: "#00c805" }}>{fp}</div>
          </div>
        </div>

        <div style={{ background: "var(--acc-dim, rgba(0,200,5,.12))", border: "1px solid rgba(0,200,5,.25)", borderRadius: 10, padding: "10px 12px", marginTop: 12, fontSize: 12.5, color: "#e8f0ea" }}>
          ✓ Les 3 compositions donnent la <b>même empreinte publique</b> <code style={{ color: "#00c805" }}>{fp}</code>. De l'extérieur, on ne peut pas remonter à <b>qui détient combien</b> — le <b>qui</b> ne traverse jamais la Sphere. (Montants déjà cachés par Confidential Transfers.)
        </div>
      </div>
    </div>
  );
}

export function ConfidentialApp() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signMsg } = useSignPersonalMessage();
  const { mutateAsync: signExec } = useSignAndExecuteTransaction();

  const client = useMemo(() => suiClient.$extend(contra({ packageConfig: pkgCfg, table: DiscreteLogTable.create(16), wasmUrl })), [suiClient]);
  const [vk, setVk] = useState<bigint | null>(null); // viewing key scalar
  const [registered, setRegistered] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [sagBalance, setSagBalance] = useState<string | null>(null);
  const [dealDoc, setDealDoc] = useState("Senior Private Credit · Maple → ACME Corp · $100k · 9% APR · LTV 65%");
  const [sealBlobId, setSealBlobId] = useState<string | null>(null);
  const [sealDecrypted, setSealDecrypted] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const owner = account?.address ?? "";
  const ta = useMemo(() => (vk && owner ? new TokenAccount(owner, AGUSD_TYPE, pkgCfg, vk) : null), [vk, owner]);
  const taSag = useMemo(() => (vk && owner ? new TokenAccount(owner, SAGUSD_TYPE, pkgCfg, vk) : null), [vk, owner]);

  function push(msg: string, ok: boolean, digest?: string) { setLog((l) => [{ msg, ok, digest }, ...l]); }
  async function exec(label: string, build: (t: Transaction) => void | Promise<void>) {
    const tx = new Transaction();
    await build(tx);
    const r = await signExec({ transaction: tx });
    push(label, true, r.digest);
    return r;
  }

  // Merge (updateBalance) can fail with EBalanceProofFailed if the proof was
  // built against a stale state (wrap not yet propagated). Retry with a delay.
  async function mergeWithRetry(tokenAccount: TokenAccount, label: string) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await exec(label, async (t) => { t.add(await client.contra.updateBalance({ tokenAccount, merge: true })); });
        return;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (attempt < 3 && /BalanceProof|abort code: 5|resolution failed|Missing/i.test(msg)) {
          push(`Merge retry ${attempt} (attente propagation)…`, true);
          await new Promise((r) => setTimeout(r, 3500));
        } else { throw e; }
      }
    }
  }

  // Derive a deterministic viewing key from a wallet signature (ed25519 is
  // deterministic, so the same wallet always yields the same key → you can
  // decrypt across sessions). Only you ever hold this key.
  async function deriveKey() {
    setBusy("Signature de la viewing key…");
    try {
      // Persist the viewing key so it's stable across reloads (and immune to any
      // wallet signature non-determinism) — derived once, reused.
      const stored = typeof localStorage !== "undefined" ? localStorage.getItem(`agama-vk-${owner}`) : null;
      let s: bigint;
      if (stored) {
        s = BigInt(stored);
        push("Viewing key chargée (persistée, locale)", true);
      } else {
        const { signature } = await signMsg({ message: new TextEncoder().encode("Agama — confidential viewing key v1") });
        s = BigInt("0x" + toHex(sha512(fromBase64(signature)))) % GROUP_ORDER;
        if (s === 0n) s = 1n;
        try { localStorage.setItem(`agama-vk-${owner}`, s.toString()); } catch { /* ignore */ }
        push("Viewing key dérivée (locale, persistée, jamais envoyée)", true);
      }
      setVk(s);
      // Auto-detect: if the confidential account already exists, skip ② and
      // load the decrypted balance right away.
      setBusy("Vérification de ton compte confidentiel…");
      const localTa = new TokenAccount(owner, AGUSD_TYPE, pkgCfg, s);
      try {
        const bal = await client.contra.getBalance(localTa);
        setRegistered(true);
        const amt = (Number(bal.balance.amount) / 1e6).toFixed(2);
        const pend = (Number(bal.pending?.amount ?? 0) / 1e6).toFixed(2);
        setBalance(amt);
        push(`Compte déjà enregistré · balance déchiffrée : ${amt} cagUSD (pending ${pend})`, true);
        await refreshSag();
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (/does not exist|DoesNotExist|not exist/i.test(msg)) push("Compte pas encore enregistré → clique ②", true);
        else push("Lecture balance — " + msg.slice(0, 120), false);
      }
    } catch (e: any) { push("Viewing key — " + String(e?.message ?? e).slice(0, 80), false); }
    setBusy("");
  }

  async function register() {
    if (!ta) return;
    setBusy("KYC : approbation de ton adresse (auto-whitelist)…");
    try {
      // Open KYC for the demo: any address gets whitelisted via the serverless
      // (dedicated whitelister key). Best-effort — on localhost this 404s, but a
      // pre-whitelisted address still registers fine.
      try {
        const r = await fetch("/api/whitelist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: owner }) });
        if (r.ok) push("KYC approuvé (auto-whitelist ouvert)", true);
      } catch { /* ignore, try register anyway */ }
      setBusy("Création + enregistrement du compte confidentiel…");
      await exec("Compte confidentiel créé", (t) => {
        const a = t.add(client.contra.newAccount({ owner }));
        t.add(client.contra.shareAccount({ account: a }));
      });
      await exec("Enregistré (KYC-gated) — clé publique liée", (t) => {
        t.moveCall({
          target: `${AGUSD_PKG}::confidential_agusd::register`,
          arguments: [t.object(CT), t.object(WHITELIST), t.object(client.contra.getAccountId(owner)), point(ta.publicKey.toBytes())],
        });
      });
      setRegistered(true);
    } catch (e: any) { push("Register — " + String(e?.message ?? e).slice(0, 90), false); }
    setBusy("");
  }

  async function depositPrivate() {
    if (!ta) return;
    setBusy("Dépôt privé : USDC → cagUSD (montant chiffré)…");
    try {
      await exec("Dépôt privé : 100 USDC → cagUSD (chiffré)", (t) => {
        const usdc = t.moveCall({ target: `${AGUSD_PKG}::usdc::faucet`, arguments: [t.object(USDC_TREASURY), t.pure.u64(100_000_000n)] });
        const ag = t.moveCall({ target: `${AGUSD_PKG}::agusd::mint`, arguments: [t.object(POOL), usdc] });
        t.add(client.contra.wrap({ coin: ag, receiver: owner, tokenType: AGUSD_TYPE }));
      });
      setBusy("Propagation du wrap (finalité)…");
      await new Promise((r) => setTimeout(r, 4000));
      await mergeWithRetry(ta, "Merge → balance chiffrée active");
      await refresh();
    } catch (e: any) { push("Dépôt — " + String(e?.message ?? e).slice(0, 90), false); }
    setBusy("");
  }

  async function transferPrivate() {
    if (!ta) return;
    setBusy("Transfert confidentiel : génération de la preuve ZK dans le navigateur (wasm)…");
    try {
      await exec("Transfert confidentiel : 30 cagUSD → recipient (montant CACHÉ)", async (t) => {
        const transferFn = await client.contra.transfer({ tokenAccount: ta, receiverAddress: DEMO_RECIPIENT, amount: 30_000_000n });
        t.add(transferFn);
      });
      await refresh();
    } catch (e: any) { push("Transfert — " + String(e?.message ?? e).slice(0, 130), false); }
    setBusy("");
  }

  async function stakeConfidential() {
    if (!taSag) return;
    setBusy("Stake confidentiel : préparation…");
    try {
      // register the confidential sagUSD token in the SAME account (KYC via same whitelist)
      let sagRegistered = false;
      try { await client.contra.getBalance(taSag); sagRegistered = true; } catch { /* not yet */ }
      if (!sagRegistered) {
        await exec("Compte confidentiel sagUSD enregistré (KYC)", (t) => {
          t.moveCall({
            target: `${AGUSD_PKG_V2}::confidential_sagusd::register`,
            arguments: [t.object(CT_SAGUSD), t.object(WHITELIST), t.object(client.contra.getAccountId(owner)), point(taSag.publicKey.toBytes())],
          });
        });
      }
      setBusy("Stake confidentiel : USDC → agUSD → sagUSD → csagUSD (chiffré)…");
      await exec("Stake confidentiel : 100 → csagUSD (yield chiffré)", (t) => {
        const usdc = t.moveCall({ target: `${AGUSD_PKG}::usdc::faucet`, arguments: [t.object(USDC_TREASURY), t.pure.u64(100_000_000n)] });
        const ag = t.moveCall({ target: `${AGUSD_PKG}::agusd::mint`, arguments: [t.object(POOL), usdc] });
        const sag = t.moveCall({ target: `${AGUSD_PKG}::sagusd::stake`, arguments: [t.object(VAULT), ag] });
        t.add(client.contra.wrap({ coin: sag, receiver: owner, tokenType: SAGUSD_TYPE }));
      });
      // Wait for the wrap to propagate before building the merge (which fetches
      // account state to compute the balance proof — stale state → EBalanceProofFailed).
      setBusy("Propagation du wrap (finalité)…");
      await new Promise((r) => setTimeout(r, 4000));
      await mergeWithRetry(taSag, "Merge csagUSD → balance chiffrée active");
      await refreshSag();
    } catch (e: any) { push("Stake confidentiel — " + String(e?.message ?? e).slice(0, 130), false); }
    setBusy("");
  }

  async function refreshSag() {
    if (!taSag) return;
    try {
      const bal = await client.contra.getBalance(taSag);
      const amt = (Number(bal.balance.amount) / 1e6).toFixed(2);
      setSagBalance(amt);
      push(`Balance csagUSD déchiffrée : ${amt} csagUSD (yield-bearing, chiffré)`, true);
    } catch { /* not registered yet */ }
  }

  function sealClient() {
    return new SealClient({ suiClient: suiClient as any, serverConfigs: KEY_SERVERS.map((objectId) => ({ objectId, weight: 1 })), verifyKeyServers: false });
  }

  async function sealStore() {
    setBusy("Seal : chiffrement de ton deal doc (MPC seuil)…");
    try {
      const { encryptedObject } = await sealClient().encrypt({ threshold: KEY_SERVERS.length, packageId: SEAL_PKG, id: sealIdentity(owner), data: new TextEncoder().encode(dealDoc) });
      setBusy("Walrus : stockage décentralisé du blob chiffré…");
      const put = await fetch(WALRUS_PUBLISHER, { method: "PUT", body: encryptedObject as any });
      const pj: any = await put.json();
      const blobId = pj.newlyCreated?.blobObject?.blobId ?? pj.alreadyCertified?.blobId;
      setSealBlobId(blobId);
      setSealDecrypted(null);
      push(`Deal doc chiffré (Seal) + stocké sur Walrus · blob ${String(blobId).slice(0, 14)}…`, true);
    } catch (e: any) { push("Seal store — " + String(e?.message ?? e).slice(0, 120), false); }
    setBusy("");
  }

  async function sealDecrypt() {
    if (!sealBlobId) return;
    setBusy("Seal : signature de la SessionKey…");
    try {
      const sk = await SessionKey.create({ address: owner, packageId: SEAL_PKG, ttlMin: 10, suiClient: suiClient as any });
      const { signature } = await signMsg({ message: sk.getPersonalMessage() });
      await sk.setPersonalMessageSignature(signature);
      setBusy("Walrus : récupération + déchiffrement Seal…");
      const got = await fetch(WALRUS_AGGREGATOR + sealBlobId);
      const ct = new Uint8Array(await got.arrayBuffer());
      const tx = new Transaction();
      tx.moveCall({ target: `${SEAL_PKG}::access::seal_approve`, arguments: [tx.pure.vector("u8", Array.from(fromHex(sealIdentity(owner)))), tx.object(SEAL_POLICY)] });
      const txBytes = await tx.build({ client: suiClient as any, onlyTransactionKind: true });
      const dec = await sealClient().decrypt({ data: ct, sessionKey: sk, txBytes });
      setSealDecrypted(new TextDecoder().decode(dec));
      push("Deal doc déchiffré — tu es autorisé par seal_approve (owner) ✓", true);
    } catch (e: any) { push("Seal decrypt — " + String(e?.message ?? e).slice(0, 120), false); }
    setBusy("");
  }

  async function refresh() {
    if (!ta) return;
    setBusy("Déchiffrement de ta balance…");
    try {
      const bal = await client.contra.getBalance(ta);
      const active = Number(bal.balance.amount) / 1e6;
      const pending = Number(bal.pending?.amount ?? 0) / 1e6;
      setBalance(active.toFixed(2));
      push(`Balance déchiffrée : active ${active.toFixed(2)} · pending ${pending.toFixed(2)} cagUSD`, true);
    } catch (e: any) {
      push("Déchiffrement — " + String(e?.message ?? e).slice(0, 110), false);
    }
    setBusy("");
  }

  const S: Record<string, React.CSSProperties> = {
    wrap: { maxWidth: 520, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8f0ea" },
    card: { background: "#111c18", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18, marginTop: 14 },
    btn: { width: "100%", marginTop: 10, padding: "13px", fontSize: 14, fontWeight: 600, color: "#06140d", background: "#00c805", border: "none", borderRadius: 10, cursor: "pointer" },
    btn2: { background: "#16241e", color: "#e8f0ea", border: "1px solid rgba(255,255,255,.12)" },
    lbl: { fontSize: 11, textTransform: "uppercase", letterSpacing: .5, color: "#7f978c" },
  };
  const disabled = !!busy;

  return (
    <div style={S.wrap}>
      <h1 style={{ fontSize: 22 }}>Agama <span style={{ color: "#00c805" }}>×</span> Sui — <span style={{ color: "#ffd479" }}>confidentiel</span></h1>
      <p style={{ color: "#7f978c", fontSize: 13, marginBottom: 12 }}>
        Dépose en privé : ton solde devient un <b>ciphertext ElGamal on-chain</b>. Toi seul le déchiffres (viewing key).
        Un concurrent voit un <b>blob</b>, pas « 100 agUSD ». Testnet · connecte <b>Slush</b>.
      </p>
      <ConnectButton />

      {!account ? (
        <div style={{ ...S.card, color: "#7f978c" }}>← Connecte ton wallet.</div>
      ) : (
        <>
          <div style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}><span style={{ color: "#7f978c" }}>toi</span><code style={{ fontSize: 12 }}>{owner.slice(0, 8)}…{owner.slice(-6)}</code></div>
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <div style={S.lbl}>tes balances confidentielles (déchiffrées par ta viewing key)</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: "#ffd479", marginTop: 4 }}>{balance === null ? "—" : `${balance}`} <span style={{ fontSize: 15, color: "#7f978c" }}>cagUSD</span></div>
              <div style={{ fontSize: 26, fontWeight: 700, color: "#00c805", marginTop: 2 }}>{sagBalance === null ? "—" : `${sagBalance}`} <span style={{ fontSize: 14, color: "#7f978c" }}>csagUSD <small>(yield, chiffré)</small></span></div>
              <div style={{ fontSize: 11, color: "#7f978c" }}>on-chain ce sont des ciphertexts — invisibles sans ta clé</div>
            </div>
          </div>

          <div style={S.card}>
            <div style={S.lbl}>flow confidentiel</div>
            <button style={{ ...S.btn, ...S.btn2, opacity: vk ? .5 : 1 }} disabled={disabled || !!vk} onClick={deriveKey}>
              ① Dériver ma viewing key {vk ? "✓" : ""}
            </button>
            <button style={{ ...S.btn, ...S.btn2, opacity: vk && !registered ? 1 : .4 }} disabled={disabled || !vk || registered} onClick={register}>
              ② Créer + enregistrer mon compte confidentiel (KYC) {registered ? "✓" : ""}
            </button>
            <button style={{ ...S.btn, opacity: registered ? 1 : .4 }} disabled={disabled || !registered} onClick={depositPrivate}>
              ③ Dépôt privé : USDC → cagUSD (montant caché)
            </button>
            <button style={{ ...S.btn, background: "#ffd479", color: "#06140d", opacity: registered ? 1 : .4 }} disabled={disabled || !registered} onClick={transferPrivate}>
              ④ Transfert confidentiel : 30 cagUSD → recipient (montant CACHÉ, preuve ZK)
            </button>
            <button style={{ ...S.btn, opacity: registered ? 1 : .4 }} disabled={disabled || !registered} onClick={stakeConfidential}>
              ⑤ Stake confidentiel : agUSD → csagUSD (yield-bearing, CHIFFRÉ)
            </button>
            <button style={{ ...S.btn, ...S.btn2, opacity: registered ? 1 : .4 }} disabled={disabled || !registered} onClick={refresh}>
              ↻ Rafraîchir ma balance déchiffrée
            </button>
          </div>

          <div style={S.card}>
            <div style={S.lbl}>⑥ Seal — deal doc privé (chiffré + Walrus)</div>
            <p style={{ color: "#7f978c", fontSize: 12, margin: "6px 0" }}>Attache les détails de ta position (originator, borrower, terms). Chiffré par <b>Seal</b> (MPC seuil), stocké sur <b>Walrus</b>. Seul toi (ou l'allowlist Agama) peux le lire.</p>
            <textarea value={dealDoc} onChange={(e) => setDealDoc(e.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box", background: "#0e1714", color: "#e8f0ea", border: "1px solid rgba(255,255,255,.12)", borderRadius: 8, padding: 10, fontSize: 12.5, fontFamily: "inherit", resize: "vertical" }} />
            <button style={{ ...S.btn, ...S.btn2 }} disabled={disabled} onClick={sealStore}>⑥ Chiffrer (Seal) + stocker (Walrus)</button>
            {sealBlobId && (
              <>
                <div style={{ fontSize: 11.5, color: "#7f978c", marginTop: 8 }}>blob Walrus <code style={{ color: "#00c805" }}>{sealBlobId.slice(0, 18)}…</code> · bytes publics, contenu Seal-gated</div>
                <button style={{ ...S.btn, background: "#ffd479", color: "#06140d" }} disabled={disabled} onClick={sealDecrypt}>Déchiffrer (owner autorisé par seal_approve)</button>
              </>
            )}
            {sealDecrypted && (
              <div style={{ marginTop: 8, background: "rgba(0,200,5,.1)", border: "1px solid rgba(0,200,5,.25)", borderRadius: 8, padding: 10, fontSize: 12.5 }}>
                🔓 déchiffré (toi seul) : <b>{sealDecrypted}</b>
              </div>
            )}
          </div>

          {busy && <div style={{ ...S.card, color: "#ffd479", fontSize: 13 }}>⏳ {busy}</div>}

          {log.length > 0 && (
            <div style={S.card}>
              <div style={S.lbl}>activité on-chain</div>
              {log.map((e, i) => (
                <div key={i} style={{ fontSize: 13, padding: "5px 0", color: e.ok ? "#e8f0ea" : "#ff6b6b" }}>
                  {e.ok ? "✓" : "✗"} {e.msg}{" "}
                  {e.digest && <a href={`https://suiscan.xyz/testnet/tx/${e.digest}`} target="_blank" rel="noreferrer" style={{ color: "#00c805" }}>voir ↗</a>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      <SpherePanel />
    </div>
  );
}
