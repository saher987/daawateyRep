// An invitee's display name, matching the backend's _resolve_display_name:
// nickname + first + last + suffix (e.g. "السيد فرنسيس صباح وعائلته") when
// structured names exist — which is always the case for invitees added via
// the Excel import — falling back to external_full_name for older rows.
export function recipientDisplayName(r) {
  if (!r) return "";
  const structured = [r.nickname, r.first_name, r.last_name, r.name_suffix].filter(Boolean).join(" ");
  return structured || r.external_full_name || r.full_name || "";
}

// Folds the spelling variants people type interchangeably in Arabic —
// أ/إ/آ → ا, ة → ه, ى → ي, and diacritics/tatweel dropped — so "ابو" finds
// "أبو" and "عطاله" finds "عطالله"-style spellings typed with a different
// letter form. Hebrew/Latin text passes through lower-cased.
export function normalizeForSearch(text) {
  return (text || "")
    .toString()
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/\s+/g, " ")
    .trim();
}

// Guest-list search: partial first name, last name, full display name, or
// (for a numeric query) any part of the phone in 05… or 9725… form.
export function recipientMatchesSearch(r, query) {
  const q = normalizeForSearch(query);
  if (!q) return true;
  const fields = [r.first_name, r.last_name, r.nickname, recipientDisplayName(r)];
  if (fields.some((f) => normalizeForSearch(f).includes(q))) return true;
  if (/^[\d+\s-]+$/.test(q)) {
    const digits = (s) => (s || "").replace(/\D/g, "").replace(/^(972|0)/, "");
    const qd = digits(q);
    return !!qd && digits(r.phone).includes(qd);
  }
  return false;
}
