import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

// The event's gift settings, shared by CreateEvent.jsx and both
// EditEventDialogs. Turning gifts on reveals the ways to pay; guests see
// whichever of them are filled in (backend events.py _gift_options).
export default function GiftSettingsFields({ form, onChange, t }) {
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <Label htmlFor="gifts_enabled">{t.giftsEnabledLabel}</Label>
          <p className="text-xs text-muted-foreground">{t.giftsEnabledHint}</p>
        </div>
        <Switch
          id="gifts_enabled"
          checked={!!form.gifts_enabled}
          onCheckedChange={(v) => onChange("gifts_enabled", v)}
        />
      </div>
      {form.gifts_enabled && (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">{t.giftBitPhoneLabel}</Label>
            <Input
              type="tel"
              dir="ltr"
              value={form.gift_bit_phone}
              onChange={(e) => onChange("gift_bit_phone", e.target.value)}
              className="h-11 rounded-xl"
              placeholder="05X-XXXXXXX"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.giftPayboxUrlLabel}</Label>
            <Input
              type="url"
              dir="ltr"
              value={form.gift_paybox_url}
              onChange={(e) => onChange("gift_paybox_url", e.target.value)}
              className="h-11 rounded-xl"
              placeholder="https://"
            />
            <p className="text-xs text-muted-foreground">{t.giftPayboxUrlHint}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.giftBankDetailsLabel}</Label>
            <Textarea
              value={form.gift_bank_details}
              onChange={(e) => onChange("gift_bank_details", e.target.value)}
              className="rounded-xl min-h-[70px]"
              placeholder={t.giftBankDetailsPlaceholder}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t.giftNoteLabel}</Label>
            <Textarea
              value={form.gift_note}
              onChange={(e) => onChange("gift_note", e.target.value)}
              className="rounded-xl min-h-[60px]"
              placeholder={t.giftNotePlaceholder}
            />
          </div>
        </div>
      )}
    </div>
  );
}
