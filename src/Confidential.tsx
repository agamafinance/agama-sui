import { useMemo, useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSignPersonalMessage,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toHex } from "@mysten/sui/utils";
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
const pkgCfg = { packageId: CONTRA_PKG, accountRegistryId: ACCOUNT_REGISTRY, tokenRegistryId: TOKEN_REGISTRY };
// A registered confidential account to receive a confidential transfer (demo).
const DEMO_RECIPIENT = "0x891a3f96356a7834b77f4c2380d8d05816bb9002b5f82e2032c9ec5713c143f4";

type Log = { msg: string; digest?: string; ok: boolean };

export function ConfidentialApp() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutateAsync: signMsg } = useSignPersonalMessage();
  const { mutateAsync: signExec } = useSignAndExecuteTransaction();

  const client = useMemo(() => suiClient.$extend(contra({ packageConfig: pkgCfg, table: DiscreteLogTable.create(16), wasmUrl })), [suiClient]);
  const [vk, setVk] = useState<bigint | null>(null); // viewing key scalar
  const [registered, setRegistered] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<Log[]>([]);
  const owner = account?.address ?? "";
  const ta = useMemo(() => (vk && owner ? new TokenAccount(owner, AGUSD_TYPE, pkgCfg, vk) : null), [vk, owner]);

  function push(msg: string, ok: boolean, digest?: string) { setLog((l) => [{ msg, ok, digest }, ...l]); }
  async function exec(label: string, build: (t: Transaction) => void | Promise<void>) {
    const tx = new Transaction();
    await build(tx);
    const r = await signExec({ transaction: tx });
    push(label, true, r.digest);
    return r;
  }

  // Derive a deterministic viewing key from a wallet signature (ed25519 is
  // deterministic, so the same wallet always yields the same key → you can
  // decrypt across sessions). Only you ever hold this key.
  async function deriveKey() {
    setBusy("Signature de la viewing key…");
    try {
      const { signature } = await signMsg({ message: new TextEncoder().encode("Agama — confidential viewing key v1") });
      let s = BigInt("0x" + toHex(sha512(fromBase64(signature)))) % GROUP_ORDER;
      if (s === 0n) s = 1n;
      setVk(s);
      push("Viewing key dérivée (locale, jamais envoyée)", true);
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
    setBusy("Création + enregistrement du compte confidentiel…");
    try {
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
      await exec("Merge → balance chiffrée active", async (t) => {
        t.add(await client.contra.updateBalance({ tokenAccount: ta, merge: true }));
      });
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
              <div style={S.lbl}>ta balance confidentielle (déchiffrée par ta viewing key)</div>
              <div style={{ fontSize: 34, fontWeight: 700, color: "#ffd479", marginTop: 4 }}>{balance === null ? "—" : `${balance}`} <span style={{ fontSize: 15, color: "#7f978c" }}>cagUSD</span></div>
              <div style={{ fontSize: 11, color: "#7f978c" }}>on-chain c'est un ciphertext — invisible sans ta clé</div>
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
            <button style={{ ...S.btn, ...S.btn2, opacity: registered ? 1 : .4 }} disabled={disabled || !registered} onClick={refresh}>
              ↻ Rafraîchir ma balance déchiffrée
            </button>
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
    </div>
  );
}
