import { useEffect, useRef, useState } from "react";

// Sends a list of guests in batches, one request at a time, with pause /
// resume / stop between batches — the engine behind the bulk thank-you
// and the reminder dialogs; BatchSendProgress shows its state.
//
// sendBatch(batch, context) sends one batch and resolves to one result per
// guest: { recipient_id, success, error?, ...anything the caller wants }.
// `context` is whatever start() was given (e.g. the message text), fixed
// for the whole run so editing the dialog mid-run changes nothing.
//
// phase: idle → running ⇄ paused → done | stopped
export const BATCH_SIZE = 10;

const chunk = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

export function useBatchSend(sendBatch, { batchSize = BATCH_SIZE } = {}) {
  const [phase, setPhase] = useState("idle");
  const [pausing, setPausing] = useState(false);
  // Everyone this run is for, fixed at start: the guest list refreshes
  // while sending, which mustn't shift the totals.
  const [targets, setTargets] = useState([]);
  // recipient id → result, for everyone sent so far (kept across retries).
  const [results, setResults] = useState({});
  // The current pass's batches: all targets, or only the failed on retry.
  const [batches, setBatches] = useState([]);
  const [batchStatus, setBatchStatus] = useState([]);
  const [current, setCurrent] = useState(0);
  const [msPerBatch, setMsPerBatch] = useState(null);
  const control = useRef({ pause: false, stop: false, next: 0, context: null, durations: [] });
  const sendRef = useRef(sendBatch);
  sendRef.current = sendBatch;

  const running = phase === "running";

  // Leaving the page mid-send would stop it halfway.
  useEffect(() => {
    if (!running) return;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const runFrom = async (passBatches, startIndex) => {
    const c = control.current;
    c.pause = false;
    c.stop = false;
    setPausing(false);
    setPhase("running");
    for (let i = startIndex; i < passBatches.length; i++) {
      if (c.stop) { setPhase("stopped"); return; }
      if (c.pause) { c.next = i; setPausing(false); setPhase("paused"); return; }
      setCurrent(i);
      setBatchStatus(s => s.map((v, j) => (j === i ? "active" : v)));
      const batch = passBatches[i];
      const started = performance.now();
      let batchResults;
      try {
        batchResults = await sendRef.current(batch, c.context);
      } catch (err) {
        // The request itself failed (offline, event started…): count this
        // batch as failed and pause, so the rest doesn't fail the same way.
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
    setPausing(false);
    setPhase(c.stop ? "stopped" : "done");
  };

  const startPass = (list) => {
    const passBatches = chunk(list, batchSize);
    control.current.durations = [];
    setMsPerBatch(null);
    setBatches(passBatches);
    setBatchStatus(passBatches.map(() => "queued"));
    setCurrent(0);
    runFrom(passBatches, 0);
  };

  const start = (list, context) => {
    control.current.context = context;
    setTargets(list);
    setResults({});
    startPass(list);
  };

  const failedTargets = targets.filter(r => results[r.id] && !results[r.id].success);

  const retryFailed = () => {
    const list = failedTargets;
    setResults(prev => {
      const next = { ...prev };
      for (const r of list) delete next[r.id];
      return next;
    });
    startPass(list);
  };

  const pause = () => { control.current.pause = true; setPausing(true); };
  const resume = () => runFrom(batches, control.current.next);
  const stop = () => {
    control.current.stop = true;
    if (phase === "paused") setPhase("stopped");
    else setPausing(true);
  };
  const reset = () => {
    setPhase("idle");
    setTargets([]);
    setResults({});
    setBatches([]);
    setBatchStatus([]);
  };

  // Totals cover the whole run, across retries.
  const resultList = Object.values(results);
  const sent = resultList.filter(r => r.success).length;
  const failed = resultList.length - sent;
  const total = targets.length;

  return {
    phase, running, pausing, targets, results, resultList, batches, batchStatus, current, msPerBatch, batchSize,
    total, sent, failed, remaining: total - sent - failed, failedTargets,
    start, retryFailed, pause, resume, stop, reset,
  };
}
