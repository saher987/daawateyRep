import React, { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { History, Clock, User, Smartphone } from "lucide-react";
import { format } from "date-fns";
import { useT } from "@/lib/i18n";

// Admin only, here and on the backend (GET /api/audit-log). Entries are
// written by the backend itself — see backend/app/audit.py.

const PAGE_SIZE = 50;

const roleColor = {
  admin: "bg-primary/10 text-primary",
  manager: "bg-warning/10 text-warning",
  venue_owner: "bg-success/10 text-success",
  user: "bg-muted text-muted-foreground",
};

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function AuditLog() {
  const { user } = useAuth();
  const t = useT();
  const [filter, setFilter] = useState("");

  const filters = [
    { key: "", label: t.auditFilterAll },
    { key: "event.,event_request.", label: t.auditFilterEvents },
    { key: "recipient.", label: t.auditFilterGuests },
    { key: "user.", label: t.auditFilterUsers },
    { key: "venue.,planned_wedding.", label: t.auditFilterVenues },
    { key: "provider.,provider_category.", label: t.auditFilterProviders },
  ];

  const isAdmin = user?.role === "admin";

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["audit-log", filter],
    queryFn: ({ pageParam }) =>
      base44.auditLog.list({ action: filter || undefined, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === PAGE_SIZE ? pages.length * PAGE_SIZE : undefined,
    enabled: isAdmin,
  });

  if (user && !isAdmin) return <Navigate to="/" replace />;

  const entries = data?.pages.flat() ?? [];

  return (
    <div>
      <PageHeader title={t.auditLog} subtitle={t.auditLogSubtitle} />

      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading && <LoadingSpinner />}

      {!isLoading && entries.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t.auditNoEntries}</p>
        </div>
      )}

      <div className="space-y-3">
        {entries.map((entry) => (
          <Card key={entry.id} className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold">
                  {t.auditActions?.[entry.action] || entry.action}
                  {entry.entity_label && (
                    <span className="font-normal text-muted-foreground"> · {entry.entity_label}</span>
                  )}
                </p>
              </div>
              {entry.environment !== "prod" && (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-destructive/10 text-destructive">
                  {entry.environment}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                <span>{entry.actor_name || t.auditUnknownActor}</span>
                {entry.actor_role && (
                  <span className={`px-2 py-0.5 rounded-full font-medium ${roleColor[entry.actor_role] || roleColor.user}`}>
                    {{ admin: t.roleAdmin, manager: t.roleManager, venue_owner: t.roleVenueOwner, user: t.roleUser }[entry.actor_role] || entry.actor_role}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1" dir="ltr">
                <Clock className="w-3.5 h-3.5" />
                <span>{format(new Date(entry.created_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
              {entry.platform && (
                <div className="flex items-center gap-1">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{entry.platform}</span>
                </div>
              )}
            </div>

            {entry.changes && (
              <ul className="text-xs space-y-1 bg-muted/50 rounded-lg p-2">
                {Object.entries(entry.changes).map(([field, [before, after]]) => (
                  <li key={field} className="break-words">
                    <span className="font-medium">{field}: </span>
                    <span className="text-muted-foreground line-through">{formatValue(before)}</span>
                    {" ← "}
                    <span>{formatValue(after)}</span>
                  </li>
                ))}
              </ul>
            )}

            {entry.meta && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {Object.entries(entry.meta).map(([key, value]) => (
                  <span key={key} className="break-words">
                    {key}: {formatValue(value)}
                  </span>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {hasNextPage && (
        <div className="text-center mt-5">
          <Button variant="outline" className="rounded-xl" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {t.auditLoadMore}
          </Button>
        </div>
      )}
    </div>
  );
}
