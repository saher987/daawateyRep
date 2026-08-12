// Ported unchanged from the original Base44 app
// (zaffaf/src/components/venues/VenueMonthCalendar.jsx). Shared by
// VenueSchedule.jsx (venue selector + calendar) and MyVenueDetail.jsx
// (single venue's calendar) — logic identical, only what's rendered above
// it differs.
import React, { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, addMonths, subMonths, isToday } from "date-fns";
import { useT } from "@/lib/i18n";

export default function VenueMonthCalendar({ events = [], dateLocale }) {
  const t = useT();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

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

  const firstDayOffset = useMemo(() => startOfMonth(currentMonth).getDay(), [currentMonth]);

  const monthEvents = useMemo(() => events
    .filter(e => {
      if (!e.date) return false;
      const d = new Date(e.date);
      return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date)), [events, currentMonth]);

  return (
    <>
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

        <div className="grid grid-cols-7 gap-1 mb-1">
          {["א", "ב", "ג", "ד", "ה", "ו", "ש"].map(d => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>

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
                  isBusy ? "bg-destructive/10 border-destructive/30" : "bg-success/10 border-success/20"
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

      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          {t.eventsThisMonth} ({monthEvents.length})
        </h3>
        <div className="space-y-2">
          {monthEvents.map(e => (
            <div key={e.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
              <p className="font-medium text-sm">{e.title}</p>
              <div className="text-left">
                <p className="text-sm font-medium">{format(new Date(e.date), "dd/MM/yyyy")}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(e.date), "HH:mm")}</p>
              </div>
            </div>
          ))}
          {monthEvents.length === 0 && (
            <p className="text-center text-muted-foreground text-sm py-4">{t.noEventsThisMonth}</p>
          )}
        </div>
      </Card>
    </>
  );
}
