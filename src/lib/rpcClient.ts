import { createPublicClient, createWalletClient, custom, fallback, http } from "viem";
import { ARC_RPC_URL, arcTestnet } from "../arc";
import { ARC_RPC_URLS, WALLETCONNECT_PROJECT_ID, ARC_CHAIN_ID_NUMBER } from "../constants";
import type { EthereumProvider } from "../types";

export function getInjectedProvider(provider?: EthereumProvider | null) {
  const injected = provider ?? window.ethereum;
  if (!injected) {
    throw new Error("Open AuraOn inside a wallet browser such as Zerion, MetaMask, Rabby, or OKX.");
  }
  return injected;
}

export function getPublicClient() {
  const envRpc = String(import.meta.env.VITE_ARC_RPC_URL || "").trim();
  const rpcUrls = [envRpc, ...ARC_RPC_URLS].filter(
    (url, index, list): url is string => Boolean(url) && list.indexOf(url) === index
  );

  return createPublicClient({
    chain: arcTestnet,
    transport: fallback(
      rpcUrls.map((url) => http(url, { retryCount: 1, retryDelay: 250, timeout: 10_000 })),
      { rank: false, retryCount: 2, retryDelay: 500 }
    )
  });
}

export function getWalletClient(provider?: EthereumProvider | null) {
  return createWalletClient({
    chain: arcTestnet,
    transport: custom(getInjectedProvider(provider) as never)
  });
}

let walletConnectProviderPromise: Promise<EthereumProvider> | null = null;

export async function getWalletConnectProvider() {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error("WalletConnect is not configured. Set VITE_WALLETCONNECT_PROJECT_ID in Vercel to connect from mobile Chrome.");
  }

  const { EthereumProvider: WalletConnectEthereumProvider } = await import("@walletconnect/ethereum-provider");

  walletConnectProviderPromise ??= WalletConnectEthereumProvider.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    optionalChains: [ARC_CHAIN_ID_NUMBER],
    showQrModal: true,
    rpcMap: {
      [String(ARC_CHAIN_ID_NUMBER)]: ARC_RPC_URL
    },
    metadata: {
      name: "AuraOn",
      description: "Prediction markets on Arc Testnet",
      url: typeof window !== "undefined" ? window.location.origin : "https://app.auraon.xyz",
      icons: [typeof window !== "undefined" ? `${window.location.origin}/aurapredict-logo.png` : "https://app.auraon.xyz/aurapredict-logo.png"]
    },
    methods: [
      "eth_requestAccounts",
      "eth_accounts",
      "eth_sendTransaction",
      "personal_sign",
      "eth_signTypedData",
      "eth_signTypedData_v4",
      "wallet_switchEthereumChain",
      "wallet_addEthereumChain"
    ],
    events: ["accountsChanged", "chainChanged", "disconnect", "connect"]
  }) as Promise<EthereumProvider>;

  return walletConnectProviderPromise;
}
