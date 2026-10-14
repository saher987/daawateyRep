import React, { useEffect, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { buildThankYouMessage, smsPartCount, DEFAULT_THANK_YOU_TEMPLATE } from "@/lib/thankYouMessage";

// Opened from the heart button on an accepted invitee (admin/manager only).
// The text starts from the event's thank_you_message, or a default when the
// event has none, and can be edited before sending; the preview shows it
// filled in for this guest. The guest's name suffix comes from their
// invitee record (set in AddInviteeDialog).
export default function ThankYouDialog({ open, onOpenChange, recipient, template }) {
  const t = useT();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");
  useBackButton({ isOpen: open, onClose: () => onOpenChange(false) });

  useEffect(() => {
    if (open) setText(template || DEFAULT_THANK_YOU_TEMPLATE);
  }, [open, template]);

  if (!recipient) return null;

  const message = buildThankYouMessage(text, recipient);
  const parts = smsPartCount(message);

  const send = async () => {
    setSending(true);
    try {
      const res = await base44.functions.invoke("sendThankYouSms", { recipientId: recipient.id, message });
      if (res?.data?.success) {
        toast({ title: t.thankYouSent });
        onOpenChange(false);
      } else {
        // Request went through but the SMS provider didn't send it (e.g.
        // no API key configured) — same handling as InviteeRow's resend.
        toast({ title: t.addError, description: t.thankYouFailed, variant: "destructive" });
      }
    } catch {
      toast({ title: t.addError, description: t.thankYouFailed, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{t.sendThankYou}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label>{t.thankYouSection}</Label>
          <Textarea value={text} onChange={e => setText(e.target.value)} className="rounded-xl min-h-[80px]" dir="auto" />
          <p className="text-xs text-muted-foreground">{t.thankYouDialogHint}</p>
        </div>

        <div className="space-y-2">
          <Label>{t.thankYouPreview}</Label>
          <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap" dir="auto">
            {message}
          </div>
          <p className="text-xs text-muted-foreground" dir="ltr">
            {recipient.phone} · {[...message].length} chars · {parts} SMS
          </p>
        </div>

        <div className="flex gap-3 pt-1">
          <Button onClick={send} disabled={sending || !text.trim()} className="flex-1 h-11 rounded-xl gap-2">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {t.sendSms}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending} className="h-11 rounded-xl px-6">
            {t.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
