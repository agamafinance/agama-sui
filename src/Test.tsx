import { useState } from "react";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
  useSuiClientQuery,
  useSignAndExecuteTransaction,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
import type { SuiClient } from "@mysten/sui/client";

// New testnet deployment (audit-hardened contracts).
const PKG = "0x9e41853e589ce1bc8f7ecac37b139f42f7cd229a2baee29bc392bd989f6f16ab";
const POOL = "0xd9878b98e855181479f439254c47599296b7a2f97c8694e751e62b87ca5d6f67";
const USDC_TREASURY = "0x8273756767150666fd12111b11458d063cfa25cec811209e41a427fe925b7d8d";
const VAULT = "0x29b9146405de04894f1a9e932ed7544965dd934e1460fb63bc524fb699344bc8";
const AGUSD = `${PKG}::agusd::AGUSD`;
const SAGUSD = `${PKG}::sagusd::SAGUSD`;

type Entry = { msg: string; digest?: string; ok: boolean };
const fmt = (v?: string) => (Number(v ?? 0) / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 });

// merge all coins of a type into one owned coin ref (so we can split/spend it)
async function primaryCoin(client: SuiClient, tx: Transaction, owner: string, coinType: string) {
  const { data } = await client.getCoins({ owner, coinType });
  if (!data.length) return null;
  const [first, ...rest] = data;
  if (rest.length) tx.mergeCoins(tx.object(first.coinObjectId), rest.map((c) => tx.object(c.coinObjectId)));
  return tx.object(first.coinObjectId);
}

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

  const suiBal = Number(sui.data?.totalBalance ?? 0) / 1e9;
  const noGas = !!account && suiBal < 0.01;

  const S: Record<string, React.CSSProperties> = {
    wrap: { maxWidth: 480, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#e8f0ea" },
    card: { background: "#111c18", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: 18, marginTop: 14 },
    row: { display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid rgba(255,255,255,.06)", fontSize: 14 },
    step: { display: "flex", alignItems: "center", gap: 12, width: "100%", marginTop: 10, padding: "13px 14px", fontSize: 14, fontWeight: 600, textAlign: "left", color: "#e8f0ea", background: "#16241e", border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, cursor: "pointer" },
    num: { width: 22, height: 22, minWidth: 22, borderRadius: 999, background: "#00c805", color: "#06140d", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 },
    sub: { color: "#7f978c", fontWeight: 400, fontSize: 12 },
  };
  const step = (n: string, title: string, sub: string, onClick: () => void, disabled = false) => (
    <button style={{ ...S.step, opacity: busy || disabled ? .5 : 1, cursor: busy || disabled ? "not-allowed" : "pointer" }} disabled={busy || disabled} onClick={onClick}>
      <span style={S.num}>{n}</span>
      <span>{title}<br /><span style={S.sub}>{sub}</span></span>
    </button>
  );

  return (
    <div style={S.wrap}>
      <h1 style={{ fontSize: 22, margin: "8px 0" }}>Agama <span style={{ color: "#00c805" }}>×</span> Sui — LP flow</h1>
      <p style={{ color: "#7f978c", fontSize: 13, marginBottom: 12 }}>
        Sois un <b>LP</b> : dépose, gagne du yield, ressors. Testnet — connecte <b>Slush</b> (ou Google dans Slush).
      </p>

      <ConnectButton />

      {!account ? (
        <div style={{ ...S.card, color: "#7f978c", fontSize: 14 }}>← Connecte ton wallet pour commencer le flow.</div>
      ) : (
        <>
          <div style={S.card}>
            <div style={S.row}><span style={{ color: "#7f978c" }}>toi (LP)</span><code style={{ fontSize: 12 }}>{owner.slice(0, 8)}…{owner.slice(-6)}</code></div>
            <div style={S.row}><span style={{ color: "#7f978c" }}>SUI (gas)</span><b style={{ color: noGas ? "#ff6b6b" : "#e8f0ea" }}>{suiBal.toFixed(3)}</b></div>
            <div style={S.row}><span style={{ color: "#7f978c" }}>agUSD</span><b>{fmt(ag.data?.totalBalance)}</b></div>
            <div style={{ ...S.row, borderBottom: "none" }}><span style={{ color: "#7f978c" }}>sagUSD (staké)</span><b>{fmt(sag.data?.totalBalance)}</b></div>
          </div>

          {noGas && (
            <div style={{ ...S.card, borderColor: "rgba(255,107,107,.4)", color: "#ff6b6b", fontSize: 13 }}>
              ⚠ Pas de SUI testnet pour le gas. Récupère-en sur <a href="https://faucet.sui.io" target="_blank" rel="noreferrer" style={{ color: "#00c805" }}>faucet.sui.io</a> (colle ton adresse), puis reviens.
            </div>
          )}

          <div style={S.card}>
            {step("1", "Déposer → mint 100 agUSD", "USDC de test gratuit → agUSD adossé 1:1", () => run("Déposé → 100 agUSD", (tx) => {
              const usdc = tx.moveCall({ target: `${PKG}::usdc::faucet`, arguments: [tx.object(USDC_TREASURY), tx.pure.u64(100_000_000n)] });
              const a = tx.moveCall({ target: `${PKG}::agusd::mint`, arguments: [tx.object(POOL), usdc] });
              tx.transferObjects([a], owner);
            }))}

            {step("2", "Stake 50 agUSD → sagUSD", "position yield-bearing, prix NAV (pas 1:1)", () => run("Staké 50 agUSD", async (tx) => {
              const coin = await primaryCoin(client, tx, owner, AGUSD);
              if (!coin) throw new Error("pas d'agUSD — fais ① d'abord");
              const s = tx.moveCall({ target: `${PKG}::sagusd::stake`, arguments: [tx.object(VAULT), tx.splitCoins(coin, [tx.pure.u64(50_000_000n)])] });
              tx.transferObjects([s], owner);
            }))}

            {step("3", "Unstake tout → agUSD", "ressors ta position au NAV (yield inclus)", () => run("Unstaké → agUSD", async (tx) => {
              const coin = await primaryCoin(client, tx, owner, SAGUSD);
              if (!coin) throw new Error("pas de sagUSD — fais ② d'abord");
              const a = tx.moveCall({ target: `${PKG}::sagusd::unstake`, arguments: [tx.object(VAULT), coin] });
              tx.transferObjects([a], owner);
            }))}

            {step("4", "Redeem tout agUSD → USDC", "brûle l'agUSD, récupère l'USDC de la réserve", () => run("Redeemé → USDC", async (tx) => {
              const coin = await primaryCoin(client, tx, owner, AGUSD);
              if (!coin) throw new Error("pas d'agUSD à redeem");
              const u = tx.moveCall({ target: `${PKG}::agusd::redeem`, arguments: [tx.object(POOL), coin] });
              tx.transferObjects([u], owner);
            }))}
          </div>

          {log.length > 0 && (
            <div style={S.card}>
              <div style={{ color: "#7f978c", fontSize: 11, textTransform: "uppercase", letterSpacing: .5, marginBottom: 6 }}>activité on-chain</div>
              {log.map((e, i) => (
                <div key={i} style={{ fontSize: 13, padding: "5px 0", color: e.ok ? "#e8f0ea" : "#ff6b6b" }}>
                  {e.ok ? "✓" : "✗"} {e.msg}{" "}
                  {e.digest && <a href={`https://suiscan.xyz/testnet/tx/${e.digest}`} target="_blank" rel="noreferrer" style={{ color: "#00c805" }}>voir ↗</a>}
                </div>
              ))}
            </div>
          )}

          <p style={{ color: "#7f978c", fontSize: 12, marginTop: 14, textAlign: "center" }}>
            dashboard complet → <a href="#dashboard" style={{ color: "#00c805" }}>localhost:5178/#dashboard</a>
          </p>
        </>
      )}
    </div>
  );
}
