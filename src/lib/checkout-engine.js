function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const TOKENS = {
  eth: {
    key: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    usd: 3200,
    chainId: 1,
    decimals: 18,
    chain: 'ethereum',
  },
  usdc: {
    key: 'usdc',
    symbol: 'USDC',
    name: 'USD Coin',
    usd: 1,
    chainId: 1,
    decimals: 6,
    chain: 'ethereum',
    contract: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  usdt: {
    key: 'usdt',
    symbol: 'USDT',
    name: 'Tether',
    usd: 1,
    chainId: 1,
    decimals: 6,
    chain: 'ethereum',
    contract: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
};

export const NETWORKS = {
  ethereum: {
    label: 'Ethereum',
    gasBaseUsd: 6.5,
    latencyMinutes: 4.5,
    reliability: 0.983,
    icon: '🧊',
    explorer: 'https://etherscan.io/tx/',
    rpcChainId: 1,
  },
};

export const defaultDemoWalletBalances = [
  {
    key: 'eth',
    symbol: TOKENS.eth.symbol,
    chain: TOKENS.eth.chain,
    decimals: TOKENS.eth.decimals,
    chainId: TOKENS.eth.chainId,
    amount: 4.7,
  },
  {
    key: 'usdc',
    symbol: TOKENS.usdc.symbol,
    chain: TOKENS.usdc.chain,
    decimals: TOKENS.usdc.decimals,
    chainId: TOKENS.usdc.chainId,
    amount: 12400,
  },
  {
    key: 'usdt',
    symbol: TOKENS.usdt.symbol,
    chain: TOKENS.usdt.chain,
    decimals: TOKENS.usdt.decimals,
    chainId: TOKENS.usdt.chainId,
    amount: 7800,
  },
];

export function shortAddress(address = '') {
  if (!address) {
    return '';
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function money(amount) {
  return Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
    style: 'currency',
    currency: 'USD',
  });
}

export function tokenAmount(amount, symbol) {
  return `${Number(amount).toFixed(Math.min(6, 4))} ${symbol}`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

export function createDemoWallet() {
  return {
    id: 'demo',
    connectorLabel: 'Demo Wallet',
    chain: 'ethereum',
    chainId: NETWORKS.ethereum.rpcChainId,
    address: '0xDeMoWa11eT0000000000000000000000000001',
    balances: defaultDemoWalletBalances.map((balance) => ({ ...balance })),
    network: NETWORKS.ethereum,
    provider: null,
    isDemo: true,
  };
}

function formatUnits(value, decimals) {
  const base = 10n ** BigInt(decimals);
  const scaled = BigInt(value || 0);
  const whole = scaled / base;
  const part = scaled % base;
  const frac = part
    .toString()
    .padStart(decimals, '0')
    .slice(0, 6)
    .replace(/0+$/, '');

  return frac ? `${whole}.${frac}` : `${whole}`;
}

function toHexWei(amount, decimals) {
  const text = Number.isFinite(amount) ? `${amount}` : '0';
  const [rawInt, rawFrac = ''] = text.split('.');
  const frac = `${rawFrac}${'0'.repeat(decimals)}`.slice(0, decimals);
  const combined = BigInt(rawInt || '0') * 10n ** BigInt(decimals) + BigInt(frac || '0');
  return `0x${combined.toString(16)}`;
}

function encodeBalanceOf(address) {
  const clean = address.toLowerCase().replace('0x', '').padStart(40, '0');
  return `0x70a08231${'0'.repeat(24)}${clean}`;
}

function encodeBalanceAbi() {
  return '0x313ce567';
}

async function readTokenValue(provider, contractAddress, methodData) {
  const res = await provider.request({
    method: 'eth_call',
    params: [
      {
        to: contractAddress,
        data: methodData,
      },
      'latest',
    ],
  });

  return res || '0x0';
}

export async function getWalletTokens(provider, address) {
  const lower = address.toLowerCase();
  const chainAssets = Object.values(TOKENS).filter((token) => token.chainId === 1);
  const balances = [];

  const native = await provider.request({
    method: 'eth_getBalance',
    params: [lower, 'latest'],
  });
  const nativeAmount = Number(formatUnits(BigInt(native), 18));

  balances.push({
    key: 'eth',
    symbol: TOKENS.eth.symbol,
    chain: TOKENS.eth.chain,
    decimals: TOKENS.eth.decimals,
    chainId: TOKENS.eth.chainId,
    amount: nativeAmount,
  });

  for (const token of chainAssets) {
    if (!token.contract) {
      continue;
    }

    try {
      const balanceHex = await readTokenValue(provider, token.contract, encodeBalanceOf(lower));
      const decimalsHex = await readTokenValue(provider, token.contract, encodeBalanceAbi());
      const decimals = Number(BigInt(decimalsHex));
      const finalDecimals = Number.isFinite(decimals) && decimals > 0 ? decimals : token.decimals;
      const adjusted = Number(formatUnits(BigInt(balanceHex), finalDecimals));

      if (adjusted > 0.000001) {
        balances.push({
          ...token,
          amount: adjusted,
          decimals: finalDecimals,
          balanceHex,
        });
      }
    } catch {
      // Ignore token failures.
    }
  }

  return balances;
}

function routeScore(route, strategy) {
  const feeWeight = strategy === 'cheapest' ? 0.93 : strategy === 'fastest' ? 0.1 : 0.52;
  const speedWeight = 1 - feeWeight;

  return route.feesTotalUsd * feeWeight + route.etaMinutes * 2.3 * speedWeight + route.failureRate * 100 * speedWeight;
}

export function rankRoutes(routes, strategy) {
  return [...routes]
    .sort((a, b) => {
      const aScore = routeScore(a, strategy);
      const bScore = routeScore(b, strategy);
      if (aScore === bScore) {
        return b.reliability - a.reliability;
      }
      return aScore - bScore;
    })
    .map((route, index) => ({ ...route, rank: index + 1 }));
}

export function findTokenBySymbol(symbol) {
  return Object.values(TOKENS).find((token) => token.symbol === symbol) || TOKENS.eth;
}

export function createDemoRoutes({
  invoiceUsd,
  settlementTokenSymbol,
  wallet,
  preference,
  acceptedPaymentMethods = [],
}) {
  const settlement = TOKENS[settlementTokenSymbol] || TOKENS.usdc;
  const now = Date.now();
  const routes = [];
  const methodSet = new Set(acceptedPaymentMethods.map((method) => method.toUpperCase()));
  const preferredOnly = methodSet.size > 0;

  wallet.balances.forEach((asset) => {
    const token = Object.values(TOKENS).find(
      (item) => item.symbol === asset.symbol && item.chainId === asset.chainId,
    );
    if (!token) {
      return;
    }
    if (!preferredOnly || methodSet.has(token.symbol)) {
      if (asset.amount <= 0.00001) {
        return;
      }

      const chainMeta = NETWORKS[token.chain];
      const sourceUsd = token.usd || 1;

      const sameChain = token.chain === settlement.chain;
      const chainSpread = sameChain ? randomBetween(0.0025, 0.0065) : randomBetween(0.0045, 0.01);
      const bridgeFee = sameChain ? 0 : randomBetween(0.8, 2.1);

      const quoteFee = (invoiceUsd / sourceUsd) * chainSpread;
      const requiredSourceTotal = invoiceUsd / sourceUsd + quoteFee;

      if (requiredSourceTotal > asset.amount) {
        return;
      }

      const gasUsd = chainMeta.gasBaseUsd * randomBetween(0.85, 1.4);
      const latency = sameChain ? chainMeta.latencyMinutes : chainMeta.latencyMinutes + 1.4;
      const reliability = chainMeta.reliability - randomBetween(0, 0.02);

      const totalSettlementUsd =
        invoiceUsd * (1 - randomBetween(0.0005, 0.006)) * (sameChain ? 1 : randomBetween(0.992, 0.999));
      const totalCostUsd = gasUsd + bridgeFee + quoteFee * sourceUsd;
      const failureRate = (1 - reliability) + (0.014 + (sameChain ? 0 : 0.02));

      routes.push({
        id: `${token.symbol}-${token.chain}-${now}-${Math.floor(Math.random() * 10000)}`,
        sourceSymbol: token.symbol,
        sourceChain: token.chain,
        settlementSymbol: settlement.symbol,
        settlementChain: settlement.chain,
        sourceKey: token.key,
        sourceAmount: requiredSourceTotal,
        settlementAmountUsd: totalSettlementUsd,
        settlementAmount: settlement.usd > 0 ? totalSettlementUsd / settlement.usd : totalSettlementUsd,
        gasUsd,
        bridgeFeeUsd: bridgeFee,
        spreadUsd: quoteFee * sourceUsd,
        etaMinutes: latency,
        reliability: Math.min(0.994, reliability),
        feesTotalUsd: totalCostUsd,
        failureRate: Math.min(0.36, Math.max(0.01, failureRate)),
        explanation: sameChain
          ? 'Direct settlement on Ethereum.'
          : `Bridge + routing via ${chainMeta.label} then settle on ${settlement.chain}.`,
        executable: token.symbol === 'ETH',
      });
    }
  });

  const ranked = rankRoutes(routes, preference || 'balanced');

  return ranked.map((route, index) => ({
    ...route,
    isBest: index === 0,
    feeSummaryUsd: route.feesTotalUsd,
    finalPayableUsd: invoiceUsd + route.feesTotalUsd,
  }));
}

export function routePriorityHint(route) {
  if (route.failureRate <= 0.11) {
    return 'Very high confidence';
  }
  if (route.failureRate <= 0.21) {
    return 'Good';
  }
  return 'Fallback route';
}

export function buildRandomHash(length = 18) {
  const alphabet = 'abcdef0123456789';
  let out = '0x';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function executeRouteSimulation(route, { hasProvider = false, wallet }) {
  if (!route) {
    return { ok: false, failureReason: 'No route selected' };
  }

  if (!hasProvider) {
    await sleep(900);
    const pass = Math.random() >= route.failureRate;
    return {
      ok: pass,
      txHash: pass ? buildRandomHash(38) : null,
      explorerHint: pass ? buildRandomHash(64) : null,
      failureReason: pass ? null : 'Demo simulation: route not executed on chain.',
    };
  }

  try {
    if (wallet && wallet.provider && route.sourceSymbol === 'ETH') {
      const txHash = await wallet.provider.request({
        method: 'eth_sendTransaction',
        params: [
          {
            from: wallet.address,
            to: '0x3A1d0De8D8a73a9fF5f3c6f4A6f0f5D2E8d3C45F1',
            value: toHexWei(route.sourceAmount, 18),
          },
        ],
      });

      await sleep(450);
      return {
        ok: true,
        txHash,
        explorerHint: `${wallet.network?.explorer || 'https://etherscan.io/tx/'}${txHash}`,
        failureReason: null,
      };
    }

    await sleep(700);
    const pass = Math.random() >= route.failureRate;
    return {
      ok: pass,
      txHash: pass ? buildRandomHash(38) : null,
      explorerHint: pass ? `${wallet.network?.explorer || ''}${buildRandomHash(64)}` : null,
      failureReason: pass ? null : 'Wallet token route executed with local simulation fallback.',
    };
  } catch (error) {
    return {
      ok: false,
      txHash: null,
      failureReason: error?.message || 'Wallet rejected transaction',
    };
  }
}

