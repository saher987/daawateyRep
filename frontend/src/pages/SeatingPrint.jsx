import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useT } from "@/lib/i18n";
import { recipientDisplayName } from "@/lib/recipientName";
import { allocationsByRecipient, groupingLabel, partySize, fmt } from "@/lib/seating";

// Printable seating lists (the browser's print dialog also saves as PDF):
// an A–Z board for the entrance, and per-table lists for the hall staff.
// Outside AppLayout on purpose, so the menu isn't printed.
export default function SeatingPrint() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const t = useT();

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => (await base44.entities.Event.filter({ id: eventId }))[0],
  });
  const { data: recipients = [] } = useQuery({
    queryKey: ["event-recipients", eventId],
    queryFn: async () => (await base44.functions.invoke("getEventRecipients", { eventId })).data.recipients,
  });
  const { data: state } = useQuery({
    queryKey: ["seating", eventId],
    queryFn: () => base44.seating.get(eventId),
    enabled: !!event?.seating_enabled,
  });

  const alloc = useMemo(() => allocationsByRecipient(state?.assignments), [state]);
  if (!event || !state) return <LoadingSpinner />;

  const tableById = Object.fromEntries(state.tables.map((tb) => [tb.id, tb]));
  const byId = Object.fromEntries(recipients.map((r) => [r.id, r]));
  const tableText = (r) => {
    const list = alloc[r.id] || [];
    if (!list.length) return "—";
    if (list.length === 1 && list[0].seats === partySize(r)) return tableById[list[0].table_id]?.number;
    return list.map((a) => `${tableById[a.table_id]?.number} (${a.seats})`).join(" + ");
  };
  const seatedRecipients = recipients
    .filter((r) => (alloc[r.id] || []).length)
    .sort((a, b) => recipientDisplayName(a).localeCompare(recipientDisplayName(b), "ar"));
  const printedAt = new Date().toLocaleString();

  return (
    <div dir={t.dir} className="max-w-3xl mx-auto p-6 bg-white text-black min-h-screen">
      <div className="flex gap-2 mb-6 print:hidden">
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="w-4 h-4" />
          {t.signPrint}
        </Button>
        <Button variant="ghost" className="gap-2" onClick={() => navigate(`/events/${eventId}/seating`)}>
          {t.backToEvents}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>

      <h1 className="text-2xl font-bold">{event.title}</h1>
      <p className="text-sm text-gray-600 mb-6">
        {event.venue_name} · {printedAt}
      </p>

      <h2 className="text-xl font-bold mb-2">{t.printAz}</h2>
      <table className="w-full text-sm border-collapse mb-10">
        <thead>
          <tr className="border-b-2 border-black text-start">
            <th className="text-start py-1">{t.exportName}</th>
            <th className="text-start py-1 w-16">{t.exportGuests}</th>
            <th className="text-start py-1 w-32">{t.exportTable}</th>
          </tr>
        </thead>
        <tbody>
          {seatedRecipients.map((r) => (
            <tr key={r.id} className="border-b border-gray-300 break-inside-avoid">
              <td className="py-1">{recipientDisplayName(r)}</td>
              <td className="py-1">{partySize(r)}</td>
              <td className="py-1 font-bold">{tableText(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="text-xl font-bold mb-2 break-before-page">{t.printByTable}</h2>
      <div className="grid grid-cols-2 gap-4">
        {state.tables.map((tb) => {
          const here = state.assignments.filter((a) => a.table_id === tb.id && byId[a.recipient_id]);
          if (!here.length) return null;
          const seated = here.reduce((s, a) => s + a.seats, 0);
          return (
            <div key={tb.id} className="border border-gray-400 rounded p-2 break-inside-avoid">
              <div className="font-bold">
                {fmt(t.tableLabel, { n: tb.number })} · {seated}/{tb.capacity}
              </div>
              {here.map((a) => (
                <div key={a.recipient_id} className="text-sm">
                  {recipientDisplayName(byId[a.recipient_id])} – {a.seats}{" "}
                  <span className="text-gray-500">· {groupingLabel(byId[a.recipient_id], t)}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
