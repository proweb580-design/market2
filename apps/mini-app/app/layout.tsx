import type { Metadata, Viewport } from 'next';
import { Roboto_Flex } from 'next/font/google';
import { ThemeScript } from '@repo/ui/storefront/theme-script';
import './globals.css';

// Variable width axis gives the wide, heavy grotesk headings of the reference; Cyrillic for RU content.
const font = Roboto_Flex({
  subsets: ['latin', 'cyrillic'],
  axes: ['wdth'],
  variable: '--font-roboto-flex',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Platform', template: '%s' },
  description: 'Brand storefront inside Telegram',
};

// Telegram Mini Apps run in a mobile webview: no pinch-zoom, content under safe areas.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="ru" className={`${font.variable} h-full`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
