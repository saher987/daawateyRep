import React from "react";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n";

const statusClasses = {
  pending: "bg-warning/10 text-warning border-warning/20",
  accepted: "bg-success/10 text-success border-success/20",
  declined: "bg-destructive/10 text-destructive border-destructive/20",
  maybe: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  active: "bg-success/10 text-success border-success/20",
  completed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  sent: "bg-chart-3/10 text-chart-3 border-chart-3/20",
  opened: "bg-primary/10 text-primary border-primary/20",
  responded: "bg-success/10 text-success border-success/20",
};

export default function StatusBadge({ status }) {
  const t = useT();
  const labelMap = {
    pending: t.statusPendingRsvp,
    accepted: t.statusAccepted,
    declined: t.statusDeclined,
    maybe: t.statusMaybe,
    draft: t.statusDraft,
    active: t.statusActive,
    completed: t.statusCompleted,
    cancelled: t.statusCancelled,
    sent: t.statusSent,
    opened: t.statusOpened,
    responded: t.statusResponded,
  };
  const label = labelMap[status] || status;
  const className = statusClasses[status] || "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={`${className} border font-medium`}>
      {label}
    </Badge>
  );
}