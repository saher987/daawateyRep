import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";
import { SUFFIX_SUGGESTIONS } from "@/lib/thankYouMessage";

// Free-text name suffix ("وعائلته", "وزوجته"…) with one-tap quick picks,
// used when adding an invitee.
export default function SuffixPicker({ value, onChange, compact = false }) {
  const t = useT();
  return (
    <div className={compact ? "space-y-1.5 min-w-0" : "space-y-2"}>
      <Label className={compact ? "text-sm" : undefined}>
        {t.suffixLabel} <span className="text-muted-foreground text-xs font-normal">({t.optional})</span>
      </Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={t.suffixPlaceholder}
        className={`${compact ? "h-10" : "h-11"} rounded-xl text-base`}
      />
      {/* compact: one horizontally scrollable row so the dialog stays short */}
      <div className={compact ? "flex gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5" : "flex flex-wrap gap-1.5"}>
        {SUFFIX_SUGGESTIONS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(value.trim() === s ? "" : s)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap shrink-0 ${
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
