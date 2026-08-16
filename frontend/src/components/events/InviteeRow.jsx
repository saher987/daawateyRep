import React, { useState } from "react";
import { Copy, Check, Trash2, ExternalLink, UserCheck, UserX, Eye, Clock, Send, Loader2, MessageCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, he } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";

// wa.me wants digits-only international format, no "+". Same normalization
// rule as the backend's to_international_phone (pulseem.py) so a guest's
// local 05... number and an already-international one both resolve right.
function toIntlPhone(phone) {
  const p = phone.trim().replace(/\s/g, "");
  if (p.startsWith("+972")) return p.slice(1);
  if (p.startsWith("972")) return p;
  if (p.startsWith("0")) return "972" + p.slice(1);
  return "972" + p;
}

export default function InviteeRow({ recipient, eventId, eventTitle, eventGreeting, canResend = false }) {
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
  // Was hardcoded to "https://daawatey.com" — the original's custom
  // domain, which this app doesn't serve from. Every "view invitation"
  // click opened a token lookup against whatever daawatey.com currently
  // resolves to instead of this app, which is exactly what "אירוע לא נמצא"
  // (event not found) was reporting. window.location.origin is always
  // wherever this page is actually being served from.
  const inviteUrl = token ? `${window.location.origin}/i/${token}` : null;
  const isLinked = !!recipient.user_id;
  const displayName = [recipient.nickname, recipient.first_name, recipient.last_name].filter(Boolean).join(' ') || recipient.external_full_name || recipient.full_name || "—";

  const deleteMutation = useMutation({
    mutationFn: () => base44.entities.InvitationRecipient.delete(recipient.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
      toast({ title: t.venueDeleted });
    },
    onError: () => {
      toast({ title: t.addError, description: t.addErrorDesc, variant: "destructive" });
    },
  });

  const sendSmsMutation = useMutation({
    mutationFn: () => base44.functions.invoke("sendInvitationSms", { recipientId: recipient.id }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
      if (result?.data?.success) {
        toast({ title: t.savedAndNotified });
      } else {
        // The request succeeded but delivery didn't (e.g. SMS/email
        // provider unreachable) — degrades the same way creation does,
        // but resending shouldn't claim success when nothing went out.
        toast({ title: t.addError, description: t.addErrorDesc, variant: "destructive" });
      }
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

  // wa.me only ever pre-fills WhatsApp's composer — there's no way to make
  // it send on its own, that's WhatsApp's own anti-spam design. The
  // inviter still has to hit Send themselves; this just saves them from
  // typing the message and pasting the link by hand. Same greeting
  // fallback the backend SMS/email already use (events.py).
  const shareViaWhatsapp = () => {
    if (!inviteUrl) return;
    const message = eventGreeting
      ? `لحظرة ${displayName}، ${eventGreeting} ${inviteUrl}`
      : eventTitle
      ? `لحظرة ${displayName}، تمت دعوتكم لحضور ${eventTitle}. ${inviteUrl}`
      : inviteUrl;
    const waUrl = `https://wa.me/${recipient.phone ? toIntlPhone(recipient.phone) : ""}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
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
            <Button variant="ghost" size="icon" onClick={shareViaWhatsapp} title={t.shareViaWhatsapp}>
              <MessageCircle className="w-4 h-4 text-[#25D366]" />
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