import React, { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Gift, Loader2 } from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { clearReferralCode, saveReferralCode } from "@/lib/referral";
import { kindLabel } from "@/lib/affiliates";
import { Button } from "@/components/ui/button";

// daawatey.com/r/<code>: the link an affiliate shares. Public. Saves the
// code on this phone (lib/referral.js) so RequestEventDialog fills it in
// and AuthContext claims it after sign-in; a signed-in visitor's phone is
// claimed right away.
export default function ReferralLanding() {
  const { code } = useParams();
  const t = useT();
  const { isAuthenticated, user } = useAuth();

  const { data: affiliate, isLoading, isError } = useQuery({
    queryKey: ["affiliate-code", code],
    queryFn: () => base44.affiliates.byCode(code),
    retry: false,
  });

  useEffect(() => {
    if (!affiliate) return;
    saveReferralCode(affiliate.code);
    if (isAuthenticated && user?.phone) {
      base44.affiliates
        .claim(affiliate.code)
        .then(() => clearReferralCode())
        .catch(() => {});
    }
  }, [affiliate, isAuthenticated, user?.phone]);

  return (
    <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm text-center space-y-6">
        <img src={logoUrl} alt="" className="w-16 h-16 mx-auto" />
        {isLoading ? (
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        ) : isError || !affiliate ? (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">{t.affLandingInvalid}</h1>
            <Button asChild className="w-full h-12 rounded-xl">
              <Link to="/">{t.affLandingStart}</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Gift className="w-7 h-7 text-primary" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-display font-bold">
                {t.affLandingTitle.replace("{name}", affiliate.name)}
              </h1>
              {affiliate.kind && <p className="text-sm text-muted-foreground">{kindLabel(affiliate.kind, t)}</p>}
              <p className="text-muted-foreground leading-relaxed">{t.affLandingBody}</p>
            </div>
            <Button asChild className="w-full h-12 rounded-xl text-base">
              <Link to="/">{t.affLandingStart}</Link>
            </Button>
            <p className="text-xs text-muted-foreground">
              {t.affLandingCodeSaved.replace("{code}", affiliate.code)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
