import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import { CheckCircle2, Clock, Phone, Mail, User, FileText, CircleDot } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, he } from "date-fns/locale";
import { useT } from "@/lib/i18n";

const statusColors = {
  pending:   "bg-warning/10 text-warning",
  in_review: "bg-primary/10 text-primary",
  approved:  "bg-success/10 text-success",
  rejected:  "bg-destructive/10 text-destructive",
};
const statusIcons = {
  pending: Clock, in_review: CircleDot, approved: CheckCircle2, rejected: CircleDot,
};

export default function EventRequests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const statusLabels = {
    pending: t.statusPendingLabel,
    in_review: t.statusInReviewLabel,
    approved: t.statusApprovedLabel,
    rejected: t.statusRejectedLabel,
  };

  const [filter, setFilter] = useState("all");

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["event-requests"],
    queryFn: () => base44.entities.EventRequest.list("-created_date"),
    enabled: isPrivileged,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.EventRequest.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-requests"] });
      toast({ title: t.requestUpdated });
    },
  });

  if (!isPrivileged) {
    navigate("/");
    return null;
  }

  if (isLoading) return <LoadingSpinner />;

  const filtered = filter === "all" ? requests : requests.filter(r => r.status === filter);

  const pendingCount = requests.filter(r => r.status === "pending" || r.status === "in_review").length;

  const handleMarkHandled = (req) => {
    updateMutation.mutate({ id: req.id, data: { status: "approved" } });
  };

  const handleMarkPending = (req) => {
    updateMutation.mutate({ id: req.id, data: { status: "pending" } });
  };

  const isHandled = (req) => req.status === "approved" || req.status === "rejected";

  return (
    <div>
      <PageHeader
        title={t.eventRequestsTitle}
        subtitle={pendingCount > 0 ? `${pendingCount} ${t.eventRequestsSubtitle}` : t.eventRequestsNoPending}
      />

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {[
          { key: "all", label: t.filterAll },
          { key: "pending", label: t.filterPending },
          { key: "in_review", label: t.filterInReview },
          { key: "approved", label: t.filterApproved },
          { key: "rejected", label: t.filterRejected },
        ].map(f => (
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
            {f.key !== "all" && (
              <span className="mr-1 text-xs opacity-70">
                ({requests.filter(r => r.status === f.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{t.noRequests}</p>
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(req => {
          const StatusIcon = statusIcons[req.status] || Clock;
          const statusColor = statusColors[req.status] || statusColors.pending;
          const statusLabel = statusLabels[req.status] || t.statusPendingLabel;
          const handled = isHandled(req);

          return (
            <Card key={req.id} className={`p-4 transition-opacity ${handled ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-base">{req.title}</h3>
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
                      <StatusIcon className="w-3 h-3" />
                      {statusLabel}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground leading-relaxed">{req.details}</p>

                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                    {req.requester_name && (
                      <div className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5" />
                        <span>{req.requester_name}</span>
                      </div>
                    )}
                    {req.requester_phone && (
                      <div className="flex items-center gap-1" dir="ltr">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{req.requester_phone}</span>
                      </div>
                    )}
                    {req.requester_email && (
                      <div className="flex items-center gap-1" dir="ltr">
                        <Mail className="w-3.5 h-3.5" />
                        <span>{req.requester_email}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>
                        {formatDistanceToNow(new Date(req.created_date), { addSuffix: true, locale: user?.preferred_language === "he" ? he : ar })}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  {!handled ? (
                    <Button
                      size="sm"
                      className="rounded-xl gap-1 h-9"
                      onClick={() => handleMarkHandled(req)}
                      disabled={updateMutation.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      {t.markHandled}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl gap-1 h-9 text-muted-foreground"
                      onClick={() => handleMarkPending(req)}
                      disabled={updateMutation.isPending}
                    >
                      {t.unmarkHandled}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}