import React, { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { fillThankYouMessage, openThankYouInWhatsapp, SUFFIX_SUGGESTIONS } from "@/lib/thankYouMessage";

// Opened from the heart button on an accepted invitee. Shows the filled-in
// thank-you message before it goes out, and lets the sender pick this
// guest's [suffix] ("وعائلته", "وزوجته"…), which is saved on the recipient
// so the next thank-you remembers it.
export default function ThankYouDialog({ open, onOpenChange, recipient, template, eventId }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [suffix, setSuffix] = useState("");
  useBackButton({ isOpen: open, onClose: () => onOpenChange(false) });

  useEffect(() => {
    if (open) setSuffix(recipient?.name_suffix || "");
  }, [open, recipient]);

  if (!recipient || !template) return null;

  const usesSuffix = template.includes("[suffix]");
  const withSuffix = { ...recipient, name_suffix: suffix.trim() };

  const send = () => {
    // Open WhatsApp first, synchronously inside the click — a window.open
    // after an await is treated as a popup and blocked on some browsers.
    openThankYouInWhatsapp(template, withSuffix);
    if (usesSuffix && suffix.trim() !== (recipient.name_suffix || "")) {
      base44.functions
        .invoke("setRecipientNameSuffix", { recipientId: recipient.id, nameSuffix: suffix.trim() })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
          queryClient.invalidateQueries({ queryKey: ["event-recipients-owner", eventId] });
        })
        .catch(() => {});
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{t.sendThankYou}</DialogTitle>
        </DialogHeader>

        {usesSuffix && (
          <div className="space-y-2">
            <Label>{t.suffixLabel}</Label>
            <Input
              value={suffix}
              onChange={e => setSuffix(e.target.value)}
              placeholder={t.suffixPlaceholder}
              className="h-11 rounded-xl text-base"
            />
            <div className="flex flex-wrap gap-1.5">
              {SUFFIX_SUGGESTIONS.map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSuffix(s)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    suffix.trim() === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>{t.thankYouPreview}</Label>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap" dir="auto">
            {fillThankYouMessage(template, withSuffix)}
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button onClick={send} className="flex-1 h-11 rounded-xl gap-2">
            <MessageCircle className="w-4 h-4" />
            {t.openWhatsapp}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-6">
            {t.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
