'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  TOKENS,
  money,
  shortAddress,
  createDemoWallet,
  createDemoRoutes,
  routePriorityHint,
  executeRouteSimulation,
} from '../../../lib/checkout-engine';
import { buildHotPayCheckoutUrl } from '../../../lib/hotpay-adapter';
import { addTransaction, getCheckoutById, updateTransaction } from '../../../lib/hotpay-store';
import { useAccount } from '../../../components/rainbow-providers';

function pickPaymentAmount(checkout) {
  const fixed = Number(checkout?.fixedAmount || 0);
  return Number.isFinite(fixed) && fixed > 0 ? fixed : 1;
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function CheckoutCustomerPage() {
  const { id } = useParams();
  const router = useRouter();
  const [merchant, setMerchant] = useState(null);
  const [checkout, setCheckout] = useState(null);
  const [mode, setMode] = useState('demo');
  const [wallet, setWallet] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [preference, setPreference] = useState('balanced');
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [status, setStatus] = useState('idle');
  const [statusMessage, setStatusMessage] = useState('Choose a route and confirm payment.');
  const [lastReceipt, setLastReceipt] = useState('');
  const [executionMode, setExecutionMode] = useState('smart');
  const [isBusy, setIsBusy] = useState(false);
  const { address, connect, isConnecting: walletIsConnecting, isConnected, wallet: accountWallet, isFallbackMode } = useAccount();

  const accountWalletNotice = useMemo(() => {
    if (mode === 'demo') {
      return 'Demo wallet ready.';
    }
    if (!isConnected) {
      return 'Connect your wallet to use live routing.';
    }
    if (isFallbackMode) {
      return 'Fallback wallet mode active.';
    }
    if (accountWallet?.address) {
      return `Connected ${accountWallet.address}. Route discovery uses wallet balances.`;
    }
    return 'Wallet connected. Waiting for balances...';
  }, [mode, isConnected, isFallbackMode, accountWallet?.address]);

  const checkoutId = Array.isArray(id) ? id[0] : id || '';

  const loadCheckout = useCallback(() => {
    const found = getCheckoutById(checkoutId);
    if (!found || found.checkout.status !== 'active') {
      setCheckout(null);
      return;
    }

    setMerchant(found.merchant);
    setCheckout(found.checkout);
    setStatusMessage(found.checkout.priceMode === 'variable' ? 'Enter amount in USD to continue.' : 'Choose a route and confirm payment.');
    setExecutionMode(found.checkout.hotpayItemId ? 'hosted' : 'smart');
    if (!amountInput) {
      setAmountInput(
        found.checkout.priceMode === 'fixed'
          ? String(safeNumber(found.checkout.fixedAmount, pickPaymentAmount(found.checkout)))
          : String(safeNumber(found.checkout.variableMin, 1))
      );
    }
  }, [amountInput, checkoutId]);

  useEffect(() => {
    loadCheckout();
  }, [loadCheckout]);

  const baseAmountUsd = useMemo(() => {
    if (!checkout) {
      return 0;
    }

    if (checkout.priceMode === 'fixed') {
      return safeNumber(checkout.fixedAmount, 0);
    }

    const entered = safeNumber(amountInput, 0);
    const min = safeNumber(checkout.variableMin, 0);
    const max = safeNumber(checkout.variableMax, 0);

    if (entered > 0 && entered >= min && entered <= max) {
      return entered;
    }

    return min;
  }, [amountInput, checkout]);

  const availableMethods = useMemo(() => {
    if (!checkout) {
      return [];
    }
    return Array.isArray(checkout.acceptedPaymentMethods) ? checkout.acceptedPaymentMethods : [];
  }, [checkout]);

  const hotPayCheckoutUrl = useMemo(() => {
    if (!checkout) {
      return '';
    }
    return buildHotPayCheckoutUrl({
      hotpayItemId: checkout.hotpayItemId,
      amount: baseAmountUsd,
      currency: checkout.settlementAsset || 'USDC',
      redirectUrl: checkout.redirectUrl,
      memoData: `${checkout.memoPrefix || 'order'}-${checkout.id}`,
    });
  }, [baseAmountUsd, checkout]);

  const walletForRouting = useMemo(() => {
    if (mode === 'mainnet' && wallet) {
      return wallet;
    }
    return createDemoWallet();
  }, [mode, wallet]);

  useEffect(() => {
    if (mode !== 'mainnet') {
      setWallet(null);
      return;
    }

    if (!isConnected || !accountWallet) {
      setWallet(null);
      return;
    }

    setWallet({
      id: accountWallet.id || 'hotkit',
      chain: accountWallet.chain || (accountWallet.chainId ? String(accountWallet.chainId) : 'ethereum'),
      chainId: accountWallet.chainId || null,
      address: accountWallet.address || address,
      connectorLabel: accountWallet.connectorLabel || 'HOT Wallet',
      balances: accountWallet.balances || [],
      network: {
        label: accountWallet.chain || 'Mainnet',
        explorer: 'https://etherscan.io/tx/',
        rpcChainId: accountWallet.chainId || 1,
      },
      provider: accountWallet.provider || accountWallet.wallet?.provider,
    });
  }, [accountWallet, address, isConnected, mode]);

  const recalcRoutes = useCallback(() => {
    if (!checkout) {
      return;
    }

    setStatusMessage('Finding the best route...');
    setRoutes([]);
    setSelectedRouteId('');

    const generated = createDemoRoutes({
      invoiceUsd: baseAmountUsd,
      settlementTokenSymbol: checkout.settlementAsset || 'usdc',
      wallet: walletForRouting,
      preference,
      acceptedPaymentMethods: availableMethods,
    });

    setRoutes(generated);
    if (generated.length > 0) {
      setSelectedRouteId(generated[0].id);
      setStatusMessage(`Found ${generated.length} route${generated.length > 1 ? 's' : ''}. Best: ${generated[0].sourceSymbol} via ${generated[0].sourceChain}.`);
    } else {
      setStatusMessage('No viable route. Ask the customer to increase amount or try different wallet.');
    }
  }, [availableMethods, baseAmountUsd, checkout, preference, walletForRouting]);

  useEffect(() => {
    recalcRoutes();
  }, [recalcRoutes]);

  const onConnectWallet = async () => {
    await connect();
  };

  const selectedRoute = routes.find((route) => route.id === selectedRouteId) || null;

  const onPay = async () => {
    if (!checkout || !merchant) {
      return;
    }

    if (executionMode === 'hosted') {
      if (!hotPayCheckoutUrl) {
        setStatus('failed');
        setStatusMessage('No HOT Pay checkout link configured for this invoice.');
        return;
      }
      const txRecord = addTransaction(merchant.id, checkout.id, {
        id: `cust_${Date.now().toString(36)}_${Math.floor(Math.random() * 9999).toString(16)}`,
        status: 'pending',
        amountUsd: baseAmountUsd,
        customerWallet: walletForRouting.address || 'anonymous',
        paymentMethod: 'HOT_PAY_HOSTED',
        route: {
          id: 'hotpay',
          sourceSymbol: 'HOT_PAY',
          sourceChain: 'hosted',
          settlementSymbol: checkout.settlementAsset || 'USDC',
          settlementChain: 'near',
          executable: true,
        },
        checkoutName: checkout.name,
        txHash: null,
        statusMessage: 'Opening HOT Pay checkout page',
      });

      window.open(hotPayCheckoutUrl, '_blank', 'noopener,noreferrer');
      if (txRecord) {
        updateTransaction(merchant.id, checkout.id, txRecord.id, {
          status: 'processing',
          statusMessage: `HOT Pay checkout opened for ${checkout.name}. Complete payment to confirm.`,
        });
      }
      setLastReceipt('Hosted checkout opened');
      setStatus('processing');
      setStatusMessage('HOT Pay checkout is now open in a new tab.');
      return;
    }

    if (!selectedRoute || !merchant) {
      return;
    }

    setIsBusy(true);
    setStatus('processing');
    setStatusMessage('Submitting payment...');

    const txRecord = addTransaction(merchant.id, checkout.id, {
      id: `cust_${Date.now().toString(36)}_${Math.floor(Math.random() * 9999).toString(16)}`,
      status: 'pending',
      amountUsd: baseAmountUsd,
      customerWallet: walletForRouting.address || 'demo-wallet',
      paymentMethod: selectedRoute.sourceSymbol,
      route: selectedRoute,
      checkoutName: checkout.name,
      txHash: null,
      statusMessage: 'Payment initialized',
    });

    try {
      const result = await executeRouteSimulation(selectedRoute, {
        hasProvider: mode === 'mainnet' && !!wallet && wallet.chain === 'ethereum' && !!wallet.provider,
        wallet,
      });

      if (!txRecord) {
        throw new Error('Could not create transaction record');
      }

      if (result.ok) {
        const next = {
          status: 'success',
          statusMessage: 'Payment confirmed.',
          txHash: result.txHash,
          explorerHint: result.explorerHint,
        };
        updateTransaction(merchant.id, checkout.id, txRecord.id, next);
        setLastReceipt(result.txHash || 'simulated');
        setStatus('success');
        setStatusMessage('Payment complete.');

        if (checkout.redirectUrl && checkout.redirectUrl.startsWith('http')) {
          setTimeout(() => router.push(checkout.redirectUrl), 3000);
        }
      } else {
        updateTransaction(merchant.id, checkout.id, txRecord.id, {
          status: 'failed',
          statusMessage: result.failureReason || 'Route failed',
        });
        setStatus('failed');
        setStatusMessage(result.failureReason || 'Route failed');
      }

      await recalcRoutes();
    } catch (error) {
      if (txRecord) {
        updateTransaction(merchant.id, checkout.id, txRecord.id, {
          status: 'failed',
          statusMessage: error?.message || 'Payment exception',
        });
      }
      setStatus('failed');
      setStatusMessage(error?.message || 'Could not process payment.');
    } finally {
      setIsBusy(false);
    }
  };

  const preferredMethodNotice = useMemo(() => {
    if (!walletForRouting?.balances || !availableMethods.length) {
      return 'No method filters available.';
    }

    const balanceMethods = walletForRouting.balances
      .map((balance) => balance.symbol)
      .filter((symbol) => availableMethods.includes(symbol));
    if (!balanceMethods.length) {
      return 'No accepted payment methods available in connected wallet.';
    }
    return `Auto-detected payment methods: ${balanceMethods.join(', ')}`;
  }, [availableMethods, walletForRouting]);

  if (!checkoutId) {
    return null;
  }

  if (!checkout) {
    return (
      <main className="app-shell">
        <section className="panel">
          <header>
            <h1>Checkout Link Not Found</h1>
            <p className="role-note">This checkout link is invalid or has been deactivated.</p>
          </header>
          <button onClick={() => router.push('/')}>Back to home</button>
        </section>
      </main>
    );
  }

  const isVariable = checkout.priceMode === 'variable';
  const variableMin = safeNumber(checkout.variableMin, 0);
  const variableMax = safeNumber(checkout.variableMax, 0);

  return (
    <main className="app-shell">
      <header className="hero checkout-topbar">
        <div>
          <p className="eyebrow">Customer Checkout</p>
          <h1>{checkout.name || 'Unnamed Checkout'}</h1>
          <p className="welcome-copy">{checkout.description || 'Complete your secure crypto checkout.'}</p>
        </div>
        <div className="checkout-controls">
          <label className="checkout-mode-label" htmlFor="customer-mode">
            Environment
          </label>
          <select
            id="customer-mode"
            className="checkout-mode-select"
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            <option value="demo">Demo mode</option>
            <option value="mainnet">Mainnet mode</option>
          </select>
          <label className="checkout-mode-label" htmlFor="execution-mode">
            Execution
          </label>
          <select
            id="execution-mode"
            className="checkout-mode-select"
            value={executionMode}
            onChange={(event) => setExecutionMode(event.target.value)}
          >
            <option value="smart">Smart routing (in-app)</option>
            <option value="hosted" disabled={!checkout?.hotpayItemId}>
              HOT Pay hosted
            </option>
          </select>
          {mode === 'mainnet' && (
            <button className="rainbow-btn" onClick={onConnectWallet} disabled={isBusy || walletIsConnecting}>
              {walletIsConnecting ? 'Connecting...' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </header>

      <main className="grid">
        <section className="panel merchant-panel">
          <header>
            <h2>Payment Details</h2>
            <p className="role-note">
              Accepted methods: {availableMethods.join(', ')} · Route optimization checks fees, speed and reliability.
            </p>
          </header>

          {isVariable ? (
            <>
              <div className="field-group">
                <label>Amount (USD)</label>
                <input
                  type="number"
                  min={variableMin}
                  max={variableMax}
                  step="0.01"
                  value={amountInput}
                  onChange={(event) => setAmountInput(event.target.value)}
                />
                <small>
                  Allowed: {money(variableMin)} to {money(variableMax)}
                </small>
              </div>
            </>
          ) : (
            <div className="field-group">
              <label>Amount (USD)</label>
              <input value={money(baseAmountUsd)} readOnly />
            </div>
          )}

          <div className="status-card">
            <div className="status-title">Merchant</div>
            <p>{merchant.name}</p>
            <p className="meta">Wallet {shortAddress(merchant.walletAddress || '')}</p>
          </div>

          <div className="status-card">
            <div className="status-title">Wallet / method status</div>
            <p>{accountWalletNotice}</p>
            <p className="meta">{preferredMethodNotice}</p>
          </div>

          <div className="status-card">
            <div className="status-title">Payment Intent</div>
            <p>
              {checkout.priceMode === 'fixed' ? `Fixed amount ${money(baseAmountUsd)}` : `Variable amount ${money(baseAmountUsd)}`}.
            </p>
            <p className="meta">Mode: {mode}</p>
            <p className="meta">
              Execution: {executionMode === 'hosted' ? 'HOT Pay hosted link' : 'in-app smart-routing simulation'}
            </p>
          </div>
        </section>

        <section className="panel checkout-panel">
          <header>
            <h2>Smart Routing Engine</h2>
            <p>
              {executionMode === 'smart'
                ? 'Best route is chosen by cost vs speed against accepted payment methods.'
                : 'HOT Pay hosted mode redirects customers to the shared secure payment URL.'}
            </p>
          </header>

          <div className="stack">
            {executionMode === 'smart' ? (
              <>
                <div className="field-group">
                  <label>Optimization strategy</label>
                  <select value={preference} onChange={(event) => setPreference(event.target.value)}>
                    <option value="balanced">Balanced</option>
                    <option value="cheapest">Cheapest first</option>
                    <option value="fastest">Fastest first</option>
                  </select>
                </div>

                <div className="status-card">
                  <div className="status-title">Connection Status</div>
                  <p>{statusMessage}</p>
                </div>

                <button className="action-row" onClick={recalcRoutes} disabled={isBusy}>
                  Recalculate routes
                </button>

                <div className="route-summary">Available routes: {routes.length}</div>
                <div className="route-cards">
                  {routes.length === 0 ? <div className="route-empty">No routes yet.</div> : null}
                  {routes.map((route) => {
                    const sourceToken = TOKENS[route.sourceKey] || TOKENS.eth;
                    return (
                      <article
                        key={route.id}
                        className={`route-card ${route.id === selectedRouteId ? 'best' : ''}`}
                        onClick={() => setSelectedRouteId(route.id)}
                      >
                        <label className="route-name">
                          <input
                            type="radio"
                            name="checkout-route"
                            checked={route.id === selectedRouteId}
                            onChange={() => setSelectedRouteId(route.id)}
                          />
                          <div>
                            <div className="route-title">
                              {route.id === selectedRouteId ? 'Selected' : `Route #${route.rank}`} · {route.sourceSymbol} on{' '}
                              {route.sourceChain} → {route.settlementSymbol} on {route.settlementChain}
                            </div>
                            <div className="route-subtitle">
                              {routePriorityHint(route)} · {route.executable ? 'Executable by wallet' : 'Simulated fallback'}
                            </div>
                          </div>
                        </label>
                        <span className={`status-pill ${route.id === selectedRouteId ? 'ok' : 'warn'}`}>
                          {Math.round(route.reliability * 100)}%
                        </span>

                        <div className="route-meta">
                          <span>Pay from wallet: {money(route.sourceAmount)} {sourceToken.symbol}</span>
                          <span>To merchant: {money(route.settlementAmountUsd)}</span>
                          <span>Fees: {money(route.feesTotalUsd)}</span>
                          <span>ETA: {route.etaMinutes.toFixed(1)} min</span>
                          <span>Final payable: {money(route.feeSummaryUsd + baseAmountUsd)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="status-card">
                <div className="status-title">Hosted checkout</div>
                <p className="meta">{hotPayCheckoutUrl || 'No HOT Pay link configured for this checkout.'}</p>
              </div>
            )}

            <button
              className="pay-btn"
              onClick={onPay}
              disabled={isBusy || (executionMode === 'smart' && (!selectedRoute || routes.length === 0))}
            >
              {isBusy
                ? 'Processing...'
                : executionMode === 'hosted'
                  ? 'Pay with HOT Pay Hosted Checkout'
                  : mode === 'demo'
                    ? 'Pay with Demo Wallet'
                    : 'Pay with Connected Wallet'}
            </button>
          </div>
        </section>

        <section className="panel activity-panel">
          <header>
            <h2>Payment Status</h2>
            <p className="role-note">Customer view status updates.</p>
          </header>
          <div className="status-card">
            <div className="status-title">Status</div>
            <p>{statusMessage}</p>
            <p className={`status-pill ${status === 'success' ? 'ok' : status === 'failed' ? 'bad' : 'warn'}`}>{status}</p>
          </div>
          {lastReceipt ? (
            <div className="status-card">
              <div className="status-title">Confirmation</div>
              <p>Transaction hash: {lastReceipt}</p>
            </div>
          ) : null}
        </section>
      </main>
    </main>
  );
}
