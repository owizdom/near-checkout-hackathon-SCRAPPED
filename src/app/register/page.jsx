'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from '../../components/rainbow-providers';
import { setActiveMerchantByWallet } from '../../lib/hotpay-store';

export default function RegisterPage() {
  const router = useRouter();
  const { isConnected, address } = useAccount();
  const [wallet, setWallet] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (!isConnected || !address) {
      setWallet('');
      return;
    }

    setWallet(address);
  }, [isConnected, address]);

  const onProceed = async () => {
    if (!isConnected || !address) {
      return;
    }

    setIsRegistering(true);
    setError('');

    try {
      const { merchant } = setActiveMerchantByWallet(address, {
        name: fullName.trim() || 'Merchant',
      });
      setWallet(merchant.walletAddress);
      setFullName(merchant.name);
      router.push('/dashboard');
    } catch (err) {
      setError(err?.message || 'Could not register wallet in local session.');
    } finally {
      setIsRegistering(false);
    }
  };

  const isReady = Boolean(wallet);

  return (
    <main className="app-shell">
      <header className="hero">
        <h1>Register Merchant Wallet</h1>
        <p>Sign in with your wallet to access merchant checkout management and shareable payment links.</p>
      </header>

      <section className="panel role-panel">
        <header>
          <h2>Wallet Sign-In</h2>
          <p className="role-note">This is your merchant identity for creating and managing checkout pages.</p>
        </header>

        <div className="form-grid">
          <div className="field-group">
            <label>Full name</label>
            <input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your brand or store name"
            />
          </div>

          <div className="field-group">
            <label>Wallet Address</label>
            <input value={wallet} readOnly placeholder="Connect wallet first" />
          </div>

          <div className="action-row">
            <ConnectButton label="Connect Wallet" showBalance={false} />
            <button onClick={onProceed} disabled={!isReady || isRegistering}>
              Continue to Dashboard
            </button>
          </div>
        </div>

        {error ? <p className="status-card">{error}</p> : null}
      </section>

      <section className="panel">
        <p>
          <Link href="/" className="action-secondary">
            ← Back to welcome
          </Link>
        </p>
      </section>
    </main>
  );
}
