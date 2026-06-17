import { useEffect, useState } from "react";
import type { Eip6963ProviderDetail, EthereumProvider } from "../types";

export function useWalletProviders() {
  const [walletProviders, setWalletProviders] = useState<Eip6963ProviderDetail[]>([]);

  useEffect(() => {
    const providers = new Map<string, Eip6963ProviderDetail>();
    const addProvider = (detail: Eip6963ProviderDetail) => {
      if (!detail?.provider || !detail.info?.uuid) return;
      providers.set(detail.info.uuid, detail);
      setWalletProviders(Array.from(providers.values()));
    };

    const handleProvider = (event: Event) => {
      addProvider((event as CustomEvent<Eip6963ProviderDetail>).detail);
    };

    window.addEventListener("eip6963:announceProvider", handleProvider as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));

    const legacyProviders = ((window.ethereum as EthereumProvider & { providers?: EthereumProvider[] })?.providers || [])
      .filter(Boolean)
      .map((provider, index) => ({
        info: {
          uuid: `legacy-${index}`,
          name:
            (provider as EthereumProvider & { isZerion?: boolean; isRabby?: boolean; isOkxWallet?: boolean; isMetaMask?: boolean })
              .isZerion
              ? "Zerion"
              : (provider as EthereumProvider & { isRabby?: boolean }).isRabby
                ? "Rabby Wallet"
                : (provider as EthereumProvider & { isOkxWallet?: boolean }).isOkxWallet
                  ? "OKX Wallet"
                  : (provider as EthereumProvider & { isMetaMask?: boolean }).isMetaMask
                    ? "MetaMask"
                    : `Browser Wallet ${index + 1}`
        },
        provider
      }));

    for (const provider of legacyProviders) addProvider(provider);

    return () => {
      window.removeEventListener("eip6963:announceProvider", handleProvider as EventListener);
    };
  }, []);

  return { walletProviders };
}
