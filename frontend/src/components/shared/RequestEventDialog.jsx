import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CalendarPlus, CheckCircle2, Gift, Phone } from "lucide-react";
import { useT } from "@/lib/i18n";
import { getReferralCode } from "@/lib/referral";
import { AFFILIATES_ENABLED } from "@/lib/affiliates";

// Admin phone displayed after submission — update as needed
const ADMIN_PHONE = "0545351842";

export default function RequestEventDialog({ open, onOpenChange, user }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  // Always starts empty — mandatory (both here and server-side, see
  // EventRequestCreate.requester_phone), and deliberately not pre-filled
  // from the profile: someone should actively type/confirm the number a
  // human admin will actually call, not silently submit whatever's saved
  // on their account.
  const [phone, setPhone] = useState("");
  // Affiliate program: filled from a /r/<code> link opened on this phone
  // (lib/referral.js), or typed. Optional; an unknown code is still sent
  // and kept on the request for the team to see.
  const t = useT();
  const [referralCode, setReferralCode] = useState(() => getReferralCode() || "");
  const cleanCode = referralCode.trim().toUpperCase();
  const { data: referrer, isError: unknownCode } = useQuery({
    queryKey: ["affiliate-code", cleanCode],
    queryFn: () => base44.affiliates.byCode(cleanCode),
    enabled: AFFILIATES_ENABLED && open && cleanCode.length >= 3,
    retry: false,
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !details.trim() || !phone.trim()) return;
    setLoading(true);
    try {
      await base44.entities.EventRequest.create({
        title: title.trim(),
        details: details.trim(),
        requester_name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.full_name || "",
        requester_email: user?.email || "",
        requester_phone: phone.trim(),
        referral_code: AFFILIATES_ENABLED ? cleanCode || null : null,
        status: "pending",
      });
      // Notify admins/managers via notification
      const displayName = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.full_name || user?.email || "مستخدم";
      await base44.functions.invoke("notifyEventRequest", {
        title: title.trim(),
        requesterName: displayName,
      });
      setSubmitted(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (val) => {
    if (!val) {
      setTitle("");
      setDetails("");
      setPhone("");
      setReferralCode(getReferralCode() || "");
      setSubmitted(false);
    }
    onOpenChange(val);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="w-5 h-5" />
            طلب فتح مناسبة
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-success" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">تم إرسال طلبك!</h3>
              <p className="text-sm text-muted-foreground mt-1">
                تم إرسال طلبك إلى الإدارة وسيتم الرد عليك في أقرب وقت ممكن.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 bg-muted rounded-xl p-3">
              <Phone className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">للتواصل المباشر: </span>
              <span className="text-sm font-bold text-primary" dir="ltr">{ADMIN_PHONE}</span>
            </div>
            <Button className="w-full rounded-xl" onClick={() => handleClose(false)}>
              إغلاق
            </Button>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>عنوان المناسبة</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="مثال: حفل زفاف، عقد قران، عيد ميلاد..."
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>تفاصيل المناسبة</Label>
              <Textarea
                value={details}
                onChange={e => setDetails(e.target.value)}
                placeholder="اكتب تفاصيل المناسبة، التاريخ المتوقع، عدد المدعوين، وأي معلومات إضافية..."
                className="rounded-xl resize-none min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>رقم الهاتف *</Label>
              <Input
                type="tel"
                dir="ltr"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="05X-XXXXXXX"
                className="h-11 rounded-xl"
                required
              />
            </div>
            {AFFILIATES_ENABLED && (
            <div className="space-y-2">
              <Label htmlFor="request-referral-code">
                {t.affReferralCodeLabel} <span className="font-normal text-muted-foreground">{t.affOptional}</span>
              </Label>
              <Input
                id="request-referral-code"
                dir="ltr"
                value={referralCode}
                onChange={e => setReferralCode(e.target.value)}
                placeholder="DANA20"
                autoCapitalize="characters"
                className="h-11 rounded-xl text-right tracking-wide"
              />
              {cleanCode.length >= 3 && referrer && (
                <p className="text-xs text-success flex items-center gap-1">
                  <Gift className="w-3.5 h-3.5" />
                  {t.affReferralCodeOk.replace("{name}", referrer.name)}
                </p>
              )}
              {cleanCode.length >= 3 && unknownCode && (
                <p className="text-xs text-muted-foreground">{t.affReferralCodeUnknown}</p>
              )}
            </div>
            )}
            <Button
              className="w-full h-11 rounded-xl gap-2"
              onClick={handleSubmit}
              disabled={loading || !title.trim() || !details.trim() || !phone.trim()}
            >
              <CalendarPlus className="w-4 h-4" />
              {loading ? "جاري الإرسال..." : "إرسال الطلب"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}