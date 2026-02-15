'use client';

import Link from 'next/link';
import { useState } from 'react';

const faqs = [
  {
    question: 'What is HOT Pay Smart Checkout?',
    answer:
      'A customer-focused payment cockpit for merchants that can route and optimize crypto payments across chains before settling into a single settlement token.',
  },
  {
    question: 'Can customers try it without a wallet first?',
    answer:
      'Yes. Use Demo mode in Smart Checkout to explore route logic, balances, and checkout behavior with test data before asking for real wallet signatures.',
  },
  {
    question: 'How does mainnet mode work?',
    answer:
      'Mainnet mode connects your wallet and pulls live balances so route discovery and settlement reflect real network state. You can still compare cheapest/fastest/balanced routing.',
  },
  {
    question: 'Where do I see conversion and settlement results?',
    answer:
      'Open the Dashboard to review attempts, success rate, settlement totals, and recent transactions from the same session.',
  },
];

export default function Home() {
  const [spotlight, setSpotlight] = useState({ x: 50, y: 50, active: false });
  const onMove = (event) => {
    setSpotlight({
      x: event.clientX,
      y: event.clientY,
      active: true,
    });
  };

  return (
    <div
      className={`welcome-shell ${spotlight.active ? 'light-on' : ''}`}
      onMouseMove={onMove}
      onMouseLeave={() => setSpotlight((current) => ({ ...current, active: false }))}
    >
      <div className="welcome-spotlight" style={{ '--spot-x': `${spotlight.x}px`, '--spot-y': `${spotlight.y}px` }} />

      <main className="welcome-main">
        <header className="hero welcome-hero">
          <p className="eyebrow">HOT PAY x HOT KIT</p>
          <h1>Welcome to Smart Checkout</h1>
          <p className="welcome-copy">
            Pick a route style your customer trusts, then let the platform optimize where, how, and when settlements happen.
          </p>
          <div className="action-row welcome-actions">
            <Link className="action-primary" href="/register">
              Register as a Merchant
            </Link>
          </div>
        </header>

        <section className="welcome-faq panel">
          <h2 className="welcome-faq-title">Frequently Asked Questions</h2>
          <div className="faq-list">
            {faqs.map((faq) => (
              <details className="faq-item" key={faq.question}>
                <summary>{faq.question}</summary>
                <p className="faq-answer">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
