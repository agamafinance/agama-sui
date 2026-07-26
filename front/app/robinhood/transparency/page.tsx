'use client';

import { useCreditPools } from '@/lib/robinhood/useCreditPools';
import { AGAMA_CREDIT_VAULTS } from '@/lib/robinhood/agtsla';
import { explorer } from '@/lib/robinhood/config';

// Curator brands behind the pools.
const CURATORS: Record<string, { name: string; logo: string }> = {
  Qiro: { name: 'Qiro Finance', logo: '/logos/qiro-icon.svg' },
  Tenka: { name: 'Tenka', logo: '/logos/tenka.svg' },
  Maple: { name: 'Maple', logo: '/logos/maple.webp' },
  Pareto: { name: 'Pareto', logo: '/logos/pareto.webp' },
};

// One row per credit pool: the strategy name + target APY, keyed to the on-chain
// vault in AGAMA_CREDIT_VAULTS (address + curator come from there).
const POOL_META: Record<string, { strategy: string; apy: string }> = {
  qPAY: { strategy: 'Payment Financing', apy: '14%' },
  qPCV: { strategy: 'Private Credit', apy: '13%' },
  qICV: { strategy: 'Institutional Credit', apy: '12%' },
  tFLAG: { strategy: 'Flagship, ABF Senior', apy: '8-9%' },
  tHY: { strategy: 'High Yield, ABF Mezz', apy: '15-20%' },
  tDEAL: { strategy: 'DealVaults', apy: '7-15%' },
  syrupUSDG: { strategy: 'Syrup USDG', apy: '6.5%' },
  fasBASIS: { strategy: 'Fasanara Digital Basis', apy: '8.81%' },
};

const usd = (v: number) => `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function RobinhoodTransparencyPage() {
  const { data } = useCreditPools();
  const total = data?.total ?? 0;

  // Rank by balance (= share) descending: most-funded vault first, empty ones last.
  const rows = [...AGAMA_CREDIT_VAULTS].sort(
    (a, b) => (data?.balances[b.key] ?? 0) - (data?.balances[a.key] ?? 0),
  );

  return (
    <>
      {/* Header */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#00C805]/[0.12] px-3 py-1 text-[12px] font-medium text-[#0a8a26]">
            <img src="/logos/robinhood-mark.svg" alt="" className="h-4 w-4" />
            Live on Robinhood Chain
          </span>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            Transparency
          </h1>
          <p className="mt-4 max-w-[680px] text-[15px] text-fg-muted">
            The real-world-asset credit vaults Agama integrates on Robinhood Chain, and their live
            on-chain balances. Read straight from each vault, nothing self-reported.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Total in RWA" value={data ? usd(total) : '—'} />
            <Stat label="Curated vaults" value={`${AGAMA_CREDIT_VAULTS.length}`} />
            <Stat label="Curators" value={`${new Set(AGAMA_CREDIT_VAULTS.map((p) => p.curator)).size}`} />
          </div>
        </div>
      </section>

      {/* Credit vaults table */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-4">Credit vaults</h2>

          <div className="overflow-hidden rounded-2xl bg-[#fdfaf1] shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left">
                <thead>
                  <tr className="border-b border-[#254839]/10 text-[11px] uppercase tracking-wider text-fg-muted">
                    <th className="px-5 py-3 font-medium">Vault</th>
                    <th className="px-5 py-3 font-medium">Curator</th>
                    <th className="px-5 py-3 font-medium text-right">Target APY</th>
                    <th className="px-5 py-3 font-medium text-right">Balance</th>
                    <th className="px-5 py-3 font-medium text-right">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const meta = POOL_META[p.key] ?? { strategy: p.symbol, apy: '—' };
                    const cur = CURATORS[p.curator] ?? { name: p.curator, logo: '' };
                    const bal = data?.balances[p.key];
                    const share = data && total > 0 && bal !== undefined ? (bal / total) * 100 : undefined;
                    return (
                      <tr key={p.key} className="border-b border-[#254839]/[0.06] last:border-0 hover:bg-[#254839]/[0.02]">
                        <td className="px-5 py-4">
                          <a href={explorer(p.address)} target="_blank" rel="noreferrer" className="group">
                            <div className="text-[15px] text-fg font-medium group-hover:underline">{p.symbol}</div>
                            <div className="text-[13px] text-fg-muted">{meta.strategy}</div>
                          </a>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white ring-1 ring-[#254839]/10">
                              {cur.logo && <img src={cur.logo} alt="" className="h-4 w-4 object-contain" />}
                            </span>
                            <span className="text-[14px] text-fg">{cur.name}</span>
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right text-[14px] text-fg tabular-nums">{meta.apy}</td>
                        <td className="px-5 py-4 text-right text-[15px] text-fg font-semibold tabular-nums">
                          {bal === undefined ? '—' : usd(bal)}
                        </td>
                        <td className="px-5 py-4 text-right text-[14px] text-fg-muted tabular-nums">
                          {share === undefined ? '—' : `${share.toFixed(1)}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-[#254839]/[0.04]">
                    <td className="px-5 py-4 text-[14px] text-fg font-semibold" colSpan={3}>Total</td>
                    <td className="px-5 py-4 text-right text-[15px] text-fg font-semibold tabular-nums">
                      {data ? usd(total) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right text-[14px] text-fg-muted tabular-nums">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] uppercase tracking-wider text-fg-muted">{label}</div>
      <div className="text-[26px] text-fg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
