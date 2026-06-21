import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // The Circle W3S wallet SDK (and some wallet deps) reach for Node built-ins
    // (util.inherits/stream/events) and the `process` global that browsers don't
    // provide. Polyfill the builtin modules plus Buffer/global/process globals.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true }
    })
  ],
  optimizeDeps: {
    include: ["@base-org/account", "@coinbase/wallet-sdk"]
  }
});
