// Phone OTP: the primary way in for both a guest opening an invitation and
// a brand-new user with no invitation yet (2026-09 product decision — see
// BUSINESS_LOGIC.md). Was OtpVerificationStep.jsx (invitation-only,
// link-only, never actually wired into any page) — extended into a real
// login: verifyOtp now gets back a Firebase custom token and signs in with
// it, so this is usable standalone on Login/Register too, not just
// alongside an invitation.
import React, { useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, Phone } from "lucide-react";
import { motion } from "framer-motion";

// Arabic-only defaults: every existing call site (the invitation page) is
// Arabic-first already. Login.jsx/Register.jsx pass their own `t` slice
// (from lib/i18n's ar/he dictionaries) to get real Hebrew strings instead.
const defaultT = {
  otpPhoneLabel: "التحقق من رقم هاتفك",
  otpPhonePlaceholder: "05XXXXXXXXX",
  otpPhoneHint: "سنرسل رمز تحقق مكوناً من 6 أرقام إلى رقمك",
  otpSendCode: "إرسال رمز التحقق",
  otpEnterCode: "أدخل رمز التحقق",
  otpVerify: "تأكيد الرمز",
  otpResend: "إعادة إرسال الرمز",
  otpInvalidPhone: "أدخل رقم هاتف صحيح",
  otpInvalidCode: "أدخل رمزاً مكوناً من 6 أرقام",
};

export default function PhoneOtpLogin({ recipientId, initialPhone, t: tOverride, onVerified }) {
  const t = { ...defaultT, ...tOverride };
  const [step, setStep] = useState(initialPhone ? "verify" : "phone"); // phone | verify
  const [phone, setPhone] = useState(initialPhone || "");
  const [otpPreview, setOtpPreview] = useState(null); // OTP_DEBUG_ECHO only
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const requestOtp = async () => {
    if (!phone || phone.replace(/\D/g, "").length < 9) {
      setError(t.otpInvalidPhone);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("sendOtp", { phone });
      setOtpPreview(res.data?.otp_preview ?? null); // demo/dev builds only
      setStep("verify");
    } catch (err) {
      setError(err.message || t.otpInvalidPhone);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== 6) {
      setError(t.otpInvalidCode);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("verifyOtpAndLink", {
        phone,
        otpCode,
        recipientId,
      });
      // signInWithCustomToken triggers the same onAuthStateChanged flow
      // Google/Apple sign-in already does — AuthContext picks it up, /api/me
      // resolves, and whichever page rendered this (Login/Register/the
      // invitation page) reacts to isAuthenticated the same way it already
      // does for those.
      await signInWithCustomToken(auth, res.data.custom_token);
      onVerified?.(res.data);
    } catch (err) {
      setError(err.message || t.otpInvalidCode);
      setOtpCode("");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {step === "phone" ? (
        <>
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl">
            <Phone className="w-5 h-5 text-primary flex-shrink-0" />
            <p className="text-sm font-medium">{t.otpPhoneLabel}</p>
          </div>
          <Input
            type="tel"
            inputMode="tel"
            placeholder={t.otpPhonePlaceholder}
            value={phone}
            onChange={(e) => { setError(null); setPhone(e.target.value); }}
            className="h-12 text-center"
            dir="ltr"
            autoFocus
          />
          <p className="text-sm text-muted-foreground text-center">{t.otpPhoneHint}</p>
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
          <Button onClick={requestOtp} disabled={loading} className="w-full h-12 rounded-xl gap-2">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
            {t.otpSendCode}
          </Button>
        </>
      ) : (
        <>
          <div className="text-center space-y-1">
            <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
            <p className="font-medium">{t.otpEnterCode}</p>
            <p className="text-sm text-muted-foreground" dir="ltr">{phone}</p>
          </div>

          {otpPreview && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">رمز تجريبي (للتطوير فقط)</p>
              <p className="text-2xl font-mono font-bold text-warning tracking-widest mt-1">{otpPreview}</p>
            </div>
          )}

          <Input
            // type="text" + inputMode="numeric", not type="number": a
            // number input silently strips a leading zero as you type it
            // (e.g. "031047" collapses to "31047"), so any code starting
            // with 0 — 1 in 10 — could never be typed at all. inputMode
            // still gets the numeric keyboard on mobile without that.
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="— — — — — —"
            maxLength={6}
            value={otpCode}
            onChange={(e) => {
              setError(null);
              setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6));
            }}
            className="h-16 rounded-xl text-center text-3xl font-mono tracking-widest"
            dir="ltr"
            autoFocus
          />

          {error && <p className="text-sm text-destructive text-center">{error}</p>}

          <Button
            onClick={verifyOtp}
            disabled={loading || otpCode.length !== 6}
            className="w-full h-12 rounded-xl gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            {t.otpVerify}
          </Button>

          {!initialPhone && (
            <button
              type="button"
              onClick={() => { setStep("phone"); setOtpCode(""); setError(null); }}
              className="w-full text-sm text-muted-foreground hover:text-foreground text-center py-2"
            >
              {t.otpResend}
            </button>
          )}
        </>
      )}
    </motion.div>
  );
}
