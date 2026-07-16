"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import {
  LayoutDashboard, TrendingUp, Wallet, FileText, FolderKanban, Users, LogOut,
} from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/income",    label: "Income",    icon: TrendingUp },
  { href: "/expenses",  label: "Expenses",  icon: Wallet },
  { href: "/invoices",  label: "Invoices",  icon: FileText },
  { href: "/projects",  label: "Projects",  icon: FolderKanban },
  { href: "/clients",   label: "Clients",   icon: Users },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const signOut = async () => {
    await supabaseBrowser().auth.signOut();
    location.href = "/login";
  };
  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] max-md:grid-cols-1">
      <aside className="border-r border-line bg-panel p-4 flex flex-col
                        max-md:flex-row max-md:items-center max-md:gap-2 max-md:overflow-x-auto">
        <div className="px-2 py-3 max-md:py-1">
          <div className="text-xl font-semibold tracking-tight">Ledger</div>
          <div className="eyebrow max-md:hidden">Your full name</div>
        </div>
        <nav className="mt-4 flex-1 space-y-1 max-md:mt-0 max-md:flex max-md:space-y-0 max-md:gap-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                  active ? "bg-ink text-paper" : "text-ink/70 hover:bg-line/50"}`}>
                <Icon size={17} /> <span className="max-md:hidden">{label}</span>
              </Link>
            );
          })}
        </nav>
        <button onClick={signOut}
          className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-muted hover:text-outflow transition">
          <LogOut size={17} /> <span className="max-md:hidden">Sign out</span>
        </button>
      </aside>
      <main className="p-6 md:p-10 max-w-6xl w-full">{children}</main>
    </div>
  );
}
