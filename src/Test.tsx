import { useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";

// New testnet deployment (audit-hardened contracts).
const PKG = "0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab";
const POOL = "0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67";
const USDC_TREASURY = "0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d";
const VAULT = "0x29b9146405de04894f1a9e932ed7544965dd934e1460fb63bc524fb699344bc8";
const AGUSD = `${PKG}::agusd::AGUSD`;
const SAGUSD = `${PKG}::sagusd::SAGUSD`;

type Entry = { msg: string; digest?: string; ok: boolean };
const fmt = (v?: string) => (Number(v ?? 0) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

export function TestApp() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { mutateAsync: signExec } = useSignAndExecuteTransaction();
  const [log, setLog] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);

  const owner = account?.address ?? "";
  const sui = useSuiClientQuery("getBalance", { owner }, { enabled: !!account });
  const ag = useSuiClientQuery("getBalance", { owner, coinType: AGUSD }, { enabled: !!account });
  const sag = useSuiClientQuery("getBalance", { owner, coinType: SAGUSD }, { enabled: !!account });
  const refetch = () => { sui.refetch(); ag.refetch(); sag.refetch(); };

  async function run(label: string, build: (tx: Transaction) => void | Promise<void>) {
    setBusy(true);
    try {
      const tx = new Transaction();
      await build(tx);
      const r = await signExec({ transaction: tx });
      setLog((l) => [{ msg: label, digest: r.digest, ok: true }, ...l]);
      setTimeout(refetch, 1600);
    } catch (e: any) {
      setLog((l) => [{ msg: `${label} — ${String(e?.message ?? e).slice(0, 90)}`, ok: false }, ...l]);
    }
    setBusy(false);
  }

  const S: Record<string, React.CSSProperties> = {
    wrap: { maxWidth: 460, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8f0ea" },
    card: { background: "#111c18", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18, marginTop: 14 },
    row: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14 },
    btn: { width: "100%", marginTop: 10, padding: "12px", fontSize: 14, fontWeight: 600, color: "#06140d", background: "#00c805", border: "none", borderRadius: 10, cursor: "pointer" },
    btn2: { background: "#16241e", color: "#e8f0ea", border: "1px solid rgba(255,255,255,.12)" },
  };

  return (
    <div style={S.wrap}>
      <h1 style={{ fontSize: 22, margin: "8px 0" }}>Agama <span style={{ color: "#00c805" }}>×</span> Sui — test</h1>
      <p style={{ color: "#7f978c", fontSize: 13, marginBottom: 12 }}>
        Connecte <b>Slush</b> (ou Google, dispo dans Slush). Testnet. Il te faut un peu de SUI testnet pour le gas
        (<a href="https://faucet.sui.io" target="_blank" rel="noreferrer" style={{ color: "#00c805" }}>faucet.sui.io</a>).
      </p>

      <ConnectButton />

      {!account ? (
        <div style={{ ...S.card, color: "#7f978c", fontSize: 14 }}>← Connecte-toi pour commencer.</div>
      ) : (
        <>
          <div style={S.card}>
            <div style={S.row}><span style={{ color: "#7f978c" }}>adresse</span><code style={{ fontSize: 12 }}>{owner.slice(0, 8)}…{owner.slice(-6)}</code></div>
            <div style={S.row}><span style={{ color: "#7f978c" }}>SUI (gas)</span><b>{(Number(sui.data?.totalBalance ?? 0) / 1e9).toFixed(3)}</b></div>
            <div style={S.row}><span style={{ color: "#7f978c" }}>agUSD</span><b>{fmt(ag.data?.totalBalance)}</b></div>
            <div style={{ ...S.row, borderBottom: "none" }}><span style={{ color: "#7f978c" }}>sagUSD</span><b>{fmt(sag.data?.totalBalance)}</b></div>
          </div>

          <button style={S.btn} disabled={busy} onClick={() => run("Déposé USDC → 100 agUSD", (tx) => {
            const usdc = tx.moveCall({ target: `${PKG}::usdc::faucet`, arguments: [tx.object(USDC_TREASURY), tx.pure.u64(100_000_000n)] });
            const a = tx.moveCall({ target: `${PKG}::agusd::mint`, arguments: [tx.object(POOL), usdc] });
            tx.transferObjects([a], owner);
          })}>① Déposer USDC → mint 100 agUSD</button>

          <button style={{ ...S.btn, ...S.btn2 }} disabled={busy} onClick={() => run("Staké 50 agUSD → sagUSD", async (tx) => {
            const coins = await client.getCoins({ owner, coinType: AGUSD });
            if (!coins.data.length) throw new Error("pas d'agUSD — fais ① d'abord");
            const staked = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [tx.pure.u64(50_000_000n)]);
            const s = tx.moveCall({ target: `${PKG}::sagusd::stake`, arguments: [tx.object(VAULT), staked] });
            tx.transferObjects([s], owner);
          })}>② Stake 50 agUSD → sagUSD</button>

          {log.length > 0 && (
            <div style={S.card}>
              <div style={{ color: "#7f978c", fontSize: 11, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>activité</div>
              {log.map((e, i) => (
                <div key={i} style={{ fontSize: 13, padding: "5px 0", color: e.ok ? "#e8f0ea" : "#ff6b6b" }}>
                  {e.ok ? "✓" : "✗"} {e.msg}{" "}
                  {e.digest && <a href={`https://suiscan.xyz/testnet/tx/${e.digest}`} target="_blank" rel="noreferrer" style={{ color: "#00c805" }}>↗</a>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
