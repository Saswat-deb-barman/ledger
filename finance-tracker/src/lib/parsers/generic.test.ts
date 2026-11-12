import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  readGrid, detectConfig, parseWithConfig, parseDate, parseAmount, inferDateOrder,
  sanitizeConfig, matchSavedFormat, signatureOf, configErrors, fingerprint,
} from "./index";

// All data below is synthetic.
const buf = (s: string) => Buffer.from(s, "utf8");
const run = (csv: string, name = "x.csv") => {
  const grid = readGrid(name, buf(csv));
  const d = detectConfig(grid);
  return { grid, d, p: parseWithConfig(grid, d.config, "Test Bank") };
};

describe("layout: separate debit / credit columns with a preamble", () => {
  const csv = [
    "Test Bank Ltd,,,,,",
    "Account No: 123456789012,,,,,",
    "IFSC: TEST0001234,,,,,",
    ",,,,,",
    "Txn Date,Narration,Chq/Ref No,Withdrawal Amt.,Deposit Amt.,Closing Balance",
    '10/07/2026,"UPI/ACME STUDIOS, PVT/123",REF1,,"1,20,000.00","2,50,000.00"',
    "11/07/2026,POS COFFEE,REF2,450.50,,\"2,49,549.50\"",
    "Total,,,450.50,\"1,20,000.00\",",
  ].join("\n");

  it("detects header, columns and style", () => {
    const { d } = run(csv);
    expect(d.confident).toBe(true);
    expect(d.config.header_row).toBe(3);   // the all-blank row is dropped
    expect(d.config.amount_style).toBe("split");
    expect(d.config.columns).toMatchObject({ date: 0, description: 1, reference: 2, debit: 3, credit: 4, balance: 5 });
  });
  it("parses rows, Indian commas, quoted commas; skips the totals row", () => {
    const { p } = run(csv);
    expect(p.txns).toHaveLength(2);
    expect(p.txns[0]).toMatchObject({ txn_date: "2026-07-10", amount: 120000, direction: "credit", balance: 250000 });
    expect(p.txns[0].description).toContain("ACME STUDIOS, PVT");
    expect(p.txns[1]).toMatchObject({ txn_date: "2026-07-11", amount: 450.5, direction: "debit" });
  });
  it("extracts account number, IFSC and period from the file", () => {
    const { p } = run(csv);
    expect(p.account_no).toBe("123456789012");
    expect(p.ifsc).toBe("TEST0001234");
    expect(p.period_from).toBe("2026-07-10");
    expect(p.period_to).toBe("2026-07-11");
    expect(p.custom).toBe(true);
  });
});

describe("layout: one signed amount column", () => {
  it("negative = money out; DD-Mon-YYYY dates", () => {
    const { d, p } = run([
      "Date,Description,Amount,Balance",
      "03-Aug-2026,Salary ACME,\"85,000.00\",\"90,000.00\"",
      "04-Aug-2026,Groceries,-2300.75,\"87,699.25\"",
    ].join("\n"));
    expect(d.config.amount_style).toBe("signed");
    expect(p.txns.map(t => [t.txn_date, t.amount, t.direction])).toEqual([
      ["2026-08-03", 85000, "credit"], ["2026-08-04", 2300.75, "debit"],
    ]);
  });
  it("invert_sign flips the convention (card exports)", () => {
    const { grid, d } = run("Date,Description,Amount\n03-Aug-2026,Shop,500.00\n04-Aug-2026,Refund,-200.00");
    const p = parseWithConfig(grid, { ...d.config, invert_sign: true }, "Card");
    expect(p.txns.map(t => t.direction)).toEqual(["debit", "credit"]);
  });
  it("warns when amounts are all positive with no Dr/Cr info", () => {
    const { d } = run("Date,Description,Amount\n03-Aug-2026,A,500\n04-Aug-2026,B,200");
    expect(d.confident).toBe(false);
    expect(d.warnings[0]).toMatch(/can't be told apart/);
  });
});

describe("layout: amount + Dr/Cr marker, or amount with Dr/Cr suffix", () => {
  it("marker column", () => {
    const { d, p } = run([
      "Tran Date,Particulars,Amount,Dr/Cr,Balance",
      "01/09/2026,NEFT IN,\"10,000.00\",CR,\"10,000.00\"",
      "02/09/2026,ATM,\"2,000.00\",DR,\"8,000.00\"",
    ].join("\n"));
    expect(d.config.amount_style).toBe("drcr");
    expect(p.txns.map(t => t.direction)).toEqual(["credit", "debit"]);
  });
  it("suffix inside the amount cell", () => {
    const { p } = run("Date,Narration,Amount\n01/09/2026,IN,\"1,500.00 Cr\"\n02/09/2026,OUT,\"700.00 Dr\"");
    expect(p.txns.map(t => [t.amount, t.direction])).toEqual([[1500, "credit"], [700, "debit"]]);
  });
});

describe("file quirks", () => {
  it("semicolon delimiter, BOM, CRLF", () => {
    const { p } = run("﻿Date;Description;Debit;Credit\r\n05/01/2026;Rent;12000;\r\n06/01/2026;Gig;;3000\r\n");
    expect(p.txns.map(t => [t.amount, t.direction])).toEqual([[12000, "debit"], [3000, "credit"]]);
  });
  it("infers MDY when a month-position value exceeds 12", () => {
    expect(inferDateOrder(["01/25/2026", "02/03/2026"])).toBe("MDY");
    expect(inferDateOrder(["25/01/2026"])).toBe("DMY");
    expect(inferDateOrder(["01/02/2026"])).toBe("DMY"); // ambiguous → day-first
  });
  it("reads real .xlsx files", () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["Bank X"], ["Date", "Narration", "Debit", "Credit", "Balance"],
      ["10/07/2026", "Coffee", 120, "", 880], ["11/07/2026", "Client", "", 5000, 5880],
    ]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "S");
    const b = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const grid = readGrid("s.xlsx", b);
    const d = detectConfig(grid);
    const p = parseWithConfig(grid, d.config, "X");
    expect(p.txns).toHaveLength(2);
    expect(p.txns[1]).toMatchObject({ amount: 5000, direction: "credit", balance: 5880 });
  });
  it("reports an undetectable layout instead of guessing", () => {
    const d = detectConfig(readGrid("x.csv", buf("foo,bar\n1,2")));
    expect(d.confident).toBe(false);
    expect(configErrors(d.config).length).toBeGreaterThan(0);
  });
});

describe("dedupe fingerprints", () => {
  it("identical same-day rows without a balance column stay distinct", () => {
    const { p } = run("Date,Description,Amount,Dr/Cr\n01/09/2026,Chai,20,DR\n01/09/2026,Chai,20,DR");
    const fps = new Set(p.txns.map(t => fingerprint("a", t)));
    expect(p.txns).toHaveLength(2);
    expect(fps.size).toBe(2);
  });
  it("re-parsing the same file gives the same fingerprints", () => {
    const csv = "Date,Description,Amount,Dr/Cr\n01/09/2026,Chai,20,DR\n01/09/2026,Chai,20,DR";
    const a = run(csv).p.txns.map(t => fingerprint("a", t));
    const b = run(csv).p.txns.map(t => fingerprint("a", t));
    expect(a).toEqual(b);
  });
});

describe("saved formats", () => {
  it("recognises a known header even when the preamble length changes", () => {
    const first = run("Date,Narration,Debit,Credit\n01/01/2026,A,1,");
    const sig = signatureOf(first.grid[first.d.config.header_row]);
    const next = readGrid("n.csv", buf("Statement,,,\nPeriod x,,,\n\nDate,Narration,Debit,Credit\n02/01/2026,B,,2"));
    const m = matchSavedFormat(next, [{ signature: sig, config: first.d.config }]);
    expect(m?.header_row).toBe(2);   // blank rows are dropped
  });
  it("does not match an unrelated file", () => {
    const g = readGrid("n.csv", buf("A,B,C\n1,2,3"));
    expect(matchSavedFormat(g, [{ signature: "date|narration", config: detectConfig(g).config }])).toBeNull();
  });
});

describe("value parsers", () => {
  it("dates", () => {
    expect(parseDate("10-07-2026 01:18:16", "DMY")).toBe("2026-07-10");
    expect(parseDate("2026-07-10T01:18:16Z", "DMY")).toBe("2026-07-10");
    expect(parseDate("Jul 10, 2026", "DMY")).toBe("2026-07-10");
    expect(parseDate("10 July 2026", "DMY")).toBe("2026-07-10");
    expect(parseDate("07/10/26", "MDY")).toBe("2026-07-10");
    expect(parseDate("31/02/2026", "DMY")).toBeNull();      // impossible date
    expect(parseDate("Total", "DMY")).toBeNull();
    expect(parseDate("", "DMY")).toBeNull();
  });
  it("amounts", () => {
    expect(parseAmount("₹ 1,23,456.78")?.value).toBe(123456.78);
    expect(parseAmount("(250.00)")?.value).toBe(-250);
    expect(parseAmount("250.00-")?.value).toBe(-250);
    expect(parseAmount("99 Cr")).toEqual({ value: 99, dir: "credit" });
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("config validation (untrusted JSON)", () => {
  const ok = { version: 1, header_row: 2, date_order: "DMY", amount_style: "split",
    columns: { date: 0, description: 1, debit: 2, credit: 3 } };
  it("accepts a good config", () => expect(sanitizeConfig(ok).columns.credit).toBe(3));
  it("rejects out-of-range columns, bad enums, non-objects", () => {
    expect(() => sanitizeConfig({ ...ok, columns: { ...ok.columns, date: 9999 } })).toThrow();
    expect(() => sanitizeConfig({ ...ok, columns: { ...ok.columns, date: -1 } })).toThrow();
    expect(() => sanitizeConfig({ ...ok, columns: { ...ok.columns, date: "1; drop table" } })).toThrow();
    expect(() => sanitizeConfig({ ...ok, date_order: "XYZ" })).toThrow();
    expect(() => sanitizeConfig({ ...ok, amount_style: "eval" })).toThrow();
    expect(() => sanitizeConfig(null)).toThrow();
    expect(() => sanitizeConfig("x")).toThrow();
  });
  it("drops unknown keys (no passthrough)", () => {
    const c: any = sanitizeConfig({ ...ok, evil: "<script>", columns: { ...ok.columns, hax: 1 } });
    expect(c.evil).toBeUndefined();
    expect(c.columns.hax).toBeUndefined();
  });
});
