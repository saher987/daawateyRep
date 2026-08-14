// Adapted from the original Base44 app (zaffaf/src/pages/ResetPassword.jsx).
// base44.auth.resetPassword({resetToken, newPassword}) -> Firebase's
// verifyPasswordResetCode + confirmPasswordReset. Firebase's emailed link
// (see ForgotPassword.jsx) carries the code as `oobCode`, not `token` —
// the only param-name difference from the original. Verifying the code
// up front (rather than only on submit) means an expired/already-used
// link shows the "invalid link" state immediately instead of after the
// user has typed a new password.
import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { translations, usePublicLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get("oobCode");
  const [lang, setLang] = usePublicLanguage();
  const t = translations[lang];

  const [checkingCode, setCheckingCode] = useState(true);
  const [codeValid, setCodeValid] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!oobCode) {
      setCheckingCode(false);
      return;
    }
    verifyPasswordResetCode(auth, oobCode)
      .then(() => setCodeValid(true))
      .catch(() => setCodeValid(false))
      .finally(() => setCheckingCode(false));
  }, [oobCode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError(t.authPasswordsNoMatch);
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message || t.authResetFailed);
    } finally {
      setLoading(false);
    }
  };

  if (checkingCode) {
    return (
      <AuthLayout icon={Lock} title={t.authNewPasswordTitle} subtitle={t.authCheckingLink} dir={t.dir}>
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  if (!oobCode || !codeValid) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title={t.authInvalidLinkTitle}
        subtitle={t.authInvalidLinkSubtitle}
        dir={t.dir}
        lang={lang}
        onLanguageChange={setLang}
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            {t.authRequestNewLink}
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">{t.authInvalidLinkBody}</p>
      </AuthLayout>
    );
  }

  if (done) {
    return (
      <AuthLayout
        icon={Lock}
        title={t.authPasswordUpdatedTitle}
        subtitle={t.authPasswordUpdatedSubtitle}
        dir={t.dir}
        footer={
          <Link to="/login" className="text-primary font-medium hover:underline">
            {t.login}
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">{t.authPasswordResetDone}</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      icon={Lock}
      title={t.authNewPasswordTitle}
      subtitle={t.authEnterNewPasswordSubtitle}
      dir={t.dir}
      lang={lang}
      onLanguageChange={setLang}
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">{t.authNewPasswordLabel}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              autoFocus
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 h-12"
              required
              minLength={6}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{t.authConfirmPassword}</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required
              minLength={6}
            />
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t.authResetting}
            </>
          ) : (
            t.authResetPasswordBtn
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}
