import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, ExternalLink, Loader2, MessageCircle, Pencil, Plus, Store, Users } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import PageHeader from "@/components/shared/PageHeader";
import ProviderFormDialog from "@/components/providers/ProviderFormDialog";
import { localized } from "@/lib/providerIcons";

// Matches the backend's _MAX_LISTINGS_PER_USER.
const MAX_LISTINGS = 5;

// "List your business": any signed-in user submits their own service to
// the providers directory. A submission stays hidden until an admin or
// manager approves it (ManageProviders' requests tab).
export default function MyBusiness() {
  const t = useT();
  const [dialog, setDialog] = useState({ open: false, provider: null });

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["my-providers"],
    queryFn: () => base44.providers.myList(),
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["provider-categories"],
    queryFn: () => base44.providers.listCategories(),
  });

  const categoryName = useMemo(() => {
    const names = {};
    for (const c of categories) names[c.id] = localized(c, "name", t.langCode);
    return names;
  }, [categories, t.langCode]);

  const statusBadge = (p) => {
    if (p.review_status === "pending") return { label: t.statusUnderReview, className: "text-amber-700 bg-amber-100" };
    if (p.review_status === "rejected") return { label: t.statusNotApproved, className: "text-destructive bg-destructive/10" };
    if (p.is_published) return { label: t.statusLive, className: "text-emerald-700 bg-emerald-100" };
    return { label: t.hiddenBadge, className: "text-muted-foreground bg-muted" };
  };

  const openNew = () => setDialog({ open: true, provider: null });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title={t.myBusiness} subtitle={t.myBusinessSubtitle}>
        {listings.length > 0 && listings.length < MAX_LISTINGS && (
          <Button className="gap-2 h-11 rounded-xl" onClick={openNew} disabled={categories.length === 0}>
            <Plus className="w-4 h-4" />
            {t.addAnotherBusiness}
          </Button>
        )}
      </PageHeader>

      {listings.length === 0 ? (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Store className="w-6 h-6 text-primary" />
            </span>
            <div>
              <h2 className="font-bold text-foreground">{t.listYourBusinessTitle}</h2>
              <p className="text-sm text-muted-foreground">{t.listYourBusinessDesc}</p>
            </div>
          </div>
          <ul className="space-y-2 text-sm">
            {[[Users, t.businessBenefitReach], [MessageCircle, t.businessBenefitContact], [BadgeCheck, t.businessBenefitFree]].map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-primary flex-shrink-0" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <Button className="w-full h-11 rounded-xl gap-2" onClick={openNew} disabled={categories.length === 0}>
            <Plus className="w-4 h-4" />
            {t.listYourBusiness}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((p) => {
            const image = p.logo_url || p.cover_url || p.gallery_urls[0];
            const badge = statusBadge(p);
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-3 space-y-2">
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                    {image ? <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Store className="w-5 h-5 text-muted-foreground/60" />}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-bold">{p.name}</span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge.className}`}>{badge.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[categoryName[p.category_id], p.city && (t[p.city] || p.city)].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl flex-shrink-0" onClick={() => setDialog({ open: true, provider: p })} aria-label={t.editMyBusiness}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                </div>
                {p.review_status === "pending" && <p className="text-xs text-muted-foreground">{t.underReviewHint}</p>}
                {p.review_status === "rejected" && (
                  <p className="text-xs rounded-xl bg-destructive/5 text-destructive px-3 py-2">
                    {p.review_note ? `${t.rejectionReason}: ${p.review_note}` : t.notApprovedHint}
                  </p>
                )}
                {p.is_published && (
                  <Link to={`/providers/${p.id}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <ExternalLink className="w-3.5 h-3.5" />
                    {t.viewPublicPage}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ProviderFormDialog
        owner
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        provider={dialog.provider}
        categories={categories}
      />
    </div>
  );
}
