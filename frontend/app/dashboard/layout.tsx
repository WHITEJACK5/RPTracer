"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";
import Loader from "@/components/ui/Loader";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/sandbox", label: "Sandbox" },
  { href: "/dashboard/graph", label: "Graph" },
  { href: "/dashboard/ledger", label: "Ledger" },
  { href: "/dashboard/settings", label: "Settings" },
];

/** Dashboard shell: left sidebar + top header wrapping each dashboard route.
 * Simulated auth guard — checks localStorage flag set by /login. Keeps the
 * "simulated auth for demo" disclosure honest: no real session, but the flow
 * is real (direct /dashboard access redirects to /login).
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      const ok = !!localStorage.getItem("tracer.session");
      if (!ok) router.replace("/login");
      else setAuthed(true);
    } catch {
      setAuthed(true);
    }
  }, [router]);

  if (authed !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-primary">
        <Loader label="checking session…" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header links={LINKS} />
        <main className="flex-1 px-5 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
