// Ported unchanged from the original Base44 app (zaffaf/src/pages/
// TermsAndConditions.jsx). Purely static content — no data, no auth.
import React from "react";
import { Card } from "@/components/ui/card";
import { ScrollText } from "lucide-react";

export default function TermsAndConditions() {
  return (
    <div className="min-h-screen bg-background py-10 px-4" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <ScrollText className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold">شروط الاستخدام</h1>
          <p className="text-muted-foreground text-sm">آخر تحديث: أبريل 2026</p>
        </div>

        <Card className="p-6 space-y-6 text-sm leading-relaxed text-foreground">

          <section className="space-y-2">
            <h2 className="text-base font-semibold">1. مقدمة</h2>
            <p>
              مرحباً بكم في منصة <strong>دعوتي (Daawatey)</strong>. تُقدّم هذه المنصة خدمات إدارة الدعوات والمناسبات عبر الإنترنت.
              باستخدامك للمنصة، فإنك توافق على الالتزام بهذه الشروط والأحكام.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">2. التعريفات</h2>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li><strong className="text-foreground">المنصة:</strong> موقع daawatey.com وجميع خدماته.</li>
              <li><strong className="text-foreground">المستخدم:</strong> أي شخص يسجّل أو يستخدم المنصة.</li>
              <li><strong className="text-foreground">المدعو:</strong> الشخص الذي يتلقى دعوة عبر المنصة.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">3. الأهلية</h2>
            <p>
              يجب أن يكون المستخدم قد أتمّ 18 عامًا على الأقل، أو يحظى بموافقة وليّ أمره القانوني لاستخدام المنصة.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">4. الخدمات المقدمة</h2>
            <p>
              تتيح المنصة للمستخدمين إنشاء مناسبات، وإدارة قوائم المدعوين، وإرسال دعوات إلكترونية، وتتبع ردود الحضور (RSVP).
              تحتفظ المنصة بحق تعديل أو إيقاف أي خدمة في أي وقت.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">5. البيانات الشخصية والخصوصية</h2>
            <p>
              تلتزم المنصة بأحكام قانون حماية الخصوصية الإسرائيلي (חוק הגנת הפרטיות, תשמ"א-1981) وتعديلاته.
              يتم جمع واستخدام البيانات الشخصية فقط لأغراض تشغيل الخدمة وإرسال الدعوات. لن تُباع بياناتك لأطراف ثالثة.
            </p>
            <p>
              يحق لك في أي وقت طلب الاطلاع على بياناتك أو تصحيحها أو حذفها عبر التواصل معنا.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">6. الرسائل الإلكترونية وخدمة الإشعارات</h2>
            <p>
              بإضافة بريد إلكتروني لمدعو، فإنك تقرّ بحصولك على موافقته لاستقبال رسائل تخصّ المناسبة.
              يحق للمدعو إلغاء الاشتراك في أي وقت. تلتزم المنصة بقانون الاتصالات الإسرائيلي المتعلق بالبريد الإلكتروني التجاري (חוק התקשורת, תשס"ח-2008).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">7. الاستخدام المقبول</h2>
            <p>يُحظر على المستخدم:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>إرسال محتوى مسيء أو مضلل أو غير قانوني.</li>
              <li>استخدام المنصة لأغراض تجارية غير مصرّح بها.</li>
              <li>انتهاك خصوصية المدعوين أو الآخرين.</li>
              <li>محاولة اختراق أو التلاعب بأنظمة المنصة.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">8. حدود المسؤولية</h2>
            <p>
              لا تتحمل منصة دعوتي المسؤولية عن أي أضرار مباشرة أو غير مباشرة ناتجة عن استخدام الخدمة أو عدم توفّرها.
              تُقدَّم الخدمة "كما هي" دون ضمانات صريحة أو ضمنية.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">9. الملكية الفكرية</h2>
            <p>
              جميع حقوق الملكية الفكرية المتعلقة بالمنصة محفوظة لدعوتي. لا يحق للمستخدمين نسخ أو توزيع أي محتوى من المنصة دون إذن مسبق.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">10. إنهاء الحساب</h2>
            <p>
              يحق للمنصة إيقاف أو إنهاء حساب أي مستخدم يخالف هذه الشروط، مع أو بدون إشعار مسبق.
              يمكن للمستخدم حذف حسابه في أي وقت من خلال صفحة الإعدادات.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">11. القانون المطبّق وحل النزاعات</h2>
            <p>
              تخضع هذه الشروط للقانون الإسرائيلي. في حال نشوء أي نزاع، تكون محاكم مدينة تل أبيب يافا هي المختصة حصراً بالفصل فيه.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">12. التعديلات</h2>
            <p>
              تحتفظ المنصة بحق تعديل هذه الشروط في أي وقت. سيتم إشعار المستخدمين بأي تغييرات جوهرية عبر البريد الإلكتروني أو إشعار داخل المنصة.
              استمرارك في استخدام المنصة بعد نشر التعديلات يُعدّ قبولاً لها.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold">13. التواصل معنا</h2>
            <p>
              لأي استفسار أو شكوى متعلقة بهذه الشروط، يرجى التواصل معنا عبر:{" "}
              <a href="mailto:noreply@daawatey.com" className="text-primary underline">noreply@daawatey.com</a>
            </p>
          </section>

        </Card>

        <p className="text-center text-xs text-muted-foreground pb-4">
          منصة دعوتي — جميع الحقوق محفوظة © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
