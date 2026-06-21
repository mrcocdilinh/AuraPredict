import { useEffect } from "react";
import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import type { EthereumProvider } from "../types";
import type { WalletType } from "./useWalletState";

// Bridge: syncs AppKit connection state into our existing wallet logic.
// Call this once at the top of App, pass in connectWallet / disconnectWallet from useWalletState.
export function useAppKitBridge({
  account,
  walletType,
  connectWallet,
  disconnectWallet
}: {
  account: string;
  walletType: WalletType;
  connectWallet: (provider: EthereumProvider) => Promise<void>;
  disconnectWallet: () => Promise<void>;
}) {
  const { isConnected, address, status } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider("eip155");
  // A Circle (email) wallet is managed outside AppKit; don't let the AppKit
  // sync effects connect over it or tear it down when Reown reports no session.
  const circleActive = walletType === "circle";

  useEffect(() => {
    if (circleActive) return;
    if (isConnected && address && walletProvider && !account) {
      void connectWallet(walletProvider as EthereumProvider);
    }
  }, [circleActive, isConnected, address, walletProvider, account, connectWallet]);

  useEffect(() => {
    if (circleActive) return;
    if (!isConnected && account) {
      void disconnectWallet();
    }
  }, [circleActive, isConnected, account, disconnectWallet]);

  // True while AppKit restores a previous session after a reload but our local
  // account isn't wired up yet — used to keep the header showing "Connecting…"
  // instead of flickering to the Sign in button on every refresh.
  const isReconnecting =
    !account && (status === "connecting" || status === "reconnecting" || (isConnected && !!address));

  return { isReconnecting };
}
