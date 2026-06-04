import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function packageChunkName(id: string) {
  const parts = id.split("node_modules/")[1]?.split(/[\\/]/).filter(Boolean) || [];
  if (parts.length === 0) return "vendor";
  const packageName = parts[0]?.startsWith("@") ? `${parts[0]}-${parts[1] || "pkg"}` : parts[0];
  return `vendor-${packageName.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (
            id.includes("@circle-fin") ||
            id.includes("@walletconnect") ||
            id.includes("@reown") ||
            id.includes("@web3modal") ||
            id.includes("@lifi") ||
            id.includes("@solana") ||
            id.includes("@coral-xyz")
          ) {
            return packageChunkName(id);
          }
          if (id.includes("viem") || id.includes("abitype") || id.includes("ox") || id.includes("borsh") || id.includes("jayson")) return "vendor-evm";
          if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) return "vendor-react";
          return packageChunkName(id);
        }
      }
    }
  }
});
