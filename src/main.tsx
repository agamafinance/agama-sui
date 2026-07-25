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
const isTest = typeof window !== "undefined" && window.location.hash.replace(/^#\/?/, "") === "test";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          {isTest ? <TestApp /> : <App />}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
