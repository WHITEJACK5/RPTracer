import Header from "@/components/layout/Header";
import Sidebar from "@/components/layout/Sidebar";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/transactions", label: "Transactions" },
  { href: "/dashboard/sandbox", label: "Sandbox" },
  { href: "/dashboard/graph", label: "Graph" },
  { href: "/dashboard/ledger", label: "Ledger" },
  { href: "/dashboard/settings", label: "Settings" },
];

/** Dashboard shell: left sidebar + top header wrapping each dashboard route. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
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
