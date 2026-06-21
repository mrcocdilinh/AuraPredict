import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    // The Circle W3S wallet SDK (and some wallet deps) reach for Node built-ins
    // like util.inherits/stream/events that browsers don't provide. Polyfill the
    // builtin modules; leave `process` to Vite so its env handling stays intact.
    nodePolyfills({
      globals: { Buffer: true, global: true, process: false }
    })
  ],
  optimizeDeps: {
    include: ["@base-org/account", "@coinbase/wallet-sdk"]
  }
});
