import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarHeart, CalendarPlus, Mail, Navigation, Phone, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { format, differenceInCalendarDays } from "date-fns";
import { ar, he } from "date-fns/locale";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import RequestEventDialog from "@/components/shared/RequestEventDialog";

const RSVP_OPTIONS = [
  { status: "accepted", labelKey: "rsvpYes", on: "bg-success text-success-foreground border-success" },
  { status: "maybe", labelKey: "rsvpMaybe", on: "bg-warning text-warning-foreground border-warning" },
  { status: "declined", labelKey: "rsvpNo", on: "bg-destructive text-destructive-foreground border-destructive" },
];

const REPLY_BADGE = {
  accepted: "bg-success/10 text-success",
  maybe: "bg-warning/10 text-warning",
  declined: "bg-destructive/10 text-destructive",
};

function wazeUrl(event) {
  const q = [event.venue_name, event.venue_address || event.venue_city].filter(Boolean).join(", ");
  return `https://waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}

// Same Google Calendar template link the invitation page builds.
function calendarUrl(event) {
  const start = new Date(event.date);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${fmt(start)}/${fmt(end)}`,
    location: [event.venue_name, event.venue_address || event.venue_city].filter(Boolean).join(", "),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function daysLeftLabel(t, date) {
  const days = differenceInCalendarDays(new Date(date), new Date());
  if (days <= 0) return t.todayLabel;
  if (days === 1) return t.tomorrowLabel;
  return t.inDays.replace("{n}", days);
}

// Marks the invitation opened, same as tapping it on the old list did.
function markViewed(recipient) {
  const nowIso = new Date().toISOString();
  const updates = { last_opened_at: nowIso, open_count: (recipient.open_count || 0) + 1, status: "opened" };
  if (!recipient.first_opened_at) updates.first_opened_at = nowIso;
  base44.entities.InvitationRecipient.update(recipient.id, updates).catch(() => {});
}

function useReply(userId) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT();
  return useMutation({
    mutationFn: ({ recipient, status, guests }) =>
      base44.functions.invoke("submitRsvp", {
        recipientId: recipient.id,
        rsvpStatus: status,
        guestsCount: status === "accepted" ? guests : undefined,
        message: recipient.rsvp_message || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-invitations", userId] });
      toast({ title: t.rsvpSaved });
    },
    onError: (e) => toast({ title: t.addError, description: e?.message, variant: "destructive" }),
  });
}

function ReplyButtons({ current, onPick, disabled }) {
  const t = useT();
  return (
    <div role="radiogroup" className="grid grid-cols-3 gap-1.5">
      {RSVP_OPTIONS.map((o) => {
        const selected = current === o.status;
        return (
          <button
            key={o.status}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onPick(o.status)}
            className={`h-11 rounded-xl border text-sm font-semibold transition-colors disabled:opacity-60 ${
              selected ? o.on : "bg-background border-border text-foreground hover:bg-accent/50"
            }`}
          >
            {t[o.labelKey]}
          </button>
        );
      })}
    </div>
  );
}

function EventMeta({ event }) {
  const t = useT();
  const locale = t.langCode === "he" ? he : ar;
  return (
    <span className="text-sm text-muted-foreground">
      {[format(new Date(event.date), "EEEE d.M · HH:mm", { locale }), [event.venue_name, event.venue_city && (t[event.venue_city] || event.venue_city)].filter(Boolean).join("، ")]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );
}

function PendingCard({ recipient, event, reply }) {
  const t = useT();
  const names = [event.groom_name, event.bride_name].filter(Boolean).join(" ❦ ");
  return (
    <article className="rounded-2xl overflow-hidden bg-card border border-border shadow-sm">
      <div className="relative h-24 bg-accent flex items-center justify-center overflow-hidden">
        {event.cover_image_url ? (
          <img src={event.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <span className="font-display text-2xl font-bold text-primary px-16 text-center line-clamp-1">{names || event.title}</span>
        )}
        <span className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-card text-xs font-semibold text-foreground">
          {t[event.event_type] || event.event_type}
        </span>
        <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-foreground text-background text-xs font-semibold">
          {daysLeftLabel(t, event.date)}
        </span>
      </div>
      <div className="p-3.5 space-y-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-bold text-base text-foreground">{event.title}</span>
          {event.host_name && <span className="text-sm text-muted-foreground">{t.hostedBy.replace("{name}", event.host_name)}</span>}
          <EventMeta event={event} />
        </div>
        <ReplyButtons
          current={null}
          disabled={reply.isPending}
          onPick={(status) => reply.mutate({ recipient, status, guests: recipient.guests_count || 1 })}
        />
        <Link
          to={`/i/${recipient.personal_token}`}
          onClick={() => markViewed(recipient)}
          className="block text-center text-sm font-semibold text-primary"
        >
          {t.openFullInvitation}
        </Link>
      </div>
    </article>
  );
}

function RepliedCard({ recipient, event, reply }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(recipient.rsvp_status);
  const [guests, setGuests] = useState(recipient.rsvp_guests_count || recipient.guests_count || 1);
  const date = new Date(event.date);
  const locale = t.langCode === "he" ? he : ar;
  const badge =
    recipient.rsvp_status === "accepted"
      ? (recipient.rsvp_guests_count || 1) === 1
        ? t.repliedYesOne
        : t.repliedYes.replace("{n}", recipient.rsvp_guests_count)
      : recipient.rsvp_status === "maybe"
        ? t.repliedMaybe
        : t.repliedNo;

  const save = (nextStatus, nextGuests) =>
    reply.mutate({ recipient, status: nextStatus, guests: nextGuests }, { onSuccess: () => setEditing(false) });

  const pick = (next) => {
    setStatus(next);
    // Accepting asks for the head count first; maybe/declined save at once.
    if (next !== "accepted") save(next, guests);
  };

  return (
    <article className="rounded-2xl bg-card border border-border p-3.5 space-y-3">
      <div className="flex items-center gap-3">
        <div className={`w-[52px] h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0 ${REPLY_BADGE[recipient.rsvp_status] || "bg-muted"}`}>
          <span className="text-lg font-bold leading-tight">{format(date, "dd")}</span>
          <span className="text-[11px]">{format(date, "MMM", { locale })}</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <Link to={`/i/${recipient.personal_token}`} onClick={() => markViewed(recipient)} className="font-bold text-foreground truncate">
            {event.title}
          </Link>
          <span className="text-sm text-muted-foreground truncate">
            {format(date, "HH:mm")} · {event.venue_name}
          </span>
          <span className={`self-start mt-0.5 px-2 py-0.5 rounded-full text-xs font-semibold ${REPLY_BADGE[recipient.rsvp_status]}`}>
            {badge} · {daysLeftLabel(t, event.date)}
          </span>
        </div>
      </div>

      {editing ? (
        <div className="space-y-2.5">
          <ReplyButtons current={status} onPick={pick} disabled={reply.isPending} />
          {status === "accepted" && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-muted">
              <span className="text-sm font-semibold">{t.guestCountLabel}</span>
              <div className="flex items-center gap-3">
                <button type="button" aria-label="-" onClick={() => setGuests((g) => Math.max(1, g - 1))} className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center">
                  <Minus className="w-4 h-4" />
                </button>
                <span className="min-w-5 text-center font-bold">{guests}</span>
                <button type="button" aria-label="+" onClick={() => setGuests((g) => Math.min(30, g + 1))} className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <Button size="sm" className="rounded-lg" disabled={reply.isPending} onClick={() => save("accepted", guests)}>
                {reply.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : t.saveBtn}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <a href={wazeUrl(event)} target="_blank" rel="noreferrer" className="h-10 rounded-xl bg-foreground text-background flex items-center justify-center gap-1.5 text-sm font-semibold">
            <Navigation className="w-4 h-4" />
            Waze
          </a>
          <a href={calendarUrl(event)} target="_blank" rel="noreferrer" className="h-10 rounded-xl border border-border bg-background flex items-center justify-center gap-1.5 text-sm font-semibold text-foreground">
            <CalendarPlus className="w-4 h-4" />
            {t.addToCalendar}
          </a>
          <button
            type="button"
            onClick={() => { setStatus(recipient.rsvp_status); setEditing(true); }}
            className="h-10 rounded-xl border border-border bg-background text-sm font-semibold text-foreground"
          >
            {t.changeReply}
          </button>
        </div>
      )}
    </article>
  );
}

function PastRow({ recipient, event }) {
  const t = useT();
  const status =
    recipient.rsvp_status === "accepted"
      ? { label: t.pastAttended, cls: "text-success" }
      : recipient.rsvp_status === "declined"
        ? { label: t.pastDeclined, cls: "text-destructive" }
        : { label: t.pastNoReply, cls: "text-muted-foreground" };
  return (
    <Link to={`/i/${recipient.personal_token}`} onClick={() => markViewed(recipient)} className="flex items-center gap-3 px-3.5 py-3 hover:bg-accent/30">
      <span className="w-11 text-center text-xs text-muted-foreground flex-shrink-0">{event.date ? format(new Date(event.date), "d.M") : "—"}</span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-foreground truncate">{event.title}</span>
        <span className={`text-xs ${status.cls}`}>{status.label}</span>
      </span>
    </Link>
  );
}

function EmptyInvitations({ user, onRequestEvent }) {
  const t = useT();
  return (
    <div className="space-y-4">
      <section className="flex flex-col items-center text-center gap-2 pt-4 pb-1 px-2">
        <div className="w-24 h-24 rounded-full bg-accent flex items-center justify-center">
          <Mail className="w-11 h-11 text-primary" />
        </div>
        <h2 className="text-lg font-bold mt-1.5">{t.invEmptyTitle}</h2>
        <p className="text-sm leading-7 text-muted-foreground max-w-sm">{t.invEmptyDesc}</p>
      </section>

      <section className="rounded-2xl border border-border bg-card p-3.5 space-y-2.5">
        <span className="text-sm font-bold">{t.invHowTitle}</span>
        {[t.invHow1, t.invHow2, t.invHow3].map((text, i) => (
          <div key={i} className="flex items-center gap-2.5 text-sm">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
            {text}
          </div>
        ))}
      </section>

      <section className="flex items-center gap-3 p-3.5 rounded-2xl bg-accent">
        <Phone className="w-5 h-5 text-primary flex-shrink-0" />
        <span className="flex-1 flex flex-col gap-0.5">
          {user?.phone ? (
            <>
              <span className="text-sm text-muted-foreground">{t.invLinkedPhone}</span>
              <span dir="ltr" className="text-base font-bold text-right">{user.phone}</span>
            </>
          ) : (
            <span className="text-sm font-semibold">{t.invNoPhone}</span>
          )}
        </span>
        <Link to="/profile" className="text-sm font-semibold text-primary">{t.editBtn}</Link>
      </section>

      <section className="flex items-center gap-3 p-4 rounded-2xl bg-foreground text-background">
        <span className="flex-1 flex flex-col gap-0.5">
          <span className="font-bold">{t.haveEventTitle}</span>
          <span className="text-xs opacity-80">{t.haveEventDesc}</span>
        </span>
        <Button size="sm" className="rounded-xl" onClick={onRequestEvent}>{t.requestEvent}</Button>
      </section>
    </div>
  );
}

export default function MyInvitations() {
  const { user, isLoadingAuth } = useAuth();
  const t = useT();
  const [showRequestDialog, setShowRequestDialog] = useState(false);
  const reply = useReply(user?.id);

  const { data: invitations = [], isLoading } = useQuery({
    queryKey: ["my-invitations", user?.id],
    queryFn: () => base44.myInvitations.list(),
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
  const byDate = (a, b) => new Date(a.event.date) - new Date(b.event.date);
  const upcoming = invitations.filter(({ event }) => event.date && new Date(event.date) >= now);
  const pending = upcoming.filter(({ recipient }) => recipient.rsvp_status === "pending").sort(byDate);
  const replied = upcoming.filter(({ recipient }) => recipient.rsvp_status !== "pending").sort(byDate);
  const past = invitations
    .filter(({ event }) => !event.date || new Date(event.date) < now)
    .sort((a, b) => byDate(b, a));

  return (
    <div dir="rtl" className="max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="text-2xl font-display font-bold">{t.myInvitationsTitle}</h1>
        {invitations.length > 0 && (
          <Button variant="outline" className="gap-2 rounded-xl h-10" onClick={() => setShowRequestDialog(true)}>
            <CalendarPlus className="w-4 h-4" />
            {t.requestEvent}
          </Button>
        )}
      </div>

      <RequestEventDialog open={showRequestDialog} onOpenChange={setShowRequestDialog} user={user} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : invitations.length === 0 ? (
        <EmptyInvitations user={user} onRequestEvent={() => setShowRequestDialog(true)} />
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="flex gap-2 flex-wrap">
            {pending.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-warning/10 text-warning text-sm font-semibold">{t.invChipPending.replace("{n}", pending.length)}</span>
            )}
            {replied.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-success/10 text-success text-sm font-semibold">{t.invChipReplied.replace("{n}", replied.length)}</span>
            )}
            {past.length > 0 && (
              <span className="px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-sm font-semibold">{t.invChipPast.replace("{n}", past.length)}</span>
            )}
          </div>

          {pending.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">{t.invPendingSection}</h2>
              {pending.map(({ recipient, event }) => (
                <PendingCard key={recipient.id} recipient={recipient} event={event} reply={reply} />
              ))}
            </section>
          )}

          {replied.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold">{t.invRepliedSection}</h2>
              {replied.map(({ recipient, event }) => (
                <RepliedCard key={`${recipient.id}-${recipient.rsvp_status}-${recipient.rsvp_guests_count}`} recipient={recipient} event={event} reply={reply} />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-bold text-muted-foreground">{t.pastEventsLabel}</h2>
              <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
                {past.map(({ recipient, event }) => (
                  <PastRow key={recipient.id} recipient={recipient} event={event} />
                ))}
              </div>
            </section>
          )}
        </motion.div>
      )}
    </div>
  );
}
