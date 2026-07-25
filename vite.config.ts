import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// COOP `same-origin-allow-popups` lets the page keep a handle on the OAuth
// popup (Google sign-in / zkLogin) so the flow can complete without the
// "Cross-Origin-Opener-Policy would block window.closed" errors.
const headers = { "Cross-Origin-Opener-Policy": "same-origin-allow-popups" };

export default defineConfig({
  plugins: [react()],
  server: { port: 5178, headers },
  preview: { port: 5178, headers },
});
