'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { getCurrentMerchant } from '../../lib/hotpay-store';

export default function CheckoutIndexPage() {
  const merchant = useMemo(() => getCurrentMerchant(), []);
  const checkouts = merchant?.checkouts || [];
  const active = checkouts.filter((item) => item.status === 'active');

  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">HOT PAY x HOT KIT</p>
        <h1>Smart Checkout Links</h1>
        <p>Open a shareable checkout link to start a real customer payment flow.</p>
      </header>

      <section className="panel">
        <header>
          <h2>Available public links</h2>
          <p className="role-note">
            Merchant flow uses routes like <code>/checkout/&lt;checkout-id&gt;</code>.
          </p>
        </header>

        {active.length === 0 ? (
          <p>No active checkout links yet. {merchant ? 'Create one in dashboard.' : 'Register as a merchant first.'}</p>
        ) : (
          <ol className="tx-list">
            {active.map((item) => (
              <li className="tx" key={item.id}>
                <strong>{item.name || item.id}</strong>
                <div className="meta">
                  <Link href={`/checkout/${item.id}`} className="action-secondary">
                    Open public checkout
                  </Link>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="action-row">
          <Link href={merchant ? '/dashboard' : '/register'} className="action-primary">
            {merchant ? 'Go to Dashboard' : 'Register as a Merchant'}
          </Link>
        </div>
      </section>
    </main>
  );
}

