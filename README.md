# HOT Pay Cross-Chain Smart Checkout (Next.js)

## What this app does

- Merchant checkout config (amount, settlement token, invoice note)
- Wallet connect flow with one-click wallet connect
- Omni-balance display
- Route quoting and ranking across chains/tokens
- Route strategy selection (`Cheapest`, `Fastest`, `Balanced`)
- One-click `Pay with Connected Wallet`
- Auto fallback if best route fails
- Merchant dashboard with attempts/success/rate/settled/transactions

## Run locally

```bash
cd /Users/Apple/Desktop/hackathon
npm install
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Real wallet balances load from the connected EVM wallet.
- The connect button now uses a simple **Connect Wallet** label.
- HOT PAY integration is added in two layers:
  - `item_id` can be attached to each checkout in the dashboard to generate HOT PAY hosted links (`https://pay.hot-labs.org/payment`).
  - Customers can choose between in-app smart-routing simulation and HOT PAY hosted execution on checkout pages.
- The provider layer currently uses a lightweight EVM connect flow for this environment while keeping a clean place to swap in HOT KIT SDK adapters later.

### RainbowKit-style setup (official)

If you want the official RainbowKit button/modal:

```bash
npm install @rainbow-me/rainbowkit wagmi viem@2.x @tanstack/react-query
```

Then add the providers (`WagmiProvider`, `QueryClientProvider`, `RainbowKitProvider`) and use:

```jsx
import { ConnectButton } from '@rainbow-me/rainbowkit';

<ConnectButton label=\"Connect Wallet\" />
```

This repo currently keeps the same wallet UX for compatibility while using a lightweight connect flow.

## Folder structure

- `src/app/page.jsx` - Full checkout app logic and UI
- `src/app/layout.jsx` - Root layout metadata
- `src/app/globals.css` - Visual styling
- `package.json` - Next scripts/deps

## Hackathon submission

Use this exact route flow for judges:

1. Fill merchant details and invoice.
2. Click `Connect Wallet` and authorize your wallet.
3. Click `Recalculate Routes`.
4. Select one route.
5. Click `Pay in Any Token`.
6. If route fails, system demonstrates fallback route retry.
7. Show dashboard stats + transaction timeline.
