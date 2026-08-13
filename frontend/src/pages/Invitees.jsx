import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, Users, Download } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import StatusBadge from "@/components/shared/StatusBadge";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import EmptyState from "@/components/shared/EmptyState";
import { format } from "date-fns";
import { useT } from "@/lib/i18n";
import { downloadFile } from "@/lib/downloadFile";

export default function Invitees() {
  const t = useT();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["all-recipients"],
    queryFn: () => base44.entities.InvitationRecipient.list("-created_date", 500),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list("-created_date", 100),
  });

  const eventMap = Object.fromEntries(events.map(e => [e.id, e]));

  const rsvpLabel = { pending: t.rsvpPending, accepted: t.rsvpAccepted, declined: t.rsvpDeclined, maybe: t.rsvpMaybe };

  const exportCSV = () => {
    const headers = [t.colName, t.colEvent, t.colPhone, t.colStatus, t.colGuests, t.colReplyDate];
    const rows = filtered.map(r => [
      r.full_name || "",
      eventMap[r.event_id]?.title || "",
      r.phone || "",
      rsvpLabel[r.rsvp_status] || r.rsvp_status || "",
      r.rsvp_status === "accepted" ? (r.rsvp_guests_count || r.guests_count || 1) : "",
      r.rsvp_date ? format(new Date(r.rsvp_date), "yyyy/MM/dd") : "",
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    downloadFile(blob, `المدعوين_${format(new Date(), "yyyyMMdd")}.csv`);
  };

  const filtered = recipients.filter(r => {
    const matchSearch = r.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.phone?.includes(search) || r.group_label?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || r.rsvp_status === statusFilter;
    const matchEvent = eventFilter === "all" || r.event_id === eventFilter;
    return matchSearch && matchStatus && matchEvent;
  });

  if (recipientsLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title={t.inviteesTitle} subtitle={`${recipients.length} ${t.inviteesTotal}`}>
        <Button variant="outline" className="gap-2 rounded-xl" onClick={exportCSV} disabled={filtered.length === 0}>
          <Download className="w-4 h-4" />
          {t.exportCsvBtn}
        </Button>
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder={t.searchInvitees}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-11 h-12 rounded-xl text-base"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-12 rounded-xl w-full sm:w-48 text-base">
            <SelectValue placeholder={t.rsvpStatus} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allStatuses}</SelectItem>
            <SelectItem value="pending">{t.rsvpPending}</SelectItem>
            <SelectItem value="accepted">{t.rsvpAccepted}</SelectItem>
            <SelectItem value="declined">{t.rsvpDeclined}</SelectItem>
            <SelectItem value="maybe">{t.rsvpMaybe}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={eventFilter} onValueChange={setEventFilter}>
          <SelectTrigger className="h-12 rounded-xl w-full sm:w-48 text-base">
            <SelectValue placeholder={t.events} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t.allEvents}</SelectItem>
            {events.map(e => (
              <SelectItem key={e.id} value={e.id}>{e.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={Users} title={t.noInviteesFound} description={t.noInviteesFoundDesc} />
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 p-4 text-sm font-medium text-muted-foreground bg-muted/30">
            <div className="col-span-3">{t.colName}</div>
            <div className="col-span-2">{t.colEvent}</div>
            <div className="col-span-2">{t.colPhone}</div>
            <div className="col-span-2">{t.colStatus}</div>
            <div className="col-span-1">{t.colGuests}</div>
            <div className="col-span-2">{t.colReplyDate}</div>
          </div>
          {filtered.map(r => (
            <div key={r.id} className="grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 p-4 hover:bg-muted/20 transition-colors items-center">
              <div className="md:col-span-3">
                <p className="font-medium">{r.full_name}</p>
                {r.group_label && <p className="text-xs text-muted-foreground">{r.group_label}</p>}
              </div>
              <div className="md:col-span-2 text-sm text-muted-foreground">
                {eventMap[r.event_id]?.title || "—"}
              </div>
              <div className="md:col-span-2 text-sm" dir="ltr">
                {r.phone || "—"}
              </div>
              <div className="md:col-span-2">
                <StatusBadge status={r.rsvp_status} />
              </div>
              <div className="md:col-span-1 text-sm">
                {r.rsvp_status === "accepted" ? (r.rsvp_guests_count || r.guests_count || 1) : "—"}
              </div>
              <div className="md:col-span-2 text-sm text-muted-foreground">
                {r.rsvp_date ? format(new Date(r.rsvp_date), "yyyy/MM/dd") : "—"}
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}