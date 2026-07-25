import { useEffect, useMemo, useReducer, useState } from "react";
import { AgamaSphere, PUBLIC, AGAMA, fmt, type Principal } from "./sphere.ts";

// --- live on-chain deployments (read-only via public RPC; no wallet needed) ---
const TESTNET_RPC = "https://sui-testnet-rpc.publicnode.com";
const BACKING_PROOF_ID = "0xd9f6edacb75cd17bc3ebf1220c806dfb5d6f4e9067cd509c21260ceeb7a8fe72";
const CONF_TOKEN = "0xd372b544af6ee21d3ce08dd94211f684bde55558dfbeed32decd8407a5c51d44";
const STAKING_VAULT = "0xb75d1f795617fe7634f2124f3dec4def3229c51e41ec659ca64902823024e7a8";
const SEAL_POLICY = "0x786325d84d2fd6a26fd641fd24d5bde715bea6cd88efca422202061860b9e08c";

async function rpcObject(id: string): Promise<any> {
  const res = await fetch(TESTNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sui_getObject", params: [id, { showContent: true }] }),
  });
  return (await res.json())?.result?.data?.content?.fields ?? null;
}

type OnChain = { coverage_bps: string; nav_cents: string; supply_cents: string; updated_epoch: string } | null;
async function fetchBackingProof(): Promise<OnChain> {
  const f = await rpcObject(BACKING_PROOF_ID);
  return f ? { coverage_bps: f.coverage_bps, nav_cents: f.nav_cents, supply_cents: f.supply_cents, updated_epoch: f.updated_epoch } : null;
}

type Vault = { navBps: number; assets: number; shares: number } | null;
async function fetchVault(): Promise<Vault> {
  const f = await rpcObject(STAKING_VAULT);
  if (!f) return null;
  const assets = Number(f.assets);
  const shares = Number(f.treasury?.fields?.total_supply?.fields?.value ?? 0);
  return { navBps: shares === 0 ? 10000 : Math.round((assets * 10000) / shares), assets, shares };
}

type Seal = { allow: number } | null;
async function fetchSeal(): Promise<Seal> {
  const f = await rpcObject(SEAL_POLICY);
  if (!f) return null;
  const contents = f.allow?.fields?.contents ?? [];
  return { allow: Array.isArray(contents) ? contents.length : 0 };
}

function OnChainPanel() {
  const [data, setData] = useState<OnChain>(null);
  const [vault, setVault] = useState<Vault>(null);
  const [seal, setSeal] = useState<Seal>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function load() {
    setLoading(true); setErr(null);
    try {
      const [bp, v, s] = await Promise.all([fetchBackingProof(), fetchVault(), fetchSeal()]);
      setData(bp); setVault(v); setSeal(s);
    } catch (e) { setErr(String(e)); }
    setLoading(false);
  }
  useEffect(() => { load(); }, []);
  const cov = data ? Number(data.coverage_bps) / 100 : null;
  return (
    <section className="onchain">
      <div className="pane-head">
        <h3>🔗 Live on Sui <span className="muted">— the twin, on-chain (not simulated)</span></h3>
        <button className="chip" onClick={load} disabled={loading}>{loading ? "…" : "Refresh from Sui"}</button>
      </div>
      <p className="scope">
        The public twin isn't only in this page — it's posted to a real <code>BackingProof</code> on Sui testnet by{" "}
        <code>onchain/seam.ts</code>. Confidential agUSD (ZK amounts) and Seal (real access control) live on the same testnet. All read-only here.
      </p>
      {err && <div className="empty">RPC error: {err}</div>}
      <div className="onchain-grid">
        <div className="oc-card">
          <span className="oc-tag testnet">testnet · BackingProof</span>
          {data ? (
            <>
              <div className="oc-cov">{cov}% <small>coverage</small></div>
              <div className="oc-line">agUSD supply <b>{fmt(Number(data.supply_cents))}</b></div>
              <div className="oc-line">NAV backing <b>{fmt(Number(data.nav_cents))}</b></div>
              <div className="oc-line">fully backed <b className={cov! >= 100 ? "g" : "b"}>{cov! >= 100 ? "✓ yes" : "✗ no"}</b></div>
              <div className="oc-line muted">updated epoch {data.updated_epoch}</div>
            </>
          ) : <div className="empty">{loading ? "reading Sui…" : "no data"}</div>}
          <a className="oc-link" href={`https://suiscan.xyz/testnet/object/${BACKING_PROOF_ID}`} target="_blank" rel="noreferrer">view object ↗</a>
        </div>
        <div className="oc-card">
          <span className="oc-tag testnet">testnet · sagUSD StakingVault</span>
          {vault ? (
            <>
              <div className="oc-cov">{(vault.navBps / 10000).toFixed(4)} <small>NAV / sagUSD</small></div>
              <div className="oc-line">staked <b>{(vault.assets / 1e6).toLocaleString("en-US")} agUSD</b></div>
              <div className="oc-line">shares <b>{(vault.shares / 1e6).toLocaleString("en-US")} sagUSD</b></div>
              <div className="oc-line muted">yield-bearing · stake/unstake priced at NAV (not 1:1)</div>
            </>
          ) : <div className="empty">{loading ? "reading Sui…" : "vault empty (NAV 1.0000)"}</div>}
          <a className="oc-link" href={`https://suiscan.xyz/testnet/object/${STAKING_VAULT}`} target="_blank" rel="noreferrer">view object ↗</a>
        </div>
        <div className="oc-card">
          <span className="oc-tag conf">testnet · ConfidentialToken&lt;AGUSD&gt;</span>
          <div className="oc-line">amounts &amp; balances <b>encrypted</b> (Twisted ElGamal + ZK)</div>
          <div className="oc-line">register <b>KYC-gated</b> · issuer freeze controls</div>
          <div className="oc-line muted">the amount-hiding layer — proven at protocol level</div>
          <a className="oc-link" href={`https://suiscan.xyz/testnet/object/${CONF_TOKEN}`} target="_blank" rel="noreferrer">view object ↗</a>
        </div>
        <div className="oc-card">
          <span className="oc-tag conf">testnet · Seal access control</span>
          <div className="oc-line">position data <b>Seal-encrypted</b> (threshold MPC)</div>
          <div className="oc-line">decrypt <b>owner OR allowlist{seal ? ` (${seal.allow})` : ""}</b></div>
          <div className="oc-line muted">rival → denied by the MPC committee (seal_approve)</div>
          <a className="oc-link" href={`https://suiscan.xyz/testnet/object/${SEAL_POLICY}`} target="_blank" rel="noreferrer">view policy ↗</a>
        </div>
      </div>
    </section>
  );
}

// ---- viewer identities for the private-side toggle ----
const VIEWERS: { id: Principal; label: string; sub: string }[] = [
  { id: PUBLIC, label: "Public / Sui", sub: "anyone on the network" },
  { id: "alice", label: "Alice (LP)", sub: "a liquidity provider" },
  { id: "bob", label: "Bob (LP)", sub: "another LP" },
  { id: "agama-risk", label: "Agama Risk", sub: "operator team (ACL'd)" },
];

function seed(): AgamaSphere {
  const s = new AgamaSphere();
  s.addVault({ id: "v-senior", name: "Senior Private Credit", aprBps: 900, concentrationCap: 0.7, originator: "Maple", borrower: "ACME Corp", riskRating: "A" });
  s.addVault({ id: "v-junior", name: "Junior Tranche", aprBps: 1400, concentrationCap: 0.4, originator: "Qiro", borrower: "Beta LLC", riskRating: "C" });
  s.denyKyc("evil");
  return s;
}

export function App() {
  const [sphere, setSphere] = useState<AgamaSphere>(seed);
  const [viewer, setViewer] = useState<Principal>(PUBLIC);
  const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null);
  const [, force] = useReducer((x) => x + 1, 0);

  function toast(msg: string, ok = true) {
    setFlash({ msg, ok });
    setTimeout(() => setFlash(null), 2600);
  }
  function run(label: string, fn: () => { ok: boolean; reason?: string } | void) {
    const r = fn();
    if (r && !r.ok) toast(`${label}: ${r.reason}`, false);
    else toast(label, true);
    force();
  }

  const twin = sphere.publicTwin();
  const positions = sphere.visiblePositions(viewer);
  const vaults = sphere.visibleVaults(viewer);
  const audit = sphere.auditLog();
  const isPublic = viewer === PUBLIC;

  const totalPrivate = useMemo(
    () => sphere.visiblePositions("agama-risk").reduce((s, p) => s + p.amount_cents, 0),
    [sphere, twin.agusd_supply_cents],
  );

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <h1>Agama <span className="mul">×</span> Sui Spheres</h1>
          <p className="tag">Private-credit vaults in a Sphere · a synthetic dollar the public can verify but never see into</p>
        </div>
        <div className="live">● running locally</div>
      </header>

      {/* Controls */}
      <div className="controls">
        <button onClick={() => run("Alice deposited $100k", () => sphere.deposit("alice", 100_000_00))}>Deposit · Alice $100k</button>
        <button onClick={() => run("Bob deposited $50k", () => sphere.deposit("bob", 50_000_00))}>Deposit · Bob $50k</button>
        <button className="danger" onClick={() => run("Blocked deposit", () => sphere.deposit("evil", 10_000_00))}>Deposit · KYC-denied ⛔</button>
        <span className="sep" />
        <button onClick={() => run("Allocated → Senior", () => sphere.allocate("v-senior", 90_000_00))}>Allocate → Senior</button>
        <button onClick={() => run("Allocated → Junior", () => sphere.allocate("v-junior", 40_000_00))}>Allocate → Junior</button>
        <button onClick={() => run("Over-cap allocation", () => sphere.allocate("v-junior", 400_000_00))}>Allocate → Junior (over cap)</button>
        <span className="sep" />
        <button onClick={() => run("Senior book earned $3k", () => { sphere.accrue("v-senior", 3_000_00); })}>Accrue yield</button>
        <button onClick={() => run("Alice redeemed $40k", () => sphere.redeem("alice", 40_000_00))}>Redeem · Alice $40k</button>
        <button className="ghost" onClick={() => { setSphere(seed()); toast("Reset"); }}>Reset</button>
      </div>

      {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`}>{flash.msg}</div>}

      {/* Split screen */}
      <div className="split">
        {/* PRIVATE */}
        <section className="pane private">
          <div className="pane-head">
            <h2>🔒 Inside the Sphere <span className="muted">— private</span></h2>
            <div className="viewer-chips">
              {VIEWERS.map((v) => (
                <button key={v.id} className={viewer === v.id ? "chip on" : "chip"} onClick={() => setViewer(v.id)} title={v.sub}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
          <p className="scope">Showing what <b>{VIEWERS.find((v) => v.id === viewer)?.label}</b> is allowed to read. ACL is pure — no operator god-view.</p>

          <h3>LP positions</h3>
          {positions.length === 0 ? (
            <div className="empty">
              {isPublic ? "The public network sees no positions at all — deposits never touch it." : "Nothing visible to this viewer."}
            </div>
          ) : (
            <table className="tbl">
              <thead><tr><th>LP</th><th>Amount</th><th>ACL</th></tr></thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id}><td>{p.lp}</td><td className="num">{fmt(p.amount_cents)}</td><td className="acl">{p.acl_read.join(", ")}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <h3>Vault internals</h3>
          {vaults.length === 0 ? (
            <div className="empty">{isPublic ? "Vault originators, borrowers and risk are Sphere-only." : "Not visible to this viewer."}</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>Vault</th><th>Originator</th><th>Borrower</th><th>Risk</th><th>Deployed</th></tr></thead>
              <tbody>
                {vaults.map((v) => (
                  <tr key={v.id}><td>{v.name}</td><td>{v.originator}</td><td>{v.borrower}</td><td><span className={`rr r${v.riskRating}`}>{v.riskRating}</span></td><td className="num">{fmt(v.deployed_cents)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* PUBLIC */}
        <section className="pane public">
          <div className="pane-head"><h2>🌐 Public on Sui <span className="muted">— what everyone sees</span></h2></div>
          <p className="scope">The redacted twin. Bridged from the Sphere: aggregates + proofs, never a name or a per-LP amount.</p>

          <div className="stat-grid">
            <Stat label="agUSD supply" value={fmt(twin.agusd_supply_cents)} />
            <Stat label="NAV (backing)" value={fmt(twin.nav_cents)} />
            <Stat label="Coverage" value={`${(twin.coverage_ratio * 100).toFixed(1)}%`} good={twin.coverage_ratio >= 1} />
            <Stat label="sagUSD rate" value={twin.sagusd_redeem_rate.toFixed(4)} />
          </div>

          <div className="commit">
            <span className="k">backing commitment</span>
            <code>{twin.backing_commitment}</code>
          </div>

          <h3>Proofs</h3>
          <ul className="proofs">
            {twin.proofs.map((p) => (
              <li key={p.key} className={p.ok ? "ok" : "bad"}>{p.ok ? "✓" : "✗"} {p.label}</li>
            ))}
          </ul>

          <div className="contrast">
            <div className="hidden">
              <span className="lbl">Hidden in the Sphere</span>
              {totalPrivate > 0 ? <b>{fmt(totalPrivate)} across {sphere.visiblePositions("agama-risk").length} private positions</b> : <b>—</b>}
              <small>who deposited · how much · which tranche · originators · risk</small>
            </div>
            <div className="shown">
              <span className="lbl">Public can still verify</span>
              <b>agUSD is {twin.coverage_ratio >= 1 ? "fully backed" : "UNDER-backed"}</b>
              <small>supply · NAV · coverage · caps respected — with zero position data</small>
            </div>
          </div>
        </section>
      </div>

      {/* Live on-chain */}
      <OnChainPanel />

      {/* Audit */}
      <section className="audit">
        <h3>Audit log <span className="muted">— append-only</span></h3>
        <ul>
          {audit.slice(0, 8).map((e) => (
            <li key={e.id} className={e.zone}>
              <span className="zone">{e.zone === "public" ? "PUBLIC" : "PRIVATE"}</span>
              <span className="act">{e.action}</span>
              <span className="det">{e.detail}</span>
            </li>
          ))}
          {audit.length === 0 && <li className="private"><span className="det muted">No activity yet — try the controls above.</span></li>}
        </ul>
      </section>

      <footer className="foot">
        Pattern mirrors Mysten Labs' own Spheres demo (abhinavg6). The <code>publicTwin()</code> seam is the single swap point for a real Spheres SDK. agUSD is <b>deployed for real on Sui testnet</b> — one package: a pool-backed dollar, a confidential token (amounts hidden — Twisted ElGamal + ZK), sagUSD staking, and an on-chain <code>BackingProof</code>.
      </footer>
    </div>
  );
}

function Stat({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div className="stat">
      <span className="stat-k">{label}</span>
      <span className={`stat-v ${good === undefined ? "" : good ? "g" : "b"}`}>{value}</span>
    </div>
  );
}
