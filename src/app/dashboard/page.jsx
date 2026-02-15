'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  getStoreState,
  getCurrentMerchant,
  removeCheckout,
  upsertCheckout,
  updateCheckoutStatus,
} from '../../lib/hotpay-store';
import { TOKENS, shortAddress } from '../../lib/checkout-engine';
import { buildHotPayCheckoutUrl } from '../../lib/hotpay-adapter';

const PAYMENT_METHODS = Object.values(TOKENS).map((token) => token.symbol);
const NEW_CHECKOUT = {
  id: '',
  name: '',
  description: '',
  priceMode: 'fixed',
  fixedAmount: '24.00',
  variableMin: '5.00',
  variableMax: '120.00',
  acceptedPaymentMethods: ['ETH', 'USDC'],
  redirectUrl: '',
  webhookUrl: '',
  metadataJson: '{}',
  settlementAsset: 'usdc',
  hotpayItemId: '',
  memoPrefix: 'order',
  status: 'active',
};

function safeMoney(value, fallback = '0') {
  return Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
    style: 'currency',
    currency: 'USD',
  });
}

function sanitizeMethods(rawMethods = []) {
  const unique = rawMethods.filter((method, index, all) => all.indexOf(method) === index);
  return unique.length > 0 ? unique : ['ETH'];
}

export default function DashboardPage() {
  const [merchant, setMerchant] = useState(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [form, setForm] = useState(NEW_CHECKOUT);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [editingId, setEditingId] = useState('');
  const [copiedId, setCopiedId] = useState('');

  const isLoggedIn = Boolean(merchant);

  useEffect(() => {
    const current = getCurrentMerchant();
    if (current) {
      setMerchant(current);
    }

    setBaseUrl(window.location.origin);
    const state = getStoreState();
    const active = state.merchants.find((item) => item.id === state.currentMerchantId) || null;
    if (active) {
      setMerchant(active);
    }
  }, []);

  const transactions = merchant?.transactions || [];
  const checkouts = merchant?.checkouts || [];

  const totalPayments = transactions.length;
  const successful = transactions.filter((item) => item.status === 'confirmed' || item.status === 'success').length;
  const pending = transactions.filter((item) => item.status === 'pending').length;
  const failed = transactions.filter((item) => item.status === 'failed').length;
  const activeCheckoutLinks = checkouts.filter((item) => item.status === 'active').length;

  const kpi = [
    { label: 'Total Payments', value: totalPayments },
    { label: 'Success', value: successful },
    { label: 'Pending', value: pending },
    { label: 'Failed', value: failed },
    { label: 'Active Checkout Links', value: activeCheckoutLinks },
  ];

  const filteredTransactions = useMemo(() => {
    if (historyFilter === 'all') {
      return transactions;
    }
    return transactions.filter((item) => item.checkoutId === historyFilter);
  }, [historyFilter, transactions]);

  const checkoutLink = (id) => `${baseUrl}/checkout/${id}`;

  const merchantShort = useMemo(() => shortAddress(merchant?.walletAddress || ''), [merchant]);

  const onCheckoutFieldChange = (event) => {
    const { name, value, checked, type } = event.target;

    if (type === 'checkbox') {
      const currentMethods = form.acceptedPaymentMethods.includes(value)
        ? form.acceptedPaymentMethods.filter((method) => method !== value)
        : [...form.acceptedPaymentMethods, value];

      setForm((current) => ({
        ...current,
        acceptedPaymentMethods: currentMethods,
      }));
      return;
    }

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const onResetForm = () => {
    setForm(NEW_CHECKOUT);
    setEditingId('');
    setHistoryFilter('all');
  };

  const onSaveCheckout = () => {
    if (!merchant) {
      return;
    }

    if (!form.name.trim()) {
      alert('Add a product name.');
      return;
    }

    const amountMode = form.priceMode === 'fixed' ? 'fixed' : 'variable';
    const fixedAmount =
      amountMode === 'fixed' ? Number(form.fixedAmount) : Number(form.variableMin);
    if (!Number.isFinite(fixedAmount) || Number(form.fixedAmount) < 0.5) {
      alert('Set a valid amount.');
      return;
    }

    const payload = {
      ...form,
      priceMode: amountMode,
      id: editingId || '',
      acceptedPaymentMethods: sanitizeMethods(form.acceptedPaymentMethods),
      fixedAmount: amountMode === 'fixed' ? Number(form.fixedAmount).toFixed(2) : null,
      variableMin: amountMode === 'variable' ? Number(form.variableMin).toFixed(2) : null,
      variableMax: amountMode === 'variable' ? Number(form.variableMax).toFixed(2) : null,
      settlementAsset: form.settlementAsset || 'usdc',
      hotpayItemId: form.hotpayItemId?.trim() || '',
      memoPrefix: form.memoPrefix?.trim() || '',
      updatedAt: new Date().toISOString(),
    };

    upsertCheckout(merchant.id, payload);
    setMerchant(getCurrentMerchant(getStoreState()));
    onResetForm();
  };

  const onEditCheckout = (item) => {
    setEditingId(item.id);
    setForm({
      id: item.id,
      name: item.name || '',
      description: item.description || '',
      priceMode: item.priceMode || 'fixed',
      fixedAmount: Number(item.fixedAmount || 0).toFixed(2),
      variableMin: Number(item.variableMin || 0).toFixed(2),
      variableMax: Number(item.variableMax || 0).toFixed(2),
      acceptedPaymentMethods: Array.isArray(item.acceptedPaymentMethods)
        ? item.acceptedPaymentMethods
        : ['ETH', 'USDC'],
      redirectUrl: item.redirectUrl || '',
      webhookUrl: item.webhookUrl || '',
      metadataJson: item.metadataJson || '{}',
      settlementAsset: item.settlementAsset || 'usdc',
      hotpayItemId: item.hotpayItemId || '',
      memoPrefix: item.memoPrefix || 'order',
      status: item.status || 'active',
    });

    setHistoryFilter(item.id);
  };

  const onDeleteCheckout = (id) => {
    if (!merchant || !window.confirm('Delete this checkout page?')) {
      return;
    }

    const { removed } = removeCheckout(merchant.id, id);
    if (removed) {
      setMerchant(getCurrentMerchant(getStoreState()));
      if (editingId === id) {
        onResetForm();
      }
      if (historyFilter === id) {
        setHistoryFilter('all');
      }
    }
  };

  const onToggleStatus = (id, nextStatus) => {
    if (!merchant) {
      return;
    }

    updateCheckoutStatus(merchant.id, id, nextStatus);
    setMerchant(getCurrentMerchant(getStoreState()));
  };

  const getCheckoutLinks = (item) => {
    const amount = item.priceMode === 'fixed' ? item.fixedAmount : item.variableMin;
    return {
      app: checkoutLink(item.id),
      hotpay: buildHotPayCheckoutUrl({
        hotpayItemId: item.hotpayItemId,
        amount,
        currency: (item.settlementAsset || 'USDC').toUpperCase(),
        redirectUrl: item.redirectUrl,
        memoData: `${item.memoPrefix || 'order'}-${item.id}`,
      }),
    };
  };

  const onCopyCheckoutLink = async (label, value) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(label);
      setTimeout(() => setCopiedId(''), 1200);
    } catch {
      setCopiedId('error');
      setTimeout(() => setCopiedId(''), 1200);
    }
  };

  if (!isLoggedIn) {
    return (
      <main className="app-shell">
        <header className="hero">
          <h1>Merchant Dashboard</h1>
          <p>Register your wallet first to create checkout pages and see live transaction history.</p>
        </header>

        <section className="panel">
          <header>
            <h2>No Merchant Session</h2>
            <p className="role-note">Your browser has no active merchant identity yet.</p>
          </header>
          <Link href="/register" className="action-primary" style={{ width: 'auto' }}>
            Register as Merchant
          </Link>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <h1>Merchant Dashboard</h1>
        <p>{merchant.name} · Wallet {merchantShort}</p>
      </header>

      <main className="dashboard-layout">
        <section className="panel">
          <header>
            <h2>Account Overview</h2>
            <p className="role-note">Real-time view from local session storage for hackathon demo.</p>
          </header>
          <div className="kpi-grid">
            {kpi.map((item) => (
              <article className="kpi" key={item.label}>
                <h3>{item.label}</h3>
                <p>{item.value}</p>
              </article>
            ))}
          </div>

          <div className="status-card">
            <div className="status-title">Transaction Stats</div>
            <p>Total settled (demo): {safeMoney(merchant.totalSettledUsd || 0)}</p>
            <p>Total checkouts: {checkouts.length}</p>
            <p>Wallet: {merchant.walletAddress}</p>
          </div>
        </section>

        <section className="panel">
          <header>
            <h2>{editingId ? 'Edit Checkout Page' : 'Create New Checkout Page'}</h2>
            <p className="role-note">Set product, pricing and accepted payment methods.</p>
          </header>

          <div className="form-grid">
            <div className="field-group">
              <label>Product / service name</label>
              <input name="name" value={form.name} onChange={onCheckoutFieldChange} />
            </div>
            <div className="field-group">
              <label>Description</label>
              <input name="description" value={form.description} onChange={onCheckoutFieldChange} />
            </div>

            <div className="field-group">
              <label>Price mode</label>
              <select name="priceMode" value={form.priceMode} onChange={onCheckoutFieldChange}>
                <option value="fixed">Fixed amount</option>
                <option value="variable">Optional variable amount</option>
              </select>
            </div>

            {form.priceMode === 'fixed' ? (
              <div className="field-group">
                <label>Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.5"
                  name="fixedAmount"
                  value={form.fixedAmount}
                  onChange={onCheckoutFieldChange}
                />
              </div>
            ) : (
              <>
                <div className="field-group">
                  <label>Minimum Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.5"
                    name="variableMin"
                    value={form.variableMin}
                    onChange={onCheckoutFieldChange}
                  />
                </div>
                <div className="field-group">
                  <label>Maximum Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.5"
                    name="variableMax"
                    value={form.variableMax}
                    onChange={onCheckoutFieldChange}
                  />
                </div>
              </>
            )}

            <div className="field-group">
              <label>Accepted payment methods</label>
              <div className="checkbox-grid">
                {PAYMENT_METHODS.map((method) => (
                  <label key={method} className="label-inline">
                    <input
                      type="checkbox"
                      value={method}
                      checked={form.acceptedPaymentMethods.includes(method)}
                      onChange={onCheckoutFieldChange}
                    />
                    {method}
                  </label>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label>Settlement token</label>
              <select name="settlementAsset" value={form.settlementAsset} onChange={onCheckoutFieldChange}>
                <option value="usdc">USDC</option>
                <option value="usdt">USDT</option>
                <option value="eth">ETH</option>
              </select>
            </div>

            <div className="field-group">
              <label>HOT PAY item ID (optional)</label>
              <input
                name="hotpayItemId"
                value={form.hotpayItemId}
                onChange={onCheckoutFieldChange}
                placeholder="Paste HOT Pay item_id for live checkout URL"
              />
              <small>
                If set, customers can pay through HOT Pay directly from this page.
              </small>
            </div>

            <div className="field-group">
              <label>HOT PAY memo prefix (optional)</label>
              <input
                name="memoPrefix"
                value={form.memoPrefix}
                onChange={onCheckoutFieldChange}
                placeholder="order"
              />
            </div>

            <div className="field-group">
              <label>Redirect URL</label>
              <input
                name="redirectUrl"
                value={form.redirectUrl}
                onChange={onCheckoutFieldChange}
                placeholder="https://example.com/thank-you"
              />
            </div>

            <div className="field-group">
              <label>Webhook URL</label>
              <input
                name="webhookUrl"
                value={form.webhookUrl}
                onChange={onCheckoutFieldChange}
                placeholder="https://example.com/webhook"
              />
            </div>

            <div className="field-group">
              <label>Metadata (JSON)</label>
              <input name="metadataJson" value={form.metadataJson} onChange={onCheckoutFieldChange} />
            </div>
          </div>

          <div className="action-row">
            <button className="rainbow-btn" onClick={onSaveCheckout}>
              {editingId ? 'Update Checkout Page' : 'Create Checkout Page'}
            </button>
            <button onClick={onResetForm}>Reset</button>
          </div>
        </section>
      </main>

      <section className="panel">
        <header>
          <h2>Checkout Pages</h2>
          <p className="role-note">Manage all active and inactive links.</p>
        </header>

        <div className="checkout-list">
          {checkouts.length === 0 ? (
            <p className="status-card">No checkouts yet. Create one above.</p>
          ) : (
            checkouts.map((item) => {
              const links = getCheckoutLinks(item);
              const isActive = item.status === 'active';
              return (
                <article className="panel-mini" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <p className="meta">{item.description || 'No description'}</p>
                    <p className="meta">Methods: {(item.acceptedPaymentMethods || []).join(', ') || 'ETH'}</p>
                    <p className="meta">Settlement: {item.settlementAsset?.toUpperCase() || 'USDC'}</p>
                    <p className="meta">HOT Pay item: {item.hotpayItemId ? 'linked' : 'not linked'}</p>
                    <p className="meta">Amount: {item.priceMode === 'fixed' ? `$${Number(item.fixedAmount || 0).toFixed(2)}` : `Between $${Number(item.variableMin || 0).toFixed(2)} and $${Number(item.variableMax || 0).toFixed(2)}`}</p>
                  </div>

                  <div className="status-row">
                    <p className={`status-pill ${isActive ? 'ok' : 'warn'}`}>
                      {item.status || 'inactive'}
                    </p>
                    <div className="checkout-link-wrap">
                      <input value={links.app} readOnly />
                      <button onClick={() => onCopyCheckoutLink(`app:${item.id}`, links.app)} className="small">
                        {copiedId === `app:${item.id}` ? 'Copied' : copiedId === 'error' ? 'Copy failed' : 'Copy App'}
                      </button>
                    </div>
                    {item.hotpayItemId ? (
                      <div className="checkout-link-wrap">
                        <input value={links.hotpay} readOnly />
                        <button
                          onClick={() => onCopyCheckoutLink(`hotpay:${item.id}`, links.hotpay)}
                          className="small"
                        >
                          {copiedId === `hotpay:${item.id}` ? 'Copied' : copiedId === 'error' ? 'Copy failed' : 'Copy HOT Pay'}
                        </button>
                      </div>
                    ) : (
                      <div className="meta">
                        Add a HOT Pay item ID to enable hosted routing and settlement.
                      </div>
                    )}

                    <img
                      alt="QR code"
                      className="qr-thumb"
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(links.app)}`}
                    />

                    <div className="action-row">
                      <button onClick={() => onEditCheckout(item)}>Edit</button>
                      <button onClick={() => onToggleStatus(item.id, isActive ? 'inactive' : 'active')}>
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => onDeleteCheckout(item.id)}>Delete</button>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>

      <section className="panel activity-panel">
        <header>
          <h2>Transaction History</h2>
          <p className="role-note">Filter per checkout page to monitor conversion and settlement status.</p>
        </header>

        <div className="field-group">
          <label>Filter by checkout</label>
          <select value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)}>
            <option value="all">All checkout pages</option>
            {checkouts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.id})
              </option>
            ))}
          </select>
        </div>

        <ol className="tx-list">
          {filteredTransactions.length === 0 ? (
            <li className="tx">No transactions yet for this view.</li>
          ) : (
            filteredTransactions.slice(0, 40).map((tx) => {
              const statusClass =
                tx.status === 'confirmed' || tx.status === 'success' ? 'ok' : tx.status === 'failed' ? 'bad' : 'warn';
              const checkout = checkouts.find((item) => item.id === tx.checkoutId);
              return (
                <li className="tx" key={tx.id}>
                  <div>
                    <strong>{tx.id}</strong>
                    <span className={`status-pill ${statusClass}`}>{tx.status}</span>
                  </div>
                  <div className="meta">Checkout: {checkout?.name || tx.checkoutId}</div>
                  <div className="meta">
                    Amount: {safeMoney(tx.amountUsd)} · Payer: {shortAddress(tx.customerWallet || '')}
                  </div>
                  <div className="meta">Tx hash: {tx.txHash || 'pending'}</div>
                </li>
              );
            })
          )}
        </ol>
      </section>
    </div>
  );
}
