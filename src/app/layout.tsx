/**
 * Root App Router layout configuring typography variables, favicon, and keyboard skip link.
 */

import type { Metadata } from "next";
import {
  Bricolage_Grotesque,
  IBM_Plex_Sans,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-bricolage",
});

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Domino Sky — Indian Flight Disruption & Recovery Simulator",
  description:
    "Interactive 16-airport Indian aviation network simulator with deterministic tail chains, crew legality tracking, surrogate fragility scoring, and zero-hallucination AI dispatch.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable}`}
    >
      <body className="min-h-screen bg-[#FBFCFD] text-[#0F172A] antialiased selection:bg-[#2B79FB]/15 selection:text-[#0F172A]">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-[#1D4ED8] focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:outline-none focus:ring-2 focus:ring-[#2B79FB]"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
