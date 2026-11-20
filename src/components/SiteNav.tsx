"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Radar } from "lucide-react";

const NAV_ITEMS = [
  { href: "/", label: "Story" },
  { href: "/simulator", label: "Simulator" },
  { href: "/intelligence", label: "Intelligence" },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 flex h-14 w-full items-center justify-between border-b border-[#E2E8F0] bg-[#FFFFFF] px-4 lg:px-8">
      <Link
        href="/"
        className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] rounded-md"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[#E2E8F0] bg-[#F8FAFC]">
          <Radar className="h-4 w-4 text-[#2563EB]" aria-hidden="true" />
        </span>
        <span className="font-display text-base font-bold tracking-tight text-[#0F172A]">
          Domino Sky
        </span>
      </Link>

      <nav aria-label="Primary" className="flex items-center gap-1 sm:gap-2">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] ${
                active
                  ? "bg-[#EFF6FF] text-[#2563EB]"
                  : "text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/simulator"
        className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-3.5 text-xs font-semibold text-white transition-colors duration-150 hover:bg-[#1D4ED8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
      >
        <span>Open Simulator</span>
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </header>
  );
}
