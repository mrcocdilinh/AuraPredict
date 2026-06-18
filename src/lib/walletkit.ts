import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import type { CaipNetwork } from "@reown/appkit";
import { ARC_CHAIN_ID_NUMBER, ARC_RPC_URL, ARC_EXPLORER_URL } from "../arc";

const arcTestnetAppKit: CaipNetwork = {
  id: ARC_CHAIN_ID_NUMBER,
  chainNamespace: "eip155",
  caipNetworkId: `eip155:${ARC_CHAIN_ID_NUMBER}`,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
  blockExplorers: { default: { name: "Arcscan", url: ARC_EXPLORER_URL } },
  testnet: true
};

export const appKitModal = createAppKit({
  adapters: [new EthersAdapter()],
  networks: [arcTestnetAppKit],
  projectId: "8a0467ff451041ae0b982bf8aa2239f0",
  metadata: {
    name: "AuraPredict",
    description: "Prediction markets on Arc Testnet",
    url: "https://app.aurapredict.xyz",
    icons: ["https://app.aurapredict.xyz/aurapredict-logo-192.png"]
  },
  features: {
    // Reown's embedded email/social wallet runs on secure.walletconnect.org and
    // only supports Reown's curated chain list. Arc Testnet (5042002) is a custom
    // chain it cannot initialize, so login hangs at "completing the process".
    // Keep these off until email login is implemented via Circle User-Controlled
    // Wallets, which allows a custom RPC/chain.
    email: false,
    socials: false,
    onramp: false,
    swaps: false,
    analytics: false
  },
  themeMode: "dark",
  themeVariables: {
    "--w3m-accent": "#2f6bff",
    "--w3m-border-radius-master": "4px"
  }
});
