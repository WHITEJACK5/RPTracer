"use client";

import { Activity, Beaker, FileText, LayoutDashboard, Network, Settings, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AvatarList from "@/components/ui/AvatarList";
import { useAnalysts } from "@/hooks/useApi";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/sandbox", label: "Sandbox", icon: Beaker },
  { href: "/dashboard/transactions", label: "Transactions", icon: Activity },
  { href: "/dashboard/graph", label: "Graph", icon: Network },
  { href: "/dashboard/ledger", label: "Ledger", icon: FileText },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

/** Dashboard sidebar shell: navigation rail + active analysts roster. */
export default function Sidebar() {
  const pathname = usePathname();
  const { data: analysts } = useAnalysts();

  return (
    <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-64 shrink-0 flex-col border-r border-border bg-bg-secondary/60 px-4 py-6 lg:flex">
      <nav className="flex flex-col gap-1">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-surface text-text-primary shadow-accent"
                  : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
              )}
            >
              <Icon size={17} className={active ? "text-accent" : ""} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-[var(--radius-md)] border border-border bg-bg-tertiary/60 p-3">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-text-muted">
          <ShieldAlert size={13} className="text-risk-low shrink-0" /> Active Analysts
        </div>
        <AvatarList analysts={analysts ?? []} max={4} />
      </div>
    </aside>
  );
}
