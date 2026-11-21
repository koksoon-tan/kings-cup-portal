import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
dayjs.extend(relativeTime);

type TsLike = { toDate(): Date } | Date | string | number | null | undefined;

export function toDate(v: TsLike): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object" && "toDate" in v) return v.toDate();
  return new Date(v);
}

export function fmtDate(v: TsLike, withTime = false) {
  const d = toDate(v);
  return d ? dayjs(d).format(withTime ? "D MMM YYYY, HH:mm" : "D MMM YYYY") : "—";
}

export function fmtAgo(v: TsLike) {
  const d = toDate(v);
  return d ? dayjs(d).fromNow() : "—";
}

export function money(n: number | null | undefined, currency = "") {
  const s = (n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}

export const STATUS_COLORS: Record<string, string> = {
  // generic
  draft: "gray", review: "yellow", published: "green", archived: "dark",
  // orders
  pending: "gray", paid: "blue", packing: "indigo", shipped: "violet", delivered: "teal", completed: "green",
  cancelled: "dark", refunded: "orange", returned: "red",
  // codes
  none: "gray", generated: "gray", sent: "blue", redeemed: "green", revoked: "red", expired: "orange",
  queued: "yellow", error: "red",
  // corporate pipeline
  lead: "gray", sample_sent: "blue", negotiating: "yellow", won: "teal", customer: "green", lost: "dark",
  quote: "gray", design: "blue", proof: "yellow", deposit: "orange", production: "indigo", ready: "teal",
  // invoices
  issued: "blue", partially_paid: "yellow", void: "dark",
  // uploads
  uploading: "yellow", processing: "yellow",
  // samples
  interested: "teal", ordered: "green", declined: "dark",
  // proofs
  approved: "green", rejected: "red", awaiting_approval: "yellow",
};

export const label = (s: string | null | undefined) => (s ? s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export const SOURCES = ["kickstarter", "shopee", "lazada", "website", "app", "corporate", "manual"] as const;
export const ORDER_STATUSES = ["pending", "paid", "packing", "shipped", "delivered", "completed", "cancelled", "refunded", "returned"] as const;
export const ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["paid", "cancelled"],
  paid: ["packing", "shipped", "cancelled", "refunded"],
  packing: ["shipped", "cancelled", "refunded"],
  shipped: ["delivered", "returned", "refunded"],
  delivered: ["completed", "returned", "refunded"],
  completed: ["returned", "refunded"],
  cancelled: [],
  refunded: ["returned"],
  returned: ["refunded"],
};
export const CORP_PIPELINE = ["lead", "sample_sent", "negotiating", "won", "customer", "lost"] as const;
export const CORP_SEGMENTS = ["corporate", "club", "bar", "events", "other"] as const;
export const CORP_ORDER_STAGES = ["quote", "design", "proof", "deposit", "production", "ready", "shipped", "completed", "cancelled"] as const;
export const SAMPLE_TYPES: Record<string, string> = {
  generic_logo: "Generic 'Your Company Logo' deck",
  standard: "Standard retail deck",
  custom_mockup: "Custom mock-up",
  other: "Other",
};
