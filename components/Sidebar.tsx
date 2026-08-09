"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  Activity,
  Calculator,
  TrendingDown,
  Scissors,
  Receipt,
  BookOpen,
  CandlestickChart,
  Repeat,
  ClipboardList,
  BarChart3,
  Flame,
  Sparkles,
  Wallet,
  Sunrise,
  Target,
  Home,
  ListChecks,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/action", label: "Action Board", icon: ListChecks },
  { href: "/indices", label: "Indices", icon: BarChart3 },
  { href: "/active", label: "Most Active", icon: Flame },
  { href: "/intraday", label: "Intraday Assistant", icon: Calculator },
  { href: "/positions", label: "Positions", icon: Activity },
  { href: "/holdings", label: "Holdings", icon: Briefcase },
  { href: "/funds", label: "Mutual Funds", icon: Wallet },
  { href: "/averaging", label: "Dip Buying", icon: TrendingDown },
  { href: "/scalping", label: "Scalping", icon: Scissors },
  { href: "/btst", label: "BTST", icon: Sunrise },
  { href: "/review", label: "Review", icon: ClipboardList },
  { href: "/rotation", label: "Sectoral Rotation", icon: Repeat },
  { href: "/brokerage", label: "Brokerage", icon: Receipt },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/style", label: "Trading Style", icon: Sparkles },
  { href: "/plan", label: "5-Year Plan", icon: Target },
  { href: "/property", label: "Property vs Stocks", icon: Home },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-surface">
        <div className="flex items-center gap-2 px-5 h-16 border-b border-border">
          <CandlestickChart className="w-5 h-5 text-accent" />
          <span className="font-semibold tracking-tight">TradeDesk</span>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent/10 text-accent font-medium"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-card"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] text-zinc-600 border-t border-border">
          Informational only — not investment advice.
        </div>
      </aside>

      {/* Mobile bottom nav — scrollable, safe-area aware (iPhone home bar) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-surface/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex overflow-x-auto py-2 px-1" style={{ WebkitOverflowScrolling: "touch" }}>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] shrink-0 min-w-[64px] ${
                  active ? "text-accent" : "text-zinc-500"
                }`}
              >
                <Icon className="w-5 h-5" />
                {label.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
