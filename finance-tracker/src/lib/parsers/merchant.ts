// Merchant extraction, tuned per bank from real statement data.
// Quality varies: Axis cleanest, Kotak good, Yes Bank weakest (VPA handles only).

export function extractMerchant(bank: string, desc: string): string {
  const d = (desc || "").trim();
  if (!d) return "(unknown)";

  if (bank === "axis") {
    // UPI/P2M/<ref>/MERCHANT NAME/... or UPI/P2A/<ref>/NAME/...
    const m = d.match(/^UPI\/P2[AM]\/\d+\/([^/]+)/i);
    if (m) return clean(m[1]);
    const imps = d.match(/^IMPS\/P2[AM]\/\d+\/([^/]+)/i);
    if (imps) return clean(imps[1]);
    const pos = d.match(/^POS\/([^/]+)/i);
    if (pos) return clean(pos[1]);
    return clean(d.split("/")[0]);
  }

  if (bank === "kotak") {
    // UPI/<Merchant>/<ref>/NA   or   plain text "RECEIVED FROM ACME STUDIOS/..."
    const upi = d.match(/^UPI\/([^/]+)\//i);
    if (upi) return clean(upi[1]);
    const recv = d.match(/RECEIVED FROM ([A-Z0-9 ]+?)[\/]/i);
    if (recv) return clean(recv[1]);
    const sent = d.match(/^SentIMPS\d+([A-Za-z ]+?)\//);
    if (sent) return clean(sent[1]);
    const mb = d.match(/^MB[:\s]/i);
    if (mb) return "Internal transfer";
    return clean(d.split("/")[0]);
  }

  // yes bank: UPI/<ref>/From:<vpa>/To:<vpa>/UPI — use the To: handle
  const to = d.match(/To:([^/@]+)@/i);
  if (to) return clean(to[1]);
  const from = d.match(/From:([^/@]+)@/i);
  if (from) return clean(from[1]);
  const neft = d.match(/(?:NEFT|RTGS|IMPS)[\s/-]?(CR|DR)?[\s-]*([A-Z0-9]+)/i);
  if (neft) return clean(neft[2]);
  return clean(d.slice(0, 24));
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/[-.]+$/, "").toUpperCase() || "(unknown)";
}
