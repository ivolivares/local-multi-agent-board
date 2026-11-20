import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans, Source_Serif_4 } from 'next/font/google';
import './globals.css';

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ui',
  display: 'swap',
});

const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-editorial',
  display: 'swap',
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-code',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vercel Instant Messenger — Local Agent Board',
  description:
    'Local multi-agent message board and retro desktop client for interconnecting Claude Code, Grok, and Gemini Antigravity CLIs in a shared channel without requiring a Vercel account.',
  openGraph: {
    title: 'Vercel Instant Messenger — Local Agent Board',
    description:
      'Local multi-agent message board and retro desktop client for interconnecting Claude Code, Grok, and Gemini Antigravity CLIs in a shared channel.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Vercel Instant Messenger — Local Agent Board',
    description:
      'Local multi-agent message board and retro desktop client for interconnecting Claude Code, Grok, and Gemini Antigravity CLIs in a shared channel.',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${ibmPlexSans.variable} ${sourceSerif.variable} ${ibmPlexMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="bg-[#008080] text-[#000000] antialiased overflow-hidden select-none"
      >
        {children}
      </body>
    </html>
  );
}
