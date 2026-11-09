import React from "react";
import { AlertTriangle, Loader2, Pause, Play, RotateCcw, Send, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { recipientDisplayName } from "@/lib/recipientName";

// Shared by BulkThankYouDialog and ReminderDialog: the confirmation step
// before a bulk send, and the live progress of a useBatchSend run.

export function ConfirmBatchSend({ question, count, batchSize, onConfirm, onBack }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 flex gap-3">
        <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <div className="space-y-1 min-w-0">
          <p className="font-semibold">{question.replace("{count}", count)}</p>
          <p className="text-sm text-muted-foreground">
            {t.batchConfirmNote.replace("{size}", batchSize).replace("{batches}", Math.ceil(count / batchSize))}
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <Button onClick={onConfirm} className="flex-1 h-11 rounded-xl gap-2">
          <Send className="w-4 h-4" />
          {t.batchConfirmBtn}
        </Button>
        <Button variant="outline" onClick={onBack} className="h-11 rounded-xl px-6">
          {t.batchBack}
        </Button>
      </div>
    </div>
  );
}

const formatDuration = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const TILE = {
  queued: "bg-muted text-muted-foreground",
  active: "bg-primary/15 text-primary ring-1 ring-primary/50 animate-pulse",
  done: "bg-success text-success-foreground",
  partial: "bg-warning text-warning-foreground",
  failed: "bg-destructive text-destructive-foreground",
};

// `doneText`: the status line when everything went out; `summary`: the
// first line of the end banner (e.g. the channel breakdown).
export default function BatchSendProgress({ sender, doneText, summary, onClose }) {
  const t = useT();
  const { phase, running, pausing, total, sent, failed, remaining, batches, batchStatus, current, msPerBatch, failedTargets } = sender;
  const pct = total ? Math.round(((sent + failed) / total) * 100) : 0;
  const batchesDone = batchStatus.filter(s => s !== "queued" && s !== "active").length;
  const batchesLeft = batches.length - batchesDone;
  const finished = phase === "done" || phase === "stopped";

  const statusText = {
    running: pausing ? t.batchPausing : t.batchSending.replace("{current}", current + 1).replace("{total}", batches.length),
    paused: t.batchPaused.replace("{count}", sent + failed),
    done: failed ? t.batchDoneWithFailures.replace("{count}", failed) : doneText,
    stopped: t.batchStopped,
  }[phase];
  const dotClass = { running: "bg-primary", paused: "bg-warning", done: failed ? "bg-warning" : "bg-success", stopped: "bg-destructive" }[phase];

  const stats = [
    { label: t.batchSent, value: sent, cls: "text-success" },
    { label: t.batchFailed, value: failed, cls: failed ? "text-destructive" : "" },
    { label: t.batchRemaining, value: remaining, cls: "" },
    { label: t.batchTimeLeft, value: running && msPerBatch && batchesLeft > 0 ? `~${formatDuration(msPerBatch * batchesLeft)}` : "—", cls: "" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2.5 font-medium text-sm min-w-0">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {running && !pausing && <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dotClass}`} />
          </span>
          <span className="truncate">{statusText}</span>
        </div>
        <p className="text-3xl font-semibold tabular-nums leading-none" dir="ltr">
          {pct}<span className="text-base text-muted-foreground">%</span>
        </p>
      </div>

      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="h-full bg-success transition-[width] duration-500 ease-out" style={{ width: `${total ? (sent / total) * 100 : 0}%` }} />
        <div className="flex-1" />
        <div className="h-full bg-destructive transition-[width] duration-500 ease-out" style={{ width: `${total ? (failed / total) * 100 : 0}%` }} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl border bg-card px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${s.cls}`} dir="ltr">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{t.batchBatches}</span>
          <span dir="ltr">{t.batchBatchesComplete.replace("{done}", batchesDone).replace("{total}", batches.length)}</span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))] gap-1.5">
          {batchStatus.map((s, i) => (
            <div
              key={i}
              title={`${i + 1} · ${batches[i]?.length ?? 0}`}
              className={`h-7 rounded-md grid place-items-center text-[10px] font-medium tabular-nums transition-colors ${
                phase === "stopped" && s === "queued" ? "border border-dashed text-muted-foreground" : TILE[s]
              }`}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-0.5">
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-success" />{t.batchLegendSent}</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-primary/30" />{t.batchLegendActive}</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-warning" />{t.batchLegendPartial}</span>
          <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-muted border" />{t.batchLegendQueued}</span>
        </div>
      </div>

      {running && <p className="text-xs text-muted-foreground">{t.batchKeepOpen}</p>}

      {finished && (
        <div className={`rounded-xl p-3 text-sm space-y-1 ${failed || remaining ? "bg-warning/15" : "bg-success/15"}`}>
          <p className="font-medium">{summary}</p>
          {failed > 0 && <p className="text-xs text-muted-foreground">{t.batchFailedHint.replace("{count}", failed)}</p>}
          {remaining > 0 && <p className="text-xs text-muted-foreground">{t.batchStoppedHint.replace("{count}", remaining)}</p>}
        </div>
      )}

      {failedTargets.length > 0 && !running && (
        <div className="text-xs text-muted-foreground max-h-24 overflow-y-auto">
          <span className="font-medium text-destructive">{t.batchFailedTo}</span>{" "}
          {failedTargets.map(recipientDisplayName).join("، ")}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-end pt-1">
        {running && (
          <>
            <Button variant="outline" onClick={sender.pause} disabled={pausing} className="h-10 rounded-xl gap-2">
              {pausing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
              {t.batchPause}
            </Button>
            <Button variant="outline" onClick={sender.stop} disabled={pausing} className="h-10 rounded-xl gap-2 text-destructive hover:text-destructive">
              <Square className="w-4 h-4" />
              {t.batchStop}
            </Button>
          </>
        )}
        {phase === "paused" && (
          <>
            <Button onClick={sender.resume} className="h-10 rounded-xl gap-2">
              <Play className="w-4 h-4" />
              {t.batchResume}
            </Button>
            <Button variant="outline" onClick={sender.stop} className="h-10 rounded-xl gap-2 text-destructive hover:text-destructive">
              <Square className="w-4 h-4" />
              {t.batchStop}
            </Button>
          </>
        )}
        {finished && (
          <>
            {failed > 0 && (
              <Button variant="outline" onClick={sender.retryFailed} className="h-10 rounded-xl gap-2">
                <RotateCcw className="w-4 h-4" />
                {t.batchRetry.replace("{count}", failed)}
              </Button>
            )}
            <Button onClick={onClose} className="h-10 rounded-xl px-6">
              {t.batchClose}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
