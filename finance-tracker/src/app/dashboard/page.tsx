import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import { inr, finYear, finYearMonths, monthLabel, monthKey } from "@/lib/format";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Wallet, Hourglass } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const supabase = supabaseServer();
  const fy = finYear();
  const months = finYearMonths();
  const thisMonth = monthKey();

  const { data: rows } = await supabase
    .from("v_monthly").select("*").order("month");

  const byMonth = new Map((rows ?? []).map((r: any) => [r.month, r]));
  const fyRows = months.map(m => byMonth.get(m) ?? { month: m, expected_in: 0, received_in: 0, expenses: 0, in_hand: 0 });

  const sum = (k: string) => fyRows.reduce((s, r: any) => s + Number(r[k] || 0), 0);
  const earnedYr = sum("received_in");
  const expensesYr = sum("expenses");
  const expectedYr = sum("expected_in");
  const inHandYr = earnedYr - expensesYr;
  const pendingYr = expectedYr - earnedYr;   // expected but not yet received

  const cur = byMonth.get(thisMonth) ?? { received_in: 0, expenses: 0, in_hand: 0, expected_in: 0 };
  const maxAbs = Math.max(1, ...fyRows.map((r: any) => Math.max(Number(r.received_in), Number(r.expenses))));

  return (
    <Shell>
      <header className="flex items-end justify-between mb-8">
        <div>
          <div className="eyebrow mb-1">FY {fy} · cash flow</div>
          <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <Link href="/income" className="rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium">
          Manage income
        </Link>
      </header>

      <section className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <Stat label="This month in-hand" value={inr(Number(cur.received_in) - Number(cur.expenses))}
          hint={`${inr(cur.received_in)} in · ${inr(cur.expenses)} out`}
          tone={Number(cur.received_in) - Number(cur.expenses) >= 0 ? "income" : "outflow"}
          icon={<Wallet size={16} />} />
        <Stat label="Earned this FY" value={inr(earnedYr)} hint="Received so far"
          tone="income" icon={<ArrowDownLeft size={16} />} />
        <Stat label="Expenses this FY" value={inr(expensesYr)} hint="All buckets"
          tone="outflow" icon={<ArrowUpRight size={16} />} />
        <Stat label="Pending" value={inr(pendingYr)} hint="Expected, not yet received"
          tone="warn" icon={<Hourglass size={16} />} />
      </section>

      <section className="card p-6 mt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="eyebrow">Monthly in vs out — FY {fy}</div>
          <div className="flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-income inline-block" /> received</span>
            <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-outflow inline-block" /> expenses</span>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-2 items-end h-44 max-sm:hidden">
          {fyRows.map((r: any) => {
            const inH = (Number(r.received_in) / maxAbs) * 100;
            const outH = (Number(r.expenses) / maxAbs) * 100;
            const isNow = r.month === thisMonth;
            return (
              <div key={r.month} className="flex flex-col items-center gap-1 h-full justify-end">
                <div className="flex items-end gap-0.5 h-full">
                  <div className="w-2.5 rounded-t bg-income" style={{ height: `${inH}%` }} title={inr(r.received_in)} />
                  <div className="w-2.5 rounded-t bg-outflow" style={{ height: `${outH}%` }} title={inr(r.expenses)} />
                </div>
                <span className={`text-[10px] ${isNow ? "text-ink font-medium" : "text-muted"}`}>
                  {monthLabel(r.month).split(" ")[0]}
                </span>
              </div>
            );
          })}
        </div>
        <div className="hairline my-4" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Net in-hand this FY</span>
          <span className={`tnum text-lg font-semibold ${inHandYr >= 0 ? "text-income" : "text-outflow"}`}>
            {inr(inHandYr)}
          </span>
        </div>
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Month by month</h2>
          <Link href="/income" className="text-sm text-accent">Edit income</Link>
        </div>
        <div className="card divide-y divide-line">
          {fyRows.map((r: any) => (
            <div key={r.month} className={`flex items-center gap-4 p-3.5 ${r.month === thisMonth && "bg-line/20"}`}>
              <div className="w-16 text-sm font-medium">{monthLabel(r.month)}</div>
              <div className="tnum text-sm text-income w-28 text-right">{inr(r.received_in)}</div>
              <div className="tnum text-sm text-outflow w-28 text-right">{inr(r.expenses)}</div>
              <div className={`tnum text-sm w-28 text-right ml-auto font-medium ${
                Number(r.received_in) - Number(r.expenses) >= 0 ? "text-income" : "text-outflow"}`}>
                {inr(Number(r.received_in) - Number(r.expenses))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function Stat({ label, value, hint, tone, icon }: any) {
  const t: Record<string,string> = { income: "text-income", outflow: "text-outflow", warn: "text-warn", accent: "text-accent" };
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="eyebrow">{label}</span><span className={t[tone]}>{icon}</span>
      </div>
      <div className={`tnum text-2xl mt-3 ${t[tone]}`}>{value}</div>
      <div className="text-xs text-muted mt-1">{hint}</div>
    </div>
  );
}
