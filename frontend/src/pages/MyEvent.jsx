import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarHeart, MapPin, Calendar, Users, Download,
  CheckCircle2, XCircle, Clock, Pencil, ChevronDown, ChevronUp
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { ar, he } from "date-fns/locale";
import { useToast } from "@/components/ui/use-toast";

// rsvpLabel is built dynamically using t inside components
const rsvpColor = {
  accepted: "bg-success/10 text-success",
  declined: "bg-destructive/10 text-destructive",
  pending: "bg-warning/10 text-warning",
  maybe: "bg-muted text-muted-foreground",
};

function EditEventDialog({ event, open, onOpenChange }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT();
  const [form, setForm] = useState({
    title: event.title || "",
    venue_name: event.venue_name || "",
    venue_address: event.venue_address || "",
    date: event.date ? event.date.slice(0, 16) : "",
    description: event.description || "",
    host_name: event.host_name || "",
    host_phone: event.host_phone || "",
  });

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Event.update(event.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-owned-events"] });
      toast({ title: t.saved, description: t.savedDesc });
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.editEventTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>{t.eventName}</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>{t.dateTime}</Label>
            <Input type="datetime-local" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>{t.venueHall}</Label>
            <Input value={form.venue_name} onChange={e => setForm(f => ({ ...f, venue_name: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>{t.address}</Label>
            <Input value={form.venue_address} onChange={e => setForm(f => ({ ...f, venue_address: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>{t.hostName}</Label>
            <Input value={form.host_name} onChange={e => setForm(f => ({ ...f, host_name: e.target.value }))} className="mt-1" />
          </div>
          <div>
            <Label>{t.hostPhone}</Label>
            <Input value={form.host_phone} onChange={e => setForm(f => ({ ...f, host_phone: e.target.value }))} className="mt-1" dir="ltr" />
          </div>
          <div>
            <Label>{t.eventDescription}</Label>
            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="mt-1" rows={3} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button className="flex-1" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
              {mutation.isPending ? t.saving : t.saveChanges}
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EventControlPanel({ event }) {
  const [showEdit, setShowEdit] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const t = useT();
  const { user } = useAuth();
  const dateLocale = user?.preferred_language === "he" ? he : ar;
  const rsvpLabel = { pending: t.pending, accepted: t.accepted, declined: t.declined, maybe: t.statusMaybe };

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["event-recipients-owner", event.id],
    queryFn: async () => {
      const res = await base44.functions.invoke('getEventRecipients', { eventId: event.id });
      return res.data.recipients;
    },
  });

  const stats = {
    total: recipients.length,
    accepted: recipients.filter(r => r.rsvp_status === "accepted").length,
    declined: recipients.filter(r => r.rsvp_status === "declined").length,
    pending: recipients.filter(r => r.rsvp_status === "pending").length,
    guests: recipients.filter(r => r.rsvp_status === "accepted").reduce((s, r) => s + (r.rsvp_guests_count || r.guests_count || 1), 0),
  };

  const filtered = recipients.filter(r => {
    const matchFilter = filter === "all" || r.rsvp_status === filter;
    const matchSearch = !search ||
      (r.external_full_name || r.full_name || "").includes(search) ||
      (r.phone || "").includes(search);
    return matchFilter && matchSearch;
  });

  const exportCSV = () => {
    const headers = [t.name, t.phone, t.status, t.guests, t.replyDate, "ملاحظات"];
    const rows = filtered.map(r => [
      r.external_full_name || r.full_name || "",
      r.phone || "",
      rsvpLabel[r.rsvp_status] || "",
      r.rsvp_status === "accepted" ? (r.rsvp_guests_count || r.guests_count || 1) : "",
      r.rsvp_date ? format(new Date(r.rsvp_date), "yyyy/MM/dd") : "",
      r.rsvp_message || r.notes || "",
    ]);
    const csv = "\uFEFF" + [headers, ...rows]
      .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title}_${format(new Date(), "yyyyMMdd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Event Header */}
      <Card className="overflow-hidden">
        {event.cover_image_url && (
          <div className="h-40 overflow-hidden">
            <img src={event.cover_image_url} alt={event.title} className="w-full h-full object-cover" />
          </div>
        )}
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="font-display text-2xl">{event.title}</CardTitle>
            <Badge variant={event.status === "active" ? "default" : "secondary"}>
              {event.status === "active" ? t.active : event.status === "draft" ? t.draft : event.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {event.date && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" />
              <span>{format(new Date(event.date), "EEEE، d MMMM yyyy - HH:mm", { locale: dateLocale })}</span>
            </div>
          )}
          {event.venue_name && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="w-4 h-4" />
              <span>{event.venue_name}{event.venue_address ? ` — ${event.venue_address}` : ""}</span>
            </div>
          )}
          <div className="pt-2">
            <Button variant="outline" className="gap-2" onClick={() => setShowEdit(true)}>
              <Pencil className="w-4 h-4" />
              {t.editEvent}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t.totalInviteesLabel, value: stats.total, icon: Users, color: "text-foreground" },
          { label: t.confirmedAttendance, value: stats.accepted, icon: CheckCircle2, color: "text-success" },
          { label: t.declinedAttendance, value: stats.declined, icon: XCircle, color: "text-destructive" },
          { label: t.awaitingReplyLabel, value: stats.pending, icon: Clock, color: "text-warning" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="p-4 text-center">
            <Icon className={`w-6 h-6 mx-auto mb-1 ${color}`} />
            <p className={`text-2xl font-bold font-display ${color}`}>{value}</p>
            <p className="text-xs text-muted-foreground mt-1">{label}</p>
          </Card>
        ))}
      </div>

      {/* Guest List */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-lg">{t.guestList}</CardTitle>
            <Button variant="outline" size="sm" className="gap-2" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4" />
              {t.exportCSV}
            </Button>
          </div>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2 mt-3">
            <Input
              placeholder={t.searchNamePhone}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 h-9 rounded-lg text-sm"
            />
            <div className="flex gap-1 flex-wrap">
              {[
                { key: "all", label: t.all },
                { key: "accepted", label: t.accepted },
                { key: "declined", label: t.declined },
                { key: "pending", label: t.pending },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    filter === f.key
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">{t.noResults}</div>
          ) : (
            <div className="divide-y divide-border">
              {/* Table header */}
              <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/30">
                <div className="col-span-4">{t.name}</div>
                <div className="col-span-3">{t.phone}</div>
                <div className="col-span-2">{t.status}</div>
                <div className="col-span-1">{t.guests}</div>
                <div className="col-span-2">{t.replyDate}</div>
              </div>
              {filtered.map(r => (
                <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-1 md:gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                  <div className="md:col-span-4">
                    <p className="font-medium text-sm">{[r.nickname, r.first_name, r.last_name].filter(Boolean).join(' ') || r.external_full_name || r.full_name || "—"}</p>
                    {r.rsvp_message && <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.rsvp_message}</p>}
                  </div>
                  <div className="md:col-span-3 text-sm text-muted-foreground" dir="ltr">{r.phone || "—"}</div>
                  <div className="md:col-span-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${rsvpColor[r.rsvp_status] || ""}`}>
                      {rsvpLabel[r.rsvp_status] || r.rsvp_status}
                    </span>
                  </div>
                  <div className="md:col-span-1 text-sm text-center">
                    {r.rsvp_status === "accepted" ? (r.rsvp_guests_count || r.guests_count || 1) : "—"}
                  </div>
                  <div className="md:col-span-2 text-xs text-muted-foreground">
                    {r.rsvp_date ? format(new Date(r.rsvp_date), "yyyy/MM/dd") : "—"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EditEventDialog event={event} open={showEdit} onOpenChange={setShowEdit} />
    </div>
  );
}

export default function MyEvent() {
  const { user } = useAuth();
  const t = useT();
  const [selectedEvent, setSelectedEvent] = useState(null);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["my-owned-events", user?.email],
    queryFn: async () => {
      const [byOwnerEmails, byOwnerEmail, byCreatedBy] = await Promise.all([
        base44.entities.Event.filter({ owner_emails: user.email }),
        base44.entities.Event.filter({ owner_email: user.email }),
        base44.entities.Event.filter({ created_by: user.email }),
      ]);
      // Merge and deduplicate by id
      const map = new Map();
      [...byOwnerEmails, ...byOwnerEmail, ...byCreatedBy].forEach(e => map.set(e.id, e));
      return Array.from(map.values());
    },
    enabled: !!user?.email,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <CalendarHeart className="w-16 h-16 text-muted-foreground/40" />
        <h2 className="text-xl font-display font-semibold">{t.noEventAssigned}</h2>
        <p className="text-muted-foreground">{t.noEventAssignedDesc}</p>
      </div>
    );
  }

  // If only one event, show its panel directly
  const activeEvent = selectedEvent || (events.length === 1 ? events[0] : null);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-display font-bold mb-6">{t.myEventDashboard}</h1>

      {/* Event selector if multiple events */}
      {events.length > 1 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {events.map(e => (
            <button
              key={e.id}
              onClick={() => setSelectedEvent(e)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                activeEvent?.id === e.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent"
              }`}
            >
              {e.title}
            </button>
          ))}
        </div>
      )}

      {activeEvent ? (
        <EventControlPanel event={activeEvent} />
      ) : (
        <p className="text-muted-foreground text-center py-10">{t.chooseEvent}</p>
      )}
    </div>
  );
}