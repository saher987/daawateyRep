import React, { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { useBatchSend } from "@/hooks/useBatchSend";
import BatchSendProgress, { ConfirmBatchSend } from "@/components/events/BatchSendProgress";

// ImportInvitees' «إرسال الدعوات للجميع»: adds and invites every row of the
// file not yet invited, after a confirmation step, in batches (useBatchSend
// → imported_invitees.py send_imported) with live progress, pause, stop and
// retry — the same flow as the reminder and the bulk thank-you. Each row is
// invited exactly like its own «إرسال دعوة» button, and leaves the saved
// list once its invitation went out.
//
// rows: the saved rows to send (those with a phone); onBatchDone(): called
// after every batch so the page can refresh its list.
export default function ImportSendAllDialog({ open, onOpenChange, rows, eventId, onBatchDone }) {
  const t = useT();
  const [confirming, setConfirming] = useState(false);
  const [already, setAlready] = useState(0);

  const sender = useBatchSend(async (batch) => {
    const data = await base44.imports.send(eventId, batch.map((row) => row.id));
    onBatchDone();
    setAlready((n) => n + data.results.filter((r) => r.already_invited).length);
    // useBatchSend matches results to rows by recipient_id = the row id.
    return data.results.map((r) => ({ ...r, recipient_id: r.id }));
  });
  const { phase, running } = sender;

  const requestClose = () => { if (!running) onOpenChange(false); };
  useBackButton({ isOpen: open, onClose: requestClose });

  useEffect(() => {
    // A paused run survives closing and reopening the dialog.
    if (!open || running || phase === "paused") return;
    setConfirming(false);
    setAlready(0);
    sender.reset();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

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
            {t.importSendAllTitle}
          </DialogTitle>
        </DialogHeader>

        {phase !== "idle" ? (
          <BatchSendProgress
            sender={sender}
            doneText={t.importSendAllDone}
            summary={t.importSendAllSummary
              .replace("{sent}", sender.sent - already)
              .replace("{total}", sender.total)
              .replace("{already}", already)}
            onClose={() => onOpenChange(false)}
          />
        ) : confirming ? (
          <ConfirmBatchSend
            question={t.importSendAllConfirm}
            count={rows.length}
            batchSize={sender.batchSize}
            onConfirm={() => { setConfirming(false); sender.start(rows); }}
            onBack={() => setConfirming(false)}
          />
        ) : (
          <>
            <div className="rounded-xl bg-primary/10 text-sm p-3 space-y-0.5">
              <p className="font-medium">{t.bulkInviteWillReach.replace("{count}", rows.length)}</p>
              <p className="text-xs text-muted-foreground">
                {t.batchInfo.replace("{size}", sender.batchSize).replace("{batches}", Math.ceil(rows.length / sender.batchSize))}
              </p>
            </div>
            <p className="text-xs text-muted-foreground leading-5">{t.importSendAllNote}</p>
            <div className="flex gap-3 pt-1">
              <Button onClick={() => setConfirming(true)} disabled={rows.length === 0} className="flex-1 h-11 rounded-xl gap-2">
                <Send className="w-4 h-4" />
                {t.bulkInviteSendTo.replace("{count}", rows.length)}
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
