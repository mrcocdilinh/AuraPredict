import { useCallback, useEffect, useState } from "react";
import { isAddress } from "viem";
import type { Address } from "viem";
import {
  ARC_RPC_URLS,
  EURC_TOKEN_ADDRESS,
  WALLET_CONNECTED_KEY,
  WALLET_DISCONNECTED_KEY
} from "../constants";
import { ARC_CHAIN_ID_DECIMAL, arcTestnetParams } from "../arc";
import { settlementTokenAbi } from "../contracts/arcPredictionMarketAbi";
import type { EthereumProvider, MarketContractVersion, MarketView } from "../types";
import {
  getInjectedProvider,
  getPublicClient,
  getWalletClient,
  getWalletConnectProvider
} from "../lib/rpcClient";
import {
  isDuplicateRpcNetworkError,
  isUnknownChainError,
  walletConnectionErrorMessage,
  withRpcRetry
} from "../lib/errorUtils";
import { isStablecoinContractVersion, sameAddress } from "../lib/marketUtils";
import { stablecoinMarketAbi } from "../lib/contractUtils";

export interface WalletStateOptions {
  contractVersion: MarketContractVersion;
  defaultSettlementToken: string;
  defaultSettlementDecimals: number;
  contractAddress: Address;
  markets: MarketView[];
  setNotice: (msg: string) => void;
}

export function useWalletState({
  contractVersion,
  defaultSettlementToken,
  contractAddress,
  markets,
  setNotice
}: WalletStateOptions) {
  const [account, setAccount] = useState("");
  const [selectedWalletProvider, setSelectedWalletProvider] = useState<EthereumProvider | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [isArcNetwork, setIsArcNetwork] = useState(true);
  const [switchingNetwork, setSwitchingNetwork] = useState(false);
  const [walletBalance, setWalletBalance] = useState<bigint>(0n);
  const [walletTokenBalances, setWalletTokenBalances] = useState<Record<string, bigint>>({});
  const [pendingWithdrawalsByToken, setPendingWithdrawalsByToken] = useState<Record<string, bigint>>({});
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [authMoreOpen, setAuthMoreOpen] = useState(false);

  const switchToArc = useCallback(async (provider?: EthereumProvider | null) => {
    const injected = getInjectedProvider(provider ?? selectedWalletProvider);
    const switchChain = async () => {
      const chainIds = [arcTestnetParams.chainId, arcTestnetParams.chainId.toLowerCase()];
      let lastError: unknown;
      for (const chainId of chainIds) {
        try {
          await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError;
    };
    const addChain = async () => {
      const addAttempts = [
        arcTestnetParams,
        { ...arcTestnetParams, chainId: arcTestnetParams.chainId.toLowerCase() },
        ...ARC_RPC_URLS.map((rpcUrl) => ({ ...arcTestnetParams, rpcUrls: [rpcUrl] }))
      ];
      let lastError: unknown;
      for (const params of addAttempts) {
        try {
          await injected.request({ method: "wallet_addEthereumChain", params: [params] });
          return;
        } catch (error) {
          lastError = error;
          if (isDuplicateRpcNetworkError(error)) continue;
        }
      }
      if (lastError && !isDuplicateRpcNetworkError(lastError)) throw lastError;
    };
    try {
      await switchChain();
    } catch (error) {
      if (!isUnknownChainError(error)) throw error;
      await addChain();
      await switchChain();
    }
    setIsArcNetwork(true);
  }, [selectedWalletProvider]);

  const refreshNetworkState = useCallback(async (provider?: EthereumProvider | null) => {
    try {
      const walletClient = getWalletClient(provider ?? selectedWalletProvider ?? window.ethereum ?? null);
      const chainId = await walletClient.getChainId();
      setIsArcNetwork(BigInt(chainId) === ARC_CHAIN_ID_DECIMAL);
    } catch {
      setIsArcNetwork(false);
    }
  }, [selectedWalletProvider]);

  const refreshWalletBalance = useCallback(async (address = account) => {
    if (!address || !isAddress(address)) {
      setWalletBalance(0n);
      setWalletTokenBalances({});
      return;
    }
    try {
      const balance =
        isStablecoinContractVersion(contractVersion) && isAddress(defaultSettlementToken)
          ? await withRpcRetry(() => getPublicClient().readContract({
              address: defaultSettlementToken as Address,
              abi: settlementTokenAbi,
              functionName: "balanceOf",
              args: [address as Address]
            }))
          : await withRpcRetry(() => getPublicClient().getBalance({ address: address as Address }));
      setWalletBalance(balance);

      if (isStablecoinContractVersion(contractVersion)) {
        const tokenSet = new Set<string>();
        if (isAddress(defaultSettlementToken)) tokenSet.add(defaultSettlementToken.toLowerCase());
        if (isAddress(EURC_TOKEN_ADDRESS)) tokenSet.add(EURC_TOKEN_ADDRESS.toLowerCase());
        const balances = await Promise.all(
          Array.from(tokenSet).map(async (token) => {
            if (isAddress(defaultSettlementToken) && sameAddress(token, defaultSettlementToken)) {
              return [token, balance] as const;
            }
            const value = await withRpcRetry(() => getPublicClient().readContract({
              address: token as Address,
              abi: settlementTokenAbi,
              functionName: "balanceOf",
              args: [address as Address]
            }));
            return [token, value] as const;
          })
        );
        setWalletTokenBalances(Object.fromEntries(balances));
      } else {
        setWalletTokenBalances({});
      }
    } catch {
      setWalletBalance(0n);
      setWalletTokenBalances({});
    }
  }, [account, contractVersion, defaultSettlementToken]);

  const ensureArcNetwork = useCallback(async (provider?: EthereumProvider | null) => {
    setSwitchingNetwork(true);
    try {
      await switchToArc(provider);
      await refreshNetworkState(provider);
      setNotice("Arc Testnet network is ready.");
    } catch (error) {
      setNotice(walletConnectionErrorMessage("Network switch failed", error));
    } finally {
      setSwitchingNetwork(false);
    }
  }, [refreshNetworkState, setNotice, switchToArc]);

  const connectWallet = useCallback(async (provider?: EthereumProvider | null) => {
    setNotice("");
    setConnecting(true);
    const providerToUse = provider ?? selectedWalletProvider ?? window.ethereum ?? null;
    const walletClient = getWalletClient(providerToUse);
    const addresses = await walletClient.requestAddresses();
    await switchToArc(providerToUse);
    const chainId = await walletClient.getChainId();
    if (BigInt(chainId) !== ARC_CHAIN_ID_DECIMAL) {
      throw new Error("Wallet is not on Arc Testnet.");
    }
    if (!addresses[0]) {
      throw new Error("No wallet account returned.");
    }
    setAccount(addresses[0]);
    void refreshWalletBalance(addresses[0]);
    setSelectedWalletProvider(providerToUse);
    setIsArcNetwork(true);
    window.localStorage.setItem(WALLET_CONNECTED_KEY, "true");
    window.localStorage.removeItem(WALLET_DISCONNECTED_KEY);
    setNotice("Wallet connected on Arc Testnet.");
    setConnecting(false);
  }, [refreshWalletBalance, selectedWalletProvider, setNotice, switchToArc]);

  const handleConnectWallet = useCallback(async (provider?: EthereumProvider | null) => {
    try {
      await connectWallet(provider);
      setWalletModalOpen(false);
    } catch (error) {
      setConnecting(false);
      setNotice(walletConnectionErrorMessage("Connect failed", error));
    }
  }, [connectWallet, setNotice]);

  const handleWalletConnect = useCallback(async () => {
    try {
      setNotice("");
      setConnecting(true);
      const provider = await getWalletConnectProvider();
      await connectWallet(provider);
      setWalletModalOpen(false);
    } catch (error) {
      setConnecting(false);
      setNotice(walletConnectionErrorMessage("WalletConnect failed", error));
    }
  }, [connectWallet, setNotice]);

  const disconnectWallet = useCallback(async () => {
    const providerToDisconnect = selectedWalletProvider;
    try {
      await providerToDisconnect?.disconnect?.();
    } catch {
      // Injected wallets usually do not expose disconnect.
    }
    setAccount("");
    setWalletBalance(0n);
    setSelectedWalletProvider(null);
    setWalletMenuOpen(false);
    window.localStorage.removeItem(WALLET_CONNECTED_KEY);
    window.localStorage.setItem(WALLET_DISCONNECTED_KEY, "true");
    setNotice("Wallet disconnected in AuraPredict.");
  }, [selectedWalletProvider, setNotice]);

  // Refresh wallet balance when account changes
  useEffect(() => {
    if (!account) {
      setWalletBalance(0n);
      return;
    }
    void refreshWalletBalance(account);
  }, [account, refreshWalletBalance]);

  // Refresh pending withdrawals when account / markets / contract change
  useEffect(() => {
    if (!isStablecoinContractVersion(contractVersion) || !account || !isAddress(account)) {
      setPendingWithdrawalsByToken({});
      return;
    }
    const tokens = Array.from(
      new Set(
        markets
          .map((market) => market.settlementToken)
          .filter((token): token is string => Boolean(token && isAddress(token)))
      )
    );
    if (tokens.length === 0 && isAddress(defaultSettlementToken)) tokens.push(defaultSettlementToken);
    Promise.all(
      tokens.map(async (token) => {
        const amount = await withRpcRetry(() => getPublicClient().readContract({
          address: contractAddress,
          abi: stablecoinMarketAbi(contractVersion),
          functionName: "pendingWithdrawals",
          args: [token as Address, account as Address]
        }));
        return [token.toLowerCase(), amount] as const;
      })
    )
      .then((rows) => setPendingWithdrawalsByToken(Object.fromEntries(rows)))
      .catch(() => setPendingWithdrawalsByToken({}));
  }, [account, contractAddress, contractVersion, defaultSettlementToken, markets]);

  return {
    account,
    setAccount,
    selectedWalletProvider,
    setSelectedWalletProvider,
    connecting,
    setConnecting,
    isArcNetwork,
    setIsArcNetwork,
    switchingNetwork,
    walletBalance,
    walletTokenBalances,
    pendingWithdrawalsByToken,
    walletMenuOpen,
    setWalletMenuOpen,
    walletModalOpen,
    setWalletModalOpen,
    authMoreOpen,
    setAuthMoreOpen,
    setPendingWithdrawalsByToken,
    switchToArc,
    refreshNetworkState,
    refreshWalletBalance,
    ensureArcNetwork,
    connectWallet,
    handleConnectWallet,
    handleWalletConnect,
    disconnectWallet
  };
}
