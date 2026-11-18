import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Gift, Loader2, Wallet, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { badgeClass, commissionStatusLabel, formatMoney } from "@/lib/affiliates";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

// Admin/manager, on EventDetails. The customer pays outside the app; the
// team records the price and marks the event paid here, which runs the
// affiliate rules (backend affiliates.evaluate_commission) and creates the
// referring affiliate's commission, to approve on the Affiliates page. A
// customer who came by WhatsApp and named who sent them gets the code
// attached here.
export default function EventPaymentCard({ event }) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const queryKey = ["event-payment", event.id];
  const { data: payment, isLoading } = useQuery({
    queryKey,
    queryFn: () => base44.affiliates.eventPayment(event.id),
  });
  const [price, setPrice] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    if (payment) setPrice(payment.price != null ? String(payment.price) : "");
  }, [payment]);

  const errorText = (err) => t[`affErr_${err?.message}`] || t.affErrGeneric;

  const save = useMutation({
    mutationFn: (data) => base44.affiliates.updateEventPayment(event.id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(queryKey, data);
      queryClient.invalidateQueries({ queryKey: ["affiliates"] });
      queryClient.invalidateQueries({ queryKey: ["affiliate-commissions"] });
      setCode("");
    },
    onError: (err) => toast({ title: errorText(err), variant: "destructive" }),
  });

  if (isLoading || !payment) {
    return (
      <Card className="p-5 mb-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  const paid = !!payment.paid_at;
  const priceNumber = price === "" ? null : Number(price);
  const priceChanged = priceNumber !== payment.price;
  const commission = payment.commission;

  const markPaid = () => {
    const body = { paid: true };
    if (priceChanged) body.price = priceNumber;
    save.mutate(body);
  };
  const markUnpaid = () => {
    if (window.confirm(t.payMarkUnpaidConfirm)) save.mutate({ paid: false });
  };

  return (
    <Card className="p-5 mb-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="font-semibold">{t.payTitle}</p>
            <p className="text-xs text-muted-foreground">
              {paid
                ? t.payPaidOn.replace("{date}", new Date(payment.paid_at).toLocaleDateString(t.langCode === "he" ? "he-IL" : "ar", { numberingSystem: "latn" }))
                : t.payNotPaid}
            </p>
          </div>
        </div>
        <span className={badgeClass(paid ? "paid" : "inactive")}>{paid ? t.payStatusPaid : t.payStatusUnpaid}</span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="event-price">{t.payPrice.replace("{currency}", t.currencySymbol)}</Label>
          <Input
            id="event-price"
            type="number"
            inputMode="decimal"
            min="0"
            dir="ltr"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="h-11 w-36 rounded-xl text-right"
          />
        </div>
        {priceChanged && (
          <Button variant="outline" className="h-11 rounded-xl" disabled={save.isPending} onClick={() => save.mutate({ price: priceNumber })}>
            {t.saveBtn}
          </Button>
        )}
        {!paid ? (
          <Button className="h-11 rounded-xl gap-2" disabled={save.isPending || !priceNumber} onClick={markPaid}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {t.payMarkPaid}
          </Button>
        ) : (
          <Button variant="outline" className="h-11 rounded-xl" disabled={save.isPending} onClick={markUnpaid}>
            {t.payMarkUnpaid}
          </Button>
        )}
      </div>

      <div className="rounded-xl bg-muted/50 p-3 space-y-3">
        {payment.referral_code ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Gift className="w-4 h-4 text-primary" />
            <span>
              {t.payReferredBy.replace("{name}", payment.referral_name)}{" "}
              <span dir="ltr" className="font-semibold">{payment.referral_code}</span>
            </span>
            <span className="text-xs text-muted-foreground">· {t[`affSource_${payment.referral_source}`] || payment.referral_source}</span>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="attach-code" className="text-sm">{t.payAttachCode}</Label>
            <div className="flex gap-2">
              <Input
                id="attach-code"
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="DANA20"
                className="h-11 w-40 rounded-xl text-right tracking-wide"
              />
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={!code.trim() || save.isPending}
                onClick={() => save.mutate({ referral_code: code.trim() })}
              >
                {t.payAttach}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t.payAttachHint}</p>
          </div>
        )}

        {commission && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="text-sm">
              <p className="font-semibold">{t.payCommissionTitle}</p>
              <p className="text-xs text-muted-foreground">
                {t.payCommissionLine
                  .replace("{pct}", commission.pct)
                  .replace("{price}", formatMoney(commission.event_price, t))}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span dir="ltr" className="text-lg font-bold">{formatMoney(commission.amount, t)}</span>
              <span className={badgeClass(commission.status)}>{commissionStatusLabel(commission.status, t)}</span>
            </div>
          </div>
        )}

        {!commission && payment.referral_code && payment.checks.length > 0 && (
          <ul className="space-y-1.5 border-t border-border pt-3">
            {payment.checks.map((c) => (
              <li key={c.key} className="flex items-center gap-2 text-sm">
                {c.ok ? <Check className="w-4 h-4 text-success" /> : <X className="w-4 h-4 text-destructive" />}
                {t[`affCheck_${c.key}`] || c.key}
              </li>
            ))}
          </ul>
        )}
        {!commission && paid && payment.commission_skipped && payment.referral_code && (
          <p className="text-xs text-muted-foreground">{t.payNoCommission}</p>
        )}
      </div>
    </Card>
  );
}
