import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { CalendarHeart, MapPin, Clock, Sparkles, Check, X, CalendarPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import RequestEventDialog from "@/components/shared/RequestEventDialog";

export default function MyInvitations() {
  const { user, isLoadingAuth } = useAuth();
  const t = useT();
  const [showRequestDialog, setShowRequestDialog] = useState(false);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["my-invitations", user?.id, user?.phone, user?.email],
    queryFn: async () => {
      const fetches = [];
      const phone = user?.data?.phone || user?.phone;
      if (phone) fetches.push(base44.entities.InvitationRecipient.filter({ phone }));
      if (user?.id) fetches.push(base44.entities.InvitationRecipient.filter({ user_id: user.id }));
      if (!fetches.length) return [];

      const results = await Promise.all(fetches);
      const allRecipients = results.flat();
      // Dedupe by id
      const seen = new Set();
      const recipients = allRecipients.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
      if (!recipients.length) return [];

      const eventIds = [...new Set(recipients.map(r => r.event_id))];
      const events = await Promise.all(
        eventIds.map(id => base44.entities.Event.filter({ id }).then(r => r[0]).catch(() => null))
      );
      const eventMap = {};
      events.forEach(e => e && (eventMap[e.id] = e));
      return recipients.map(r => ({ recipient: r, event: eventMap[r.event_id] })).filter(x => x.event);
    },
    enabled: !!user,
  });

  if (isLoadingAuth) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-6 text-center" dir="rtl">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <CalendarHeart className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-display font-bold mb-2">{t.myInvitationsTitle}</h2>
          <p className="text-muted-foreground text-sm">{t.mustLogin}</p>
        </div>
        <Button className="h-12 px-8 rounded-xl" onClick={() => base44.auth.redirectToLogin(window.location.href)}>
          {t.login}
        </Button>
      </div>
    );
  }

  const now = new Date();
  const upcoming = invitations.filter(({ event }) => event.date && new Date(event.date) >= now);
  const past = invitations.filter(({ event }) => !event.date || new Date(event.date) < now);

  const InvitationCard = ({ recipient, event }) => {
    const handleView = () => {
      const nowIso = new Date().toISOString();
      const updates = {
        last_opened_at: nowIso,
        open_count: (recipient.open_count || 0) + 1,
        status: "opened",
      };
      if (!recipient.first_opened_at) updates.first_opened_at = nowIso;
      base44.entities.InvitationRecipient.update(recipient.id, updates).catch(() => {});
    };
    return (
      <Link to={`/i/${recipient.personal_token || recipient.invitation_token}`} onClick={handleView}>
        <Card className="p-5 hover:shadow-lg transition-all duration-200 hover:border-primary/20 cursor-pointer">
          <div className="flex items-start gap-4">
            {event.cover_image_url ? (
              <img src={event.cover_image_url} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CalendarHeart className="w-7 h-7 text-primary" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold truncate">{event.title}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="truncate">{event.venue_name}</span>
              </div>
              {event.date && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                  <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{format(new Date(event.date), "yyyy/MM/dd HH:mm")}</span>
                </div>
              )}
            </div>
            <div className="flex-shrink-0">
              {recipient.rsvp_status === "accepted" ? (
                <span className="flex items-center gap-1 text-xs font-medium text-success bg-success/10 px-2 py-1 rounded-full">
                  <Check className="w-3 h-3" /> {t.attending}
                </span>
              ) : recipient.rsvp_status === "declined" ? (
                <span className="flex items-center gap-1 text-xs font-medium text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                  <X className="w-3 h-3" /> {t.notAttending}
                </span>
              ) : (
                <span className="text-xs font-medium text-warning bg-warning/10 px-2 py-1 rounded-full">
                  {t.awaitingStatus}
                </span>
              )}
            </div>
          </div>
        </Card>
      </Link>
    );
  };

  return (
    <div dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold">{t.myInvitationsTitle}</h1>
          <p className="text-muted-foreground text-sm mt-1">{t.allInvitations}</p>
        </div>
        <Button
          variant="outline"
          className="gap-2 rounded-xl h-11"
          onClick={() => setShowRequestDialog(true)}
        >
          <CalendarPlus className="w-4 h-4" />
          {t.requestEvent}
        </Button>
      </div>
      <RequestEventDialog open={showRequestDialog} onOpenChange={setShowRequestDialog} user={user} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : invitations.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="p-10 text-center">
            <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="font-semibold text-lg mb-1">{t.noInvitations}</h3>
            <p className="text-sm text-muted-foreground">{t.noInvitationsDesc}</p>
          </Card>
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t.upcomingEventsLabel}</h2>
              <div className="space-y-4">
                {upcoming.map(({ recipient, event }) => <InvitationCard key={recipient.id} recipient={recipient} event={event} />)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t.pastEventsLabel}</h2>
              <div className="space-y-4 opacity-70">
                {past.map(({ recipient, event }) => <InvitationCard key={recipient.id} recipient={recipient} event={event} />)}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}