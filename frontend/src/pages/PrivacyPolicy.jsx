// Ported unchanged from the original Base44 app (zaffaf/src/pages/
// PrivacyPolicy.jsx). Purely static content — no data, no auth.
import React from "react";
import { Card } from "@/components/ui/card";
import PageHeader from "@/components/shared/PageHeader";

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <PageHeader title="سياسة الخصوصية" />

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">مقدمة</h2>
            <p className="text-muted-foreground leading-relaxed">
              نحن نقدّر خصوصيتك ونلتزم بحماية بيانات المستخدمين. تشرح هذه السياسة كيفية جمع واستخدام وحماية معلوماتك الشخصية على منصة دعوتي.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">1. البيانات التي نجمعها</h2>
            <div className="space-y-3 text-muted-foreground">
              <p>نجمع المعلومات التالية:</p>
              <ul className="list-disc list-inside space-y-2 mr-4">
                <li><strong>معلومات التسجيل:</strong> الاسم، البريد الإلكتروني، رقم الهاتف</li>
                <li><strong>بيانات الحدث:</strong> تفاصيل المناسبات التي تنشئها وقوائم الضيوف</li>
                <li><strong>بيانات الرد على الدعوة:</strong> حالة الرد (مؤكد/اعتذر/بانتظار) والرسائل</li>
                <li><strong>بيانات الاستخدام:</strong> تسجيل الدخول، الأنشطة، المتصفح، عنوان IP</li>
                <li><strong>بيانات الدفع:</strong> معلومات الفواتير والمعاملات (إن وجدت)</li>
              </ul>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">2. كيفية استخدام البيانات</h2>
            <div className="space-y-3 text-muted-foreground">
              <ul className="list-disc list-inside space-y-2 mr-4">
                <li>تقديم الخدمة وإدارة حسابك</li>
                <li>إرسال الدعوات والتنبيهات المتعلقة بالمناسبات</li>
                <li>تحسين تجربة المستخدم والخدمات</li>
                <li>الامتثال للالتزامات القانونية والعقودية</li>
                <li>منع الاحتيال والأنشطة غير القانونية</li>
              </ul>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">3. مشاركة البيانات</h2>
            <p className="text-muted-foreground leading-relaxed mb-3">
              نحن لا نبيع بيانات المستخدمين. قد نشارك المعلومات في الحالات التالية:
            </p>
            <ul className="list-disc list-inside space-y-2 mr-4 text-muted-foreground">
              <li>مع مزودي الخدمات الموثوقين (البريد، الدفع، التحليل)</li>
              <li>عند الضرورة لتنفيذ القانون أو حماية الحقوق</li>
              <li>في حالة الاندماج أو بيع الشركة</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">4. أمان البيانات</h2>
            <p className="text-muted-foreground leading-relaxed">
              نستخدم تشفير SSL وإجراءات أمان متقدمة لحماية بيانات المستخدمين. ومع ذلك، لا يمكن ضمان الأمان التام عبر الإنترنت.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">5. حقوقك</h2>
            <div className="space-y-3 text-muted-foreground">
              <p>لديك الحق في:</p>
              <ul className="list-disc list-inside space-y-2 mr-4">
                <li>الوصول إلى بياناتك الشخصية</li>
                <li>تصحيح المعلومات غير الصحيحة</li>
                <li>حذف حسابك وبياناتك</li>
                <li>الاعتراض على معالجة معينة</li>
              </ul>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">6. ملفات تعريف الارتباط</h2>
            <p className="text-muted-foreground leading-relaxed">
              نستخدم ملفات تعريف الارتباط لتحسين تجربتك. يمكنك إدارة تفضيلات ملفات تعريف الارتباط من خلال إعدادات متصفحك.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">7. التغييرات على هذه السياسة</h2>
            <p className="text-muted-foreground leading-relaxed">
              قد نحدّث هذه السياسة من وقت لآخر. سيتم إخطارك بأي تغييرات جوهرية عبر البريد الإلكتروني أو إشعار على الموقع.
            </p>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">8. التواصل معنا</h2>
            <p className="text-muted-foreground leading-relaxed">
              للأسئلة حول هذه السياسة، يرجى التواصل معنا عبر صفحة <a href="/support" className="text-primary hover:underline">الدعم</a>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
