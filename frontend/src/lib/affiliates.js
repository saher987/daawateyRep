// Shared by the affiliate pages (Affiliates, MyReferrals, BecomePartner)
// and the payment card on EventDetails.

// Amounts are whole-app money, shown with the currency from i18n
// (t.currencySymbol), the same one provider prices use.
export function formatMoney(value, t) {
  const n = Number(value || 0);
  const text = n.toLocaleString(t.langCode === "he" ? "he-IL" : "ar", {
    maximumFractionDigits: 2,
    numberingSystem: "latn",
  });
  return `${t.currencySymbol}${text}`;
}

export const AFFILIATE_KINDS = ["planner", "photo", "music", "makeup", "venue", "other"];

const BADGE = {
  pending: "text-amber-800 bg-amber-100",
  approved: "text-amber-800 bg-amber-100",
  active: "text-emerald-800 bg-emerald-100",
  paid: "text-emerald-800 bg-emerald-100",
  rejected: "text-destructive bg-destructive/10",
  inactive: "text-muted-foreground bg-muted",
};

export const badgeClass = (status) =>
  `inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${BADGE[status] || BADGE.inactive}`;

// "pending" means different things for an affiliate (application) and a
// commission (waiting for approval), hence two label sets.
export const affiliateStatusLabel = (status, t) => t[`affStatus_${status}`] || status;
export const commissionStatusLabel = (status, t) => t[`comStatus_${status}`] || status;
export const kindLabel = (kind, t) => (kind ? t[`affKind_${kind}`] || kind : "");

export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
