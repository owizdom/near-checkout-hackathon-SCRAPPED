'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigation = [
  { href: '/', label: 'Welcome' },
  { href: '/register', label: 'Register' },
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/checkout', label: 'Checkout' },
];

function isActive(href, pathname) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SiteHeader() {
  const pathname = usePathname();

  if (pathname === '/' || pathname.startsWith('/checkout')) {
    return null;
  }

  return (
    <div className="site-header-shell">
      <div className="site-header">
        <p className="eyebrow">HOT PAY x HOT KIT</p>
        <h1>HOT Pay Smart Checkout</h1>
        <nav className="tabs" aria-label="Primary">
          {navigation.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`tab ${isActive(item.href, pathname) ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
