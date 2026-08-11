import React, { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Bell, CheckCheck, Clock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

export default function Notifications() {
  const { user } = useAuth();
  const t = useT();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.entities.Notification.filter(
      { target_user_email: user?.email },
      "-created_date",
      100
    ),
    enabled: !!user?.email,
  });

  // Mark all invitation recipients as seen when this page is opened
  useEffect(() => {
    if (!user?.email) return;
    base44.entities.InvitationRecipient.filter({ email: user.email }).then((invitations) => {
      const seenKey = `seen_invitations_${user.email}`;
      const allIds = invitations.map(inv => inv.id);
      localStorage.setItem(seenKey, JSON.stringify(allIds));
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
    });
  }, [user?.email]);

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    for (const n of unread) {
      await base44.entities.Notification.update(n.id, { is_read: true });
    }
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
    queryClient.invalidateQueries({ queryKey: ["unread-notifications"] });
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title={t.notifications} subtitle={t.notificationsSubtitle}>
        {notifications.some(n => !n.is_read) && (
          <Button variant="outline" className="gap-2 rounded-xl" onClick={markAllRead}>
            <CheckCheck className="w-4 h-4" />
            {t.markAllRead}
          </Button>
        )}
      </PageHeader>

      {notifications.length === 0 ? (
        <EmptyState icon={Bell} title={t.noNotifications} description={t.noNotificationsDesc} />
      ) : (
        <div className="space-y-3">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={`p-4 cursor-pointer transition-all duration-200 hover:shadow-md ${
                !n.is_read ? "border-primary/30 bg-primary/5" : ""
              }`}
              onClick={() => {
                if (!n.is_read) markReadMutation.mutate(n.id);
                if (n.event_id) navigate(`/events/${n.event_id}`);
              }}
            >
              <div className="flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${!n.is_read ? "bg-primary" : "bg-transparent"}`} />
                <div className="flex-1">
                  <p className="font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                    <Clock className="w-3 h-3" />
                    {n.created_date && format(new Date(n.created_date), "yyyy/MM/dd HH:mm")}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}