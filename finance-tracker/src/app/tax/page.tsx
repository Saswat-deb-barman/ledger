import Shell from "@/components/Shell";
import { supabaseServer } from "@/lib/supabase-server";
import { finYear } from "@/lib/format";
import TaxManager from "./TaxManager";

export const dynamic = "force-dynamic";

// Financial years this module covers: 24-25 through the current FY.
function finYearRange(): string[] {
  const [, endNow] = finYear().split("-").map(s => 2000 + Number(s));
  const years: string[] = [];
  for (let start = 2024; start < endNow; start++) {
    years.push(`${String(start).slice(-2)}-${String(start + 1).slice(-2)}`);
  }
  return years.reverse(); // most recent first
}

export default async function TaxPage({
  searchParams,
}: { searchParams: { fy?: string } }) {
  const supabase = supabaseServer();
  const years = finYearRange();
  const fy = searchParams.fy && years.includes(searchParams.fy) ? searchParams.fy : years[0];

  const { data: docs } = await supabase
    .from("tax_documents").select("*")
    .eq("fin_year", fy).order("created_at", { ascending: false });

  return (
    <Shell>
      <TaxManager fy={fy} years={years} docs={docs ?? []} />
    </Shell>
  );
}
