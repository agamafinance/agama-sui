'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ALLOCATIONS, netApy } from '@/lib/robinhood/allocations';
import { useRobinhoodStats } from '@/lib/robinhood/useRobinhoodStats';

// The one agStock vault per row: symbol, the tokenized stock behind it, its brand
// colour for the disc, and where the row leads. Same five vaults the keeper runs.
const STOCK_ROWS: { symbol: string; stockSymbol: string; name: string; blurb: string; brand: string; logo: string }[] = [
  { symbol: 'agTSLA', stockSymbol: 'TSLA', name: 'Agama Tesla Vault',    blurb: 'Deposit TSLA · auto-compounding leveraged yield', brand: '#E31937', logo: '/logos/stocks/tesla.svg' },
  { symbol: 'agAMD',  stockSymbol: 'AMD',  name: 'Agama AMD Vault',      blurb: 'Deposit AMD · auto-compounding leveraged yield',  brand: '#2B2B2B', logo: '/logos/stocks/amd.svg' },
  { symbol: 'agAMZN', stockSymbol: 'AMZN', name: 'Agama Amazon Vault',   blurb: 'Deposit AMZN · auto-compounding leveraged yield', brand: '#FF9900', logo: '/logos/stocks/amazon.svg' },
  { symbol: 'agNFLX', stockSymbol: 'NFLX', name: 'Agama Netflix Vault',  blurb: 'Deposit NFLX · auto-compounding leveraged yield', brand: '#B81D24', logo: '/logos/stocks/netflix.svg' },
  { symbol: 'agPLTR', stockSymbol: 'PLTR', name: 'Agama Palantir Vault', blurb: 'Deposit PLTR · auto-compounding leveraged yield', brand: '#0B1420', logo: '/logos/stocks/palantir.svg' },
];

const usd = (v: number | undefined) =>
  v === undefined ? '—' : `$${v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;

export default function RobinhoodEarnPage() {
  const { data } = useRobinhoodStats();
  const apy = netApy(ALLOCATIONS);
  const tvl = data ? usd(data.navUsd) : '—';

  return (
    <>
      {/* Header */}
      <section className="px-6 md:px-24 pt-10 md:pt-14 pb-8">
        <div className="max-w-[1400px] mx-auto relative">
          {/* Coins cascading into the top-right corner — the surface's brand lock-up. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-[104px] -right-[150px] z-20 hidden xl:block"
            style={{ transform: 'rotate(-18deg)' }}
          >
            <img src="/hero-coins.png" alt="" className="w-[720px] max-w-none drop-shadow-[0_18px_40px_rgba(20,50,35,0.18)]" />
          </div>

          <span className="inline-flex items-center gap-2 rounded-full bg-[#00C805]/[0.12] px-3 py-1 text-[12px] font-medium text-[#0a8a26]">
            <img src="/logos/robinhood-mark.svg" alt="" className="h-4 w-4" />
            Powered by Robinhood Chain
          </span>

          <h1 className="mt-3 text-[34px] md:text-[44px] leading-[1.05] text-fg font-semibold">
            Your stocks, put to work
            <br />
            settled on Robinhood
          </h1>
          <p className="mt-4 max-w-[640px] text-[15px] text-fg-muted">
            Deposit a tokenized stock and get an auto-compounding agStock vault. Agama levers it
            on Morpho and routes the borrowed dollars into curated private credit. You keep the
            stock upside. The credit spread compounds into the share price. Nothing to claim.
          </p>

          <div className="mt-7 flex flex-wrap gap-8">
            <Stat label="Net APY" value={apy} />
            <Stat label="Vault NAV" value={tvl} />
            <Stat label="Target LTV" value="60%" />
          </div>
        </div>
      </section>

      {/* Vaults */}
      <section className="vault-panel relative z-10 rounded-t-[20px] px-6 md:px-24 pt-10 md:pt-14 pb-24">
        <div className="max-w-[1400px] mx-auto space-y-3">
          <h2 className="text-[13px] uppercase tracking-wider text-fg-muted mb-2">Stock vaults</h2>

          {STOCK_ROWS.map((r) => {
            const live = data?.stocks.find((s) => s.symbol === r.symbol);
            return (
              <VaultRow
                key={r.symbol}
                href="/robinhood/portfolio"
                symbol={r.symbol}
                stockSymbol={r.stockSymbol}
                brand={r.brand}
                logo={r.logo}
                name={r.name}
                blurb={r.blurb}
                right={live ? usd(live.priceUsd) : '—'}
                rightLabel={`${r.stockSymbol} price`}
              />
            );
          })}
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

/// A tokenized stock rendered as a branded disc — the Robinhood analogue of the
/// Stellar TokenIcon. The real company logo (white) sits on the stock's brand colour.
function StockIcon({ logo, brand, size = 40 }: { logo: string; brand: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-2xl"
      style={{ width: size, height: size, background: brand }}
    >
      <img src={logo} alt="" className="object-contain" style={{ width: size * 0.56, height: size * 0.56 }} />
    </span>
  );
}

function VaultRow({
  href,
  symbol,
  brand,
  logo,
  name,
  blurb,
  right,
  rightLabel,
}: {
  href: string;
  symbol: string;
  stockSymbol: string;
  brand: string;
  logo: string;
  name: string;
  blurb: string;
  right: string;
  rightLabel: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl bg-[#fdfaf1] px-5 py-4 shadow-[0_1px_3px_rgba(20,50,35,0.06),0_10px_30px_rgba(20,50,35,0.09)]"
    >
      <StockIcon logo={logo} brand={brand} size={40} />
      <div>
        <div className="text-[15px] text-fg font-medium">
          {symbol} <span className="text-fg-muted font-normal">· {name}</span>
        </div>
        <div className="text-[13px] text-fg-muted">{blurb}</div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-[11px] uppercase tracking-wider text-fg-muted">{rightLabel}</div>
        <div className="text-[16px] text-fg font-semibold tabular-nums">{right}</div>
      </div>
      <ArrowRight className="h-5 w-5 text-fg-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
