import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { LanguageProvider } from '../components/LanguageProvider';

export const metadata: Metadata = {
  title: 'Jev Evaluation Lab',
  description: 'Jev-Analysen, Belegsuche und manuelle Auswertung.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="de"><body><LanguageProvider>{children}</LanguageProvider></body></html>;
}
