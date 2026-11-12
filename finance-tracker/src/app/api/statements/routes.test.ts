import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- minimal in-memory stand-in for the Supabase client -------------------
const h = vi.hoisted(() => ({ current: null as any }));
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: async () => h.current }));

function fakeSupabase(user: { id: string } | null) {
  const db: Record<string, any[]> = { bank_accounts: [], bank_formats: [], statement_imports: [], bank_txns: [], tag_rules: [] };
  const client = {
    db,
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      const q: any = { op: "select", filters: [] as [string, any][], payload: null, opts: null, single: false };
      const rows = () => (db[table] ??= []);
      const match = (r: any) => q.filters.every(([c, v]: [string, any]) => r[c] === v);
      const run = async () => {
        if (q.op === "insert") {
          const arr = (Array.isArray(q.payload) ? q.payload : [q.payload]).map((r: any) => ({ id: crypto.randomUUID(), ...r }));
          rows().push(...arr);
          return { data: q.single ? arr[0] : arr, error: null, count: arr.length };
        }
        if (q.op === "upsert") {
          const arr = Array.isArray(q.payload) ? q.payload : [q.payload];
          const keys = String(q.opts?.onConflict ?? "").split(",");
          let n = 0;
          for (const r of arr) {
            const ex = rows().find(x => keys.every(k => x[k] === r[k]));
            if (ex) { if (!q.opts?.ignoreDuplicates) { Object.assign(ex, r); n++; } }   // like Postgres: an upsert that updates a row counts it
            else { rows().push({ id: crypto.randomUUID(), ...r }); n++; }
          }
          return { data: null, error: null, count: n };
        }
        if (q.op === "update") { rows().filter(match).forEach(r => Object.assign(r, q.payload)); return { data: null, error: null }; }
        const found = rows().filter(match);
        return { data: q.single ? (found[0] ?? null) : found, error: null };
      };
      const b: any = {
        select: () => b, order: () => b, limit: () => b,
        eq: (c: string, v: any) => { q.filters.push([c, v]); return b; },
        insert: (p: any) => { q.op = "insert"; q.payload = p; return b; },
        upsert: (p: any, o: any) => { q.op = "upsert"; q.payload = p; q.opts = o; return b; },
        update: (p: any) => { q.op = "update"; q.payload = p; return b; },
        single: () => { q.single = true; return run(); },
        maybeSingle: () => { q.single = true; return run(); },
        then: (res: any, rej: any) => run().then(res, rej),
      };
      return b;
    },
  };
  return client;
}

import { POST as upload } from "./upload/route";
import { POST as analyze } from "./analyze/route";

const post = (url: string, fields: Record<string, string | File>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request(`http://localhost${url}`, { method: "POST", body: fd });
};
const csvFile = (text: string, name = "stmt.csv") => new File([text], name, { type: "text/csv" });

// A statement layout that is NOT one of the three built-in banks.
const OTHER_BANK = [
  "Example Bank,,,,",
  "Account Number: 555500001111,,,,",
  "Date,Narration,Withdrawal,Deposit,Balance",
  "01/08/2026,UPI/ACME STUDIOS/998877,,\"50,000.00\",\"60,000.00\"",
  "02/08/2026,POS CAFE,320.00,,\"59,680.00\"",
].join("\n");

const MAPPING = {
  version: 1, header_row: 2, date_order: "DMY", amount_style: "split",
  columns: { date: 0, description: 1, reference: null, debit: 2, credit: 3, amount: null, drcr: null, balance: 4 },
};

beforeEach(() => { h.current = fakeSupabase({ id: "user-1" }); });

describe("auth & limits", () => {
  it("both routes reject signed-out requests", async () => {
    h.current = fakeSupabase(null);
    expect((await upload(post("/u", { file: csvFile(OTHER_BANK) }))).status).toBe(401);
    expect((await analyze(post("/a", { file: csvFile(OTHER_BANK) }))).status).toBe(401);
  });
  it("rejects oversized files (413) and wrong types (415)", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.csv");
    expect((await upload(post("/u", { file: big }))).status).toBe(413);
    expect((await analyze(post("/a", { file: big }))).status).toBe(413);
    expect((await upload(post("/u", { file: new File(["x"], "evil.exe") }))).status).toBe(415);
  });
  it("rejects a request with no file", async () => {
    expect((await upload(post("/u", { nope: "x" }))).status).toBe(400);
  });
});

describe("analyze", () => {
  it("detects the layout of an unknown bank and previews it, saving nothing", async () => {
    const res = await analyze(post("/a", { file: csvFile(OTHER_BANK) }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j.confident).toBe(true);
    expect(j.config.amount_style).toBe("split");
    expect(j.summary).toMatchObject({ count: 2, credits: 50000, debits: 320 });
    expect(j.preview[0].direction).toBe("credit");
    expect(h.current.db.bank_txns).toHaveLength(0);
    expect(h.current.db.bank_formats).toHaveLength(0);
  });
  it("rejects a malformed config", async () => {
    const res = await analyze(post("/a", { file: csvFile(OTHER_BANK), config: '{"date_order":"X"}' }));
    expect(res.status).toBe(400);
  });
});

describe("upload: unknown bank → wizard → saved format", () => {
  it("returns unknown_format for an unrecognised layout and writes nothing", async () => {
    const res = await upload(post("/u", { file: csvFile(OTHER_BANK) }));
    const j = await res.json();
    expect(res.status).toBe(422);
    expect(j.code).toBe("unknown_format");
    expect(h.current.db.bank_txns).toHaveLength(0);
    expect(h.current.db.bank_accounts).toHaveLength(0);
  });

  it("imports with a mapping, saves the format and creates the account", async () => {
    const res = await upload(post("/u", {
      file: csvFile(OTHER_BANK), config: JSON.stringify(MAPPING), format_name: "Example Bank", save_format: "1",
    }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ bank: "Example Bank", total: 2, inserted: 2, duplicates: 0, format_saved: true });
    const { db } = h.current;
    expect(db.bank_formats).toHaveLength(1);
    expect(db.bank_formats[0].signature).toBe("date|narration|withdrawal|deposit|balance");
    expect(db.bank_accounts).toHaveLength(1);
    expect(db.bank_accounts[0]).toMatchObject({ account_number: "555500001111", bank_name: "Example Bank" });
    expect(db.bank_txns.every((t: any) => t.owner_id === "user-1")).toBe(true);
    expect(db.bank_txns[0].merchant).toBe("ACME STUDIOS");
  });

  it("re-uploading the same file is fully de-duplicated", async () => {
    const body = () => post("/u", { file: csvFile(OTHER_BANK), config: JSON.stringify(MAPPING), format_name: "Example Bank", save_format: "1" });
    await upload(body());
    const j = await (await upload(body())).json();
    expect(j).toMatchObject({ inserted: 0, duplicates: 2 });
    expect(h.current.db.bank_txns).toHaveLength(2);
    expect(h.current.db.bank_accounts).toHaveLength(1);   // account reused, not duplicated
  });

  it("recognises the saved format next time, with no mapping supplied", async () => {
    await upload(post("/u", { file: csvFile(OTHER_BANK), config: JSON.stringify(MAPPING), format_name: "Example Bank", save_format: "1" }));
    const next = OTHER_BANK.replace("01/08/2026", "05/08/2026").replace("02/08/2026", "06/08/2026");
    const res = await upload(post("/u", { file: csvFile(next) }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ bank: "Example Bank", inserted: 2 });
    expect(h.current.db.bank_accounts).toHaveLength(1);
  });

  it("does not save a format unless asked", async () => {
    await upload(post("/u", { file: csvFile(OTHER_BANK), config: JSON.stringify(MAPPING), format_name: "Example Bank", save_format: "0" }));
    expect(h.current.db.bank_formats).toHaveLength(0);
  });

  it("validates input: name required, bad config and bad account id rejected", async () => {
    const f = () => csvFile(OTHER_BANK);
    expect((await upload(post("/u", { file: f(), config: JSON.stringify(MAPPING), format_name: "" }))).status).toBe(400);
    expect((await upload(post("/u", { file: f(), config: '{"hack":1}', format_name: "X" }))).status).toBe(422);
    expect((await upload(post("/u", { file: f(), config: JSON.stringify(MAPPING), format_name: "X", account_id: "not-a-uuid" }))).status).toBe(400);
    expect(h.current.db.bank_txns).toHaveLength(0);
  });

  it("a mapping that yields no rows is rejected, not imported", async () => {
    const bad = { ...MAPPING, header_row: 99 };
    const res = await upload(post("/u", { file: csvFile(OTHER_BANK), config: JSON.stringify(bad), format_name: "X" }));
    expect(res.status).toBe(422);
    expect(h.current.db.bank_txns).toHaveLength(0);
  });
});

describe("built-in banks are unchanged", () => {
  const KOTAK = [
    ",,,,Account No.,9876543210",
    ",,,,IFSC,TEST0001234",
    ",,,,Period,From 01/07/2026 To 31/07/2026",
    "Sl. No.,Transaction Date,Value Date,Description,Chq /Ref No.,Amount,Dr / Cr,Balance,Dr / Cr",
    "1,10-07-2026 01:18:16,10-07-2026,UPI/Cafe/123/NA,123,250.00,DR,1000.00,CR",
  ].join("\n");
  it("still parses Kotak and keys the fingerprint on the real account number", async () => {
    const res = await upload(post("/u", { file: csvFile(KOTAK, "KM_stmt.csv") }));
    const j = await res.json();
    expect(res.status).toBe(200);
    expect(j).toMatchObject({ bank: "kotak", inserted: 1 });
    expect(h.current.db.bank_txns[0].fingerprint).toBe("9876543210|2026-07-10|250.00|1000.00|debit");
    expect(h.current.db.bank_accounts[0]).toMatchObject({ bank_name: "Kotak Mahindra Bank", account_number: "9876543210" });
    expect(h.current.db.bank_formats).toHaveLength(0);
  });
});
