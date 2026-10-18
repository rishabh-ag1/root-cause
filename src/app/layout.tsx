import type { Metadata, Viewport } from 'next';
import Nav from '@/components/Nav';
import Analytics from '@/components/Analytics';
import './globals.css';
import './game.css';

const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: 'Root Cause: the daily business case',
  description: 'One business mystery a day. Open as few evidence files as you can, name the root cause, and see where you rank.',
  openGraph: { type: 'website', siteName: 'Root Cause' },
  twitter: { card: 'summary_large_image' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#e6dfcf' },
    { media: '(prefers-color-scheme: dark)', color: '#151816' },
  ],
};

// Applies a saved theme before paint so there's no flash.
const themeScript = `try{var t=localStorage.getItem('rc-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Nav />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
