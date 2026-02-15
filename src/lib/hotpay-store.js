const STORAGE_KEY = 'hotpay-smart-checkout-v1';

const STORAGE_TTL_MS = 1000 * 60 * 60 * 24 * 180;

const DEFAULT_STATE = {
  version: 1,
  currentMerchantId: null,
  merchants: [],
};

function read() {
  if (typeof window === 'undefined') {
    return structuredClone(DEFAULT_STATE);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return structuredClone(DEFAULT_STATE);
    }

    const parsed = JSON.parse(raw);
    const state = {
      version: parsed.version || 1,
      currentMerchantId: parsed.currentMerchantId || null,
      merchants: Array.isArray(parsed.merchants) ? parsed.merchants : [],
    };

    const now = Date.now();
    state.merchants = state.merchants
      .map((merchant) => ({
        ...merchant,
        checkouts: Array.isArray(merchant.checkouts) ? merchant.checkouts : [],
        transactions: Array.isArray(merchant.transactions) ? merchant.transactions : [],
      }))
      .filter((merchant) => now - merchant.updatedAt < STORAGE_TTL_MS);

    return state;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function write(state) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeWalletAddress(address = '') {
  return (address || '').toLowerCase();
}

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.floor(Math.random() * 99999)
    .toString(36)
    .padStart(4, '0')}`;
}

function shortAddress(address = '') {
  if (!address || address.length < 10) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getStoreState() {
  return read();
}

export function saveStoreState(state) {
  write({
    ...DEFAULT_STATE,
    ...state,
    merchants: Array.isArray(state.merchants) ? state.merchants : [],
    currentMerchantId: state.currentMerchantId || null,
    version: 1,
  });
}

export function getCurrentMerchant(state = read()) {
  return state.merchants.find((merchant) => merchant.id === state.currentMerchantId) || null;
}

export function getMerchantByWalletAddress(address, state = read()) {
  const target = normalizeWalletAddress(address);
  return state.merchants.find((merchant) => normalizeWalletAddress(merchant.walletAddress) === target) || null;
}

export function getCheckoutById(checkoutId, state = read()) {
  for (const merchant of state.merchants) {
    const checkout = merchant.checkouts.find((item) => item.id === checkoutId);
    if (checkout) {
      return { checkout, merchant };
    }
  }

  return null;
}

export function setActiveMerchantByWallet(address, profile = {}) {
  const state = read();
  const normalized = normalizeWalletAddress(address);
  let merchant = getMerchantByWalletAddress(normalized, state);

  if (!merchant) {
    merchant = {
      id: randomId('m'),
      walletAddress: normalized,
      name: profile.name || `Merchant ${shortAddress(normalized)}`,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
      status: 'active',
      checkouts: [],
      transactions: [],
      metadata: {
        registerReferral: profile.referral || '',
      },
    };

    state.merchants.push(merchant);
  }

  merchant.updatedAt = Date.now();
  if (profile.name) {
    merchant.name = profile.name;
  }
  state.currentMerchantId = merchant.id;
  write(state);

  return { state, merchant };
}

export function clearActiveMerchant() {
  const state = read();
  state.currentMerchantId = null;
  write(state);
}

export function upsertCheckout(merchantId, checkoutInput) {
  const state = read();
  const merchant = state.merchants.find((item) => item.id === merchantId);

  if (!merchant) {
    return { state, checkout: null };
  }

  const now = new Date().toISOString();
  const clean = {
    ...checkoutInput,
    id: checkoutInput.id || randomId('chk'),
    createdAt: checkoutInput.createdAt || now,
    updatedAt: now,
    status: checkoutInput.status || 'active',
    name: checkoutInput.name || 'Untitled checkout',
    settlementAsset: checkoutInput.settlementAsset || 'usdc',
    acceptedPaymentMethods: Array.isArray(checkoutInput.acceptedPaymentMethods)
      ? checkoutInput.acceptedPaymentMethods
      : ['ETH', 'USDC'],
  };

  const existingIndex = merchant.checkouts.findIndex((item) => item.id === clean.id);
  if (existingIndex >= 0) {
    merchant.checkouts[existingIndex] = {
      ...merchant.checkouts[existingIndex],
      ...clean,
      id: merchant.checkouts[existingIndex].id,
    };
  } else {
    merchant.checkouts.unshift(clean);
  }

  merchant.updatedAt = Date.now();
  state.currentMerchantId = merchantId;
  write(state);
  const checkout = merchant.checkouts.find((item) => item.id === clean.id) || null;
  return { state, checkout };
}

export function updateCheckoutStatus(merchantId, checkoutId, status) {
  const state = read();
  const merchant = state.merchants.find((item) => item.id === merchantId);
  if (!merchant) {
    return { state, checkout: null };
  }

  const checkout = merchant.checkouts.find((item) => item.id === checkoutId);
  if (!checkout) {
    return { state, checkout: null };
  }

  checkout.status = status;
  checkout.updatedAt = new Date().toISOString();
  write(state);
  return { state, checkout };
}

export function removeCheckout(merchantId, checkoutId) {
  const state = read();
  const merchant = state.merchants.find((item) => item.id === merchantId);
  if (!merchant) {
    return { state, removed: false };
  }

  const before = merchant.checkouts.length;
  merchant.checkouts = merchant.checkouts.filter((item) => item.id !== checkoutId);
  merchant.transactions = merchant.transactions.filter((txn) => txn.checkoutId !== checkoutId);
  const removed = merchant.checkouts.length < before;

  write(state);
  return { state, removed };
}

export function addTransaction(merchantId, checkoutId, transaction) {
  const state = read();
  const merchant = state.merchants.find((item) => item.id === merchantId);
  if (!merchant) {
    return null;
  }

  const normalizedTransaction = {
    id: transaction.id || randomId('tx'),
    checkoutId,
    createdAt: new Date().toISOString(),
    status: transaction.status || 'pending',
    ...transaction,
  };

  merchant.transactions.unshift(normalizedTransaction);
  merchant.transactions = merchant.transactions.slice(0, 500);
  merchant.updatedAt = Date.now();
  write(state);

  return normalizedTransaction;
}

export function updateTransaction(merchantId, checkoutId, txId, patch) {
  const state = read();
  const merchant = state.merchants.find((item) => item.id === merchantId);
  if (!merchant) {
    return null;
  }

  const tx = merchant.transactions.find((item) => item.id === txId && item.checkoutId === checkoutId);
  if (!tx) {
    return null;
  }

  Object.assign(tx, patch);
  merchant.updatedAt = Date.now();
  write(state);
  return tx;
}

export default {
  getStoreState,
  saveStoreState,
  getCurrentMerchant,
  getMerchantByWalletAddress,
  getCheckoutById,
  setActiveMerchantByWallet,
  clearActiveMerchant,
  upsertCheckout,
  updateCheckoutStatus,
  removeCheckout,
  addTransaction,
  updateTransaction,
};

