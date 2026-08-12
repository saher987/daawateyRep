// Ported unchanged from the original Base44 app (zaffaf/src/pages/
// MyVenues.jsx). Venue.list() goes through base44Client.js's shim to
// GET /api/venues, scoped server-side to the caller's own venues for
// venue_owner accounts — the `.filter(...)` by owner_emails below is a
// redundant belt-and-suspenders check, same as in VenueSchedule.jsx.
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Card } from "@/components/ui/card";
import { Building2, MapPin, Users, Loader2 } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";

export default function MyVenues() {
  const { user } = useAuth();
  const t = useT();
  const isVenueOwner = user?.role === "venue_owner" || user?.role === "admin" || user?.role === "manager";

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list(),
  });

  const myVenues = useMemo(() => {
    if (user?.role === "admin" || user?.role === "manager") return venues;
    return venues.filter(v => Array.isArray(v.owner_emails) && v.owner_emails.includes(user?.email));
  }, [venues, user]);

  if (!isVenueOwner) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t.noPermissionPage}</div>;
  }

  return (
    <div dir="rtl">
      <PageHeader title="ניהול האולם שלי" subtitle="האולמות שאתה מנהל" />

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : myVenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
          <Building2 className="w-10 h-10 opacity-30" />
          <p>{t.noVenueAssigned}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {myVenues.map(v => (
            <Link key={v.id} to={`/my-venues/${v.id}`}>
              <Card className="overflow-hidden space-y-3 hover:shadow-md transition-shadow cursor-pointer">
                {v.image_url && (
                  <img src={v.image_url} alt={v.name} className="w-full h-40 object-cover" />
                )}
                <div className="p-5 pt-3 space-y-2">
                  <h3 className="font-semibold text-base">{v.name}</h3>
                  {v.city && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{t[v.city] || v.city}</p>}
                  {v.max_guests && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {t.upToGuests?.replace('{n}', v.max_guests) || `עד ${v.max_guests} אורחים`}
                    </p>
                  )}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
