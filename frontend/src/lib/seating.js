// Small shared helpers for seating groups (side + group) and who-sits-where.
import { normalizeForSearch } from "@/lib/recipientName";

export const SIDES = ["groom", "bride", "both"];

export const SIDE_COLOR = {
  groom: "#A3762A",
  bride: "#B4536A",
  both: "#3C6FB0",
  none: "#9AA0AA",
};

export function sideLabel(side, t) {
  return { groom: t.sideGroom, bride: t.sideBride, both: t.sideBoth }[side] || t.sideNone;
}

// "طرف العريس › أصدقاء المدرسة"
export function groupingLabel(r, t) {
  if (!r.side && !r.group_label) return `${t.sideNone} · ${t.groupNone}`;
  return `${sideLabel(r.side, t)} › ${r.group_label || t.groupNone}`;
}

// Seats an invitation needs: the confirmed count, else the invited count.
export function partySize(r) {
  return r.rsvp_guests_count || r.guests_count || 1;
}

export function allocationsByRecipient(assignments = []) {
  const map = {};
  for (const a of assignments) (map[a.recipient_id] ||= []).push({ table_id: a.table_id, seats: a.seats });
  return map;
}

export function seatedByTable(assignments = []) {
  const map = {};
  for (const a of assignments) map[a.table_id] = (map[a.table_id] || 0) + a.seats;
  return map;
}

// Group names that look like what's being typed (or all of them when the
// field is empty), ignoring hamza/ta-marbuta/alef-maqsura and "ال".
export function matchingGroupNames(names, typed) {
  const norm = (s) => normalizeForSearch(s).replace(/(^|\s)ال/g, "$1").replace(/\s+/g, "");
  const q = norm(typed);
  return names.filter((n) => n !== typed && (!q || norm(n).includes(q)));
}

// Excel "Side" column values in Arabic, Hebrew or English.
const SIDE_WORDS = {
  groom: ["groom", "عريس", "العريس", "طرف العريس", "חתן", "צד החתן"],
  bride: ["bride", "عروس", "العروس", "طرف العروس", "כלה", "צד הכלה"],
  both: ["both", "shared", "مشترك", "مشتركة", "משותף"],
};

export function parseSide(value) {
  const v = (value ?? "").toString().trim().toLowerCase();
  if (!v) return { side: null, unknown: false };
  for (const [side, words] of Object.entries(SIDE_WORDS)) {
    if (words.includes(v)) return { side, unknown: false };
  }
  return { side: null, unknown: true };
}
