import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Check, Download, Gift, Loader2, Pencil, Plus, Users, Wallet, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import {
  AFFILIATE_KINDS,
  affiliateStatusLabel,
  badgeClass,
  commissionStatusLabel,
  formatMoney,
  kindLabel,
} from "@/lib/affiliates";
import { downloadFile } from "@/lib/downloadFile";
import PageHeader from "@/components/shared/PageHeader";
import StatCard from "@/components/shared/StatCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

// Must match backend affiliates.MIN_PAYOUT.
const MIN_PAYOUT = 100;

// Admin/manager: the affiliate program (backend app/routers/affiliates.py).
// Affiliates (added here or applied from BecomePartner), their commissions
// (created when an event is marked paid on EventDetails), the monthly
// payout, and shareholders' venues whose events earn no commission.
export default function Affiliates() {
  const t = useT();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState({ open: false, affiliate: null });
  const [created, setCreated] = useState(null);

  const { data: affiliates = [], isLoading } = useQuery({
    queryKey: ["affiliates"],
    queryFn: () => base44.affiliates.list(),
  });
  const { data: commissions = [] } = useQuery({
    queryKey: ["affiliate-commissions"],
    queryFn: () => base44.affiliates.commissions(),
  });
  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["affiliates"] });
    queryClient.invalidateQueries({ queryKey: ["affiliate-commissions"] });
  };
  const errorText = (err) => t[`affErr_${err?.message}`] || t.affErrGeneric;
  const onError = (err) => toast({ title: errorText(err), variant: "destructive" });

  const review = useMutation({
    mutationFn: ({ id, action }) => base44.affiliates.review(id, action),
    onSuccess: (a) => {
      refresh();
      if (a.status === "active") toast({ title: a.sms_sent ? t.affSmsSent : t.affSmsNotSent });
    },
    onError,
  });
  const decide = useMutation({
    mutationFn: ({ id, action }) => base44.affiliates.decide(id, action),
    onSuccess: refresh,
    onError,
  });
  const payout = useMutation({
    mutationFn: (reference) => base44.affiliates.payout({ reference: reference || null }),
    onSuccess: (r) => {
      refresh();
      toast({ title: t.affPayoutDone.replace("{count}", r.affiliates).replace("{total}", formatMoney(r.total, t)) });
    },
    onError,
  });
  const excludeVenue = useMutation({
    mutationFn: ({ id, excluded }) => base44.affiliates.setVenueExcluded(id, excluded),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["venues"] }),
    onError,
  });

  const pending = affiliates.filter((a) => a.status === "pending");
  const listed = affiliates.filter((a) => a.status !== "pending");
  const toApprove = commissions.filter((c) => c.status === "pending");

  // The payout everyone at MIN_PAYOUT or more gets this month.
  const payable = useMemo(() => {
    const totals = {};
    for (const c of commissions) if (c.status === "approved") totals[c.affiliate_id] = (totals[c.affiliate_id] || 0) + c.amount;
    const eligible = Object.values(totals).filter((v) => v >= MIN_PAYOUT);
    return { affiliates: eligible.length, total: eligible.reduce((a, b) => a + b, 0) };
  }, [commissions]);

  const stats = {
    active: affiliates.filter((a) => a.status === "active").length,
    customers: affiliates.reduce((n, a) => n + a.customers, 0),
    due: affiliates.reduce((n, a) => n + a.approved_amount, 0),
    paid: affiliates.reduce((n, a) => n + a.paid_amount, 0),
  };

  const exportCsv = () => {
    const header = [t.affColAffiliate, t.affColCode, t.affColEvent, t.affColEventDate, t.affColPrice, "%", t.affColAmount, t.status, t.affColPaidAt];
    const rows = commissions.map((c) => [
      c.affiliate_name,
      c.affiliate_code,
      c.event_title,
      c.event_date ? c.event_date.slice(0, 10) : "",
      c.event_price,
      c.pct,
      c.amount,
      commissionStatusLabel(c.status, t),
      c.paid_at ? c.paid_at.slice(0, 10) : "",
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    // BOM: Excel opens UTF-8 Arabic/Hebrew correctly only with it.
    downloadFile(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }), "affiliate-commissions.csv");
  };

  const confirmPayout = () => {
    const reference = window.prompt(t.affPayoutReference, "");
    if (reference === null) return;
    payout.mutate(reference.trim());
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-6xl">
      <PageHeader title={t.navAffiliates} subtitle={t.affPageSubtitle.replace("{min}", formatMoney(MIN_PAYOUT, t))}>
        <Button variant="outline" className="gap-2 h-11 rounded-xl" onClick={exportCsv} disabled={commissions.length === 0}>
          <Download className="w-4 h-4" />
          {t.affExportCsv}
        </Button>
        <Button className="gap-2 h-11 rounded-xl" onClick={() => setDialog({ open: true, affiliate: null })}>
          <Plus className="w-4 h-4" />
          {t.affAdd}
        </Button>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard icon={Gift} label={t.affStatActive} value={stats.active} />
        <StatCard icon={Users} label={t.affStatCustomers} value={stats.customers} color="success" />
        <StatCard icon={Wallet} label={t.affStatDue} value={formatMoney(stats.due, t)} color="warning" />
        <StatCard icon={Banknote} label={t.affStatPaid} value={formatMoney(stats.paid, t)} color="muted" />
      </div>

      {pending.length > 0 && (
        <Card className="p-4 mb-6 space-y-3">
          <h2 className="font-semibold">{t.affApplications.replace("{count}", pending.length)}</h2>
          {pending.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {a.name} <span className="text-sm font-normal text-muted-foreground">· {kindLabel(a.kind, t)}</span>
                </p>
                <p className="text-xs text-muted-foreground" dir="ltr">{a.code} · {a.phone}</p>
                {a.application_note && <p className="text-sm mt-1">{a.application_note}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="rounded-xl gap-1" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, action: "approve" })}>
                  <Check className="w-4 h-4" />
                  {t.affApprove}
                </Button>
                <Button size="sm" variant="outline" className="rounded-xl" disabled={review.isPending} onClick={() => review.mutate({ id: a.id, action: "reject" })}>
                  {t.affReject}
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}

      <Tabs defaultValue="affiliates" dir="rtl">
        <TabsList className="mb-4">
          <TabsTrigger value="affiliates">{t.affTabAffiliates}</TabsTrigger>
          <TabsTrigger value="commissions">
            {t.affTabCommissions}
            {toApprove.length > 0 && <span className="ms-1.5 rounded-full bg-primary text-primary-foreground px-1.5 text-xs">{toApprove.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="venues">{t.affTabVenues}</TabsTrigger>
        </TabsList>

        <TabsContent value="affiliates">
          {listed.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">{t.affEmpty}</Card>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    {[t.affColAffiliate, t.affColCode, t.affColPct, t.affColCustomers, t.affColPaidEvents, t.affColDue, t.status, ""].map((h, i) => (
                      <th key={i} className="px-4 py-3 text-right font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {listed.map((a) => (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-4 py-3">
                        <p className="font-semibold">{a.name}</p>
                        <p className="text-xs text-muted-foreground">{kindLabel(a.kind, t)}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold" dir="ltr" style={{ textAlign: "right" }}>{a.code}</td>
                      <td className="px-4 py-3">{a.excluded ? "0%" : `${a.commission_pct}%`}</td>
                      <td className="px-4 py-3">{a.customers}</td>
                      <td className="px-4 py-3">{a.paid_events}</td>
                      <td className="px-4 py-3 font-semibold" dir="ltr" style={{ textAlign: "right" }}>{formatMoney(a.approved_amount, t)}</td>
                      <td className="px-4 py-3">
                        <span className={badgeClass(a.excluded ? "inactive" : a.status)}>
                          {a.excluded ? t.affExcludedBadge : affiliateStatusLabel(a.status, t)}
                        </span>
                      </td>
                      <td className="px-2 py-3">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11"
                          aria-label={t.affEditFor.replace("{name}", a.name)}
                          onClick={() => setDialog({ open: true, affiliate: a })}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="commissions" className="space-y-4">
          <Card className="p-4 flex flex-wrap items-center justify-between gap-3 bg-accent/40">
            <div>
              <p className="font-semibold">{t.affPayoutTitle}</p>
              <p className="text-sm text-muted-foreground">
                {t.affPayoutLine.replace("{count}", payable.affiliates).replace("{total}", formatMoney(payable.total, t))}
              </p>
            </div>
            <Button className="rounded-xl h-11" disabled={payable.affiliates === 0 || payout.isPending} onClick={confirmPayout}>
              {payout.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {t.affPayoutButton}
            </Button>
          </Card>
          {commissions.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground">{t.affNoCommissions}</Card>
          ) : (
            <Card className="divide-y divide-border">
              {commissions.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold">{c.event_title}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.affiliate_name} · <span dir="ltr">{c.affiliate_code}</span> · {c.pct}% {t.affOf} {formatMoney(c.event_price, t)}
                      {c.is_first ? "" : ` · ${t.affRepeat}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span dir="ltr" className="font-bold">{formatMoney(c.amount, t)}</span>
                    <span className={badgeClass(c.status)}>{commissionStatusLabel(c.status, t)}</span>
                    {c.status === "pending" && (
                      <>
                        <Button size="icon" className="h-11 w-11 rounded-xl" aria-label={t.affApprove} disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "approve" })}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="outline" className="h-11 w-11 rounded-xl" aria-label={t.affReject} disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "reject" })}>
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </Card>
          )}
        </TabsContent>

        <TabsContent value="venues">
          <Card className="p-4 space-y-1">
            <p className="text-sm text-muted-foreground mb-2">{t.affVenuesHint}</p>
            {venues.map((v) => (
              <label key={v.id} className="flex items-center justify-between gap-3 min-h-11 py-2 cursor-pointer">
                <span>
                  {v.name}
                  {v.city ? <span className="text-xs text-muted-foreground"> · {t[v.city] || v.city}</span> : null}
                </span>
                <Switch
                  checked={!!v.affiliate_excluded}
                  disabled={excludeVenue.isPending}
                  onCheckedChange={(checked) => excludeVenue.mutate({ id: v.id, excluded: checked })}
                />
              </label>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <AffiliateDialog
        open={dialog.open}
        affiliate={dialog.affiliate}
        canDelete={user?.role === "admin"}
        onClose={() => setDialog({ open: false, affiliate: null })}
        onSaved={(a, isNew) => {
          refresh();
          setDialog({ open: false, affiliate: null });
          if (isNew) setCreated(a);
        }}
      />

      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent dir="rtl" className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>{created && t.affCreatedTitle.replace("{name}", created.name)}</DialogTitle>
          </DialogHeader>
          {created && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-accent p-4 space-y-1">
                <p dir="ltr" className="text-3xl font-bold tracking-widest">{created.code}</p>
                <p dir="ltr" className="text-sm text-muted-foreground">{`${window.location.origin}/r/${created.code}`}</p>
              </div>
              {created.sms_sent !== null && created.sms_sent !== undefined && (
                <p className="text-sm text-muted-foreground">{created.sms_sent ? t.affSmsSent : t.affSmsNotSent}</p>
              )}
              <Button className="w-full rounded-xl h-11" onClick={() => setCreated(null)}>{t.affDone}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AffiliateDialog({ open, affiliate, canDelete, onClose, onSaved }) {
  const t = useT();
  const { toast } = useToast();
  const isNew = !affiliate;
  const empty = { name: "", phone: "", kind: "planner", code: "", commission_pct: 20, repeat_pct: 0, excluded: false, status: "active", send_sms: true };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(affiliate ? { ...empty, ...affiliate, send_sms: false } : empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, affiliate]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e?.target ? e.target.value : e }));

  const submit = async () => {
    setBusy(true);
    try {
      const common = {
        name: form.name.trim(),
        kind: form.kind || null,
        code: form.code.trim() || null,
        commission_pct: Number(form.commission_pct) || 0,
        repeat_pct: Number(form.repeat_pct) || 0,
        excluded: form.excluded,
      };
      const saved = isNew
        ? await base44.affiliates.create({ ...common, phone: form.phone.trim(), send_sms: form.send_sms })
        : await base44.affiliates.update(affiliate.id, { ...common, code: common.code || affiliate.code, status: form.status });
      onSaved(saved, isNew);
    } catch (err) {
      toast({ title: t[`affErr_${err?.message}`] || t.affErrGeneric, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(t.affDeleteConfirm)) return;
    try {
      await base44.affiliates.delete(affiliate.id);
      onSaved(null, false);
    } catch (err) {
      toast({ title: t[`affErr_${err?.message}`] || t.affErrGeneric, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? t.affAdd : t.affEdit}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="aff-name">{t.affName}</Label>
            <Input id="aff-name" value={form.name} onChange={set("name")} className="h-11 rounded-xl" />
          </div>
          {isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="aff-phone">{t.phone}</Label>
              <Input id="aff-phone" type="tel" dir="ltr" value={form.phone} onChange={set("phone")} placeholder="05X-XXXXXXX" className="h-11 rounded-xl text-right" />
              <p className="text-xs text-muted-foreground">{t.affPhoneHint}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="aff-kind">{t.affKind}</Label>
            <select id="aff-kind" value={form.kind || ""} onChange={set("kind")} className="w-full h-11 rounded-xl border border-input bg-background px-3">
              {AFFILIATE_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k, t)}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="aff-code">{t.affCode}</Label>
            <Input id="aff-code" dir="ltr" value={form.code} onChange={set("code")} placeholder={isNew ? t.affCodeAuto : ""} className="h-11 rounded-xl text-right tracking-wide" />
            <p className="text-xs text-muted-foreground">{t.affCodeHint}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="aff-pct">{t.affPctFirst}</Label>
              <Input id="aff-pct" type="number" min="0" max="100" dir="ltr" value={form.commission_pct} onChange={set("commission_pct")} className="h-11 rounded-xl text-right" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aff-repeat">{t.affPctRepeat}</Label>
              <Input id="aff-repeat" type="number" min="0" max="100" dir="ltr" value={form.repeat_pct} onChange={set("repeat_pct")} className="h-11 rounded-xl text-right" />
            </div>
          </div>
          {!isNew && (
            <div className="space-y-1.5">
              <Label htmlFor="aff-status">{t.status}</Label>
              <select id="aff-status" value={form.status} onChange={set("status")} className="w-full h-11 rounded-xl border border-input bg-background px-3">
                {["active", "inactive", "pending", "rejected"].map((s) => <option key={s} value={s}>{affiliateStatusLabel(s, t)}</option>)}
              </select>
            </div>
          )}
          <label className="flex items-start justify-between gap-3 min-h-11 cursor-pointer">
            <span className="text-sm">
              <span className="font-semibold block">{t.affExcluded}</span>
              <span className="text-muted-foreground">{t.affExcludedHint}</span>
            </span>
            <Switch checked={form.excluded} onCheckedChange={set("excluded")} />
          </label>
          {isNew && (
            <label className="flex items-center justify-between gap-3 min-h-11 cursor-pointer text-sm">
              {t.affSendSms}
              <Switch checked={form.send_sms} onCheckedChange={set("send_sms")} />
            </label>
          )}
          <Button className="w-full h-11 rounded-xl" disabled={busy || !form.name.trim() || (isNew && !form.phone.trim())} onClick={submit}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {isNew ? t.affCreate : t.saveBtn}
          </Button>
          {!isNew && canDelete && (
            <Button variant="ghost" className="w-full h-11 rounded-xl text-destructive" onClick={remove}>
              {t.affDelete}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
