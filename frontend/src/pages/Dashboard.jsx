import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import usePullToRefresh from "@/hooks/usePullToRefresh";
import { Link } from "react-router-dom";
import {
  CalendarHeart,
  Users,
  CheckCircle2,
  Clock,
  Plus,
  ArrowLeft,
  TrendingUp,
  LogIn,
  Sparkles,
  CalendarPlus,
  Phone,
  Mail
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";

export default function Dashboard() {
  const { isAuthenticated, user } = useAuth();
  const t = useT();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list("-created_date", 50),
    enabled: isPrivileged,
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["all-recipients"],
    queryFn: () => base44.entities.InvitationRecipient.list("-created_date", 500),
    enabled: isPrivileged,
  });

  const { data: eventRequests = [] } = useQuery({
    queryKey: ["event-requests"],
    queryFn: () => base44.entities.EventRequest.list("-created_date", 50),
    enabled: isPrivileged,
  });

  const isLoading = eventsLoading || recipientsLoading;

  const stats = {
    totalEvents: events.length,
    activeEvents: events.filter(e => e.status === "active").length,
    totalInvitees: recipients.length,
    confirmed: recipients.filter(r => r.rsvp_status === "accepted").length,
    pending: recipients.filter(r => r.rsvp_status === "pending").length,
    declined: recipients.filter(r => r.rsvp_status === "declined").length,
  };

  const recentEvents = events.slice(0, 5);

  const queryClient = useQueryClient();
  const { containerRef, isRefreshing, pullDistance } = usePullToRefresh(async () => {
    await queryClient.invalidateQueries();
  });

  // Unauthenticated users see a simple login prompt
  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6 px-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-10 h-10 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground mb-2">{t.welcomeTo}</h2>
          <p className="text-muted-foreground">{t.noInvitationsGuest}</p>
        </div>
        <Button size="lg" className="gap-2 rounded-xl px-8" onClick={() => base44.auth.redirectToLogin(window.location.href)}>
          <LogIn className="w-5 h-5" />
          {t.login}
        </Button>
      </div>
    );
  }

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
      <PageHeader title={t.dashboard} subtitle={t.dashboardSubtitle}>
        <Button asChild className="gap-2 rounded-xl px-6 h-12 text-base">
          <Link to="/events/new">
            <Plus className="w-5 h-5" />
            {t.newEvent}
          </Link>
        </Button>
      </PageHeader>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={CalendarHeart} label={t.totalEvents} value={stats.totalEvents} color="primary" />
        <StatCard icon={Users} label={t.totalInvitees} value={stats.totalInvitees} color="muted" />
        <StatCard icon={CheckCircle2} label={t.confirmed} value={stats.confirmed} color="success" />
        <StatCard icon={Clock} label={t.awaitingReply} value={stats.pending} color="warning" />
      </div>

      {/* Recent Events */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{t.recentEvents}</h2>
          <Button variant="ghost" asChild className="gap-1 text-muted-foreground">
            <Link to="/events">
              {t.viewAll}
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </Button>
        </div>

        {recentEvents.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground mb-4">{t.noEventsYet}</p>
            <Button asChild className="gap-2">
              <Link to="/events/new">
                <Plus className="w-4 h-4" />
                {t.createFirst}
              </Link>
            </Button>
          </Card>
        ) : (
          <div className="grid gap-4">
            {recentEvents.map(event => {
              const eventRecipients = recipients.filter(r => r.event_id === event.id);
              const confirmed = eventRecipients.filter(r => r.rsvp_status === "accepted").length;
              return (
                <Link key={event.id} to={`/events/${event.id}`}>
                  <Card className="p-5 hover:shadow-lg transition-all duration-300 hover:border-primary/20 cursor-pointer">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-foreground truncate">{event.title}</h3>
                          <StatusBadge status={event.status} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>{event.venue_name}</span>
                          {event.date && (
                            <span>{format(new Date(event.date), "yyyy/MM/dd")}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <div className="flex items-center gap-1 text-sm">
                          <TrendingUp className="w-4 h-4 text-success" />
                          <span className="font-semibold">{confirmed}</span>
                          <span className="text-muted-foreground">/ {eventRecipients.length}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{t.accepted}</p>
                      </div>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Event Requests */}
      {eventRequests.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold">{t.eventRequestsTitle}</h2>
            <Badge className="bg-warning/10 text-warning border-0">{eventRequests.filter(r => r.status === "pending").length} {t.newRequests}</Badge>
          </div>
          <div className="grid gap-3">
            {eventRequests.map(req => (
              <Card key={req.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <CalendarPlus className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{req.title}</p>
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{req.details}</p>
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {req.requester_name && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Users className="w-3 h-3" /> {req.requester_name}
                          </span>
                        )}
                        {req.requester_phone && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                            <Phone className="w-3 h-3" /> {req.requester_phone}
                          </span>
                        )}
                        {req.requester_email && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                            <Mail className="w-3 h-3" /> {req.requester_email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge className={
                    req.status === "pending" ? "bg-warning/10 text-warning border-0 flex-shrink-0" :
                    req.status === "approved" ? "bg-success/10 text-success border-0 flex-shrink-0" :
                    req.status === "rejected" ? "bg-destructive/10 text-destructive border-0 flex-shrink-0" :
                    "bg-muted text-muted-foreground border-0 flex-shrink-0"
                  }>
                    {req.status === "pending" ? t.statusPending : req.status === "approved" ? t.statusApproved : req.status === "rejected" ? t.statusRejected : t.statusInReview}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* RSVP Summary */}
      {stats.totalInvitees > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">{t.rsvpSummary}</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-xl bg-success/5">
              <p className="text-2xl font-bold font-display text-success">{stats.confirmed}</p>
              <p className="text-sm text-muted-foreground">{t.accepted}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-warning/5">
              <p className="text-2xl font-bold font-display text-warning">{stats.pending}</p>
              <p className="text-sm text-muted-foreground">{t.pending}</p>
            </div>
            <div className="text-center p-4 rounded-xl bg-destructive/5">
              <p className="text-2xl font-bold font-display text-destructive">{stats.declined}</p>
              <p className="text-sm text-muted-foreground">{t.declined}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}