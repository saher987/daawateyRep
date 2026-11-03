// The approved universal invitation template (daawatey_invitation_universal
// in Meta), for the event forms' preview only — the backend sends it by name
// with the guest's name and the event's WhatsApp text. Meta allows no line
// breaks inside a variable, so the text shows (and is sent) as one paragraph.
export function whatsappInvitationPreview(text, t) {
  const body = (text || "").replace(/\s+/g, " ").trim();
  return `حضرة ${t.whatsappTextGuestPlaceholder}، بكل محبة وتقدير،\n${body}\n` +
    "لعرض تفاصيل الدعوة وتأكيد حضوركم يرجى الضغط على الزر أدناه.\nبانتظار تشريفكم.";
}
