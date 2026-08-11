import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CalendarHeart, MapPin, Clock, Heart, Sparkles, Check, X, ArrowRight, Loader2, CalendarPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import MapButtons from "@/components/shared/MapButtons";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { translations } from "@/lib/i18n";

function getInvitationLang() {
  try {
    const stored = localStorage.getItem("preferred_language");
    return stored && translations[stored] ? stored : "ar";
  } catch { return "ar"; }
}

export default function InvitationPage() {
  const token = window.location.pathname.split("/i/")[1];
  const queryClient = useQueryClient();
  const [rsvpDone, setRsvpDone] = useState(null); // "accepted" | "declined"
  const [changingRsvp, setChangingRsvp] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lang = getInvitationLang();
  const isHe = lang === "he";

  useEffect(() => {
    base44.auth.isAuthenticated().then(async (authed) => {
      if (authed) {
        const me = await base44.auth.me();
        setLoggedInUser(me);
      }
    });
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invitation-v2", token],
    queryFn: async () => {
      const res = await base44.functions.invoke('getInvitationByToken', { token });
      return res.data;
    },
    enabled: !!token,
    onSuccess: (data) => {
      if (data?.recipient) {
        const now = new Date().toISOString();
        const updates = {
          last_opened_at: now,
          open_count: (data.recipient.open_count || 0) + 1,
          status: "opened",
        };
        if (!data.recipient.first_opened_at) updates.first_opened_at = now;
        base44.entities.InvitationRecipient.update(data.recipient.id, updates).catch(() => {});
      }
    }
  });

  const rsvpMutation = useMutation({
    mutationFn: async (status) => {
      await base44.functions.invoke('submitRsvp', {
        recipientId: data.recipient.id,
        rsvpStatus: status,
        guestsCount: data.recipient.guests_count || 1,
      });
    },
    onSuccess: (_, status) => {
      setRsvpDone(status);
      setChangingRsvp(false);
      queryClient.invalidateQueries({ queryKey: ["invitation-v2", token] });
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data?.event || !data?.recipient) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4" dir="rtl">
        <Card className="p-8 text-center max-w-sm">
          <Heart className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">{isHe ? "ההזמנה לא נמצאה" : "الدعوة غير موجودة"}</h1>
          <p className="text-muted-foreground">{isHe ? "הקישור אינו תקין או שההזמנה נמחקה" : "الرابط غير صالح أو تم حذف هذه الדعوة"}</p>
        </Card>
      </div>
    );
  }

  const { event, displayName, recipient } = data;

  const addToGoogleCalendar = () => {
    const start = new Date(event.date);
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // 3 hours default
    const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
    const location = [event.venue_name, event.venue_address].filter(Boolean).join(", ");
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${fmt(start)}/${fmt(end)}`,
      location,
      details: event.description || "",
    });
    window.open(`https://calendar.google.com/calendar/render?${params.toString()}`, "_blank");
  };
  const alreadyResponded = (rsvpDone || recipient.rsvp_status === "accepted" || recipient.rsvp_status === "declined") && !changingRsvp;
  const finalStatus = rsvpDone || recipient.rsvp_status;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Hero */}
      <div className="relative h-64 sm:h-80 bg-gradient-to-b from-primary/20 via-primary/5 to-background overflow-hidden">
        {event.cover_image_url && (
          <img src={event.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 to-background" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
        >
          <Sparkles className="w-8 h-8 text-primary mb-3" />
          <p className="text-sm text-foreground/70 mb-1">{isHe ? "הזמנה אישית" : "دعوة خاصة"}</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">{event.title}</h1>
          {(event.groom_name || event.bride_name) && (
            <p className="text-lg text-foreground/70 font-display mt-1">
              {[event.groom_name, event.bride_name].filter(Boolean).join(" & ")}
            </p>
          )}
        </motion.div>
      </div>

      <div className="max-w-lg mx-auto px-4 -mt-6 pb-20 space-y-5">
        {/* Greeting */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <Card className="p-6 text-center shadow-lg">
            <p className="text-muted-foreground mb-1">{isHe ? "יקר/ה שלנו" : "عزيزنا / عزيزتنا"}</p>
            <h2 className="text-2xl font-display font-bold">{displayName}</h2>
            <p className="text-muted-foreground text-sm mt-2">{isHe ? "נשמח לראותך בשמחתנו" : "يشرفنا دعوتكم لحضور هذه المناسبة السعيدة"}</p>
          </Card>
        </motion.div>

        {/* Invitation Image */}
        {event.invitation_image_url && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card className="overflow-hidden shadow-lg p-0 cursor-pointer" onClick={() => setLightboxOpen(true)}>
              <img src={event.invitation_image_url} alt="بطاقة الدعوة" className="w-full object-contain max-h-[500px]" />
            </Card>
          </motion.div>
        )}

        {/* Lightbox */}
        <AnimatePresence>
          {lightboxOpen && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
              onClick={() => setLightboxOpen(false)}
            >
              <motion.img
                initial={{ scale: 0.8 }} animate={{ scale: 1 }} exit={{ scale: 0.8 }}
                src={event.invitation_image_url} alt="بطاقة الدعوة"
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Event Details */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
          <Card className="p-6 space-y-5 shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CalendarHeart className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isHe ? "תאריך" : "التاريخ"}</p>
                <p className="font-semibold text-lg">{event.date ? format(new Date(event.date), "yyyy/MM/dd") : "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Clock className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{isHe ? "שעה" : "الوقت"}</p>
                <p className="font-semibold text-lg">{event.date ? format(new Date(event.date), "HH:mm") : "—"}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm text-muted-foreground">{isHe ? "מיקום" : "المكان"}</p>
                <p className="font-semibold text-lg">{event.venue_name}</p>
                {event.venue_address && <p className="text-sm text-muted-foreground">{event.venue_address}</p>}
                <MapButtons venue_name={event.venue_name} venue_address={event.venue_address} venue_map_url={event.venue_map_url} className="mt-2" />
              </div>
            </div>
          </Card>
        </motion.div>

        {/* Add to Google Calendar */}
        {event.date && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
            <Button
              variant="outline"
              className="w-full h-12 rounded-xl gap-2 border-primary/30 text-primary hover:bg-primary/5"
              onClick={addToGoogleCalendar}
            >
              <CalendarPlus className="w-5 h-5" />
              {isHe ? "הוסף ליומן Google" : "أضف إلى تقويم Google"}
            </Button>
          </motion.div>
        )}

        {/* Description */}
        {event.description && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
            <Card className="p-6 shadow-lg">
              <p className="text-muted-foreground leading-relaxed">{event.description}</p>
            </Card>
          </motion.div>
        )}

        {/* RSVP Section */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
          <Card className="p-6 shadow-lg">
            <AnimatePresence mode="wait">
              {alreadyResponded ? (
                <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-4">
                  <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
                    finalStatus === "accepted" ? "bg-success/10" : "bg-destructive/10"
                  }`}>
                    {finalStatus === "accepted"
                      ? <Check className="w-8 h-8 text-success" />
                      : <X className="w-8 h-8 text-destructive" />
                    }
                  </div>
                  <h3 className="text-xl font-semibold">
                    {finalStatus === "accepted"
                      ? (isHe ? "✅ אגיע" : "✅ سأحضر")
                      : (isHe ? "❌ לא אגיע" : "❌ لن أحضر")}
                  </h3>
                  <p className="text-sm text-muted-foreground">{isHe ? "תודה על תגובתך" : "شكراً لك على ردك"}</p>

                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl text-sm border-border"
                    onClick={() => { setChangingRsvp(true); setRsvpDone(null); }}
                  >
                    {isHe ? "שנה תגובה" : "تغيير الإجابة"}
                  </Button>

                  {/* More details CTA */}
                  <div className="pt-2 border-t border-border">
                    <Button
                      className="w-full h-12 rounded-xl gap-2"
                      onClick={() => {
                        if (loggedInUser) {
                          window.location.href = "/my-invitations";
                        } else {
                          base44.auth.redirectToLogin("/my-invitations");
                        }
                      }}
                    >
                      {isHe ? "פרטים נוספים" : "مزيد من التفاصيل"}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="rsvp" initial={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <h3 className="text-xl font-semibold text-center">{isHe ? "האם תגיע?" : "هل ستحضر؟"}</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      size="lg"
                      className="h-16 rounded-xl text-lg gap-2 bg-success hover:bg-success/90 text-success-foreground"
                      onClick={() => rsvpMutation.mutate("accepted")}
                      disabled={rsvpMutation.isPending}
                    >
                      {rsvpMutation.isPending && rsvpMutation.variables === "accepted"
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <Check className="w-6 h-6" />
                      }
                      {isHe ? "אגיע" : "سأحضر"}
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      className="h-16 rounded-xl text-lg gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
                      onClick={() => rsvpMutation.mutate("declined")}
                      disabled={rsvpMutation.isPending}
                    >
                      {rsvpMutation.isPending && rsvpMutation.variables === "declined"
                        ? <Loader2 className="w-5 h-5 animate-spin" />
                        : <X className="w-6 h-6" />
                      }
                      {isHe ? "לא אגיע" : "لن أحضر"}
                    </Button>
                  </div>
                  <div className="border-t border-border pt-3">
                    <Button
                      variant="ghost"
                      className="w-full h-11 rounded-xl gap-2 text-muted-foreground"
                      onClick={() => {
                        if (loggedInUser) {
                          window.location.href = "/my-invitations";
                        } else {
                          base44.auth.redirectToLogin("/my-invitations");
                        }
                      }}
                    >
                      {isHe ? "פרטים נוספים" : "مزيد من التفاصيل"}
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </motion.div>

        {/* Footer */}
        <div className="text-center pt-2 pb-4">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
            <Sparkles className="w-3.5 h-3.5" />
            {isHe ? "פלטפורמת דעוותי" : "منصة دعوتي"}
          </p>
        </div>
      </div>
    </div>
  );
}