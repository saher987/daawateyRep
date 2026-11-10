import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  Circle,
  Download,
  LayoutGrid,
  Lock,
  Move,
  Printer,
  RectangleHorizontal,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import HallPlan from "@/components/seating/HallPlan";
import { useToast } from "@/components/ui/use-toast";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/i18nSeating";
import { recipientDisplayName } from "@/lib/recipientName";
import { downloadFile } from "@/lib/downloadFile";
import {
  SIDES,
  SIDE_COLOR,
  allocationsByRecipient,
  groupingLabel,
  matchingGroupNames,
  partySize,
  seatedByTable as seatedByTableOf,
  sideLabel,
} from "@/lib/seating";
import { PLAN_H, PLAN_W, SNAP, hallLabel, overlaps, snapClamp, tableGeometry } from "@/lib/seatingGeometry";

export default function Seating() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState("seat"); // "seat" | "layout"
  const [selectedParty, setSelectedParty] = useState(null);
  const [selectedTableId, setSelectedTableId] = useState(null);
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [filterSide, setFilterSide] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [splitAsk, setSplitAsk] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [drag, setDrag] = useState(null);
  const [groupDraft, setGroupDraft] = useState("");
  const [quick, setQuick] = useState({ count: 10, seats: 10 });
  const [busy, setBusy] = useState(false);
  const justDragged = useRef(false);

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => (await base44.entities.Event.filter({ id: eventId }))[0],
    enabled: !!eventId,
  });
  const { data: recipients = [] } = useQuery({
    queryKey: ["event-recipients", eventId],
    queryFn: async () => (await base44.functions.invoke("getEventRecipients", { eventId })).data.recipients,
    enabled: !!eventId,
  });
  const { data: state, isLoading: stateLoading } = useQuery({
    queryKey: ["seating", eventId],
    queryFn: () => base44.seating.get(eventId),
    enabled: !!event?.seating_enabled,
  });
  const { data: groupNames } = useQuery({
    queryKey: ["group-names", eventId],
    queryFn: () => base44.seating.groupNames(eventId),
    enabled: !!event?.seating_enabled,
  });

  const tables = useMemo(() => state?.tables || [], [state]);
  const elements = useMemo(() => state?.hall_elements || [], [state]);
  const alloc = useMemo(() => allocationsByRecipient(state?.assignments), [state]);
  const seatedByTable = useMemo(() => seatedByTableOf(state?.assignments), [state]);
  const tableById = useMemo(() => Object.fromEntries(tables.map((tb) => [tb.id, tb])), [tables]);
  const recipientById = useMemo(() => Object.fromEntries(recipients.map((r) => [r.id, r])), [recipients]);
  const seatedOf = (rid) => (alloc[rid] || []).reduce((s, a) => s + a.seats, 0);
  const accepted = recipients.filter((r) => r.rsvp_status === "accepted");
  const waiting = accepted.filter((r) => seatedOf(r.id) < partySize(r));
  // A party that's fully seated (e.g. by auto-assign) is no longer "picked".
  const picked = selectedParty ? recipientById[selectedParty] : null;
  const party = picked && partySize(picked) - seatedOf(picked.id) > 0 ? picked : null;
  const partyRemaining = party ? partySize(party) - seatedOf(party.id) : 0;

  useEffect(() => {
    setGroupDraft(party?.group_label || "");
  }, [party?.id, party?.group_label]);

  // --- server calls -------------------------------------------------------

  const apply = (next) => queryClient.setQueryData(["seating", eventId], next);
  const run = async (fn, okMessage) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next?.state) apply(next.state);
      else if (next) apply(next);
      if (okMessage) toast({ title: okMessage });
      return next;
    } catch (err) {
      toast({ title: err.message || t.addError, variant: "destructive" });
      return null;
    } finally {
      setBusy(false);
    }
  };
  const setAllocations = (rid, allocations) =>
    run(() => base44.seating.assign(eventId, [{ recipient_id: rid, allocations }]));
  const updateTable = (tb, patch) => run(() => base44.seating.updateTable(eventId, tb.id, patch));
  const refreshRecipients = () => {
    queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
    queryClient.invalidateQueries({ queryKey: ["group-names", eventId] });
  };
  const setGrouping = async (rid, fields) => {
    try {
      await base44.seating.setGrouping(eventId, [rid], fields);
      refreshRecipients();
    } catch (err) {
      toast({ title: err.message || t.addError, variant: "destructive" });
    }
  };

  const confirmIfLocked = () => !state?.seating_locked_at || window.confirm(t.seatingLockedConfirm);

  const seatParty = (tb, seats) => {
    const current = alloc[party.id] || [];
    const existing = current.find((a) => a.table_id === tb.id);
    const next = existing
      ? current.map((a) => (a.table_id === tb.id ? { ...a, seats: a.seats + seats } : a))
      : [...current, { table_id: tb.id, seats }];
    setAllocations(party.id, next).then((ok) => {
      if (ok && seats >= partyRemaining) {
        setSelectedParty(null);
        setSelectedTableId(tb.id);
      }
    });
  };

  // --- interactions -------------------------------------------------------

  const onTableClick = (tb, inLayout) => {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    if (inLayout) {
      setSelectedTableId(tb.id);
      setSelectedElementId(null);
      return;
    }
    if (!party) {
      setSelectedTableId(selectedTableId === tb.id ? null : tb.id);
      return;
    }
    const free = tb.capacity - (seatedByTable[tb.id] || 0);
    if (free <= 0) {
      toast({ title: fmt(t.tableFull, { table: tb.number }) });
      return;
    }
    if (!confirmIfLocked()) return;
    if (free >= partyRemaining) seatParty(tb, partyRemaining);
    else setSplitAsk({ table: tb, free });
  };

  const removeFromTable = (rid, tableId) => {
    if (!confirmIfLocked()) return;
    setAllocations(rid, (alloc[rid] || []).filter((a) => a.table_id !== tableId));
  };

  const onDragStart = (d) => {
    setSelectedParty(null);
    if (d.kind === "table") {
      setSelectedTableId(d.id);
      setSelectedElementId(null);
    } else {
      setSelectedElementId(d.id);
      setSelectedTableId(null);
    }
    setDrag({ ...d, x: d.ox, y: d.oy, moved: false });
  };
  const onDragMove = (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.startX) * drag.factor;
    const dy = (e.clientY - drag.startY) * drag.factor;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
    const item = drag.kind === "table" ? tableById[drag.id] : elements.find((x) => x.id === drag.id);
    const size = drag.kind === "table" ? tableGeometry(item) : { fw: item.w, fh: item.h };
    setDrag({
      ...drag,
      moved: true,
      x: snapClamp(drag.ox + dx, size.fw, PLAN_W),
      y: snapClamp(drag.oy + dy, size.fh, PLAN_H),
    });
  };
  const onDragEnd = () => {
    const d = drag;
    setDrag(null);
    if (!d?.moved) return;
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 300);
    const patch = { x: d.x, y: d.y };
    if (d.kind === "table") run(() => base44.seating.updateTable(eventId, d.id, patch));
    else run(() => base44.seating.updateElement(eventId, d.id, patch));
  };
  const nudge = (dx, dy) => {
    if (selectedTableId) {
      const tb = tableById[selectedTableId];
      updateTable(tb, { x: tb.x + dx, y: tb.y + dy });
    } else if (selectedElementId) {
      const el = elements.find((x) => x.id === selectedElementId);
      run(() => base44.seating.updateElement(eventId, el.id, { x: el.x + dx, y: el.y + dy }));
    }
  };

  // Live positions while dragging.
  const shownTables = drag?.kind === "table" ? tables.map((tb) => (tb.id === drag.id ? { ...tb, x: drag.x, y: drag.y } : tb)) : tables;
  const shownElements =
    drag?.kind === "element" ? elements.map((el) => (el.id === drag.id ? { ...el, x: drag.x, y: drag.y } : el)) : elements;
  const overlap = useMemo(() => overlaps(shownTables, shownElements), [shownTables, shownElements]);

  const decorate = (item, kind) => {
    if (mode === "layout") {
      const bad = kind === "table" ? overlap.tableIds.has(item.id) : overlap.elementIds.has(item.id);
      if (kind === "element") {
        if (selectedElementId === item.id) return { shadow: "0 0 0 3px #3C6FB0" };
        return bad ? { shadow: "0 0 0 3px #C0392B" } : {};
      }
      if (bad && selectedTableId !== item.id) return { border: "2px solid #C0392B", shadow: "0 0 0 4px rgba(192,57,43,0.28)" };
      return {};
    }
    if (kind !== "table" || !party) return {};
    const free = item.capacity - (seatedByTable[item.id] || 0);
    if (free >= partyRemaining) return { border: "2px solid #2F8073", shadow: "0 0 0 4px rgba(47,128,115,0.28)" };
    if (free > 0) return { border: "2px dashed #B7701A", shadow: "0 0 0 4px rgba(183,112,26,0.22)" };
    return { opacity: 0.4 };
  };

  // --- export ---------------------------------------------------------------

  const tablesText = (rid) => {
    const list = alloc[rid] || [];
    const r = recipientById[rid];
    if (!list.length) return "";
    if (list.length === 1 && list[0].seats === partySize(r)) return tableById[list[0].table_id]?.number || "";
    return list.map((a) => `${tableById[a.table_id]?.number} (${a.seats})`).join(" + ");
  };
  const exportCsv = () => {
    const rows = [...accepted]
      .sort((a, b) => recipientDisplayName(a).localeCompare(recipientDisplayName(b), "ar"))
      .map((r) => [recipientDisplayName(r), partySize(r), tablesText(r.id), r.side ? sideLabel(r.side, t) : "", r.group_label || ""]);
    const header = [t.exportName, t.exportGuests, t.exportTable, t.exportSide, t.exportGroup];
    const csv = "﻿" + [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    downloadFile(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `seating_${eventId.slice(0, 8)}.csv`);
  };

  // --- render -----------------------------------------------------------------

  if (eventLoading) return <LoadingSpinner />;
  if (!event) return <EmptyState title={t.notAuthorized} />;
  if (!event.seating_enabled) {
    return (
      <EmptyState icon={LayoutGrid} title={t.seatingOffTitle} description={t.seatingOffDesc}>
        <Button variant="outline" onClick={() => navigate(`/events/${eventId}`)}>
          {t.backToEvents}
        </Button>
      </EmptyState>
    );
  }
  if (stateLoading || !state) return <LoadingSpinner />;

  const totalGuests = accepted.reduce((s, r) => s + partySize(r), 0);
  const seatedGuests = accepted.reduce((s, r) => s + Math.min(seatedOf(r.id), partySize(r)), 0);
  const totalSeats = tables.reduce((s, tb) => s + tb.capacity, 0);
  const allSeated = Object.values(seatedByTable).reduce((s, n) => s + n, 0);
  const tablesUsed = tables.filter((tb) => (seatedByTable[tb.id] || 0) > 0).length;

  const sideKey = (r) => r.side || "none";
  const groupKey = (r) => r.group_label || "__none";
  const inSide = waiting.filter((r) => filterSide === "all" || sideKey(r) === filterSide);
  const shown = inSide.filter((r) => filterGroup === "all" || groupKey(r) === filterGroup);
  const groupsInSide = [...new Set(inSide.map((r) => r.group_label).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));

  const selTable = selectedTableId ? tableById[selectedTableId] : null;
  const selElement = mode === "layout" && selectedElementId ? elements.find((x) => x.id === selectedElementId) : null;
  const tableParties = selTable
    ? Object.entries(alloc)
        .flatMap(([rid, list]) => list.filter((a) => a.table_id === selTable.id).map((a) => ({ r: recipientById[rid], seats: a.seats })))
        .filter((x) => x.r)
    : [];
  const partySuggestions = party
    ? matchingGroupNames(groupNames?.[party.side || "none"] || [], groupDraft).slice(0, 6)
    : [];

  const chip = (on) =>
    on ? "bg-foreground text-background border-foreground" : "bg-background text-foreground border-border";

  return (
    <div>
      <PageHeader title={t.seatingTitle} subtitle={event.title}>
        <Button variant="ghost" className="gap-2" onClick={() => navigate(`/events/${eventId}`)}>
          {t.backToEvents}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </PageHeader>

      {/* Publish + lock */}
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 cursor-pointer">
          <span className="flex-1">
            <span className="block text-sm font-semibold">{t.seatingPublish}</span>
            <span className="block text-xs text-muted-foreground">
              {state.seating_published ? t.seatingPublishOn : t.seatingPublishOff}
            </span>
          </span>
          <Switch
            checked={state.seating_published}
            onCheckedChange={(v) => run(() => base44.seating.settings(eventId, { seating_published: v }), t.seatingSaved)}
          />
        </label>
        <label className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 cursor-pointer">
          <Lock className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1">
            <span className="block text-sm font-semibold">{t.seatingLock}</span>
            {state.seating_locked_at && <span className="block text-xs text-muted-foreground">{t.seatingLocked}</span>}
          </span>
          <Switch
            checked={!!state.seating_locked_at}
            onCheckedChange={(v) => run(() => base44.seating.settings(eventId, { locked: v }))}
          />
        </label>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          className="gap-2 rounded-xl"
          disabled={busy || !tables.length}
          onClick={async () => {
            const res = await run(() => base44.seating.autoAssign(eventId));
            if (!res) return;
            if (!res.placed && !res.left) toast({ title: t.autoAssignNothing });
            else
              toast({
                title: [
                  fmt(t.autoAssignResult, { placed: res.placed }),
                  res.split ? fmt(t.autoAssignSplit, { n: res.split }) : null,
                  res.left ? fmt(t.autoAssignLeft, { n: res.left }) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              });
          }}
        >
          <Sparkles className="w-4 h-4" />
          {t.seatingAutoAssign}
        </Button>
        <Button variant="outline" className="gap-2 rounded-xl" disabled={busy} onClick={() => run(() => base44.seating.addTable(eventId, { shape: "round" })).then(() => setMode("layout"))}>
          <Circle className="w-4 h-4" />
          {t.seatingAddRound}
        </Button>
        <Button
          variant="outline"
          className="gap-2 rounded-xl"
          disabled={busy}
          onClick={() => run(() => base44.seating.addTable(eventId, { shape: "rect", seats_top: 4, seats_bottom: 4 })).then(() => setMode("layout"))}
        >
          <RectangleHorizontal className="w-4 h-4" />
          {t.seatingAddRect}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="gap-2 rounded-xl">
              <LayoutGrid className="w-4 h-4" />
              {t.seatingQuickSetup}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 space-y-3" dir="rtl">
            <div className="space-y-1">
              <Label className="text-xs">{t.seatingQuickCount}</Label>
              <Input type="number" min={1} max={60} value={quick.count} onChange={(e) => setQuick({ ...quick, count: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t.seatingQuickSeats}</Label>
              <Input type="number" min={1} max={30} value={quick.seats} onChange={(e) => setQuick({ ...quick, seats: e.target.value })} />
            </div>
            <Button
              className="w-full"
              disabled={busy}
              onClick={() =>
                run(() =>
                  base44.seating.addTables(eventId, {
                    count: Math.max(1, Math.min(60, Number(quick.count) || 1)),
                    shape: "round",
                    seats_round: Math.max(1, Math.min(30, Number(quick.seats) || 10)),
                  }),
                )
              }
            >
              {t.seatingQuickAdd}
            </Button>
          </PopoverContent>
        </Popover>
        <Button variant="outline" className="rounded-xl" disabled={busy || !state.assignments.length} onClick={() => setConfirmClear(true)}>
          {t.seatingClearAll}
        </Button>
        <div className="flex-1" />
        <Button variant="outline" className="gap-2 rounded-xl" onClick={exportCsv}>
          <Download className="w-4 h-4" />
          {t.seatingExportCsv}
        </Button>
        <Button variant="outline" className="gap-2 rounded-xl" asChild>
          <Link to={`/events/${eventId}/seating/print`}>
            <Printer className="w-4 h-4" />
            {t.seatingPrint}
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {[
          [t.statSeatedGuests, `${seatedGuests} / ${totalGuests}`],
          [t.statWaitingInvitations, waiting.length],
          [t.statTablesUsed, `${tablesUsed} / ${tables.length}`],
          [t.statFreeSeats, Math.max(0, totalSeats - allSeated)],
        ].map(([label, value]) => (
          <Card key={label} className="p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold" dir="ltr" style={{ textAlign: "end" }}>{value}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 items-start">
        {/* Plan */}
        <Card className="p-4 flex-[999_1_560px] min-w-0 space-y-3">
          <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-xl">
            {[
              ["seat", Users, t.seatingModeSeat],
              ["layout", Move, t.seatingModeLayout],
            ].map(([key, Icon, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  setSelectedParty(null);
                  setSelectedElementId(null);
                }}
                className={`h-11 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 ${mode === key ? "bg-background shadow-sm" : ""}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          {mode === "layout" && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#3C6FB0] bg-[#EEF3FA] text-[#1F3F6B] px-3 py-2 text-sm">
              <span>{t.layoutHint}</span>
              {overlap.tableIds.size + overlap.elementIds.size > 0 && (
                <span className="rounded-full bg-[#FBE9E7] text-[#9B2C1F] px-2 py-0.5 text-xs font-semibold">
                  {fmt(t.layoutOverlaps, { n: overlap.tableIds.size + overlap.elementIds.size })}
                </span>
              )}
            </div>
          )}

          {mode === "seat" && party && (
            <div role="status" className="rounded-xl border border-[#2F8073] bg-[#E6F2EF] text-[#1D5A50] px-3 py-2 space-y-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <span>
                  {fmt(t.pickTableFor, { name: recipientDisplayName(party), count: partyRemaining })}{" "}
                  <span className="opacity-80">{t.pickTableLegend}</span>
                </span>
                <Button size="sm" variant="outline" className="shrink-0" onClick={() => setSelectedParty(null)}>
                  {t.cancel}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs">{t.sideLabel}:</span>
                {[...SIDES, "none"].map((s) => {
                  const on = (party.side || "none") === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setGrouping(party.id, { side: s === "none" ? null : s })}
                      className={`h-8 px-2.5 rounded-full border text-xs flex items-center gap-1.5 ${on ? "bg-white border-[#1D5A50]" : "bg-[#F4FAF8] border-[#B9D6CF]"}`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ background: SIDE_COLOR[s] }} />
                      {sideLabel(s === "none" ? null : s, t)}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <label htmlFor="seating-group" className="text-xs">{t.groupNameLabel}:</label>
                <Input
                  id="seating-group"
                  value={groupDraft}
                  placeholder={t.groupNamePlaceholder}
                  onChange={(e) => setGroupDraft(e.target.value)}
                  onBlur={() => groupDraft !== (party.group_label || "") && setGrouping(party.id, { group_label: groupDraft })}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="h-8 w-48 bg-white text-sm"
                />
                {partySuggestions.length > 0 && <span className="text-xs">{t.groupUsedSuggestions}</span>}
                {partySuggestions.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setGroupDraft(n);
                      setGrouping(party.id, { group_label: n });
                    }}
                    className="h-7 px-2.5 rounded-full border border-dashed border-[#2F8073] bg-white text-xs"
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!tables.length && <p className="text-sm text-muted-foreground">{t.seatingNoTables}</p>}

          <div className="overflow-x-auto">
            <HallPlan
              tables={shownTables}
              elements={shownElements}
              seatedByTable={seatedByTable}
              selectedId={selectedTableId}
              layoutMode={mode === "layout"}
              showGrid={mode === "layout"}
              decorate={decorate}
              onTableClick={onTableClick}
              onElementClick={(el) => {
                if (justDragged.current) return;
                setSelectedElementId(el.id);
                setSelectedTableId(null);
              }}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-[#D8CFBF] bg-white" />{t.legendEmpty}</span>
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full border-2 border-[#A3762A] bg-[#F3E8D3]" />{t.legendPartial}</span>
            <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 rounded-full bg-[#8C6422]" />{t.legendFull}</span>
          </div>
        </Card>

        {/* Side panel */}
        <div className="flex-[1_1_340px] min-w-0 space-y-4">
          {selElement && (
            <Card className="p-4 space-y-3 border-2 border-[#3C6FB0]">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{hallLabel(selElement, t)}</h2>
                <Button size="icon" variant="ghost" aria-label={t.cancel} onClick={() => setSelectedElementId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <NudgePad onNudge={nudge} t={t} />
            </Card>
          )}

          {selTable && (
            <Card className="p-4 space-y-3 border-2 border-[#3C6FB0]">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold">
                  {fmt(t.tableLabel, { n: selTable.number })}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {fmt(t.tableSeatsSummary, { seated: seatedByTable[selTable.id] || 0, cap: selTable.capacity })}
                  </span>
                </h2>
                <Button size="icon" variant="ghost" aria-label={t.cancel} onClick={() => setSelectedTableId(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {mode === "layout" && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-[#EEF3FA] p-2">
                  <NudgePad onNudge={nudge} t={t} small />
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-xs text-[#1F3F6B]">{t.nudgeHint}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-destructive"
                      onClick={() => {
                        if (seatedByTable[selTable.id]) {
                          toast({ title: t.tableRemoveGuests });
                          return;
                        }
                        run(() => base44.seating.deleteTable(eventId, selTable.id)).then((ok) => ok && setSelectedTableId(null));
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                      {t.tableDelete}
                    </Button>
                  </div>
                </div>
              )}

              <TableEditor table={selTable} seated={seatedByTable[selTable.id] || 0} onPatch={(p) => updateTable(selTable, p)} t={t} />

              {tableParties.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t.tableEmpty}</p>
              ) : (
                <div className="space-y-1.5">
                  {tableParties.map(({ r, seats }) => (
                    <div key={r.id} className="flex items-center gap-2 rounded-xl border border-border px-2.5 py-1.5">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SIDE_COLOR[r.side || "none"] }} />
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold text-sm truncate">{recipientDisplayName(r)}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {groupingLabel(r, t)} ·{" "}
                          {seats === partySize(r) ? fmt(t.guestsCountShort, { n: seats }) : fmt(t.tableHerePartial, { here: seats, total: partySize(r) })}
                          {r.rsvp_status === "declined" && <span className="text-destructive"> · {t.declinedButSeated}</span>}
                        </span>
                      </span>
                      <Button size="sm" variant="outline" className="text-destructive" onClick={() => removeFromTable(r.id, selTable.id)}>
                        {t.remove}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold">
                {t.waitingListTitle} ({waiting.length})
              </h2>
            </div>
            <p className="text-xs text-muted-foreground">{t.waitingListHint}</p>
            <div className="flex flex-wrap gap-1.5">
              {["all", ...SIDES, "none"].map((s) => {
                const n = waiting.filter((r) => s === "all" || sideKey(r) === s).length;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={filterSide === s}
                    onClick={() => {
                      setFilterSide(s);
                      setFilterGroup("all");
                    }}
                    className={`h-8 px-2.5 rounded-full border text-xs font-semibold flex items-center gap-1.5 ${chip(filterSide === s)}`}
                  >
                    {s !== "all" && <span className="w-2 h-2 rounded-full" style={{ background: SIDE_COLOR[s] }} />}
                    {s === "all" ? t.filterAll : sideLabel(s === "none" ? null : s, t)} ({n})
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-xl bg-muted/50 p-2">
              {[["all", t.groupAll], ...groupsInSide.map((g) => [g, g]), ["__none", t.groupNone]].map(([key, label]) => {
                const n = inSide.filter((r) => key === "all" || groupKey(r) === key).length;
                if (key !== "all" && !n) return null;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={filterGroup === key}
                    onClick={() => setFilterGroup(key)}
                    className={`h-7 px-2 rounded-lg border text-xs ${chip(filterGroup === key)}`}
                  >
                    {label} ({n})
                  </button>
                );
              })}
            </div>
            {(filterSide === "none" || filterGroup === "__none") && shown.length > 0 && (
              <p className="rounded-xl bg-[#FBF1E3] text-[#6B3E0B] px-3 py-2 text-xs">{t.noGroupHint}</p>
            )}
            {shown.length === 0 && <p className="rounded-xl bg-[#E6F2EF] text-[#1D5A50] px-3 py-2 text-sm font-semibold">{t.waitingListEmpty}</p>}
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto">
              {shown.map((r) => {
                const on = selectedParty === r.id;
                const seated = seatedOf(r.id);
                const list = alloc[r.id] || [];
                return (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setMode("seat");
                      setSelectedElementId(null);
                      setSelectedTableId(null);
                      setSelectedParty(on ? null : r.id);
                    }}
                    className={`w-full text-start flex items-center gap-2.5 min-h-[52px] px-2.5 py-1.5 rounded-xl border-2 ${on ? "border-[#2F8073] bg-[#E6F2EF]" : seated ? "border-[#E3C79A] bg-card" : "border-border bg-card"}`}
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SIDE_COLOR[r.side || "none"] }} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm truncate">{recipientDisplayName(r)}</span>
                      <span className={`block text-xs truncate ${seated ? "text-[#8A4F0E]" : "text-muted-foreground"}`}>
                        {seated
                          ? fmt(t.splitWaiting, {
                              where: list.map((a) => fmt(t.onTable, { n: a.seats, table: tableById[a.table_id]?.number })).join("، "),
                              left: partySize(r) - seated,
                            })
                          : `${groupingLabel(r, t)}${r.town ? ` · ${r.town}` : ""}`}
                      </span>
                    </span>
                    <span className="shrink-0 min-w-8 text-center rounded-full bg-[#EFE4D0] text-[#5E4216] px-2 text-sm font-bold">
                      {partySize(r) - seated}
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* Split a family */}
      <AlertDialog open={!!splitAsk} onOpenChange={(o) => !o && setSplitAsk(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{party && fmt(t.splitTitle, { name: recipientDisplayName(party) })}</AlertDialogTitle>
            <AlertDialogDescription>
              {splitAsk && fmt(t.splitBody, { table: splitAsk.table.number, free: splitAsk.free, remaining: partyRemaining })}{" "}
              {splitAsk && fmt(t.splitRest, { rest: partyRemaining - splitAsk.free })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const { table, free } = splitAsk;
                setSplitAsk(null);
                seatParty(table, free);
              }}
            >
              {splitAsk && fmt(t.splitConfirm, { free: splitAsk.free })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.seatingClearAll}</AlertDialogTitle>
            <AlertDialogDescription>{t.seatingClearConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => base44.seating.clear(eventId))}>{t.seatingClearAll}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NudgePad({ onNudge, t, small }) {
  const size = small ? "w-9 h-9" : "w-11 h-11";
  const btn = (label, Icon, dx, dy) => (
    <Button type="button" variant="outline" size="icon" className={size} aria-label={label} onClick={() => onNudge(dx, dy)}>
      <Icon className="w-4 h-4" />
    </Button>
  );
  return (
    <div dir="ltr" className="grid grid-cols-3 gap-1 w-fit">
      <span />
      {btn(t.nudgeHint, ArrowUp, 0, -SNAP)}
      <span />
      {btn(t.nudgeHint, ArrowLeft, -SNAP, 0)}
      {btn(t.nudgeHint, ArrowDown, 0, SNAP)}
      {btn(t.nudgeHint, ArrowRight, SNAP, 0)}
    </div>
  );
}

function TableEditor({ table, seated, onPatch, t }) {
  const [number, setNumber] = useState(table.number);
  useEffect(() => setNumber(table.number), [table.id, table.number]);
  const isRound = table.shape === "round";
  const oneSide = !isRound && table.seats_bottom === 0;
  const side = Math.max(table.seats_top, table.seats_bottom);
  const step = (label, value, onDec, onInc) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm">
        {label}: <strong>{value}</strong>
      </span>
      <span className="flex gap-1.5">
        <Button type="button" size="icon" variant="outline" className="w-9 h-9" aria-label="−" onClick={onDec}>−</Button>
        <Button type="button" size="icon" variant="outline" className="w-9 h-9" aria-label="+" onClick={onInc}>+</Button>
      </span>
    </div>
  );
  const toggle = (label, checked, onChange) => (
    <label className="flex items-center gap-2 text-sm min-h-8 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-[#8C6422]" />
      {label}
    </label>
  );
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="table-number" className="text-xs shrink-0">{t.tableNumber}</Label>
        <Input
          id="table-number"
          value={number}
          maxLength={20}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={() => number.trim() && number !== table.number && onPatch({ number: number.trim() })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-9 w-24"
        />
      </div>
      <div className="grid grid-cols-2 gap-1 bg-muted p-1 rounded-xl">
        <button
          type="button"
          aria-pressed={isRound}
          className={`h-9 rounded-lg text-sm font-semibold ${isRound ? "bg-background shadow-sm" : ""}`}
          onClick={() => !isRound && onPatch({ shape: "round", seats_round: Math.max(10, seated) })}
        >
          {t.tableShapeRound}
        </button>
        <button
          type="button"
          aria-pressed={!isRound}
          className={`h-9 rounded-lg text-sm font-semibold ${!isRound ? "bg-background shadow-sm" : ""}`}
          onClick={() => {
            if (!isRound) return;
            const n = Math.max(4, Math.ceil(seated / 2));
            onPatch({ shape: "rect", seats_top: n, seats_bottom: n, seats_left: 0, seats_right: 0, rotation: 0 });
          }}
        >
          {t.tableShapeRect}
        </button>
      </div>
      <div className="rounded-xl bg-muted/50 p-2.5 space-y-1.5">
        {isRound
          ? step(
              t.tableChairs,
              table.seats_round,
              () => table.seats_round > 1 && onPatch({ seats_round: table.seats_round - 1 }),
              () => table.seats_round < 30 && onPatch({ seats_round: table.seats_round + 1 }),
            )
          : (
            <>
              {step(
                t.tableChairsPerSide,
                side,
                () => side > 1 && onPatch({ seats_top: side - 1, seats_bottom: oneSide ? 0 : side - 1 }),
                () => side < 20 && onPatch({ seats_top: side + 1, seats_bottom: oneSide ? 0 : side + 1 }),
              )}
              {toggle(t.tableEndA, table.seats_left > 0, () => onPatch({ seats_left: table.seats_left ? 0 : 1 }))}
              {toggle(t.tableEndB, table.seats_right > 0, () => onPatch({ seats_right: table.seats_right ? 0 : 1 }))}
              {toggle(t.tableOneSide, oneSide, () => onPatch({ seats_bottom: oneSide ? side : 0 }))}
              {toggle(t.tableVertical, table.rotation === 90, () => onPatch({ rotation: table.rotation === 90 ? 0 : 90 }))}
            </>
          )}
      </div>
    </div>
  );
}
