import { useMemo, useReducer, useState } from "react";
import { AgamaSphere, PUBLIC, AGAMA, fmt, type Principal } from "./sphere.ts";

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
        Pattern mirrors Mysten Labs' own Spheres demo (abhinavg6). The <code>publicTwin()</code> seam is the single swap point for a real Spheres SDK — nothing else changes. <b>Confidential transfers</b> (confirmed coming to Sui, Jun 2026) will hide on-chain amounts too.
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
