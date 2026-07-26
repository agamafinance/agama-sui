'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

export type Platform = 'evm' | 'stellar' | 'arbitrum' | 'sui' | 'robinhood';

const KEY = 'agama.platform';

type Ctx = {
  platform: Platform;
  setPlatform: (p: Platform) => void;
};

const NetworkContext = createContext<Ctx>({ platform: 'evm', setPlatform: () => {} });

export function NetworkProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The URL decides the platform from the very first (server) render, so the
  // pre-rendered HTML of /stellar pages never flashes the EVM navbar.
  const [platform, setPlatformState] = useState<Platform>(
    pathname?.startsWith('/stellar')
      ? 'stellar'
      : pathname?.startsWith('/arbitrum')
        ? 'arbitrum'
        : pathname?.startsWith('/sui')
          ? 'sui'
        : pathname?.startsWith('/robinhood')
          ? 'robinhood'
          : 'evm'
  );

  // Hydrate from localStorage on the client — but the URL takes precedence:
  // a saved "evm" must not override a direct landing on a /stellar or /arbitrum route.
  useEffect(() => {
    if (
      pathname?.startsWith('/stellar') ||
      pathname?.startsWith('/arbitrum') ||
      pathname?.startsWith('/sui') ||
      pathname?.startsWith('/robinhood')
    )
      return;
    const saved = window.localStorage.getItem(KEY);
    if (saved === 'stellar' || saved === 'evm' || saved === 'arbitrum' || saved === 'sui' || saved === 'robinhood')
      setPlatformState(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Navigating onto a network route implies that platform.
  useEffect(() => {
    if (pathname?.startsWith('/stellar')) setPlatformState('stellar');
    else if (pathname?.startsWith('/arbitrum')) setPlatformState('arbitrum');
    else if (pathname?.startsWith('/sui')) setPlatformState('sui');
    else if (pathname?.startsWith('/robinhood')) setPlatformState('robinhood');
  }, [pathname]);

  const setPlatform = (p: Platform) => {
    setPlatformState(p);
    try {
      window.localStorage.setItem(KEY, p);
    } catch {
      /* ignore */
    }
  };

  return (
    <NetworkContext.Provider value={{ platform, setPlatform }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
