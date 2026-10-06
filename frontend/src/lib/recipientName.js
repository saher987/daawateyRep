// An invitee's display name, matching the backend's _resolve_display_name:
// nickname + first + last + suffix (e.g. "السيد فرنسيس صباح وعائلته") when
// structured names exist — which is always the case for invitees added via
// the Excel import — falling back to external_full_name for older rows.
export function recipientDisplayName(r) {
  if (!r) return "";
  const structured = [r.nickname, r.first_name, r.last_name, r.name_suffix].filter(Boolean).join(" ");
  return structured || r.external_full_name || r.full_name || "";
}
