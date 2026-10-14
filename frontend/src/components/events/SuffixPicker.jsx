import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { SUFFIX_SUGGESTIONS } from "@/lib/thankYouMessage";

// Free-text name suffix ("وعائلته", "وزوجته"…) with one-tap quick picks,
// used when adding an invitee.
export default function SuffixPicker({ value, onChange }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label>
        {t.suffixLabel} <span className="text-muted-foreground text-xs font-normal">({t.optional})</span>
      </Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t.suffixPlaceholder}
        className="h-11 rounded-xl text-base"
      />
      <div className="flex flex-wrap gap-1.5">
        {SUFFIX_SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value.trim() === s ? "" : s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
              value.trim() === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
