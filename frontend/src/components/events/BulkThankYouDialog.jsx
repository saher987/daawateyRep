import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { useBatchSend } from "@/hooks/useBatchSend";
import { recipientDisplayName } from "@/lib/recipientName";
import { buildThankYouMessage, smsPartCount, DEFAULT_THANK_YOU_TEMPLATE, fillWhatsappThanks } from "@/lib/thankYouMessage";
import BatchSendProgress, { ConfirmBatchSend } from "@/components/events/BatchSendProgress";

// "Thank guests" on the admin event page (admin/manager only, like the
// per-guest heart in InviteeRow): sends the thank-you to every accepted
// guest with a phone number, after a confirmation step, in batches
// (useBatchSend → events.py send_thanks_batch) with live progress.
// Each message is filled in per guest here, same as ThankYouDialog.
// Guests already thanked (thanked_at, set by the backend on every send
// that went out) are left out unless the admin unticks the skip option.
//
// What a guest gets (WhatsApp template or SMS) follows the same rule as
// the single send — see ThankYouDialog's comment.
export default function BulkThankYouDialog({ open, onOpenChange, recipients, template, whatsappThanks, eventId }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [skipThanked, setSkipThanked] = useState(true);
  const [confirming, setConfirming] = useState(false);

  const sender = useBatchSend(async (batch, messageText) => {
    const { data } = await base44.functions.invoke("sendThankYouBatch", {
      eventId,
      items: batch.map(r => ({ recipientId: r.id, message: buildThankYouMessage(messageText, r) })),
    });
    return data.results;
  });
  const { phase, running } = sender;

  const requestClose = () => { if (!running) onOpenChange(false); };
  useBackButton({ isOpen: open, onClose: requestClose });

  const { eligible, noPhone } = useMemo(() => {
    const accepted = recipients.filter(r => r.rsvp_status === "accepted");
    return { eligible: accepted.filter(r => r.phone), noPhone: accepted.filter(r => !r.phone).length };
  }, [recipients]);
  const alreadyThanked = eligible.filter(r => r.thanked_at).length;
  const toSend = skipThanked ? eligible.filter(r => !r.thanked_at) : eligible;

  useEffect(() => {
    // A paused run survives closing and reopening the dialog.
    if (!open || running || phase === "paused") return;
    setText(template || DEFAULT_THANK_YOU_TEMPLATE);
    setSkipThanked(true);
    setConfirming(false);
    sender.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once sending stops (paused, done or stopped), refresh the guest list so
  // the thanked marks and the skip count are current.
  useEffect(() => {
    if (phase === "idle" || running) return;
    queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirmSend = () => {
    setConfirming(false);
    sender.start(toSend, text);
  };

  const preview = toSend[0];
  const message = preview ? buildThankYouMessage(text, preview) : "";
  const whatsappCount = sender.resultList.filter(r => r.success && r.channel === "whatsapp").length;

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
            <Heart className="w-5 h-5 text-primary" />
            {t.bulkThanksTitle}
          </DialogTitle>
        </DialogHeader>

        {phase !== "idle" ? (
          <BatchSendProgress
            sender={sender}
            doneText={t.bulkThanksDone}
            summary={t.bulkThanksSummary
              .replace("{sent}", sender.sent)
              .replace("{total}", sender.total)
              .replace("{whatsapp}", whatsappCount)
              .replace("{sms}", sender.sent - whatsappCount)}
            onClose={() => onOpenChange(false)}
          />
        ) : confirming ? (
          <ConfirmBatchSend
            question={t.bulkThanksConfirm}
            count={toSend.length}
            batchSize={sender.batchSize}
            onConfirm={confirmSend}
            onBack={() => setConfirming(false)}
          />
        ) : (
          <>
            <div className="rounded-xl bg-primary/10 text-sm p-3 space-y-0.5">
              <p className="font-medium">{t.bulkThanksWillReach.replace("{count}", toSend.length)}</p>
              <p className="text-xs text-muted-foreground">
                {t.batchInfo.replace("{size}", sender.batchSize).replace("{batches}", Math.ceil(toSend.length / sender.batchSize))}
                {noPhone > 0 && ` · ${t.bulkThanksNoPhone.replace("{count}", noPhone)}`}
                {skipThanked && alreadyThanked > 0 && ` · ${t.bulkThanksSkippedCount.replace("{count}", alreadyThanked)}`}
              </p>
              {toSend.length === 0 && alreadyThanked > 0 && <p className="text-xs">{t.bulkThanksAllThanked}</p>}
            </div>
            {alreadyThanked > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={skipThanked} onCheckedChange={v => setSkipThanked(!!v)} />
                {t.bulkThanksSkipThanked}
              </label>
            )}

            <div className="space-y-2">
              <Label>{t.thankYouSection}</Label>
              <Textarea value={text} onChange={e => setText(e.target.value)} className="rounded-xl min-h-[80px]" dir="auto" />
              <p className="text-xs text-muted-foreground">{t.thankYouDialogHint}</p>
            </div>

            {whatsappThanks ? (
              <div className="space-y-2">
                <Label>{t.thankYouWhatsappPreview}</Label>
                <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap" dir="auto">
                  {fillWhatsappThanks(whatsappThanks)}
                </div>
                <p className="text-xs text-muted-foreground">{t.thankYouWhatsappDialogHint}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t.thankYouWhatsappNotSet}</p>
            )}

            {preview && (
              <div className="space-y-2">
                <Label>{t.bulkThanksPreviewFor.replace("{name}", recipientDisplayName(preview))}</Label>
                <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap" dir="auto">{message}</div>
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {[...message].length} chars · {smsPartCount(message)} SMS
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <Button onClick={() => setConfirming(true)} disabled={toSend.length === 0 || !text.trim()} className="flex-1 h-11 rounded-xl gap-2">
                <Heart className="w-4 h-4" />
                {t.bulkThanksSendTo.replace("{count}", toSend.length)}
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
