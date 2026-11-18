import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Gift, Loader2, MessageCircle } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { badgeClass, commissionStatusLabel, formatMoney, whatsappShareUrl } from "@/lib/affiliates";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// The affiliate's own page (backend GET /api/my-affiliate): their code and
// link to share, totals, and the customers they brought — first names
// only — with each one's commission status.
export default function MyReferrals() {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["my-affiliate"],
    queryFn: () => base44.affiliates.mine(),
    retry: false,
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }
  if (isError || !data) {
    return (
      <div className="max-w-xl">
        <PageHeader title={t.navMyReferrals} />
        <Card className="p-8 text-center text-muted-foreground">{t.myRefNotAffiliate}</Card>
      </div>
    );
  }

  const { affiliate, link, referrals } = data;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is on screen to copy by hand.
    }
  };
  const shareText = t.myRefShareText.replace("{name}", affiliate.name).replace("{link}", link);

  const statusFor = (r) => {
    if (r.commission_status) return { key: r.commission_status, label: commissionStatusLabel(r.commission_status, t) };
    return { key: "inactive", label: t.myRefNoPaidEvent };
  };

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader title={t.navMyReferrals} />

      {affiliate.status !== "active" && (
        <Card className="p-4 text-sm text-muted-foreground">{t.myRefInactive}</Card>
      )}

      <Card className="p-5 bg-accent/60 space-y-3">
        <p className="text-sm font-semibold">{t.myRefYourCode}</p>
        <p dir="ltr" className="text-3xl font-bold tracking-widest text-right">{affiliate.code}</p>
        <p dir="ltr" className="text-sm text-muted-foreground text-right break-all">{link}</p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className="h-11 rounded-xl gap-2 bg-background" onClick={copy}>
            <Copy className="w-4 h-4" />
            {copied ? t.myRefCopied : t.myRefCopy}
          </Button>
          <Button asChild className="h-11 rounded-xl gap-2">
            <a href={whatsappShareUrl(shareText)} target="_blank" rel="noreferrer">
              <MessageCircle className="w-4 h-4" />
              {t.shareViaWhatsapp}
            </a>
          </Button>
        </div>
        <p className="text-sm">
          {t.myRefRule.replace("{pct}", affiliate.commission_pct)}
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {[
          [t.myRefCustomers, affiliate.customers],
          [t.myRefPaidEvents, affiliate.paid_events],
          [t.myRefEarned, formatMoney(affiliate.pending_amount + affiliate.approved_amount + affiliate.paid_amount, t)],
          [t.myRefToBePaid, formatMoney(affiliate.approved_amount, t)],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <h2 className="font-semibold px-4 pt-4 pb-2">{t.myRefList}</h2>
        {referrals.length === 0 ? (
          <div className="px-4 pb-6 pt-2 text-sm text-muted-foreground flex items-center gap-2">
            <Gift className="w-4 h-4" />
            {t.myRefEmpty}
          </div>
        ) : (
          referrals.map((r, i) => {
            const s = statusFor(r);
            return (
              <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
                <div className="min-w-0">
                  <p className="font-semibold">{r.name || t.myRefCustomer}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.event_title || new Date(r.created_at).toLocaleDateString(t.langCode === "he" ? "he-IL" : "ar", { numberingSystem: "latn" })}
                  </p>
                </div>
                <span className={badgeClass(s.key)}>
                  {s.label}
                  {r.amount != null && <span dir="ltr" className="ms-1">· {formatMoney(r.amount, t)}</span>}
                </span>
              </div>
            );
          })
        )}
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {t.myRefPayoutNote.replace("{min}", formatMoney(data.min_payout, t)).replace("{days}", data.window_days)}
      </p>
    </div>
  );
}
