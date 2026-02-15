'use client';

import '@rainbow-me/rainbowkit/styles.css';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { RainbowKitProvider, getDefaultConfig, useConnectModal } from '@rainbow-me/rainbowkit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createPublicClient, formatUnits, http } from 'viem';
import { mainnet, polygon, optimism, arbitrum, base } from 'wagmi/chains';
import { useAccount as useWagmiAccount, useConnect, useDisconnect, WagmiProvider } from 'wagmi';
import { TOKENS, createDemoWallet, shortAddress as formatShortAddress } from '../lib/checkout-engine';

const WalletContext = createContext({
  address: '',
  isConnected: false,
  isConnecting: false,
  isDisconnected: true,
  walletLabel: 'Wallet',
  connect: async () => {},
  disconnect: async () => {},
  chainId: null,
  error: '',
  wallet: null,
  balances: [],
  isFallbackMode: false,
});

const queryClient = new QueryClient();
const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_HOT_WALLET_CONNECT_PROJECT_ID || '3cbf324S21f18648ed6153e2c324l2cf';
const SUPPORTED_CHAINS = [mainnet, polygon, optimism, arbitrum, base];
const FALLBACK_LABEL = 'Wallet';

const config = getDefaultConfig({
  appName: 'HOT Pay Smart Checkout',
  projectId: WALLETCONNECT_PROJECT_ID,
  chains: SUPPORTED_CHAINS,
  ssr: true,
});

function shortAddress(address = '') {
  return formatShortAddress(address);
}

function normalizeChainName(chainName = '') {
  return chainName.toLowerCase().replace(/\s+/g, '_') || 'ethereum';
}

function explorerForChain(chain = null) {
  if (chain?.blockExplorers?.default?.url) {
    return chain.blockExplorers.default.url.endsWith('/') ? chain.blockExplorers.default.url : `${chain.blockExplorers.default.url}/`;
  }
  return 'https://etherscan.io/tx/';
}

function composeWalletShape({ account, chain, balances, isFallbackMode }) {
  return {
    id: `${account.address}-${chain?.id || '1'}`,
    chain: normalizeChainName(chain?.name || 'ethereum'),
    chainId: chain?.id || null,
    address: account.address,
    connectorLabel: chain?.name || 'Wallet',
    balances,
    network: {
      label: chain?.name || 'Ethereum',
      explorer: explorerForChain(chain),
      rpcChainId: chain?.id || 1,
    },
    provider: typeof window !== 'undefined' ? window.ethereum : null,
    isFallbackMode: isFallbackMode,
  };
}

async function fetchWalletBalances(chainId, address) {
  if (typeof window === 'undefined' || !chainId || !address) {
    return [];
  }

  const chain = SUPPORTED_CHAINS.find((item) => item.id === chainId) || SUPPORTED_CHAINS[0];
  const rpcUrl = chain.rpcUrls?.default?.http?.[0];
  if (!rpcUrl) {
    return [];
  }

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const normalized = address.toLowerCase();

  const balances = [];
  try {
    const eth = await publicClient.getBalance({ address: normalized });
    const ethAmount = Number(formatUnits(eth, TOKENS.eth.decimals));
    if (ethAmount > 0) {
      balances.push({
        key: TOKENS.eth.key,
        symbol: TOKENS.eth.symbol,
        chain: TOKENS.eth.chain,
        chainId: TOKENS.eth.chainId,
        amount: ethAmount,
        decimals: TOKENS.eth.decimals,
      });
    }
  } catch {
    // Ignore native balance errors to avoid blocking wallet connect.
  }

  const supportedTokens = Object.values(TOKENS).filter((token) => token.contract && token.chainId === chainId);
  for (const token of supportedTokens) {
    try {
      const raw = await publicClient.readContract({
        address: token.contract,
        abi: [
          {
            type: 'function',
            name: 'balanceOf',
            stateMutability: 'view',
            inputs: [{ name: 'account', type: 'address' }],
            outputs: [{ type: 'uint256' }],
          },
        ],
        functionName: 'balanceOf',
        args: [normalized],
      });

      const amount = Number(formatUnits(raw, token.decimals));
      if (amount > 0) {
        balances.push({
          key: token.key,
          symbol: token.symbol,
          chain: token.chain,
          chainId: token.chainId,
          amount,
          decimals: token.decimals,
        });
      }
    } catch {
      // Ignore token that can not be read on this chain.
    }
  }

  return balances;
}

function useWalletCore() {
  const account = useWagmiAccount();
  const { connect: connectWallet, connectors } = useConnect();
  const { openConnectModal } = useConnectModal();
  const { disconnect: wagmiDisconnect } = useDisconnect();
  const [address, setAddress] = useState('');
  const [chainId, setChainId] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [balances, setBalances] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [error, setError] = useState('');
  const [walletLabel, setWalletLabel] = useState(FALLBACK_LABEL);

  useEffect(() => {
    let disposed = false;

    const hydrate = async () => {
      if (!account.isConnected || !account.address) {
        setAddress('');
        setChainId(null);
        setWallet(null);
        setBalances([]);
        setWalletLabel(FALLBACK_LABEL);
        setIsFallbackMode(false);
        return;
      }

      const normalized = account.address.toLowerCase();
      setAddress(normalized);
      setChainId(account.chainId || null);
      setWalletLabel(account.chain?.name || 'Wallet');
      setIsConnecting(false);
      setIsFallbackMode(false);

      const fallbackWallet = composeWalletShape({
        account: { address: normalized },
        chain: account.chain || mainnet,
        balances: createDemoWallet().balances,
        isFallbackMode: true,
      });
      setWallet(fallbackWallet);
      setBalances(fallbackWallet.balances);

      const loaded = await fetchWalletBalances(account.chainId, normalized);
      if (disposed || !account.isConnected) {
        return;
      }

      const hasLiveBalances = loaded.length > 0;
      const finalBalances = hasLiveBalances ? loaded : fallbackWallet.balances;

      setBalances(finalBalances);
      setIsFallbackMode(!hasLiveBalances);
      setWallet(
        composeWalletShape({
          account: { address: normalized },
          chain: account.chain || mainnet,
          balances: finalBalances,
          isFallbackMode: !hasLiveBalances,
        }),
      );
    };

    hydrate().catch(() => {
      if (!disposed) {
        setError('Unable to load live wallet balances.');
        const fallbackWallet = composeWalletShape({
          account: { address: account.address.toLowerCase() },
          chain: account.chain || mainnet,
          balances: createDemoWallet().balances,
          isFallbackMode: true,
        });
        setBalances(fallbackWallet.balances);
        setWallet(fallbackWallet);
        setIsFallbackMode(true);
      }
    });

    return () => {
      disposed = true;
    };
  }, [account.address, account.chain, account.chainId, account.isConnected]);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setError('');
    try {
      if (typeof connectWallet === 'function') {
        // Prefer extension connectors first so clicking connect opens browser wallet UI directly.
        const directConnector = connectors.find(
          (connector) => connector.type === 'injected' || connector.id === 'injected',
        );

        if (directConnector) {
          await connectWallet({ connector: directConnector });
          setIsConnecting(false);
          return;
        }
      }

      if (!openConnectModal) {
        throw new Error('Wallet connect modal not available. Refresh and try again.');
      }
      openConnectModal();
    } catch (connectError) {
      setError(connectError?.message || 'Unable to open wallet connection modal.');
    } finally {
      setIsConnecting(false);
    }
  }, [connectWallet, connectors, openConnectModal]);

  const disconnect = useCallback(async () => {
    try {
      await wagmiDisconnect();
    } catch (disconnectError) {
      setError(disconnectError?.message || 'Unable to disconnect wallet.');
    } finally {
      setAddress('');
      setChainId(null);
      setWallet(null);
      setBalances([]);
      setWalletLabel(FALLBACK_LABEL);
      setIsFallbackMode(false);
    }
  }, [wagmiDisconnect]);

  return {
    address,
    isConnected: account.isConnected,
    isDisconnected: !account.isConnected,
    isConnecting,
    walletLabel: walletLabel,
    connect,
    disconnect,
    chainId,
    error,
    wallet,
    balances,
    isFallbackMode,
  };
}

export function useAccount() {
  return useContext(WalletContext);
}

export function ConnectButton({ label = 'Connect Wallet' }) {
  const { isConnected, address, isConnecting, connect, disconnect, walletLabel } = useAccount();
  const buttonLabel = isConnected ? `Connected ${shortAddress(address)} (${walletLabel || FALLBACK_LABEL})` : label;

  return (
    <button className="rainbow-btn" onClick={isConnected ? disconnect : connect} disabled={isConnecting}>
      {isConnecting ? 'Connecting...' : buttonLabel}
    </button>
  );
}

function RainbowContextBridge({ children }) {
  const walletState = useWalletCore();

  return <WalletContext.Provider value={walletState}>{children}</WalletContext.Provider>;
}

export default function RainbowProviders({ children }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <RainbowContextBridge>{children}</RainbowContextBridge>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
