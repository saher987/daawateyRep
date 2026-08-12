// Ported unchanged from the original Base44 app (zaffaf/src/pages/
// VenueSchedule.jsx). Event.filter({status: {$in: [...]}}) and Venue.list()
// both go through base44Client.js's shim now — /api/venue-events and
// /api/venues respectively, both scoped server-side to the caller's own
// venues for venue_owner accounts (see venues.py/events.py docstrings) — so
// the `.filter(...)` by owner_emails below is a redundant belt-and-suspenders
// check against data that's already scoped, exactly like it was against
// Base44's per-row RLS in the original.
import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import MobileSelect from "@/components/shared/MobileSelect";
import { CalendarDays, Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday } from "date-fns";
import { he, ar } from "date-fns/locale";

export default function VenueSchedule() {
  const { user } = useAuth();
  const t = useT();
  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const isVenueOwner = user?.role === "venue_owner";
  const lang = user?.preferred_language || "ar";
  const dateLocale = lang === "he" ? he : ar;

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedVenueId, setSelectedVenueId] = useState("all");

  // Load all venues
  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list(),
  });

  // Filter venues this user owns (for venue_owner role)
  const myVenues = useMemo(() => {
    if (isAdmin) return venues;
    return venues.filter(v => Array.isArray(v.owner_emails) && v.owner_emails.includes(user?.email));
  }, [venues, user, isAdmin]);

  // Load events
  const { data: allEvents = [] } = useQuery({
    queryKey: ["events-schedule"],
    queryFn: () => base44.entities.Event.filter({ status: { $in: ["active", "draft"] } }),
  });

  // Filter events to only the venues this user has access to
  const relevantVenueIds = useMemo(() => new Set(myVenues.map(v => v.id)), [myVenues]);
  const relevantVenueNames = useMemo(() => new Set(myVenues.map(v => v.name?.toLowerCase())), [myVenues]);

  const events = useMemo(() => {
    if (isAdmin && selectedVenueId === "all") return allEvents;
    return allEvents.filter(e => {
      const matchById = e.venue_id && relevantVenueIds.has(e.venue_id);
      const matchByName = e.venue_name && relevantVenueNames.has(e.venue_name?.toLowerCase());
      if (isAdmin) {
        return selectedVenueId === "all" || e.venue_id === selectedVenueId || e.venue_name === myVenues.find(v => v.id === selectedVenueId)?.name;
      }
      return matchById || matchByName;
    });
  }, [allEvents, relevantVenueIds, relevantVenueNames, isAdmin, selectedVenueId, myVenues]);

  // Calendar days
  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  // Map each day to events
  const eventsByDay = useMemo(() => {
    const map = {};
    events.forEach(e => {
      if (!e.date) return;
      const day = format(new Date(e.date), "yyyy-MM-dd");
      if (!map[day]) map[day] = [];
      map[day].push(e);
    });
    return map;
  }, [events]);

  // First day of month offset (Sunday = 0)
  const firstDayOffset = useMemo(() => {
    const start = startOfMonth(currentMonth);
    return start.getDay();
  }, [currentMonth]);

  if (!isAdmin && !isVenueOwner) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t.noPermissionPage}</div>;
  }

  if (!isAdmin && myVenues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <Building2 className="w-12 h-12 opacity-30" />
        <p>{t.noVenueAssigned}</p>
      </div>
    );
  }

  return (
    <div dir="rtl">
      <PageHeader title={t.venueScheduleTitle} subtitle={t.venueScheduleSubtitle} />

      {/* Venue selector */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {isAdmin ? (
          <MobileSelect
            value={selectedVenueId}
            onValueChange={setSelectedVenueId}
            options={[{ value: "all", label: t.allVenues }, ...venues.map(v => ({ value: v.id, label: v.name }))]}
            placeholder={t.selectVenue}
          />
        ) : myVenues.length > 1 ? (
          <MobileSelect
            value={selectedVenueId}
            onValueChange={setSelectedVenueId}
            options={[{ value: "all", label: t.myVenues }, ...myVenues.map(v => ({ value: v.id, label: v.name }))]}
            placeholder={t.selectVenue}
          />
        ) : (
          <div className="flex items-center gap-2 px-4 py-2 bg-muted rounded-xl text-sm font-medium">
            <Building2 className="w-4 h-4" />
            {myVenues[0]?.name}
          </div>
        )}
      </div>

      {/* Month navigation */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <h2 className="font-semibold text-lg">
            {format(currentMonth, "MMMM yyyy", { locale: dateLocale })}
          </h2>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayOffset }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map(day => {
            const key = format(day, "yyyy-MM-dd");
            const dayEvents = eventsByDay[key] || [];
            const isBusy = dayEvents.length > 0;
            const today = isToday(day);

            return (
              <div
                key={key}
                className={`min-h-[60px] rounded-xl p-1.5 border transition-colors ${
                  isBusy
                    ? "bg-destructive/10 border-destructive/30"
                    : "bg-success/10 border-success/20"
                } ${today ? "ring-2 ring-primary ring-offset-1" : ""}`}
              >
                <div className={`text-xs font-semibold mb-1 ${today ? "text-primary" : isBusy ? "text-destructive" : "text-success"}`}>
                  {format(day, "d")}
                </div>
                {dayEvents.slice(0, 2).map(e => (
                  <div key={e.id} className="text-[10px] bg-destructive/20 text-destructive rounded px-1 py-0.5 mb-0.5 truncate">
                    {e.title}
                  </div>
                ))}
                {dayEvents.length > 2 && (
                  <div className="text-[10px] text-muted-foreground">+{dayEvents.length - 2}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex gap-4 mt-4 justify-center text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-success/30 border border-success/40" />
            {t.free}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-destructive/30 border border-destructive/40" />
            {t.busy}
          </div>
        </div>
      </Card>

      {/* Events list for current month */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          {t.eventsThisMonth} ({events.filter(e => {
            if (!e.date) return false;
            const d = new Date(e.date);
            return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
          }).length})
        </h3>
        <div className="space-y-2">
          {events
            .filter(e => {
              if (!e.date) return false;
              const d = new Date(e.date);
              return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .map(e => (
              <div key={e.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <div>
                  <p className="font-medium text-sm">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.venue_name}</p>
                </div>
                <div className="text-left">
                  <p className="text-sm font-medium">{format(new Date(e.date), "dd/MM/yyyy")}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(e.date), "HH:mm")}</p>
                </div>
              </div>
            ))}
          {events.filter(e => {
            if (!e.date) return false;
            const d = new Date(e.date);
            return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
          }).length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-4">{t.noEventsThisMonth}</p>
          )}
        </div>
      </Card>
    </div>
  );
}
