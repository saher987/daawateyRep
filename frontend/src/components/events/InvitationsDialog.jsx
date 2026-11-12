import React, { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { useBatchSend } from "@/hooks/useBatchSend";
import BatchSendProgress, { ConfirmBatchSend } from "@/components/events/BatchSendProgress";

// "Send invitations" on the admin event page (admin/manager only, like the
// reminder and the bulk thank-you): sends the invitation to the guests
// already on the list, after a confirmation step, in batches (useBatchSend →
// events.py send_invitations_batch) with live progress, pause, stop and
// retry. Each guest gets exactly what InviteeRow's per-guest resend sends
// (WhatsApp or SMS per INVITATION_CHANNEL, with their personal link).
// By default only guests never sent an invitation (sent_count 0); the
// admin can include everyone.
export default function InvitationsDialog({ open, onOpenChange, recipients, eventId }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [includeSent, setIncludeSent] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const sender = useBatchSend(async (batch) => {
    const { data } = await base44.functions.invoke("sendInvitationBatch", {
      eventId,
      recipientIds: batch.map((r) => r.id),
    });
    return data.results;
  });
  const { phase, running } = sender;

  const requestClose = () => { if (!running) onOpenChange(false); };
  useBackButton({ isOpen: open, onClose: requestClose });

  const { reachable, noContact } = useMemo(() => {
    const withContact = recipients.filter((r) => r.phone || r.email);
    return { reachable: withContact, noContact: recipients.length - withContact.length };
  }, [recipients]);
  const alreadySent = reachable.filter((r) => (r.sent_count || 0) > 0).length;
  const toSend = includeSent ? reachable : reachable.filter((r) => !(r.sent_count > 0));

  useEffect(() => {
    // A paused run survives closing and reopening the dialog.
    if (!open || running || phase === "paused") return;
    setIncludeSent(false);
    setConfirming(false);
    sender.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once sending stops, refresh the list so the sent counts are current.
  useEffect(() => {
    if (phase === "idle" || running) return;
    queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(true) : requestClose())}>
      <DialogContent
        className="sm:max-w-lg max-h-[92dvh] overflow-y-auto"
        dir="rtl"
        onInteractOutside={(e) => running && e.preventDefault()}
        onEscapeKeyDown={(e) => running && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-primary" />
            {t.bulkInviteTitle}
          </DialogTitle>
        </DialogHeader>

        {phase !== "idle" ? (
          <BatchSendProgress
            sender={sender}
            doneText={t.bulkInviteDone}
            summary={t.bulkInviteSummary.replace("{sent}", sender.sent).replace("{total}", sender.total)}
            onClose={() => onOpenChange(false)}
          />
        ) : confirming ? (
          <ConfirmBatchSend
            question={t.bulkInviteConfirm}
            count={toSend.length}
            batchSize={sender.batchSize}
            onConfirm={() => { setConfirming(false); sender.start(toSend); }}
            onBack={() => setConfirming(false)}
          />
        ) : (
          <>
            <div className="rounded-xl bg-primary/10 text-sm p-3 space-y-0.5">
              <p className="font-medium">{t.bulkInviteWillReach.replace("{count}", toSend.length)}</p>
              <p className="text-xs text-muted-foreground">
                {t.batchInfo.replace("{size}", sender.batchSize).replace("{batches}", Math.ceil(toSend.length / sender.batchSize))}
                {noContact > 0 && ` · ${t.bulkInviteNoContact.replace("{count}", noContact)}`}
                {!includeSent && alreadySent > 0 && ` · ${t.bulkInviteSkippedCount.replace("{count}", alreadySent)}`}
              </p>
              {toSend.length === 0 && alreadySent > 0 && <p className="text-xs">{t.bulkInviteAllSent}</p>}
            </div>
            {alreadySent > 0 && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={includeSent} onCheckedChange={(v) => setIncludeSent(!!v)} />
                {t.bulkInviteIncludeSent}
              </label>
            )}
            <p className="text-xs text-muted-foreground">{t.bulkInviteNote}</p>

            <div className="flex gap-3 pt-1">
              <Button onClick={() => setConfirming(true)} disabled={toSend.length === 0} className="flex-1 h-11 rounded-xl gap-2">
                <Send className="w-4 h-4" />
                {t.bulkInviteSendTo.replace("{count}", toSend.length)}
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
