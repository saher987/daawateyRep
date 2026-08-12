// Ported unchanged from the original Base44 app (zaffaf/src/pages/
// MyVenueDetail.jsx). Venue.get(id)/Event.filter({status:{$in:[...]}}) go
// through base44Client.js's shim to GET /api/venues/{id} and
// GET /api/venue-events respectively, both access-controlled server-side —
// `hasAccess` below is a redundant belt-and-suspenders check against data
// the backend already scoped/would 403 on.
import React, { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, MapPin, Users, Phone, Loader2 } from "lucide-react";
import { he, ar } from "date-fns/locale";
import VenueMonthCalendar from "@/components/venues/VenueMonthCalendar";

export default function MyVenueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const t = useT();
  const lang = user?.preferred_language || "ar";
  const dateLocale = lang === "he" ? he : ar;
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const { data: venue, isLoading } = useQuery({
    queryKey: ["venue", id],
    queryFn: () => base44.entities.Venue.get(id),
  });

  const { data: allEvents = [] } = useQuery({
    queryKey: ["events-schedule"],
    queryFn: () => base44.entities.Event.filter({ status: { $in: ["active", "draft"] } }),
  });

  const events = useMemo(() => {
    if (!venue) return [];
    return allEvents.filter(e =>
      e.venue_id === venue.id || (e.venue_name && e.venue_name.toLowerCase() === venue.name?.toLowerCase())
    );
  }, [allEvents, venue]);

  const hasAccess = venue && (isPrivileged || (Array.isArray(venue.owner_emails) && venue.owner_emails.includes(user?.email)));

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!venue || !hasAccess) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t.noPermissionPage}</div>;
  }

  return (
    <div dir="rtl">
      <Button variant="ghost" size="sm" className="mb-4 gap-1" onClick={() => navigate("/my-venues")}>
        <ChevronRight className="w-4 h-4" />
        חזרה לאולמות שלי
      </Button>

      <Card className="overflow-hidden mb-6">
        {venue.image_url && (
          <img src={venue.image_url} alt={venue.name} className="w-full h-48 object-cover" />
        )}
        <div className="p-5 space-y-2">
          <h2 className="font-display text-xl font-bold">{venue.name}</h2>
          {venue.city && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              {venue.address ? `${venue.address}, ` : ""}{t[venue.city] || venue.city}
            </p>
          )}
          <div className="flex flex-wrap gap-4 pt-1">
            {venue.max_guests && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {t.upToGuests?.replace('{n}', venue.max_guests) || `עד ${venue.max_guests} אורחים`}
              </span>
            )}
            {venue.phone && (
              <span className="text-sm text-muted-foreground flex items-center gap-1.5" dir="ltr">
                <Phone className="w-4 h-4" />
                {venue.phone}
              </span>
            )}
          </div>
          {venue.notes && <p className="text-sm text-muted-foreground pt-1">{venue.notes}</p>}
        </div>
      </Card>

      <VenueMonthCalendar events={events} dateLocale={dateLocale} />
    </div>
  );
}
