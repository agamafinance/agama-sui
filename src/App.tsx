import { useEffect, useMemo, useReducer, useState } from "react";
import { AgamaSphere, PUBLIC, AGAMA, fmt, type Principal } from "./sphere.ts";

// --- live on-chain deployments (read-only via public RPC; no wallet needed) ---
const TESTNET_RPC = "https://sui-testnet-rpc.publicnode.com";
const BACKING_PROOF_ID = "0x842891aa47a4ef08cd370c3fcd186eef4084bfa55c74f02ef9ea0a6d9173ff23";
const POOL = "0xb3ff4a8a6fb24eb818fba18ffd3e0194c10dbd1bc9d8f466fc213a7910d79665";
const CONF_TOKEN = "0xc5185f8ad2ee4a386cf675b7203dfe35ec6e7fd7460dc87019c746dd3d076d78";
const STAKING_VAULT = "0x1ff050b03e180879d7ec14c3d6f496dee165f155e85f7c2f240e5e8d2c67bbe8";
const SEAL_POLICY = "0xc109bcd23f09d5d1395cd774b69f033d5544d295fb7f72f26ab5734822ba1c33";
const ATTEST_REGISTRY = "0x7f6e8a0dd75f36c6a43647913d4c8f1532c5ce36a2f5972bf571db0d804c64f7";
const WALRUS_BLOB = "Wo6IMua_VAb3iA3fcrh75_LZXME_zyJY39DimWiQKZo";
const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space/v1/blobs/";

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

// The trustless half of solvency: read the pool and prove agUSD == USDC reserve,
// 1:1, straight from chain state — no attestation, no operator to trust.
type Reserve = { reserve: number; supply: number; backed: boolean } | null;
async function fetchReserve(): Promise<Reserve> {
  const f = await rpcObject(POOL);
  if (!f) return null;
  const reserve = Number(f.usdc_reserve);
  const supply = Number(f.agusd_treasury?.fields?.total_supply?.fields?.value ?? 0);
  return { reserve, supply, backed: reserve === supply };
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

type Attest = { navCents: number; updates: number; keyed: boolean } | null;
async function fetchAttest(): Promise<Attest> {
  const f = await rpcObject(ATTEST_REGISTRY);
  if (!f) return null;
  const pk = f.enclave_pubkey ?? [];
  return { navCents: Number(f.latest_nav_cents ?? 0), updates: Number(f.updates ?? 0), keyed: Array.isArray(pk) ? pk.length > 0 : false };
}

type Walrus = { bytes: number } | null;
async function fetchWalrus(): Promise<Walrus> {
  try {
    const r = await fetch(WALRUS_AGGREGATOR + WALRUS_BLOB);
    if (!r.ok) return null;
    return { bytes: (await r.arrayBuffer()).byteLength };
  } catch { return null; }
}

function OnChainPanel() {
  const [data, setData] = useState<OnChain>(null);
  const [reserve, setReserve] = useState<Reserve>(null);
  const [vault, setVault] = useState<Vault>(null);
  const [seal, setSeal] = useState<Seal>(null);
  const [attest, setAttest] = useState<Attest>(null);
  const [walrus, setWalrus] = useState<Walrus>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function load() {
    setLoading(true); setErr(null);
    try {
      const [bp, r, v, s, a, w] = await Promise.all([fetchBackingProof(), fetchReserve(), fetchVault(), fetchSeal(), fetchAttest(), fetchWalrus()]);
      setData(bp); setReserve(r); setVault(v); setSeal(s); setAttest(a); setWalrus(w);
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
        Solvency has two halves, both live on testnet. agUSD's USDC reserve is <b>proven on-chain</b> — read the
        pool and see <code>reserve == supply</code>, 1:1, with no operator to trust. The private-credit NAV on top
        is <b>attested</b> in the Sphere + TEE. All read-only here.
      </p>
      {err && <div className="empty">RPC error: {err}</div>}
      <div className="onchain-grid">
        <div className="oc-card">
          <span className="oc-tag proven">testnet · reserve — proven on-chain</span>
          {reserve ? (
            <>
              <div className="oc-cov">{reserve.backed ? "1:1" : "≠"} <small>reserve : supply</small></div>
              <div className="oc-line">USDC reserve <b>${(reserve.reserve / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
              <div className="oc-line">agUSD supply <b>${(reserve.supply / 1e6).toLocaleString("en-US", { maximumFractionDigits: 2 })}</b></div>
              <div className="oc-line">fully backed <b className={reserve.backed ? "g" : "b"}>{reserve.backed ? "✓ proven (=)" : "✗ mismatch"}</b></div>
              <div className="oc-line muted">enforced by mint 1:1 + ZK conservation — no trust</div>
            </>
          ) : <div className="empty">{loading ? "reading Sui…" : "no data"}</div>}
          <a className="oc-link" href={`https://suiscan.xyz/testnet/object/${POOL}`} target="_blank" rel="noreferrer">view pool ↗</a>
        </div>
        <div className="oc-card">
          <span className="oc-tag testnet">testnet · BackingProof (attested)</span>
          {data ? (
            <>
              <div className="oc-cov">{cov}% <small>coverage</small></div>
              <div className="oc-line">agUSD supply <b>{fmt(Number(data.supply_cents))}</b></div>
              <div className="oc-line">NAV backing <b>{fmt(Number(data.nav_cents))}</b></div>
              <div className="oc-line">fully backed <b className={cov! >= 100 ? "g" : "b"}>{cov! >= 100 ? "✓ yes" : "✗ no"}</b></div>
              <div className="oc-line muted">NAV attested (Sphere-enforced + Nautilus TEE) · epoch {data.updated_epoch}</div>
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
        <div className="oc-card">
          <span className="oc-tag conf">testnet · Walrus deal docs</span>
          <div className="oc-line">deal doc on Walrus <b>{walrus ? `${walrus.bytes} B` : loading ? "…" : "—"}</b></div>
          <div className="oc-line">bytes <b>public</b> · content <b>Seal-gated</b></div>
          <div className="oc-line muted">decentralized storage; only owner/allowlist can read</div>
          <a className="oc-link" href={`${WALRUS_AGGREGATOR}${WALRUS_BLOB}`} target="_blank" rel="noreferrer">fetch blob ↗</a>
        </div>
        <div className="oc-card">
          <span className="oc-tag conf">testnet · Nautilus attested NAV</span>
          {attest ? (
            <>
              <div className="oc-cov">{fmt(attest.navCents)} <small>attested</small></div>
              <div className="oc-line">enclave key <b className={attest.keyed ? "g" : "b"}>{attest.keyed ? "✓ registered" : "—"}</b></div>
              <div className="oc-line">attestations <b>{attest.updates}</b></div>
              <div className="oc-line muted">forged signature → rejected on-chain (TEE-attested)</div>
            </>
          ) : <div className="empty">{loading ? "reading Sui…" : "no data"}</div>}
          <a className="oc-link" href={`https://suiscan.xyz/testnet/object/${ATTEST_REGISTRY}`} target="_blank" rel="noreferrer">view object ↗</a>
        </div>
        <div className="oc-card">
          <span className="oc-tag conf">testnet · zkLogin onboarding</span>
          <div className="oc-line">LP onboarding <b>no seed phrase</b></div>
          <div className="oc-line">login <b>Google → derived address</b></div>
          <div className="oc-line muted">ephemeral key + ZK proof; salt-derived Sui address</div>
          <a className="oc-link" href="https://docs.sui.io/concepts/cryptography/zklogin" target="_blank" rel="noreferrer">zkLogin docs ↗</a>
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

// ---- anonymity demo: three different books, one identical outside view ----
const ANON_BOOKS: { key: string; label: string; sub: string; book: [Principal, number][] }[] = [
  { key: "A", label: "Book A", sub: "3 LPs", book: [["alice", 500_000_00], ["bob", 300_000_00], ["carol", 200_000_00]] },
  { key: "B", label: "Book B", sub: "other names + split", book: [["xavier", 400_000_00], ["yara", 400_000_00], ["zoe", 200_000_00]] },
  { key: "C", label: "Book C", sub: "a single whale", book: [["whale", 1_000_000_00]] },
];
function buildAnon(book: [Principal, number][]): AgamaSphere {
  const s = new AgamaSphere();
  s.addVault({ id: "v-senior", name: "Senior Private Credit", aprBps: 900, concentrationCap: 0.7, originator: "Maple", borrower: "ACME Corp", riskRating: "A" });
  for (const [lp, amt] of book) s.deposit(lp, amt);
  s.allocate("v-senior", 600_000_00);
  return s;
}
function AnonymityPanel() {
  const [sel, setSel] = useState("A");
  const built = ANON_BOOKS.map((b) => ({ ...b, view: buildAnon(b.book).outsideView() }));
  const fp = (view: { agusd_supply_cents: number; coverage_ratio: number; backing_commitment: string }) =>
    `${view.agusd_supply_cents}|${view.coverage_ratio}|${view.backing_commitment}`;
  const allSame = built.every((b) => fp(b.view) === fp(built[0].view));
  const cur = built.find((b) => b.key === sel)!;
  const v = cur.view;
  return (
    <section className="anon">
      <div className="pane-head">
        <h3>🎭 Can you trace the person? <span className="muted">— three different books, one identical public fingerprint</span></h3>
      </div>
      <p className="scope">Switch the book: the <b>inside</b> changes completely — different people, amounts, even a different number of LPs — but the <b>outside</b> (all the chain ever sees) does not move. So an observer cannot invert it back to a person.</p>
      <div className="viewer-chips">
        {ANON_BOOKS.map((b) => (
          <button key={b.key} className={sel === b.key ? "chip on" : "chip"} onClick={() => setSel(b.key)} title={b.sub}>{b.label} · {b.sub}</button>
        ))}
      </div>
      <div className="anon-split">
        <div className="anon-in">
          <span className="lbl">Inside the Sphere <small>· {cur.sub}</small></span>
          <table className="tbl">
            <thead><tr><th>LP</th><th>Amount</th></tr></thead>
            <tbody>{cur.book.map(([lp, amt]) => (<tr key={lp}><td>{lp}</td><td className="num">{fmt(amt)}</td></tr>))}</tbody>
          </table>
        </div>
        <div className="anon-arrow">→<small>only the aggregate crosses</small>→</div>
        <div className="anon-out">
          <span className="lbl">Outside — what the world sees</span>
          <div className="stat-grid">
            <Stat label="agUSD supply" value={fmt(v.agusd_supply_cents)} />
            <Stat label="Coverage" value={`${(v.coverage_ratio * 100).toFixed(1)}%`} good={v.coverage_ratio >= 1} />
          </div>
          <div className="commit"><span className="k">public fingerprint</span><code>{v.backing_commitment}</code></div>
        </div>
      </div>
      <div className={`anon-verdict ${allSame ? "ok" : "bad"}`}>
        {allSame ? "✓" : "✗"} All three books yield the identical public fingerprint <code>{built[0].view.backing_commitment}</code> — supply, coverage and commitment are byte-for-byte the same. No LP, no amount, no count, no graph leaves the Sphere.
      </div>
    </section>
  );
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
  // The audit log respects the same boundary as everything else: outsiders see
  // only on-chain (public) events; an LP sees public + their own; Agama sees all.
  const audit = sphere.auditLog().filter((e) =>
    e.zone === "public" ? true
    : viewer === PUBLIC ? false
    : AGAMA.includes(viewer) ? true
    : e.actor === viewer,
  );
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
        <div className="live">● live · agUSD on Sui testnet</div>
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

      {/* Anonymity — indistinguishability of the outside view */}
      <AnonymityPanel />

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
