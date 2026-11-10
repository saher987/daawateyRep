import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { LayoutGrid, QrCode } from "lucide-react";
import { useT } from "@/lib/i18n";

// The two optional per-event services: table arrangement and entrance
// check-in. Both off by default — an event without them works exactly as
// before (invitations, RSVP, reminders, thank-you). Used by CreateEvent and
// EditEventDialog.
export default function EventFeaturesFields({ seatingEnabled, checkinEnabled, onChange }) {
  const t = useT();
  const rows = [
    {
      key: "seating_enabled",
      checked: !!seatingEnabled,
      icon: LayoutGrid,
      label: t.featureSeatingLabel,
      hint: t.featureSeatingHint,
    },
    {
      key: "checkin_enabled",
      checked: !!checkinEnabled,
      icon: QrCode,
      label: t.featureCheckinLabel,
      hint: t.featureCheckinHint,
    },
  ];
  return (
    <div className="space-y-2">
      <Label>{t.eventFeaturesSection}</Label>
      {rows.map(({ key, checked, icon: Icon, label, hint }) => (
        <label
          key={key}
          className="flex items-start gap-3 rounded-xl border border-border px-4 py-3 cursor-pointer"
        >
          <Icon className="w-5 h-5 mt-0.5 text-primary shrink-0" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">{label}</span>
            <span className="block text-xs text-muted-foreground">{hint}</span>
          </span>
          <Switch checked={checked} onCheckedChange={(v) => onChange(key, v)} />
        </label>
      ))}
    </div>
  );
}
