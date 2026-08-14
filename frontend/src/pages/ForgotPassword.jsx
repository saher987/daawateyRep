// Adapted from the original Base44 app (zaffaf/src/pages/ForgotPassword.jsx).
// base44.auth.resetPasswordRequest(email) -> Firebase's own
// sendPasswordResetEmail. handleCodeInApp:true + url means the emailed link
// points straight at our own /reset-password page (with mode/oobCode query
// params Firebase appends) instead of Firebase's default hosted page — no
// Firebase Console action-URL configuration needed, this is set per-call.
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { translations, usePublicLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ForgotPassword() {
  const [lang, setLang] = usePublicLanguage();
  const t = translations[lang];
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email, {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
    } catch {
      // Always show success regardless — same as the original, so this
      // form can't be used to probe which emails have accounts.
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <AuthLayout
      icon={Mail}
      title={t.authResetPasswordTitle}
      subtitle={t.authResetPasswordSubtitle}
      dir={t.dir}
      lang={lang}
      onLanguageChange={setLang}
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />{t.authBackToLogin}
        </Link>
      }
    >
      {sent ? (
        <p className="text-sm text-foreground text-center">{t.authResetSentMessage}</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">{t.authEmail}</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {t.authSending}
              </>
            ) : (
              t.authSendResetLink
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
