import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Link, useNavigate } from "react-router-dom";
import {
  CalendarHeart, MapPin, Users, Phone, Copy, Check, Plus,
  ArrowRight, Settings, Trash2, Send, ExternalLink, Pencil, Sparkles
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PageHeader from "@/components/shared/PageHeader";
import MapButtons from "@/components/shared/MapButtons";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import InviteeRow from "@/components/events/InviteeRow";
import AddInviteeDialog from "@/components/events/AddInviteeDialog";
import EditEventDialog from "@/components/events/EditEventDialog";
import InvitationCardEditor from "@/components/events/InvitationCardEditor";
import GuestStatsDashboard from "@/components/events/GuestStatsDashboard";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";


export default function EventDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const eventId = window.location.pathname.split("/events/")[1];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const t = useT();
  const [showAddInvitee, setShowAddInvitee] = useState(false);
  const [showEditEvent, setShowEditEvent] = useState(false);
  const [showCardEditor, setShowCardEditor] = useState(false);
  const [inviteeFilter, setInviteeFilter] = useState("all");

  const { data: event, isLoading: eventLoading } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => {
      const events = await base44.entities.Event.filter({ id: eventId });
      return events[0];
    },
    enabled: !!eventId,
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["event-recipients", eventId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getEventRecipients', { eventId });
      return res.data.recipients;
    },
    enabled: !!eventId,
  });

  // Real-time: refresh invitee list when any recipient record changes (e.g. user_id gets linked)
  useEffect(() => {
    if (!eventId) return;
    const unsubscribe = base44.entities.InvitationRecipient.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
    });
    return unsubscribe;
  }, [eventId]);

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.Event.delete(eventId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/events");
    },
  });

  const activateMutation = useMutation({
    mutationFn: () => base44.entities.Event.update(eventId, { status: "active" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      toast({ title: t.eventActivated, description: t.eventActivatedDesc });
    },
  });

  if (eventLoading || recipientsLoading) return <LoadingSpinner />;
  if (!event) return <EmptyState title={t.eventNotFound} />;

  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const isOwner = event.created_by === user?.email ||
    event.owner_email === user?.email ||
    (Array.isArray(event.owner_emails) && event.owner_emails.includes(user?.email));
  const isEventManager = Array.isArray(event.manager_emails) && event.manager_emails.includes(user?.email);
  // Can see RSVP details (stats + invitee list)
  const canSeeRsvpDetails = isPrivileged || isOwner || isEventManager;
  // Can access the event page at all (owner, invited, admin/manager)
  // Match by email OR phone
  const myInvitation = recipients.find(r =>
    (user?.email && r.email === user?.email) ||
    (user?.phone && r.phone === user?.phone)
  );
  const isInvited = !!myInvitation;
  const canAccess = canSeeRsvpDetails || isInvited;

  if (!canAccess) {
    return <EmptyState title={t.notAuthorized} description={t.notAuthorizedDesc} />;
  }

  const stats = {
    total: recipients.length,
    accepted: recipients.filter(r => r.rsvp_status === "accepted").length,
    declined: recipients.filter(r => r.rsvp_status === "declined").length,
    pending: recipients.filter(r => r.rsvp_status === "pending").length,
    totalGuests: recipients
      .filter(r => r.rsvp_status === "accepted")
      .reduce((sum, r) => sum + (r.rsvp_guests_count || r.guests_count || 1), 0),
  };

  return (
    <div>
      <PageHeader title={event.title} subtitle={event.venue_name}>
        <Button variant="ghost" className="gap-2" onClick={() => navigate("/events")}>
          {t.backToEvents}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </PageHeader>

      {/* Invitation Image */}
      {event.invitation_image_url && (
        <div className="mb-6 flex justify-center">
          <img
            src={event.invitation_image_url}
            alt="صورة الدعوة"
            className="max-h-96 rounded-2xl shadow-lg object-contain"
          />
        </div>
      )}

      {/* Event Info Cards */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CalendarHeart className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.dateLabel}</p>
              <p className="font-semibold">
                {event.date ? format(new Date(event.date), "yyyy/MM/dd - HH:mm") : t.notSet}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.locationLabel}</p>
              <p className="font-semibold">{event.venue_name}</p>
            </div>
          </div>
          <MapButtons
            venue_name={event.venue_name}
            venue_address={event.venue_address}
            venue_map_url={event.venue_map_url}
            className="mt-3"
          />
        </Card>
        <Card className="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t.stateLabel}</p>
              <StatusBadge status={event.status} />
            </div>
          </div>
        </Card>
      </div>

      {/* RSVP Stats Dashboard — only for owner / admin / manager */}
      {canSeeRsvpDetails && (
        <GuestStatsDashboard recipients={recipients} event={event} />
      )}

      {/* Invitees Section — only for owner / admin / manager */}
      {canSeeRsvpDetails && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">{t.guestListTitle}</h3>
            <Button className="gap-2 rounded-xl" onClick={() => setShowAddInvitee(true)}>
              <Plus className="w-4 h-4" />
              {t.addInvitee}
            </Button>
          </div>

          {recipients.length === 0 ? (
            <EmptyState
              icon={Users}
              title={t.noInviteesTitle}
              description={t.noInviteesDesc}
            >
              <Button className="gap-2" onClick={() => setShowAddInvitee(true)}>
                <Plus className="w-4 h-4" />
                {t.addFirstInvitee}
              </Button>
            </EmptyState>
          ) : (() => {
            const filterCategories = [
              { key: "all", label: t.filterAll, count: recipients.length },
              { key: "accepted", label: t.filterAccepted, count: recipients.filter(r => r.rsvp_status === "accepted").length },
              { key: "declined", label: t.filterDeclined, count: recipients.filter(r => r.rsvp_status === "declined").length },
              { key: "opened_no_response", label: t.filterOpenedNoReply, count: recipients.filter(r => r.last_opened_at && r.rsvp_status === "pending").length },
              { key: "not_opened", label: t.filterNotOpened, count: recipients.filter(r => !r.last_opened_at).length },
            ];

            const filtered = recipients.filter(r => {
              if (inviteeFilter === "all") return true;
              if (inviteeFilter === "accepted") return r.rsvp_status === "accepted";
              if (inviteeFilter === "declined") return r.rsvp_status === "declined";
              if (inviteeFilter === "opened_no_response") return r.last_opened_at && r.rsvp_status === "pending";
              if (inviteeFilter === "not_opened") return !r.last_opened_at;
              return true;
            });

            return (
              <>
                {/* Filter tabs */}
                <div className="flex gap-2 flex-wrap mb-3">
                  {filterCategories.map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setInviteeFilter(cat.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all ${
                        inviteeFilter === cat.key
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {cat.label}
                      <span className={`text-xs px-1.5 py-0 rounded-full ${
                        inviteeFilter === cat.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"
                      }`}>
                        {cat.count}
                      </span>
                    </button>
                  ))}
                </div>

                <Card className="divide-y divide-border overflow-hidden">
                  {filtered.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground text-sm">{t.noInviteesInCategory}</div>
                  ) : (
                    filtered.map(recipient => (
                      <InviteeRow
                        key={recipient.id}
                        recipient={recipient}
                        eventId={eventId}
                        eventTitle={event?.title}
                        eventGreeting={event?.invitation_greeting}
                        canResend={isPrivileged}
                      />
                    ))
                  )}
                </Card>
              </>
            );
          })()}
        </div>
      )}

      {/* Actions — only for owner / admin / manager */}
      {canSeeRsvpDetails && (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => setShowEditEvent(true)}>
            <Pencil className="w-4 h-4" />
            {t.editEventBtn}
          </Button>
          <Button variant="outline" className="gap-2 rounded-xl" onClick={() => setShowCardEditor(true)}>
            <Sparkles className="w-4 h-4" />
            {t.designCardBtn}
          </Button>
          {event.status === "draft" && (
            <Button
              className="gap-2 rounded-xl"
              onClick={() => activateMutation.mutate()}
              disabled={activateMutation.isPending}
            >
              <Send className="w-4 h-4" />
              {t.activateEvent}
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2 rounded-xl text-destructive hover:text-destructive">
                <Trash2 className="w-4 h-4" />
                {t.deleteEvent}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
                <AlertDialogDescription>{t.deleteConfirmDesc}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteMutation.mutate()}>
                  {t.deleteBtn}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      <AddInviteeDialog
        open={showAddInvitee}
        onOpenChange={setShowAddInvitee}
        eventId={eventId}
      />
      <EditEventDialog
        open={showEditEvent}
        onOpenChange={setShowEditEvent}
        event={event}
      />
      <InvitationCardEditor
        open={showCardEditor}
        onOpenChange={setShowCardEditor}
        event={event}
      />
    </div>
  );
}