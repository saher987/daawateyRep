import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { useBatchSend } from "@/hooks/useBatchSend";
import BatchSendProgress, { ConfirmBatchSend } from "@/components/events/BatchSendProgress";
import { smsPartCount } from "@/lib/thankYouMessage";
import { DEFAULT_REMINDER_DETAILS, DETAILS_PLACEHOLDERS, buildReminder } from "@/lib/reminderMessage";

// "Send reminder" on the admin event page (admin/manager only — every SMS
// costs money). Picks who gets it by RSVP status, shows how many guests it
// will reach and over which channel, and the reminder's free text with a
// preview per group (accepted / not replied yet) filled in for one of those
// guests. The backend does the sending: push for guests with the app (a
// phone message if the push reaches no device), and for everyone else the
// WhatsApp reminder template or SMS, per INVITATION_CHANNEL.
//
// Like the bulk thank-you: Send asks for confirmation, then the guests go
// out in batches (useBatchSend → events.py send_reminders_batch) with live
// progress, pause / stop between batches and retry for the failed.
const AUDIENCES = ["accepted", "pending", "maybe"];

export default function ReminderDialog({ open, onOpenChange, event, recipients }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState(() => new Set(AUDIENCES));
  const [skipReminded, setSkipReminded] = useState(true);
  const [smsAppUsers, setSmsAppUsers] = useState(false);
  const [details, setDetails] = useState("");
  const [confirming, setConfirming] = useState(false);

  const sender = useBatchSend(async (batch, { details: text, smsAppUsers: alsoSms }) => {
    const { data } = await base44.functions.invoke("sendReminderBatch", {
      eventId: event.id,
      recipientIds: batch.map(r => r.id),
      details: text,
      smsAppUsers: alsoSms,
    });
    return data.results;
  });
  const { phase, running } = sender;
  const requestClose = () => { if (!running) onOpenChange(false); };
  useBackButton({ isOpen: open, onClose: requestClose });

  useEffect(() => {
    // A paused run survives closing and reopening the dialog.
    if (!open || running || phase === "paused") return;
    setDetails(event?.reminder_details || DEFAULT_REMINDER_DETAILS);
    setConfirming(false);
    sender.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once sending stops, refresh the guest list (reminder counts) and the
  // event (its saved reminder text).
  useEffect(() => {
    if (phase === "idle" || running) return;
    queryClient.invalidateQueries({ queryKey: ["event-recipients", event.id] });
    queryClient.invalidateQueries({ queryKey: ["event", event.id] });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const confirmSend = () => {
    setConfirming(false);
    sender.start(targets, { details: details.trim(), smsAppUsers });
  };

  const channelTotals = sender.resultList.reduce(
    (acc, r) => ({ push: acc.push + (r.push ? 1 : 0), whatsapp: acc.whatsapp + (r.whatsapp ? 1 : 0), sms: acc.sms + (r.sms ? 1 : 0) }),
    { push: 0, whatsapp: 0, sms: 0 }
  );

  // How one group's reminder will look: the WhatsApp message (its link is a
  // button there) and the SMS length, for one guest of that group.
  const preview = (label, recipient, group) => {
    if (!recipient) return null;
    const message = buildReminder(details, event, recipient, group);
    return (
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <div className="rounded-xl border bg-muted/30 p-2.5 text-xs space-y-2" dir="rtl">
          <p className="whitespace-pre-wrap">{message.whatsapp}</p>
          <p className="flex items-center justify-center gap-1.5 border-t pt-2 font-medium text-primary">
            <ExternalLink className="w-3.5 h-3.5" />
            {group === "accepted" ? t.reminderButtonDetails : t.reminderButtonConfirm}
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground" dir="ltr">SMS: {[...message.sms].length} chars · {smsPartCount(message.sms)} SMS</p>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={v => (v ? onOpenChange(true) : requestClose())}>
      <DialogContent
        className="sm:max-w-lg max-h-[92dvh] overflow-y-auto"
        dir="rtl"
        onInteractOutside={e => running && e.preventDefault()}
        onEscapeKeyDown={e => running && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BellRing className="w-5 h-5 text-primary" />
            {t.sendReminder}
          </DialogTitle>
        </DialogHeader>

        {phase !== "idle" ? (
          <BatchSendProgress
            sender={sender}
            doneText={t.reminderDone}
            summary={`${t.reminderBatchSummary.replace("{sent}", sender.sent).replace("{total}", sender.total)} · ${t.reminderSentChannels
              .replace("{push}", channelTotals.push)
              .replace("{whatsapp}", channelTotals.whatsapp)
              .replace("{sms}", channelTotals.sms)}`}
            onClose={() => onOpenChange(false)}
          />
        ) : confirming ? (
          <ConfirmBatchSend
            question={t.reminderConfirm}
            count={targets.length}
            batchSize={sender.batchSize}
            onConfirm={confirmSend}
            onBack={() => setConfirming(false)}
          />
        ) : (
        <>
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
          {targets.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {t.batchInfo.replace("{size}", sender.batchSize).replace("{batches}", Math.ceil(targets.length / sender.batchSize))}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm">{t.reminderDetailsLabel}</Label>
          <Textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={500} className="rounded-xl min-h-[80px] text-sm" dir="rtl" />
          <p className="text-[11px] text-muted-foreground">
            {t.reminderDetailsHint} <span dir="ltr">{DETAILS_PLACEHOLDERS.map(p => `[${p}]`).join(" ")}</span>
          </p>
        </div>
        {wantsAccepted && preview(t.reminderPreviewAccepted, previewAccepted, "accepted")}
        {wantsPending && preview(t.reminderPreviewPending, previewPending, "pending")}

        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => setConfirming(true)}
            disabled={started || targets.length === 0 || !details.trim()}
            className="flex-1 h-11 rounded-xl gap-2"
          >
            <BellRing className="w-4 h-4" />
            {t.reminderSendTo.replace("{count}", targets.length)}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-6">
            {t.cancel}
          </Button>
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
