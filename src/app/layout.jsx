import SiteHeader from '../components/site-header';
import RainbowProviders from '../components/rainbow-providers';
import './globals.css';

export const metadata = {
  title: 'HOT Pay Smart Checkout',
  description: 'Cross-chain smart checkout route optimizer for hackathon demo.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <RainbowProviders>{children}</RainbowProviders>
      </body>
    </html>
  );
}
