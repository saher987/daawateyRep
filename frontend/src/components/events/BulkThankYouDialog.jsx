import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Loader2, Pause, Play, RotateCcw, Square } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { recipientDisplayName } from "@/lib/recipientName";
import { buildThankYouMessage, smsPartCount, DEFAULT_THANK_YOU_TEMPLATE, fillWhatsappThanks } from "@/lib/thankYouMessage";

// "Thank guests" on the admin event page (admin/manager only, like the
// per-guest heart in InviteeRow): sends the thank-you to every accepted
// guest with a phone number. The list is split into batches of BATCH_SIZE,
// sent one request at a time (events.py send_thanks_batch), so the dialog
// can show live progress per batch and pause or stop between batches.
// Each message is filled in per guest here, same as ThankYouDialog.
// Guests already thanked (thanked_at, set by the backend on every send
// that went out) are left out unless the admin unticks the skip option.
//
// What a guest gets (WhatsApp template or SMS) follows the same rule as
// the single send — see ThankYouDialog's comment.
const BATCH_SIZE = 10;

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

const formatDuration = (ms) => {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export default function BulkThankYouDialog({ open, onOpenChange, recipients, template, whatsappThanks, eventId }) {
  const t = useT();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [skipThanked, setSkipThanked] = useState(true);
  // The list this run sends to, fixed at Send: the guest list refreshes as
  // thanked_at changes, which mustn't shift the totals mid-run.
  const [runTargets, setRunTargets] = useState([]);
  // compose → running ⇄ paused → done | stopped
  const [phase, setPhase] = useState("compose");
  const [pausing, setPausing] = useState(false);
  // recipient id → { success, channel, error } for everyone sent so far.
  const [results, setResults] = useState({});
  // The current run's batches (the whole list, or only the failed on retry).
  const [batches, setBatches] = useState([]);
  const [batchStatus, setBatchStatus] = useState([]);
  const [current, setCurrent] = useState(0);
  const [msPerBatch, setMsPerBatch] = useState(null);
  const control = useRef({ pause: false, stop: false, next: 0, text: "", durations: [] });

  const running = phase === "running";
  const requestClose = () => { if (!running) onOpenChange(false); };
  useBackButton({ isOpen: open, onClose: requestClose });

  const { eligible, noPhone } = useMemo(() => {
    const accepted = recipients.filter(r => r.rsvp_status === "accepted");
    return { eligible: accepted.filter(r => r.phone), noPhone: accepted.filter(r => !r.phone).length };
  }, [recipients]);
  const alreadyThanked = eligible.filter(r => r.thanked_at).length;
  const toSend = skipThanked ? eligible.filter(r => !r.thanked_at) : eligible;
  const targets = phase === "compose" ? toSend : runTargets;

  useEffect(() => {
    // A paused run survives closing and reopening the dialog.
    if (!open || running || phase === "paused") return;
    setText(template || DEFAULT_THANK_YOU_TEMPLATE);
    setSkipThanked(true);
    setPhase("compose");
    setResults({});
    setBatches([]);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the page mid-send would stop it halfway.
  useEffect(() => {
    if (!running) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  // Once sending stops (paused, done or stopped), refresh the guest list so
  // the thanked marks and the skip count are current.
  useEffect(() => {
    if (phase === "compose" || running) return;
    queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const runFrom = async (runBatches, startIndex) => {
    const c = control.current;
    c.pause = false;
    c.stop = false;
    setPausing(false);
    setPhase("running");
    for (let i = startIndex; i < runBatches.length; i++) {
      if (c.stop) { setPhase("stopped"); return; }
      if (c.pause) { c.next = i; setPausing(false); setPhase("paused"); return; }
      setCurrent(i);
      setBatchStatus(s => s.map((v, j) => (j === i ? "active" : v)));
      const batch = runBatches[i];
      const started = performance.now();
      let batchResults;
      try {
        const { data } = await base44.functions.invoke("sendThankYouBatch", {
          eventId,
          items: batch.map(r => ({ recipientId: r.id, message: buildThankYouMessage(c.text, r) })),
        });
        batchResults = data.results;
      } catch (err) {
        // The request itself failed (e.g. offline): count this batch as
        // failed and pause, so the rest doesn't fail the same way.
        batchResults = batch.map(r => ({ recipient_id: r.id, success: false, error: err.message }));
        c.pause = true;
      }
      c.durations.push(performance.now() - started);
      setMsPerBatch(c.durations.reduce((a, b) => a + b, 0) / c.durations.length);
      const failed = batchResults.filter(r => !r.success).length;
      setResults(prev => {
        const next = { ...prev };
        for (const r of batchResults) next[r.recipient_id] = r;
        return next;
      });
      setBatchStatus(s => s.map((v, j) => (j === i ? (failed === 0 ? "done" : failed === batch.length ? "failed" : "partial") : v)));
    }
    if (c.pause && !c.stop) {
      c.next = runBatches.length;
      setPhase("done");
      return;
    }
    setPhase(c.stop ? "stopped" : "done");
  };

  const start = (list) => {
    const runBatches = chunk(list, BATCH_SIZE);
    control.current.durations = [];
    setMsPerBatch(null);
    setBatches(runBatches);
    setBatchStatus(runBatches.map(() => "queued"));
    setCurrent(0);
    runFrom(runBatches, 0);
  };

  const send = () => {
    control.current.text = text;
    setResults({});
    setRunTargets(toSend);
    start(toSend);
  };

  const retryFailed = () => {
    const failedList = targets.filter(r => results[r.id] && !results[r.id].success);
    setResults(prev => {
      const next = { ...prev };
      for (const r of failedList) delete next[r.id];
      return next;
    });
    start(failedList);
  };

  const pause = () => { control.current.pause = true; setPausing(true); };
  const resume = () => runFrom(batches, control.current.next);
  const stop = () => {
    control.current.stop = true;
    if (phase === "paused") setPhase("stopped");
    else setPausing(true);
  };

  // Totals cover the whole list, across retries.
  const total = targets.length;
  const resultList = Object.values(results);
  const sent = resultList.filter(r => r.success).length;
  const failed = resultList.length - sent;
  const remaining = total - sent - failed;
  const pct = total ? Math.round(((sent + failed) / total) * 100) : 0;
  const whatsappCount = resultList.filter(r => r.success && r.channel === "whatsapp").length;
  const smsCount = sent - whatsappCount;
  const batchesDone = batchStatus.filter(s => s !== "queued" && s !== "active").length;
  const batchesLeft = batches.length - batchesDone;
  const failedNames = targets.filter(r => results[r.id] && !results[r.id].success).map(recipientDisplayName);
  const notReached = phase === "stopped" || phase === "done" ? remaining : 0;

  const preview = targets[0];
  const message = preview ? buildThankYouMessage(text, preview) : "";
  const batchCount = Math.ceil(total / BATCH_SIZE);

  const statusText = {
    running: pausing ? t.bulkThanksPausing : t.bulkThanksSending.replace("{current}", current + 1).replace("{total}", batches.length),
    paused: t.bulkThanksPaused.replace("{count}", sent + failed),
    done: failed ? t.bulkThanksDoneWithFailures.replace("{count}", failed) : t.bulkThanksDone,
    stopped: t.bulkThanksStopped,
  }[phase];

  const dotClass = { running: "bg-primary", paused: "bg-warning", done: failed ? "bg-warning" : "bg-success", stopped: "bg-destructive" }[phase];

  const tileClass = {
    queued: "bg-muted text-muted-foreground",
    active: "bg-primary/15 text-primary ring-1 ring-primary/50 animate-pulse",
    done: "bg-success text-success-foreground",
    partial: "bg-warning text-warning-foreground",
    failed: "bg-destructive text-destructive-foreground",
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
            <Heart className="w-5 h-5 text-primary" />
            {t.bulkThanksTitle}
          </DialogTitle>
        </DialogHeader>

        {phase === "compose" ? (
          <>
            <div className="rounded-xl bg-primary/10 text-sm p-3 space-y-0.5">
              <p className="font-medium">{t.bulkThanksWillReach.replace("{count}", total)}</p>
              <p className="text-xs text-muted-foreground">
                {t.bulkThanksBatchesInfo.replace("{size}", BATCH_SIZE).replace("{batches}", batchCount)}
                {noPhone > 0 && ` · ${t.bulkThanksNoPhone.replace("{count}", noPhone)}`}
                {skipThanked && alreadyThanked > 0 && ` · ${t.bulkThanksSkippedCount.replace("{count}", alreadyThanked)}`}
              </p>
              {total === 0 && alreadyThanked > 0 && <p className="text-xs">{t.bulkThanksAllThanked}</p>}
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
              <Button onClick={send} disabled={total === 0 || !text.trim()} className="flex-1 h-11 rounded-xl gap-2">
                <Heart className="w-4 h-4" />
                {t.bulkThanksSendTo.replace("{count}", total)}
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-6">
                {t.cancel}
              </Button>
            </div>
          </>
        ) : (
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

            <div
              className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="h-full bg-success transition-[width] duration-500 ease-out" style={{ width: `${total ? (sent / total) * 100 : 0}%` }} />
              <div className="flex-1" />
              <div className="h-full bg-destructive transition-[width] duration-500 ease-out" style={{ width: `${total ? (failed / total) * 100 : 0}%` }} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: t.bulkThanksSent, value: sent, cls: "text-success" },
                { label: t.bulkThanksFailed, value: failed, cls: failed ? "text-destructive" : "" },
                { label: t.bulkThanksRemaining, value: remaining, cls: "" },
                {
                  label: t.bulkThanksTimeLeft,
                  value: running && msPerBatch && batchesLeft > 0 ? `~${formatDuration(msPerBatch * batchesLeft)}` : "—",
                  cls: "",
                },
              ].map(s => (
                <div key={s.label} className="rounded-xl border bg-card px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">{s.label}</p>
                  <p className={`text-lg font-semibold tabular-nums ${s.cls}`} dir="ltr">{s.value}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t.bulkThanksBatches}</span>
                <span dir="ltr">{t.bulkThanksBatchesComplete.replace("{done}", batchesDone).replace("{total}", batches.length)}</span>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(1.75rem,1fr))] gap-1.5">
                {batchStatus.map((s, i) => (
                  <div
                    key={i}
                    title={`${i + 1} · ${batches[i]?.length ?? 0}`}
                    className={`h-7 rounded-md grid place-items-center text-[10px] font-medium tabular-nums transition-colors ${
                      phase === "stopped" && s === "queued" ? "border border-dashed text-muted-foreground" : tileClass[s]
                    }`}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-0.5">
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-success" />{t.bulkThanksLegendSent}</span>
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-primary/30" />{t.bulkThanksLegendActive}</span>
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-warning" />{t.bulkThanksLegendPartial}</span>
                <span className="flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm bg-muted border" />{t.bulkThanksLegendQueued}</span>
              </div>
            </div>

            {running && <p className="text-xs text-muted-foreground">{t.bulkThanksKeepOpen}</p>}

            {(phase === "done" || phase === "stopped") && (
              <div className={`rounded-xl p-3 text-sm space-y-1 ${failed || notReached ? "bg-warning/15" : "bg-success/15"}`}>
                <p className="font-medium">
                  {t.bulkThanksSummary
                    .replace("{sent}", sent)
                    .replace("{total}", total)
                    .replace("{whatsapp}", whatsappCount)
                    .replace("{sms}", smsCount)}
                </p>
                {failed > 0 && <p className="text-xs text-muted-foreground">{t.bulkThanksFailedHint.replace("{count}", failed)}</p>}
                {notReached > 0 && <p className="text-xs text-muted-foreground">{t.bulkThanksStoppedHint.replace("{count}", notReached)}</p>}
              </div>
            )}

            {failedNames.length > 0 && !running && (
              <div className="text-xs text-muted-foreground max-h-24 overflow-y-auto">
                <span className="font-medium text-destructive">{t.bulkThanksFailedTo}</span>{" "}
                {failedNames.join("، ")}
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-1">
              {running && (
                <>
                  <Button variant="outline" onClick={pause} disabled={pausing} className="h-10 rounded-xl gap-2">
                    {pausing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                    {t.bulkThanksPause}
                  </Button>
                  <Button variant="outline" onClick={stop} disabled={pausing} className="h-10 rounded-xl gap-2 text-destructive hover:text-destructive">
                    <Square className="w-4 h-4" />
                    {t.bulkThanksStop}
                  </Button>
                </>
              )}
              {phase === "paused" && (
                <>
                  <Button onClick={resume} className="h-10 rounded-xl gap-2">
                    <Play className="w-4 h-4" />
                    {t.bulkThanksResume}
                  </Button>
                  <Button variant="outline" onClick={stop} className="h-10 rounded-xl gap-2 text-destructive hover:text-destructive">
                    <Square className="w-4 h-4" />
                    {t.bulkThanksStop}
                  </Button>
                </>
              )}
              {(phase === "done" || phase === "stopped") && (
                <>
                  {failed > 0 && (
                    <Button variant="outline" onClick={retryFailed} className="h-10 rounded-xl gap-2">
                      <RotateCcw className="w-4 h-4" />
                      {t.bulkThanksRetry.replace("{count}", failed)}
                    </Button>
                  )}
                  <Button onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-6">
                    {t.bulkThanksClose}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
