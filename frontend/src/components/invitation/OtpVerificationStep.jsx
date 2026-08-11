import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, Phone } from "lucide-react";
import { motion } from "framer-motion";

export default function OtpVerificationStep({ phone, recipientId, externalFullName, onVerified }) {
  const [step, setStep] = useState("request"); // request | verify
  const [otpPreview, setOtpPreview] = useState(null); // for demo: shows OTP
  const [otpCode, setOtpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const requestOtp = async () => {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('sendOtp', { phone });
    setLoading(false);
    if (res.data?.success) {
      setOtpPreview(res.data.otp_preview); // demo only
      setStep("verify");
    } else {
      setError("حدث خطأ أثناء إرسال الرمز");
    }
  };

  const verifyOtp = async () => {
    if (otpCode.length !== 6) { setError("أدخل رمزاً مكوناً من 6 أرقام"); return; }
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke('verifyOtpAndLink', {
      phone,
      otpCode,
      recipientId,
      externalFullName,
    });
    setLoading(false);
    if (res.data?.success) {
      onVerified(res.data);
    } else {
      setError(res.data?.message || "رمز غير صحيح");
      setOtpCode("");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {step === "request" ? (
        <>
          <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-xl">
            <Phone className="w-5 h-5 text-primary flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">التحقق من رقم هاتفك</p>
              <p className="text-xs text-muted-foreground mt-0.5" dir="ltr">{phone}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground text-center">
            سنرسل رمز تحقق مكوناً من 6 أرقام إلى رقمك
          </p>
          <Button
            onClick={requestOtp}
            disabled={loading}
            className="w-full h-14 rounded-xl text-base gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Phone className="w-5 h-5" />}
            إرسال رمز التحقق
          </Button>
        </>
      ) : (
        <>
          <div className="text-center space-y-1">
            <ShieldCheck className="w-10 h-10 text-primary mx-auto" />
            <p className="font-medium">أدخل رمز التحقق</p>
            <p className="text-sm text-muted-foreground" dir="ltr">{phone}</p>
          </div>

          {/* Demo OTP display */}
          {otpPreview && (
            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">رمز تجريبي (للتطوير فقط)</p>
              <p className="text-2xl font-mono font-bold text-warning tracking-widest mt-1">{otpPreview}</p>
            </div>
          )}

          <Input
            type="number"
            inputMode="numeric"
            placeholder="— — — — — —"
            maxLength={6}
            value={otpCode}
            onChange={(e) => {
              setError(null);
              setOtpCode(e.target.value.slice(0, 6));
            }}
            className="h-16 rounded-xl text-center text-3xl font-mono tracking-widest"
            dir="ltr"
          />

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <Button
            onClick={verifyOtp}
            disabled={loading || otpCode.length !== 6}
            className="w-full h-14 rounded-xl text-base gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
            تأكيد الرمز
          </Button>

          <button
            type="button"
            onClick={() => { setStep("request"); setOtpCode(""); setError(null); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground text-center py-2"
          >
            إعادة إرسال الرمز
          </button>
        </>
      )}
    </motion.div>
  );
}