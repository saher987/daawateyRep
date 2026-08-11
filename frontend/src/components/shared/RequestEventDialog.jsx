import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CalendarPlus, CheckCircle2, Phone } from "lucide-react";

// Admin phone displayed after submission — update as needed
const ADMIN_PHONE = "050-000-0000";

export default function RequestEventDialog({ open, onOpenChange, user }) {
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim() || !details.trim()) return;
    setLoading(true);
    try {
      await base44.entities.EventRequest.create({
        title: title.trim(),
        details: details.trim(),
        requester_name: [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.full_name || "",
        requester_email: user?.email || "",
        requester_phone: user?.phone || "",
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
            <Button
              className="w-full h-11 rounded-xl gap-2"
              onClick={handleSubmit}
              disabled={loading || !title.trim() || !details.trim()}
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