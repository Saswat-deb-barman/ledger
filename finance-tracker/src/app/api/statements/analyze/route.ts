import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { readStatementUpload, UploadError } from "@/lib/statement-upload";
import {
  readGrid, detectConfig, applyConfig, configErrors, summarize, sanitizeConfig,
  extractAccountInfo, type FormatConfig,
} from "@/lib/parsers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST multipart: `file` and optionally `config` (JSON). Nothing is saved.
// Returns the detected (or supplied) column mapping plus a preview of what it
// would import, so the user can check it against their statement.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  try {
    const { form, buf, file } = await readStatementUpload(req);
    const grid = readGrid(file.name, buf);
    if (grid.length === 0) return NextResponse.json({ error: "The file looks empty." }, { status: 422 });

    let config: FormatConfig;
    let warnings: string[] = [];
    let confident = true;
    const supplied = form.get("config");
    if (typeof supplied === "string" && supplied) {
      try { config = sanitizeConfig(JSON.parse(supplied)); }
      catch { return NextResponse.json({ error: "invalid config" }, { status: 400 }); }
    } else {
      const d = detectConfig(grid);
      config = d.config; warnings = d.warnings; confident = d.confident;
    }

    const errors = configErrors(config);
    let preview: any[] = [], summary = null, skipped = 0;
    if (errors.length === 0) {
      const r = applyConfig(grid, config);
      preview = r.txns.slice(0, 12);
      summary = summarize(r.txns);
      skipped = r.skipped;
      warnings = [...warnings, ...r.warnings];
    }

    return NextResponse.json({
      config, confident, errors, warnings, preview, summary, skipped,
      account: extractAccountInfo(grid, config.header_row),
      // First rows of the raw file so the user can pick the header row / columns.
      grid_preview: grid.slice(0, 30).map(r => r.slice(0, 20).map(c => c.slice(0, 60))),
      total_rows: grid.length,
    });
  } catch (e: any) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Couldn't read that file." }, { status: 422 });
  }
}
