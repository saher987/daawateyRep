import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Search, Store } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import MobileSelect from "@/components/shared/MobileSelect";
import ProviderFormDialog from "@/components/providers/ProviderFormDialog";
import CategoriesManager from "@/components/providers/CategoriesManager";
import { localized } from "@/lib/providerIcons";

const CLICK_LABELS = ["whatsapp", "phone", "instagram", "facebook", "website", "map"];

// Admin/manager management of the providers directory — everything a
// manager needs to add a provider without a developer.
export default function ManageProviders() {
  const t = useT();
  const { user } = useAuth();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const [tab, setTab] = useState("providers");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dialog, setDialog] = useState({ open: false, provider: null });

  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["manage-providers"],
    queryFn: () => base44.providers.manageList(),
    enabled: isPrivileged,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["manage-provider-categories"],
    queryFn: () => base44.providers.manageListCategories(),
    enabled: isPrivileged,
  });

  const categoryName = useMemo(() => {
    const names = {};
    for (const c of categories) names[c.id] = localized(c, "name", t.langCode);
    return names;
  }, [categories, t.langCode]);

  const query = search.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const matchesSearch = (p) =>
    !query || p.name.toLowerCase().includes(query) || (!!digits && (p.phone || "").replace(/\D/g, "").includes(digits));
  const shown = providers.filter((p) => (categoryFilter === "all" || p.category_id === categoryFilter) && matchesSearch(p));
  const published = providers.filter((p) => p.is_published).length;
  const totalClicks = providers.reduce((sum, p) => sum + Object.values(p.clicks).reduce((a, b) => a + b, 0), 0);

  const clickLabel = {
    whatsapp: t.contactWhatsapp, phone: t.contactCall, instagram: t.contactInstagram,
    facebook: t.contactFacebook, website: t.contactWebsite, map: t.showOnMap,
  };

  if (!isPrivileged) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t.noPagePermission}</div>;
  }

  return (
    <div className="max-w-4xl">
      <PageHeader title={t.manageProviders} subtitle={t.manageProvidersSubtitle}>
        {tab === "providers" && (
          <Button className="gap-2 h-11 rounded-xl" onClick={() => setDialog({ open: true, provider: null })} disabled={categories.length === 0}>
            <Plus className="w-4 h-4" />
            {t.addProvider}
          </Button>
        )}
      </PageHeader>

      <div role="tablist" className="grid grid-cols-2 p-1 rounded-xl bg-muted mb-5 max-w-sm">
        {[["providers", t.providersTabLabel], ["categories", t.categoriesTabLabel]].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`h-10 rounded-lg text-sm font-medium transition-colors ${tab === key ? "bg-background text-foreground shadow-sm font-semibold" : "text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "categories" ? (
        <CategoriesManager />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-border bg-card p-3"><div className="text-xl font-bold">{published}</div><div className="text-xs text-muted-foreground">{t.statPublished}</div></div>
            <div className="rounded-xl border border-border bg-card p-3"><div className="text-xl font-bold">{providers.length - published}</div><div className="text-xs text-muted-foreground">{t.statHidden}</div></div>
            <div className="rounded-xl border border-border bg-card p-3"><div className="text-xl font-bold">{totalClicks.toLocaleString("en-US")}</div><div className="text-xs text-muted-foreground">{t.clicks30d}</div></div>
          </div>

          <div className="flex gap-2">
            <label className="flex-1 min-w-0 flex items-center gap-2 h-11 px-3 rounded-xl border border-input bg-background">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.searchProviders} className="border-0 shadow-none focus-visible:ring-0 h-9 px-0" />
            </label>
            <div className="w-36 flex-shrink-0">
              <MobileSelect
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                options={[{ value: "all", label: t.allCategories }, ...categories.map((c) => ({ value: c.id, label: categoryName[c.id] }))]}
                className="h-11"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : shown.length === 0 ? (
            <EmptyState icon={Store} title={t.noProvidersManage} />
          ) : (
            <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              {shown.map((p) => {
                const image = p.logo_url || p.cover_url || p.gallery_urls[0];
                const clicks = CLICK_LABELS.filter((k) => p.clicks[k]).map((k) => `${clickLabel[k]} ${p.clicks[k]}`).join(" · ");
                return (
                  <div key={p.id} className={`flex gap-3 p-3 ${p.is_published ? "" : "bg-muted/50"}`}>
                    <div className="w-14 h-14 rounded-xl bg-muted overflow-hidden flex-shrink-0 flex items-center justify-center">
                      {image ? <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Store className="w-5 h-5 text-muted-foreground/60" />}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-bold ${p.is_published ? "" : "text-muted-foreground"}`}>{p.name}</span>
                        {p.is_featured && <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{t.featuredBadge}</span>}
                        {!p.is_published && <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{t.hiddenBadge}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[categoryName[p.category_id], p.city && (t[p.city] || p.city)].filter(Boolean).join(" · ")}
                      </div>
                      {clicks && <div className="text-xs text-foreground/70">{clicks}</div>}
                    </div>
                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl flex-shrink-0" onClick={() => setDialog({ open: true, provider: p })} aria-label={t.editProvider}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <ProviderFormDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        provider={dialog.provider}
        categories={categories}
      />
    </div>
  );
}
