// One normalized shape every bank adapter must produce.
export type RawTxn = {
  txn_date: string;      // ISO YYYY-MM-DD
  description: string;
  reference: string;
  amount: number;        // always positive
  direction: "credit" | "debit";
  balance: number | null;
};

export type ParsedStatement = {
  bank: "yes" | "axis" | "kotak";
  account_no: string | null;
  ifsc: string | null;
  account_label: string;
  period_from: string | null;   // ISO
  period_to: string | null;     // ISO
  txns: RawTxn[];
};

// Amount tiers — thresholds live here so they're easy to retune.
export const TIERS = { small: 2000, medium: 25000 } as const;
export function tierOf(amount: number): "small" | "medium" | "large" {
  if (amount < TIERS.small) return "small";
  if (amount < TIERS.medium) return "medium";
  return "large";
}

// Stable fingerprint for dedupe: account + date + amount + balance.
export function fingerprint(account_no: string | null, t: RawTxn): string {
  return [account_no ?? "?", t.txn_date, t.amount.toFixed(2),
          t.balance?.toFixed(2) ?? "?", t.direction].join("|");
}
