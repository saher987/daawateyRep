import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronUp, QrCode } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import { useT } from "@/lib/i18n";
import { recipientDisplayName } from "@/lib/recipientName";
import { partySize, fmt } from "@/lib/seating";

// Host view of the entrance check-in: live "N of M arrived", the QR sign,
// who arrived and which confirmed guests haven't (with a manual "arrived"
// for the reception table). Refreshes every 30 seconds.
export default function ArrivalsCard({ event, recipients }) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const key = ["arrivals", event.id];

  const { data } = useQuery({
    queryKey: key,
    queryFn: () => base44.checkin.arrivals(event.id),
    refetchInterval: 30000,
  });

  const act = async (fn) => {
    try {
      queryClient.setQueryData(key, await fn());
    } catch (err) {
      toast({ title: err.message || t.addError, variant: "destructive" });
    }
  };

  if (!data) return null;
  const arrivedIds = new Set(data.arrivals.map((a) => a.recipient_id));
  const noShows = recipients.filter((r) => r.rsvp_status === "accepted" && !arrivedIds.has(r.id));

  return (
    <Card className="p-5 mb-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-lg">{t.arrivalsTitle}</h3>
          <p className="text-2xl font-bold">
            {fmt(t.arrivalsCount, { n: data.people_arrived, total: data.expected_people })}
          </p>
          <p className="text-xs text-muted-foreground">
            {fmt(t.arrivalsInvitations, { n: data.checked_in_invitations })} · {t.arrivalsMinimum}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 rounded-xl" asChild>
            <Link to={`/events/${event.id}/checkin-sign`}>
              <QrCode className="w-4 h-4" />
              {t.arrivalsSign}
            </Link>
          </Button>
          <Button variant="ghost" size="icon" aria-expanded={open} aria-label={t.arrivalsList} onClick={() => setOpen(!open)}>
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {data.per_table.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {data.per_table
            .filter((tb) => tb.seated > 0)
            .map((tb) => (
              <span key={tb.table_id} className="rounded-lg bg-muted px-2 py-1 text-xs">
                {fmt(t.tableLabel, { n: tb.number })}: {tb.arrived}/{tb.seated}
              </span>
            ))}
        </div>
      )}

      {open && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t.arrivalsList} ({data.arrivals.length})</p>
            {data.arrivals.map((a) => (
              <div key={a.recipient_id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                <span className="truncate">
                  {a.display_name} · {a.people_arrived}
                </span>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => act(() => base44.checkin.unmark(event.id, a.recipient_id))}>
                  {t.arrivalsUnmark}
                </Button>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t.noShowList} ({noShows.length})</p>
            {noShows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm">
                <span className="truncate">
                  {recipientDisplayName(r)} · {partySize(r)}
                </span>
                <Button size="sm" variant="outline" onClick={() => act(() => base44.checkin.mark(event.id, r.id, partySize(r)))}>
                  {t.arrivalsMark}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
