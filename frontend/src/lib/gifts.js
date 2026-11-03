// Host-side checks for the event gift settings (CreateEvent.jsx and both
// EditEventDialogs). The backend rejects a non-https PayBox link too; this
// just says why before the request goes out.

export function giftFormValues(event) {
  return {
    gifts_enabled: !!event?.gifts_enabled,
    gift_bit_phone: event?.gift_bit_phone || "",
    gift_paybox_url: event?.gift_paybox_url || "",
    gift_bank_details: event?.gift_bank_details || "",
    gift_note: event?.gift_note || "",
  };
}

export function giftSettingsError(form, t) {
  const payboxUrl = (form.gift_paybox_url || "").trim();
  if (payboxUrl && !/^https:\/\//i.test(payboxUrl)) return t.giftsBadPayboxUrl;
  if (!form.gifts_enabled) return null;
  const hasMethod = [form.gift_bit_phone, payboxUrl, form.gift_bank_details].some((v) => (v || "").trim());
  return hasMethod ? null : t.giftsNeedMethod;
}
