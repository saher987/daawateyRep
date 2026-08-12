// Ported unchanged from the original Base44 app (zaffaf/src/pages/
// Support.jsx). base44.functions.invoke('sendSupportEmail', ...) now goes
// through base44Client.js's shim to POST /api/support-messages (Resend,
// no auth needed — matches this page's own no-login-required routing).
import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import { Mail, Phone, MessageSquare } from "lucide-react";
import { toast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";

export default function Support() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.subject || !formData.message) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول" });
      return;
    }

    setIsSubmitting(true);
    try {
      await base44.functions.invoke('sendSupportEmail', {
        name: formData.name,
        email: formData.email,
        subject: formData.subject,
        message: formData.message,
      });
      toast({ title: "تم الإرسال", description: "تم إرسال رسالتك بنجاح. سنرد عليك قريباً." });
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      toast({ title: "خطأ", description: "حدث خطأ في الإرسال. حاول لاحقاً." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqs = [
    {
      q: "كيف أنشئ مناسبة جديدة؟",
      a: "انتقل إلى قسم المناسبات وانقر على 'إنشاء مناسبة جديدة'. ملأ التفاصيل مثل النوع والتاريخ والموقع، ثم احفظها.",
    },
    {
      q: "كيف أضيف ضيوفاً إلى المناسبة؟",
      a: "بعد إنشاء المناسبة، انتقل إلى قسم المدعوين وأضف أرقام الهاتف أو البريد الإلكتروني. سيتم إرسال الدعوات تلقائياً.",
    },
    {
      q: "هل يمكن تعديل تفاصيل المناسبة بعد إنشاؤها؟",
      a: "نعم، يمكنك تعديل التفاصيل من صفحة المناسبة ما دامت لم تكتمل بعد.",
    },
    {
      q: "كيف أرى من رد على الدعوة؟",
      a: "انتقل إلى صفحة المناسبة وستجد لوحة الإحصائيات التي تظهر عدد من وافقوا واعتذروا وما زالوا بانتظار الرد.",
    },
    {
      q: "كيف أحذف حسابي؟",
      a: "انتقل إلى الإعدادات والملف الشخصي، وستجد خيار حذف الحساب. ملاحظة: هذا الإجراء غير قابل للعكس.",
    },
    {
      q: "هل يمكن إرسال دعوات مخصصة؟",
      a: "نعم، يمكنك تخصيص تصميم الدعوة بألوان وصور ونصوص خاصة بك.",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-5xl mx-auto">
        <PageHeader title="الدعم والمساعدة" />

        {/* Contact Info */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 text-center">
            <Mail className="w-8 h-8 mx-auto mb-3 text-primary" />
            <h3 className="font-semibold mb-2">البريد الإلكتروني</h3>
            <a href="mailto:support@daawatey.com" className="text-primary hover:underline text-sm">
              support@daawatey.com
            </a>
          </Card>
          <Card className="p-6 text-center">
            <Phone className="w-8 h-8 mx-auto mb-3 text-primary" />
            <h3 className="font-semibold mb-2">الهاتف</h3>
            <a href="tel:+972123456789" className="text-primary hover:underline text-sm">
              +972 (0) 50 800 5672
            </a>
          </Card>
          <Card className="p-6 text-center">
            <MessageSquare className="w-8 h-8 mx-auto mb-3 text-primary" />
            <h3 className="font-semibold mb-2">الرسالة</h3>
            <p className="text-sm text-muted-foreground">استخدم النموذج أدناه</p>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Contact Form */}
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-6">أرسل لنا رسالة</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name" className="mb-2 block">الاسم</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="أدخل اسمك"
                />
              </div>
              <div>
                <Label htmlFor="email" className="mb-2 block">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="أدخل بريدك الإلكتروني"
                />
              </div>
              <div>
                <Label htmlFor="subject" className="mb-2 block">الموضوع</Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="موضوع الرسالة"
                />
              </div>
              <div>
                <Label htmlFor="message" className="mb-2 block">الرسالة</Label>
                <Textarea
                  id="message"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  placeholder="اكتب رسالتك هنا"
                  rows={5}
                />
              </div>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full"
              >
                {isSubmitting ? "جاري الإرسال..." : "إرسال الرسالة"}
              </Button>
            </form>
          </Card>

          {/* FAQ */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold mb-6">الأسئلة الشائعة</h2>
            {faqs.map((faq, idx) => (
              <Card key={idx} className="p-4">
                <h3 className="font-semibold text-sm mb-2 text-primary">{faq.q}</h3>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
