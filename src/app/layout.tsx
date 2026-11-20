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
  title: "Domino Sky — Airline OCC Disruption Simulator",
  description:
    "Interactive 16-airport Indian airline operations control simulator with deterministic delay cascades, crew legality tracking, and zero-hallucination AI recovery dispatch.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${ibmPlexSans.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-[#090D12] text-[#F1F5F9] antialiased selection:bg-amber-500/30 selection:text-[#F1F5F9]">
        {children}
      </body>
    </html>
  );
}
