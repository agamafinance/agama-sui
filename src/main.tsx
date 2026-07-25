import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, useSuiClient } from "@mysten/dapp-kit";
import { registerEnokiWallets } from "@mysten/enoki";
import "@mysten/dapp-kit/dist/index.css";
import { App } from "./App.tsx";
import { TestApp } from "./Test.tsx";
import { ENOKI_API_KEY, GOOGLE_CLIENT_ID } from "./enoki-config";
import "./styles.css";

const queryClient = new QueryClient();
const networks = { testnet: { url: "https://sui-testnet-rpc.publicnode.com" } };

// Adds "Sign in with Google" (zkLogin via Enoki) to the connect modal, if configured.
function EnokiRegistration() {
  const client = useSuiClient();
  React.useEffect(() => {
    if (!ENOKI_API_KEY || !GOOGLE_CLIENT_ID) return;
    const { unregister } = registerEnokiWallets({
      apiKey: ENOKI_API_KEY,
      providers: { google: { clientId: GOOGLE_CLIENT_ID, redirectUrl: window.location.origin } },
      client: client as any,
      network: "testnet",
    });
    return unregister;
  }, [client]);
  return null;
}
// Default landing is the interactive LP flow (wallet connect). The full
// info dashboard lives at #dashboard.
const isDashboard = typeof window !== "undefined" && window.location.hash.replace(/^#\/?/, "") === "dashboard";

function Root() {
  const [dash, setDash] = React.useState(isDashboard);
  React.useEffect(() => {
    const onHash = () => setDash(window.location.hash.replace(/^#\/?/, "") === "dashboard");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return dash ? <App /> : <TestApp />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <EnokiRegistration />
        <WalletProvider autoConnect>
          <Root />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
