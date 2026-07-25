import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider } from "@mysten/dapp-kit";
import "@mysten/dapp-kit/dist/index.css";
import { App } from "./App.tsx";
import { TestApp } from "./Test.tsx";
import "./styles.css";

const queryClient = new QueryClient();
const networks = { testnet: { url: "https://sui-testnet-rpc.publicnode.com" } };
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
        <WalletProvider autoConnect>
          <Root />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
