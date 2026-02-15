const HOT_PAY_HOST = 'https://pay.hot-labs.org/payment';
const HOT_PAY_API = 'https://api.hot-labs.org/partners/processed_payments';

function normalizeAmount(value) {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return '0';
  }

  const compact = parsed.toFixed(6).replace(/\.?0+$/, '');
  return compact;
}

export function buildHotPayCheckoutUrl({
  hotpayItemId,
  amount,
  currency,
  redirectUrl,
  memo,
  memoData,
}) {
  if (!hotpayItemId) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('item_id', hotpayItemId);

  if (amount) {
    params.set('amount', normalizeAmount(amount));
  }
  if (currency) {
    params.set('payment_token', currency);
  }
  if (redirectUrl) {
    params.set('redirect_url', redirectUrl);
  }
  if (memo || memoData) {
    params.set('memo', `${memo || ''}${memo && memoData ? ':' : ''}${memoData || ''}`);
  }

  return `${HOT_PAY_HOST}?${params.toString()}`;
}

export async function fetchProcessedPayments({
  token,
  itemId,
  memo,
  senderId,
  limit = 100,
  offset = 0,
}) {
  const query = new URLSearchParams();
  if (itemId) {
    query.set('item_id', itemId);
  }
  if (memo) {
    query.set('memo', memo);
  }
  if (senderId) {
    query.set('sender_id', senderId);
  }
  if (limit) {
    query.set('limit', String(limit));
  }
  if (offset) {
    query.set('offset', String(offset));
  }

  const queryString = query.toString();
  const url = `${HOT_PAY_API}${queryString ? `?${queryString}` : ''}`;
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token || ''}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HOT Pay API error (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}

export async function testHotPayWebhook(itemId) {
  if (!itemId) {
    throw new Error('Missing HOT Pay item id.');
  }

  const url = `https://api.hot-labs.org/partners/merchant_item/${itemId}/test_webhook`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to test HOT Pay webhook (${response.status}): ${text || response.statusText}`);
  }

  return response.json();
}
