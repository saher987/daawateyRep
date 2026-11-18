import React, { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, Gift, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { AFFILIATE_KINDS, kindLabel } from "@/lib/affiliates";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";

// "Become a partner": any signed-in user applies to the affiliate program
// (backend POST /api/affiliate-applications); the team approves on the
// Affiliates page, which sends the code by SMS. Needs a phone on the
// account — that's how the affiliate is found and paid.
export default function BecomePartner() {
  const t = useT();
  const { user, checkAppState } = useAuth();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: [user?.first_name, user?.last_name].filter(Boolean).join(" "),
    kind: "planner",
    code: "",
    note: "",
    accepted: false,
  });
  const [busy, setBusy] = useState(false);
  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const status = user?.affiliate_status;

  const submit = async () => {
    setBusy(true);
    try {
      await base44.affiliates.apply({
        name: form.name.trim(),
        kind: form.kind,
        code: form.code.trim() || null,
        note: form.note.trim() || null,
        accepted_terms: form.accepted,
      });
      await checkAppState();
    } catch (err) {
      toast({ title: t[`affErr_${err?.message}`] || t.affErrGeneric, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (status === "pending") {
    return (
      <div className="max-w-xl">
        <PageHeader title={t.navBecomePartner} />
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
            <Clock className="w-8 h-8 text-amber-800" />
          </div>
          <h2 className="text-xl font-bold">{t.bpSentTitle}</h2>
          <p className="text-muted-foreground">{t.bpSentBody}</p>
        </Card>
      </div>
    );
  }
  if (status === "active" || status === "inactive") {
    return (
      <div className="max-w-xl">
        <PageHeader title={t.navBecomePartner} />
        <Card className="p-8 text-center space-y-4">
          <CheckCircle2 className="w-10 h-10 text-success mx-auto" />
          <p>{t.bpAlready}</p>
          <Button asChild className="rounded-xl h-11">
            <Link to="/my-referrals">{t.navMyReferrals}</Link>
          </Button>
        </Card>
      </div>
    );
  }
  if (status === "rejected") {
    return (
      <div className="max-w-xl">
        <PageHeader title={t.navBecomePartner} />
        <Card className="p-8 text-center text-muted-foreground">{t.bpRejected}</Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-5">
      <PageHeader title={t.navBecomePartner} />

      <Card className="p-5 bg-accent/60 space-y-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Gift className="w-5 h-5 text-primary" />
          {t.bpHeadline}
        </h2>
        <ul className="list-disc ps-5 text-sm leading-7">
          <li>{t.bpBenefit1}</li>
          <li>{t.bpBenefit2}</li>
          <li>{t.bpBenefit3}</li>
        </ul>
      </Card>

      {!user?.phone ? (
        <Card className="p-5 space-y-3 text-sm">
          <p>{t.bpNeedPhone}</p>
          <Button asChild variant="outline" className="rounded-xl h-11">
            <Link to="/profile">{t.profile}</Link>
          </Button>
        </Card>
      ) : (
        <Card className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bp-name">{t.bpName}</Label>
            <Input id="bp-name" value={form.name} onChange={set("name")} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-kind">{t.affKind}</Label>
            <select id="bp-kind" value={form.kind} onChange={set("kind")} className="w-full h-11 rounded-xl border border-input bg-background px-3">
              {AFFILIATE_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k, t)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-code">
              {t.bpCode} <span className="font-normal text-muted-foreground">{t.affOptional}</span>
            </Label>
            <Input id="bp-code" dir="ltr" value={form.code} onChange={set("code")} placeholder="OR20" className="h-11 rounded-xl text-right tracking-wide" />
            <p className="text-xs text-muted-foreground">{t.affCodeHint}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-note">{t.bpNote}</Label>
            <Textarea id="bp-note" value={form.note} onChange={set("note")} className="rounded-xl min-h-[90px] resize-none" />
          </div>
          <label className="flex items-start gap-3 min-h-11 text-sm cursor-pointer">
            <input type="checkbox" checked={form.accepted} onChange={set("accepted")} className="w-5 h-5 mt-0.5 accent-primary" />
            <span>
              {t.bpTermsBefore} <Link to="/terms" className="text-primary underline">{t.bpTermsLink}</Link>
            </span>
          </label>
          <Button className="w-full h-12 rounded-xl" disabled={busy || !form.name.trim() || !form.accepted} onClick={submit}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {t.bpSubmit}
          </Button>
        </Card>
      )}
    </div>
  );
}
