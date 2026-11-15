// Picking guests from the phone's contact list (DAW-57), for
// ContactsImportButton. Two ways in, one result shape:
//
// - Installed app (Capacitor): @capacitor-community/contacts reads the
//   contacts after the OS permission prompt; ContactsPickerDialog then lets
//   the user tick the ones to add. Android needs READ_CONTACTS in the
//   manifest, iOS NSContactsUsageDescription in Info.plist.
// - Website: the browser's own Contact Picker (navigator.contacts.select),
//   today Chrome on Android only, one contact per pick. The browser shows
//   the picker and hands over just the contact the user chose — no
//   permission, no full list.
//
// Either way only the chosen names and numbers ever leave the phone.
import { Capacitor } from "@capacitor/core";

export const isNativeContacts = () => Capacitor.isNativePlatform();

const hasWebPicker = () =>
  typeof navigator !== "undefined" && "contacts" in navigator && typeof navigator.contacts?.select === "function";

// Whether to show "from contacts" at all on this device.
export const contactsSupported = () => isNativeContacts() || hasWebPicker();

// Phones set to Arabic often save numbers in Arabic-Indic digits
// ("٠٥٤…") or Persian ones ("۰۵۴…"). \D treats those as non-digits, so
// without this the whole number vanished and the contact was dropped as
// "no phone".
const toLatinDigits = (s) =>
  s.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf));

// Israeli numbers as the rest of the app stores them: "05XXXXXXXX".
export function normalizeContactPhone(value) {
  let digits = toLatinDigits(String(value ?? "")).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00972")) digits = digits.slice(5);
  else if (digits.startsWith("972")) digits = digits.slice(3);
  return digits.startsWith("0") ? digits : `0${digits}`;
}

// A mobile number if the contact has one (invitations go by WhatsApp/SMS),
// else the first number.
function bestPhone(numbers) {
  const phones = numbers.map(normalizeContactPhone).filter((p) => p.length >= 9);
  return phones.find((p) => p.startsWith("05")) || phones[0] || "";
}

// "سامي مجدلاني" → first "سامي", last "مجدلاني"; one word → first name only.
function splitName(display) {
  const parts = String(display || "").replace(/\s+/g, " ").trim().split(" ");
  return { first_name: parts[0] || "", last_name: parts.slice(1).join(" ") };
}

const toContact = (id, { display, given, family }, numbers) => {
  const name = given || family ? { first_name: given || "", last_name: family || "" } : splitName(display);
  return { id: String(id), ...name, phone: bestPhone(numbers) };
};

const byName = (a, b) =>
  `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "ar");

// Installed app: every contact that has a name or a number, after the OS
// permission prompt. Throws { code: "denied" } when the user refuses.
export async function loadDeviceContacts() {
  const { Contacts } = await import("@capacitor-community/contacts");
  let { contacts: state } = await Contacts.checkPermissions();
  if (state !== "granted" && state !== "limited") {
    ({ contacts: state } = await Contacts.requestPermissions());
  }
  if (state !== "granted" && state !== "limited") {
    const err = new Error("Contacts permission denied");
    err.code = "denied";
    throw err;
  }
  const { contacts } = await Contacts.getContacts({ projection: { name: true, phones: true } });
  return contacts
    .map((c) =>
      toContact(
        c.contactId,
        { display: c.name?.display, given: c.name?.given, family: c.name?.family },
        (c.phones || []).map((p) => p.number),
      ),
    )
    .filter((c) => c.phone && (c.first_name || c.last_name))
    .sort(byName);
}

// Website: the browser's picker. Resolves to { contacts, withoutPhone }:
// the chosen contacts that have a usable number, and how many were chosen
// without one (no number saved, or the "phone numbers" chip at the top of
// Chrome's picker was switched off) — the caller says so instead of
// silently adding nothing.
// While Chrome's picker is open the phone shows its own Contacts app, and
// Android may reload the Chrome tab in the background meanwhile; the
// chosen contact then reaches a fresh page that no longer waits for it,
// and nothing happens. This mark (sessionStorage survives the reload)
// lets ContactsImportButton notice that and say so.
const PICK_MARK = "daawatey.contactsPickStartedAt";
const store = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};
const setPickMark = (on) => {
  try {
    if (on) store()?.setItem(PICK_MARK, String(Date.now()));
    else store()?.removeItem(PICK_MARK);
  } catch {
    // Storage blocked: the reload notice is just skipped.
  }
};

// True once, right after a reload that interrupted a pick (within 10
// minutes of opening the picker).
export function takeInterruptedPick() {
  try {
    const started = Number(store()?.getItem(PICK_MARK) || 0);
    if (!started) return false;
    setPickMark(false);
    return Date.now() - started < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export async function pickWebContacts() {
  // One contact per pick: in Chrome's multi-select mode tapping a name only
  // ticks it, and owners kept closing the picker without pressing its
  // confirm button, so nothing came back. Single mode adds on the tap; to
  // add more, press the button again.
  setPickMark(true);
  let chosen;
  try {
    chosen = await navigator.contacts.select(["name", "tel"], { multiple: false });
  } finally {
    setPickMark(false);
  }
  const contacts = chosen
    .map((c, i) => toContact(i, { display: (c.name || [])[0] }, c.tel || []))
    .filter((c) => c.phone);
  return { contacts, withoutPhone: chosen.length - contacts.length };
}

// A picked contact in POST /events/{id}/imported-invitees' guest shape.
export const contactToGuest = (c) => ({
  first_name: c.first_name || null,
  last_name: c.last_name || null,
  phone: c.phone,
  guests_count: 1,
});
