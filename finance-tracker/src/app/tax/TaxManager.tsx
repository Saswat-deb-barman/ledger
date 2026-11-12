"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { fmtDate } from "@/lib/format";
import { Upload, Download, Trash2, ChevronDown, ChevronRight, FileText } from "lucide-react";

const CATEGORIES: { value: string; label: string }[] = [
  { value: "form_16a_tds", label: "Form 16A / TDS certificates" },
  { value: "form_26as", label: "Form 26AS" },
  { value: "ais_tis", label: "AIS / TIS" },
  { value: "bank_statement", label: "Bank statements" },
  { value: "investment_proof", label: "Investment / deduction proofs" },
  { value: "rent_receipt", label: "Rent receipts" },
  { value: "foreign_remittance_certificate", label: "Foreign remittance certificates (FIRC)" },
  { value: "invoice_copy", label: "Invoice copies" },
  { value: "computation_sheet", label: "Computation sheet" },
  { value: "itr_acknowledgement", label: "ITR acknowledgement" },
  { value: "audit_report", label: "Audit report" },
  { value: "other", label: "Other" },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

function fmtSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function TaxManager({ fy, years, docs }: any) {
  const router = useRouter();
  const go = (y: string) => router.push(`/tax?fy=${y}`);

  const byCategory = CATEGORIES.map(c => ({
    ...c, docs: docs.filter((d: any) => d.category === c.value),
  }));
  const totalCount = docs.length;

  return (
    <>
      <header className="mb-6">
        <div className="eyebrow mb-1">Tax module · CA-ready document repository</div>
        <h1 className="text-3xl font-semibold tracking-tight">FY {fy}</h1>
      </header>

      <div className="flex gap-1 mb-6 border-b border-line">
        {years.map((y: string) => (
          <button key={y} onClick={() => go(y)}
            className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
              fy === y ? "border-ink font-medium" : "border-transparent text-muted"}`}>
            FY {y}
          </button>
        ))}
      </div>

      <UploadForm fy={fy} onDone={() => router.refresh()} />

      <div className="mt-6 space-y-3">
        {totalCount === 0 && (
          <div className="card p-6 text-center text-sm text-muted">
            No documents for FY {fy} yet. Upload the first one above.
          </div>
        )}
        {byCategory.filter(c => c.docs.length > 0).map(c => (
          <CategoryBlock key={c.value} label={c.label} docs={c.docs} onChanged={() => router.refresh()} />
        ))}
      </div>
    </>
  );
}

function UploadForm({ fy, onDone }: any) {
  const [category, setCategory] = useState(CATEGORIES[0].value);
  const [addedBy, setAddedBy] = useState<"self" | "ca">("self");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const upload = async () => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { setMsg("Error: file is larger than 25 MB"); return; }
    setBusy(true); setMsg("");
    const sb = supabaseBrowser();
    const { data: { user } } = await sb.auth.getUser();
    // Keep the original name for display, but store under a sanitized key.
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
    const path = `${user!.id}/${fy}/${crypto.randomUUID()}-${safeName}`;
    const { error: upErr } = await sb.storage.from("tax-documents").upload(path, file);
    if (upErr) { setMsg(`Error: ${upErr.message}`); setBusy(false); return; }
    const { error: insErr } = await sb.from("tax_documents").insert({
      owner_id: user!.id, fin_year: fy, category, file_name: file.name,
      storage_path: path, file_size: file.size, mime_type: file.type,
      notes: notes || null, added_by: addedBy,
    });
    setBusy(false);
    if (insErr) { setMsg(`Error: ${insErr.message}`); return; }
    setFile(null); setNotes("");
    onDone();
  };

  return (
    <div className="card p-4 grid grid-cols-[1fr_1fr_1fr_auto_auto] gap-3 items-end max-sm:grid-cols-1">
      <label className="block">
        <div className="eyebrow mb-1.5">Category</div>
        <select value={category} onChange={e => setCategory(e.target.value)}
          className="w-full border border-line rounded-lg px-2.5 py-2 text-sm bg-white">
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="block">
        <div className="eyebrow mb-1.5">File</div>
        <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="w-full text-sm" />
      </label>
      <label className="block">
        <div className="eyebrow mb-1.5">Notes (optional)</div>
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Q2 advance tax challan"
          className="w-full border border-line rounded-lg px-2.5 py-2 text-sm bg-white" />
      </label>
      <label className="block">
        <div className="eyebrow mb-1.5">Added by</div>
        <select value={addedBy} onChange={e => setAddedBy(e.target.value as any)}
          className="w-full border border-line rounded-lg px-2.5 py-2 text-sm bg-white">
          <option value="self">Me</option>
          <option value="ca">CA</option>
        </select>
      </label>
      <button onClick={upload} disabled={!file || busy}
        className="rounded-xl bg-ink text-paper px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-40">
        <Upload size={15} /> {busy ? "Uploading…" : "Upload"}
      </button>
      {msg && <div className="col-span-full text-xs text-outflow">{msg}</div>}
    </div>
  );
}

function CategoryBlock({ label, docs, onChanged }: any) {
  const [open, setOpen] = useState(true);
  const sb = supabaseBrowser();

  const download = async (path: string) => {
    const { data } = await sb.storage.from("tax-documents").createSignedUrl(path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  };
  const del = async (doc: any) => {
    if (!confirm(`Delete "${doc.file_name}"?`)) return;
    await sb.storage.from("tax-documents").remove([doc.storage_path]);
    await sb.from("tax_documents").delete().eq("id", doc.id);
    onChanged();
  };

  return (
    <div className="card">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 p-4">
        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        <span className="font-medium">{label}</span>
        <span className="text-xs text-muted ml-auto">{docs.length} file{docs.length === 1 ? "" : "s"}</span>
      </button>
      {open && (
        <div className="divide-y divide-line border-t border-line">
          {docs.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 p-3.5">
              <FileText size={16} className="text-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{d.file_name}</div>
                <div className="text-xs text-muted truncate">
                  {fmtSize(d.file_size)} · {fmtDate(d.created_at)}
                  {d.added_by === "ca" && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">CA</span>}
                  {d.notes && <span className="ml-2">{d.notes}</span>}
                </div>
              </div>
              <button onClick={() => download(d.storage_path)} title="Download"
                className="p-2 rounded-lg text-muted hover:text-ink hover:bg-line/50">
                <Download size={15} />
              </button>
              <button onClick={() => del(d)} title="Delete"
                className="p-2 rounded-lg text-muted hover:text-outflow hover:bg-line/50">
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
