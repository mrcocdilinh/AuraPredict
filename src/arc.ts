import { defineChain } from "viem";

export const ARC_CHAIN_ID_DECIMAL = 5042002n;
export const ARC_CHAIN_ID_NUMBER = 5042002;
export const ARC_CHAIN_ID_HEX = "0x4CEF52";
export const ARC_RPC_URL = "https://rpc.testnet.arc.network";
export const ARC_RPC_URLS = [
  ARC_RPC_URL,
  "https://rpc.drpc.testnet.arc.network",
  "https://rpc.quicknode.testnet.arc.network",
  "https://rpc.blockdaemon.testnet.arc.network"
];
export const ARC_WS_URL = "wss://rpc.testnet.arc.network";
export const ARC_EXPLORER_URL = "https://testnet.arcscan.app";
export const ARC_NATIVE_USDC_DECIMALS = 18;

export const arcTestnetParams = {
  chainId: ARC_CHAIN_ID_HEX,
  chainName: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: ARC_RPC_URLS,
  blockExplorerUrls: [ARC_EXPLORER_URL]
};

export const arcTestnet = defineChain({
  id: ARC_CHAIN_ID_NUMBER,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USDC",
    symbol: "USDC",
    decimals: 18
  },
  rpcUrls: {
    default: {
      http: ARC_RPC_URLS,
      webSocket: [ARC_WS_URL]
    }
  },
  blockExplorers: {
    default: {
      name: "Arcscan",
      url: ARC_EXPLORER_URL
    }
  },
  testnet: true
});
