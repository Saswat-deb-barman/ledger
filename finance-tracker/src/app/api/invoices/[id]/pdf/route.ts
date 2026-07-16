import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import {
  Document, Page, Text, View, StyleSheet, renderToBuffer,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";

const s = StyleSheet.create({
  page: { padding: 44, fontSize: 10, color: "#16130F", fontFamily: "Helvetica" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold" },
  eyebrow: { fontSize: 8, color: "#8A8478", letterSpacing: 1, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between" },
  block: { marginTop: 6 },
  th: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#E7E3DA", paddingBottom: 5, marginTop: 24 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#EFEBE2", paddingVertical: 6 },
  cDesc: { flex: 1 }, cNum: { width: 70, textAlign: "right" },
  totalBox: { marginTop: 14, marginLeft: "auto", width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  bold: { fontFamily: "Helvetica-Bold" },
  muted: { color: "#8A8478" },
  bank: { marginTop: 28, padding: 12, backgroundColor: "#FBFAF7", borderRadius: 6 },
});

const money = (n: number) =>
  "INR " + new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(Number(n || 0));

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data: inv } = await supabase
    .from("invoices")
    .select("*, clients(name, gstin, pan, billing_address, email)")
    .eq("id", params.id).single();
  if (!inv) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: items } = await supabase
    .from("invoice_items").select("*").eq("invoice_id", params.id).order("sort_order");

  const by = inv.billed_by ?? {};
  const bank = inv.bank_details ?? {};

  const doc = React.createElement(Document, {},
    React.createElement(Page, { size: "A4", style: s.page },
      React.createElement(View, { style: s.row },
        React.createElement(View, {},
          React.createElement(Text, { style: s.eyebrow }, "Invoice"),
          React.createElement(Text, { style: s.h1 }, inv.invoice_number),
        ),
        React.createElement(View, { style: { textAlign: "right" } },
          React.createElement(Text, { style: s.muted }, `Issued ${inv.issue_date}`),
          inv.due_date && React.createElement(Text, { style: s.muted }, `Due ${inv.due_date}`),
        ),
      ),
      React.createElement(View, { style: [s.row, { marginTop: 28 }] },
        React.createElement(View, { style: { maxWidth: 240 } },
          React.createElement(Text, { style: s.eyebrow }, "Billed by"),
          React.createElement(Text, { style: [s.bold, s.block] }, by.name ?? "Your full name"),
          by.address && React.createElement(Text, { style: s.muted }, by.address),
          by.email && React.createElement(Text, { style: s.muted }, by.email),
          by.phone && React.createElement(Text, { style: s.muted }, by.phone),
          by.pan && React.createElement(Text, { style: s.muted }, `PAN: ${by.pan}`),
        ),
        React.createElement(View, { style: { maxWidth: 240, textAlign: "right" } },
          React.createElement(Text, { style: s.eyebrow }, "Billed to"),
          React.createElement(Text, { style: [s.bold, s.block] }, inv.clients?.name ?? "Personal"),
          inv.clients?.billing_address && React.createElement(Text, { style: s.muted }, inv.clients.billing_address),
          inv.clients?.gstin && React.createElement(Text, { style: s.muted }, `GSTIN: ${inv.clients.gstin}`),
          inv.clients?.email && React.createElement(Text, { style: s.muted }, inv.clients.email),
        ),
      ),
      React.createElement(View, { style: s.th },
        React.createElement(Text, { style: s.cDesc }, "Item"),
        React.createElement(Text, { style: s.cNum }, "Qty"),
        React.createElement(Text, { style: s.cNum }, "Rate"),
        React.createElement(Text, { style: s.cNum }, "Amount"),
      ),
      ...(items ?? []).map((it: any) =>
        React.createElement(View, { style: s.tr, key: it.id },
          React.createElement(Text, { style: s.cDesc }, it.description),
          React.createElement(Text, { style: s.cNum }, String(it.quantity)),
          React.createElement(Text, { style: s.cNum }, money(it.rate)),
          React.createElement(Text, { style: s.cNum }, money(it.amount)),
        )),
      React.createElement(View, { style: s.totalBox },
        React.createElement(View, { style: s.totalRow },
          React.createElement(Text, { style: s.muted }, "Subtotal"),
          React.createElement(Text, {}, money(inv.subtotal))),
        Number(inv.discount) > 0 && React.createElement(View, { style: s.totalRow },
          React.createElement(Text, { style: s.muted }, "Discount"),
          React.createElement(Text, {}, `- ${money(inv.discount)}`)),
        Number(inv.tax_rate) > 0 && React.createElement(View, { style: s.totalRow },
          React.createElement(Text, { style: s.muted }, `Tax (${inv.tax_rate}%)`),
          React.createElement(Text, {}, money(inv.tax_amount))),
        React.createElement(View, { style: [s.totalRow, { marginTop: 4 }] },
          React.createElement(Text, { style: s.bold }, "Total"),
          React.createElement(Text, { style: s.bold }, money(inv.total))),
      ),
      (bank.account_number || bank.upi) && React.createElement(View, { style: s.bank },
        React.createElement(Text, { style: s.eyebrow }, "Payment details"),
        bank.account_name && React.createElement(Text, { style: s.block }, `Account: ${bank.account_name}`),
        bank.account_number && React.createElement(Text, {}, `A/C: ${bank.account_number}`),
        bank.ifsc && React.createElement(Text, {}, `IFSC: ${bank.ifsc}`),
        bank.bank && React.createElement(Text, {}, `Bank: ${bank.bank}`),
        bank.upi && React.createElement(Text, {}, `UPI: ${bank.upi}`),
      ),
      React.createElement(Text, { style: { marginTop: 40, fontSize: 8, color: "#8A8478" } },
        "This is an electronically generated document, no signature required."),
    ),
  );

  const buffer = await renderToBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${inv.invoice_number.replace(/\//g, "-")}.pdf"`,
    },
  });
}
