import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { Link } from "react-router-dom";
import { Plus, CalendarHeart, MapPin, Users, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";

function EventCard({ event, isPast = false }) {
  const eventTypeLabels = useEventTypeLabels();
  return (
    <Link to={`/events/${event.id}`}>
      <Card className={`overflow-hidden transition-all duration-300 cursor-pointer group ${isPast ? "" : "hover:shadow-xl hover:-translate-y-1"}`}>
        <div className="h-40 bg-gradient-to-bl from-primary/20 via-primary/5 to-accent relative overflow-hidden">
          {(event.cover_image_url || event.invitation_image_url) && (
            <img src={event.cover_image_url || event.invitation_image_url} alt="" className="w-full h-full object-cover" />
          )}
          {isPast && <div className="absolute inset-0 bg-background/30" />}
          <div className="absolute top-3 left-3">
            <StatusBadge status={event.status} />
          </div>
          <div className="absolute bottom-3 right-3">
            <span className="bg-background/80 backdrop-blur-sm text-xs font-medium px-3 py-1.5 rounded-full">
              {eventTypeLabels[event.event_type] || event.event_type}
            </span>
          </div>
        </div>
        <div className="p-5">
          <h3 className={`font-semibold text-lg mb-2 transition-colors ${isPast ? "" : "group-hover:text-primary"}`}>
            {event.title}
          </h3>
          <div className="space-y-2 text-sm text-muted-foreground">
            {event.venue_name && (
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 flex-shrink-0" />
                <span className="truncate">{event.venue_name}</span>
              </div>
            )}
            {event.date && (
              <div className="flex items-center gap-2">
                <CalendarHeart className="w-4 h-4 flex-shrink-0" />
                <span>{format(new Date(event.date), "yyyy/MM/dd - HH:mm")}</span>
              </div>
            )}
            {(event.groom_name || event.bride_name) && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 flex-shrink-0" />
                <span>{[event.groom_name, event.bride_name].filter(Boolean).join(" & ")}</span>
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}

function useEventTypeLabels() {
  const t = useT();
  return {
    wedding: t.wedding,
    engagement: t.engagement,
    birthday: t.birthday,
    graduation: t.graduation,
    corporate: t.corporate,
    other: t.other,
  };
}

export default function Events() {
  const [search, setSearch] = useState("");
  const { user } = useAuth();
  const t = useT();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list("-created_date", 100),
  });

  // For regular users, also fetch their invitations to show invited events
  // Match by email OR phone (phone is the primary identifier for most users)
  const userPhone = user?.phone;
  const { data: myInvitationsByEmail = [] } = useQuery({
    queryKey: ["my-invitations-email", user?.email],
    queryFn: () => base44.entities.InvitationRecipient.filter({ email: user?.email }),
    enabled: !!user?.email && !isPrivileged,
  });
  const { data: myInvitationsByPhone = [], isLoading: invitationsLoading } = useQuery({
    queryKey: ["my-invitations-phone", userPhone],
    queryFn: () => base44.entities.InvitationRecipient.filter({ phone: userPhone }),
    enabled: !!userPhone && !isPrivileged,
  });
  const myInvitations = [...myInvitationsByEmail, ...myInvitationsByPhone];

  const isLoading = eventsLoading || invitationsLoading;

  // Build the set of event IDs the user is invited to
  const invitedEventIds = new Set(myInvitations.map(r => r.event_id));

  // Regular users see: events they own (owner_email) OR events they're invited to
  const visibleEvents = isPrivileged
    ? events
    : events.filter(e =>
        e.owner_email === user?.email ||
        e.created_by === user?.email ||
        (Array.isArray(e.owner_emails) && e.owner_emails.includes(user?.email)) ||
        invitedEventIds.has(e.id)
      );

  const now = new Date();

  const filteredEvents = visibleEvents.filter(e =>
    e.title?.toLowerCase().includes(search.toLowerCase()) ||
    e.venue_name?.toLowerCase().includes(search.toLowerCase())
  );

  const upcomingEvents = filteredEvents
    .filter(e => !e.date || new Date(e.date) >= now)
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  const pastEvents = filteredEvents
    .filter(e => e.date && new Date(e.date) < now)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const queryClient = useQueryClient();
  const { containerRef, isRefreshing, pullDistance } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries({ queryKey: ["events"] });
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <div ref={containerRef}>
      {(isRefreshing || pullDistance > 0) && (
        <div
          className="flex items-center justify-center overflow-hidden"
          style={{ height: isRefreshing ? 40 : pullDistance }}
        >
          <div className={`w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full ${isRefreshing ? "animate-spin" : ""}`} />
        </div>
      )}
      <PageHeader title={t.events} subtitle={t.eventsSubtitle}>
        {isPrivileged && (
          <Button asChild className="gap-2 rounded-xl px-6 h-12 text-base">
            <Link to="/events/new">
              <Plus className="w-5 h-5" />
              {t.newEvent}
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          placeholder={t.searchEvent}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-11 h-12 rounded-xl text-base"
        />
      </div>

      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={CalendarHeart}
          title={t.noEvents}
          description={isPrivileged ? t.noEventsDesc : t.noEventsInviteDesc}
        >
          {isPrivileged && (
            <Button asChild className="gap-2">
              <Link to="/events/new">
                <Plus className="w-4 h-4" />
                {t.createEvent}
              </Link>
            </Button>
          )}
        </EmptyState>
      ) : isPrivileged ? (
        <>
          {/* Upcoming events */}
          {upcomingEvents.length > 0 && (
            <div className="mb-8">
              <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success inline-block" />
                {t.upcomingEvents} ({upcomingEvents.length})
              </h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                {upcomingEvents.map(event => <EventCard key={event.id} event={event} />)}
              </div>
            </div>
          )}
          {/* Past events */}
          {pastEvents.length > 0 && (
            <div>
              <h2 className="text-base font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-muted-foreground inline-block" />
                {t.pastEvents} ({pastEvents.length})
              </h2>
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5 opacity-60">
                {pastEvents.map(event => <EventCard key={event.id} event={event} isPast />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredEvents.map(event => <EventCard key={event.id} event={event} />)}
        </div>
      )}
    </div>
  );
}