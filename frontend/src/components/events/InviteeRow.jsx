import React, { useState } from "react";
import { Copy, Check, Trash2, ExternalLink, UserCheck, UserX, Eye, Clock, Send, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";

export default function InviteeRow({ recipient, eventId, canResend = false }) {
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useT();
  const { user } = useAuth();
  const dateLocale = user?.preferred_language === "he" ? he : ar;

  const rsvpLabel = {
    pending: { label: t.statusPendingRsvp, className: "bg-warning/10 text-warning border-warning/30" },
    accepted: { label: t.statusAccepted, className: "bg-success/10 text-success border-success/30" },
    declined: { label: t.statusDeclined, className: "bg-destructive/10 text-destructive border-destructive/30" },
    maybe: { label: t.statusMaybe, className: "bg-muted text-muted-foreground" },
  };

  const token = recipient.personal_token || recipient.invitation_token;
  const APP_ORIGIN = "https://daawatey.com";
  const inviteUrl = token ? `${APP_ORIGIN}/i/${token}` : null;
  const isLinked = !!recipient.user_id;
  const displayName = [recipient.nickname, recipient.first_name, recipient.last_name].filter(Boolean).join(' ') || recipient.external_full_name || recipient.full_name || "—";

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.InvitationRecipient.delete(recipient.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
      toast({ title: t.venueDeleted });
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: () => base44.functions.invoke("sendInvitationSms", { recipientId: recipient.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
      toast({ title: t.savedAndNotified });
    },
    onError: () => {
      toast({ title: t.addError, description: t.addErrorDesc, variant: "destructive" });
    },
  });

  const copyLink = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast({ title: t.saved });
    setTimeout(() => setCopied(false), 2000);
  };

  const rsvp = rsvpLabel[recipient.rsvp_status] || rsvpLabel.pending;

  return (
    <div className="flex items-center gap-3 p-4 hover:bg-muted/30 transition-colors">
      {/* Left: User linked indicator */}
      <div className="flex-shrink-0">
        {isLinked
          ? <UserCheck className="w-5 h-5 text-success" />
          : <UserX className="w-5 h-5 text-muted-foreground/50" />
        }
      </div>

      {/* Center: Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-sm">{displayName}</p>
          <Badge
            variant="outline"
            className={`text-xs px-2 py-0 ${isLinked ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground"}`}
          >
            {isLinked ? t.statusResponded : t.statusPendingRsvp}
          </Badge>
          <Badge variant="outline" className={`text-xs px-2 py-0 ${rsvp.className}`}>
            {rsvp.label}
          </Badge>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          {recipient.phone && <span dir="ltr">{recipient.phone}</span>}
          {recipient.group_label && <span>· {recipient.group_label}</span>}
          <span className="flex items-center gap-1">
            <Eye className="w-3 h-3" />
            {recipient.open_count || 0}
          </span>
          {recipient.last_opened_at ? (
            <span className="flex items-center gap-1 text-primary/70">
              <Clock className="w-3 h-3" />
              {t.statusOpened} {formatDistanceToNow(new Date(recipient.last_opened_at), { addSuffix: true, locale: dateLocale })}
            </span>
          ) : (
            <span className="text-muted-foreground/50">{t.filterNotOpened}</span>
          )}
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {canResend && recipient.phone && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => sendSmsMutation.mutate()}
            disabled={sendSmsMutation.isPending}
          >
            {sendSmsMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </Button>
        )}
        {inviteUrl && (
          <>
            <Button variant="ghost" size="icon" onClick={copyLink}>
              {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" asChild>
              <a href={inviteUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="w-4 h-4" />
              </a>
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => deleteMutation.mutate()}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}