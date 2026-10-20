import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { smsPartCount } from "@/lib/thankYouMessage";
import { DEFAULT_REMINDER_ACCEPTED, DEFAULT_REMINDER_PENDING, REMINDER_PLACEHOLDERS, fillReminder } from "@/lib/reminderMessage";

// "Send reminder" on the admin event page (admin/manager only — every SMS
// costs money). Picks who gets it by RSVP status, shows how many guests it
// will reach and over which channel, and the two texts (accepted / not
// replied yet) with a preview filled in for one of those guests. The
// backend does the sending: push for guests with the app (SMS if the push
// reaches no device), SMS for everyone else.
const AUDIENCES = ["accepted", "pending", "maybe"];

export default function ReminderDialog({ open, onOpenChange, event, recipients }) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState(() => new Set(AUDIENCES));
  const [skipReminded, setSkipReminded] = useState(true);
  const [smsAppUsers, setSmsAppUsers] = useState(false);
  const [textAccepted, setTextAccepted] = useState("");
  const [textPending, setTextPending] = useState("");
  const [sending, setSending] = useState(false);
  useBackButton({ isOpen: open, onClose: () => onOpenChange(false) });

  useEffect(() => {
    if (!open) return;
    setTextAccepted(event?.reminder_message || DEFAULT_REMINDER_ACCEPTED);
    setTextPending(event?.reminder_message_pending || DEFAULT_REMINDER_PENDING);
  }, [open, event]);

  const audienceLabel = { accepted: t.accepted, pending: t.pending, maybe: t.statusMaybe };
  const countByStatus = useMemo(
    () => Object.fromEntries(AUDIENCES.map(s => [s, recipients.filter(r => r.rsvp_status === s).length])),
    [recipients]
  );

  // Same selection rules as the backend (events.py send_reminders).
  const { targets, skipped } = useMemo(() => {
    const inAudience = recipients.filter(r => statuses.has(r.rsvp_status) && (r.user_id || r.phone));
    const already = inAudience.filter(r => r.last_reminded_at);
    return { targets: skipReminded ? inAudience.filter(r => !r.last_reminded_at) : inAudience, skipped: skipReminded ? already.length : 0 };
  }, [recipients, statuses, skipReminded]);
  const appCount = targets.filter(r => r.user_id).length;
  const smsCount = targets.filter(r => r.phone && (!r.user_id || smsAppUsers)).length;

  const started = event?.date && new Date(event.date) <= new Date();
  const wantsAccepted = statuses.has("accepted");
  const wantsPending = statuses.has("pending") || statuses.has("maybe");
  const previewAccepted = targets.find(r => r.rsvp_status === "accepted") || recipients[0];
  const previewPending = targets.find(r => r.rsvp_status !== "accepted") || recipients[0];

  const toggle = (s) => setStatuses(prev => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s);
    else next.add(s);
    return next;
  });

  const send = async () => {
    setSending(true);
    try {
      const { data } = await base44.functions.invoke("sendEventReminders", {
        eventId: event.id,
        statuses: [...statuses],
        // Both are required by the API; an unselected group's text may be blank.
        message_accepted: textAccepted.trim() || DEFAULT_REMINDER_ACCEPTED,
        message_pending: textPending.trim() || DEFAULT_REMINDER_PENDING,
        include_already_reminded: !skipReminded,
        sms_app_users: smsAppUsers,
      });
      toast({
        title: t.reminderSentTitle.replace("{count}", data.reminded),
        description: [
          t.reminderSentChannels.replace("{push}", data.push).replace("{sms}", data.sms),
          data.failed ? t.reminderFailedCount.replace("{count}", data.failed) : null,
        ].filter(Boolean).join(" · "),
        variant: data.reminded === 0 && data.failed > 0 ? "destructive" : undefined,
      });
      queryClient.invalidateQueries({ queryKey: ["event-recipients", event.id] });
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      onOpenChange(false);
    } catch (err) {
      toast({ title: t.addError, description: err.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const textBlock = (label, value, setValue, previewFor) => {
    const message = previewFor ? fillReminder(value, event, previewFor) : "";
    return (
      <div className="space-y-1.5">
        <Label className="text-sm">{label}</Label>
        <Textarea value={value} onChange={e => setValue(e.target.value)} className="rounded-xl min-h-[90px] text-sm" dir="rtl" />
        {previewFor && (
          <>
            <div className="rounded-xl border bg-muted/30 p-2.5 text-xs whitespace-pre-wrap" dir="rtl">{message}</div>
            <p className="text-[11px] text-muted-foreground" dir="ltr">{[...message].length} chars · {smsPartCount(message)} SMS</p>
          </>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[92dvh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            {t.sendReminder}
          </DialogTitle>
        </DialogHeader>

        {started && <p className="text-sm text-destructive">{t.reminderEventStarted}</p>}

        <div className="space-y-2">
          <Label className="text-sm">{t.reminderAudience}</Label>
          <div className="flex flex-wrap gap-2">
            {AUDIENCES.map(s => (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                  statuses.has(s) ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
              >
                {audienceLabel[s]}
                <span className={`text-xs px-1.5 rounded-full ${statuses.has(s) ? "bg-primary-foreground/20" : "bg-background"}`}>{countByStatus[s]}</span>
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={skipReminded} onCheckedChange={v => setSkipReminded(!!v)} />
            {t.reminderSkipReminded}
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={smsAppUsers} onCheckedChange={v => setSmsAppUsers(!!v)} />
            {t.reminderSmsAppUsers}
          </label>
        </div>

        <div className="rounded-xl bg-primary/10 text-sm p-3 space-y-0.5">
          <p className="font-medium">{t.reminderWillReach.replace("{count}", targets.length)}</p>
          <p className="text-xs text-muted-foreground">
            {t.reminderChannelsEstimate.replace("{push}", appCount).replace("{sms}", smsCount)}
            {skipped > 0 && ` · ${t.reminderSkippedCount.replace("{count}", skipped)}`}
          </p>
        </div>

        {wantsAccepted && textBlock(t.reminderTextAccepted, textAccepted, setTextAccepted, previewAccepted)}
        {wantsPending && textBlock(t.reminderTextPending, textPending, setTextPending, previewPending)}
        <p className="text-[11px] text-muted-foreground" dir="ltr">
          {REMINDER_PLACEHOLDERS.map(p => `[${p}]`).join(" ")}
        </p>

        <div className="flex gap-3 pt-1">
          <Button
            onClick={send}
            disabled={sending || started || targets.length === 0 || (wantsAccepted && !textAccepted.trim()) || (wantsPending && !textPending.trim())}
            className="flex-1 h-11 rounded-xl gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
            {t.reminderSendTo.replace("{count}", targets.length)}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending} className="h-11 rounded-xl px-6">
            {t.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
