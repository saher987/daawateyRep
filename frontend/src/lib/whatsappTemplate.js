// Event.whatsapp_template — which approved WhatsApp template invitations to
// this event use (backend/app/integrations/whatsapp.py). The تأهيل wording
// names the groom/bride, so it's only offered for weddings/engagements, the
// event types whose forms show those fields.

export function whatsappTemplateOptions(t) {
  return [
    { value: "default", label: t.whatsappTemplateDefault },
    { value: "tahil_son", label: t.whatsappTemplateTahilSon },
    { value: "tahil_daughter", label: t.whatsappTemplateTahilDaughter },
  ];
}

// The تأهيل templates fill in the host, the groom (son) or bride (daughter),
// and the hall — returns the error to show when one of them is missing, or
// null when the form can be saved. The backend falls back to the generic
// template in that case anyway, but the organizer should know.
export function whatsappTemplateError(form, t) {
  const missing = !form.host_name?.trim() || !form.venue_name?.trim();
  if (form.whatsapp_template === "tahil_son" && (missing || !form.groom_name?.trim())) {
    return t.whatsappTemplateMissingSon;
  }
  if (form.whatsapp_template === "tahil_daughter" && (missing || !form.bride_name?.trim())) {
    return t.whatsappTemplateMissingDaughter;
  }
  return null;
}
