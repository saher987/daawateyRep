import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, MessageCircle, QrCode } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import ArrivalsCard from "@/components/events/ArrivalsCard";
import { useT } from "@/lib/i18n";
import { fmt, partySize } from "@/lib/seating";

// Same WhatsApp number as the home page's "ابدأ مناسبتك معنا".
const WHATSAPP_NUMBER = "972545641116";

// "أدوات مناسبتك" on MyEvent (the event owner's page): the table arrangement
// and the entrance check-in, when the team has turned them on for this
// event. Owners can't switch services on themselves (update_event refuses
// it), so a service that's off shows a WhatsApp "talk to us" instead.
export default function EventToolsSection({ event, recipients }) {
  const t = useT();
  const seatingOn = !!event.seating_enabled;
  const checkinOn = !!event.checkin_enabled;
  const off = [!seatingOn && "seating", !checkinOn && "checkin"].filter(Boolean);

  return (
    <section className="space-y-3" aria-labelledby="event-tools-title">
      <h2 id="event-tools-title" className="text-lg font-bold">{t.eventToolsTitle}</h2>
      {seatingOn && <SeatingTile event={event} recipients={recipients} />}
      {checkinOn && <ArrivalsCard event={event} recipients={recipients} />}
      {off.length > 0 && <OffTile event={event} off={off} />}
    </section>
  );
}

function SeatingTile({ event, recipients }) {
  const t = useT();
  const { data: state } = useQuery({
    queryKey: ["seating", event.id],
    queryFn: () => base44.seating.get(event.id),
  });
  const tables = state?.tables?.length || 0;
  const seated = (state?.assignments || []).reduce((sum, a) => sum + a.seats, 0);
  const expected = recipients.filter((r) => r.rsvp_status === "accepted").reduce((sum, r) => sum + partySize(r), 0);
  const pct = expected ? Math.min(100, Math.round((seated / expected) * 100)) : 0;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
          <LayoutGrid className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{t.seatingTitle}</p>
          <p className="text-sm text-muted-foreground">
            {state ? fmt(t.eventToolsSeated, { tables, seated, total: expected }) : "…"}
          </p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className={`text-sm flex items-center gap-1.5 ${event.seating_published ? "text-success font-semibold" : "text-muted-foreground"}`}>
        <span className={`w-2 h-2 rounded-full ${event.seating_published ? "bg-success" : "bg-muted-foreground/50"}`} aria-hidden="true" />
        {event.seating_published ? t.seatingPublishOn : t.seatingPublishOff}
      </p>
      <Link
        to={`/events/${event.id}/seating`}
        className="flex items-center justify-center h-12 rounded-xl bg-primary text-primary-foreground font-semibold"
      >
        {t.eventToolsOpenPlan}
      </Link>
    </Card>
  );
}

function OffTile({ event, off }) {
  const t = useT();
  const labels = { seating: t.featureSeatingLabel, checkin: t.featureCheckinLabel };
  const icons = { seating: LayoutGrid, checkin: QrCode };
  const text = fmt(t.eventToolsWhatsappText, {
    services: off.map((k) => labels[k]).join(" + "),
    event: event.title,
  });
  return (
    <Card className="p-4 space-y-3 border-dashed">
      {off.map((k) => {
        const Icon = icons[k];
        return (
          <div key={k} className="flex items-center gap-3">
            <div className="w-11 h-11 shrink-0 rounded-xl bg-muted flex items-center justify-center">
              <Icon className="w-5 h-5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="font-semibold">{labels[k]}</p>
              <p className="text-sm text-muted-foreground">{t.eventToolsOff}</p>
            </div>
          </div>
        );
      })}
      <p className="text-sm leading-6 text-muted-foreground">{t.eventToolsOffHint}</p>
      <a
        href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-center gap-2 h-12 rounded-xl bg-[#171C26] text-white font-semibold"
      >
        <MessageCircle className="w-5 h-5 text-[#E2C68F]" aria-hidden="true" />
        {t.eventToolsTalk}
      </a>
    </Card>
  );
}
