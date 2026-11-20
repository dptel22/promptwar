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
      <body className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-[#2563EB]/15 selection:text-[#0F172A]">
        {children}
      </body>
    </html>
  );
}
