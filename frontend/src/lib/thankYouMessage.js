// Fills an event's hand-written thank-you template (events.thank_you_message)
// for one invitee and opens it in WhatsApp. Placeholders are written in
// square brackets, e.g. "يا [nick_name] [first_name]، شكراً…".

export const THANK_YOU_PLACEHOLDERS = ["nick_name", "first_name", "last_name", "full_name"];

// wa.me wants digits-only international format, no "+". Same normalization
// rule as the backend's to_international_phone (pulseem.py) so a guest's
// local 05... number and an already-international one both resolve right.
export function toIntlPhone(phone) {
  const p = phone.trim().replace(/\s/g, "");
  if (p.startsWith("+972")) return p.slice(1);
  if (p.startsWith("972")) return p;
  if (p.startsWith("0")) return "972" + p.slice(1);
  return "972" + p;
}

export function fillThankYouMessage(template, recipient) {
  const fullName =
    [recipient.first_name, recipient.last_name].filter(Boolean).join(" ") ||
    recipient.external_full_name ||
    recipient.full_name ||
    "";
  const values = {
    nick_name: recipient.nickname || "",
    // Guests added with only a single name field have no first_name —
    // fall back to that name rather than leaving a gap in the greeting.
    first_name: recipient.first_name || fullName,
    last_name: recipient.last_name || "",
    full_name: fullName,
  };
  return template
    .replace(/\[(\w+)\]/g, (match, key) => (key in values ? values[key] : match))
    // An empty placeholder (e.g. no nickname) leaves doubled spaces or a
    // space before punctuation behind — tidy those up line by line.
    .split("\n")
    .map(line => line.replace(/[ \t]{2,}/g, " ").replace(/ ([،,.!؟?])/g, "$1").trim())
    .join("\n");
}

export function openThankYouInWhatsapp(template, recipient) {
  const message = fillThankYouMessage(template, recipient);
  const phone = recipient.phone ? toIntlPhone(recipient.phone) : "";
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
}
