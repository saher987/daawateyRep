import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Store } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Input } from "@/components/ui/input";
import CitySelect from "@/components/shared/CitySelect";
import EmptyState from "@/components/shared/EmptyState";
import ProviderCard from "@/components/providers/ProviderCard";
import { localized, providerIcon } from "@/lib/providerIcons";

// The directory's home: category grid, featured providers, and a search
// across every published provider. Public — see ProvidersLayout.
export default function Providers() {
  const t = useT();
  const [city, setCity] = useState("all");
  const [search, setSearch] = useState("");

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: ["provider-categories"],
    queryFn: () => base44.providers.listCategories(),
  });
  // Every published provider in one call — the directory is small enough,
  // and it lets the per-category counts follow the city filter and the
  // search run instantly without another round trip.
  const { data: providers = [], isLoading: loadingProviders } = useQuery({
    queryKey: ["providers", "all"],
    queryFn: () => base44.providers.list(),
  });

  const categoryName = useMemo(() => {
    const names = {};
    for (const c of categories) names[c.id] = localized(c, "name", t.langCode);
    return names;
  }, [categories, t.langCode]);

  const inCity = useMemo(() => (city === "all" ? providers : providers.filter((p) => p.city === city)), [providers, city]);
  const counts = useMemo(() => {
    const result = {};
    for (const p of inCity) result[p.category_id] = (result[p.category_id] || 0) + 1;
    return result;
  }, [inCity]);
  const featured = inCity.filter((p) => p.is_featured).slice(0, 6);

  const query = search.trim().toLowerCase();
  const searchResults = query
    ? inCity.filter((p) => p.name.toLowerCase().includes(query) || (categoryName[p.category_id] || "").toLowerCase().includes(query))
    : [];

  const isLoading = loadingCategories || loadingProviders;

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl lg:text-3xl font-display font-bold text-foreground">{t.providersTitle}</h1>
        <p className="text-muted-foreground mt-1">{t.providersSubtitle}</p>
      </div>

      <div className="flex gap-2">
        <label className="flex-1 min-w-0 flex items-center gap-2 h-11 px-3 rounded-xl border border-input bg-background">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchServices}
            className="border-0 shadow-none focus-visible:ring-0 h-9 px-0"
          />
        </label>
        <div className="w-36 flex-shrink-0">
          <CitySelect value={city} onValueChange={setCity} leadingOptions={[{ value: "all", label: t.allCities }]} className="h-11" />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : query ? (
        searchResults.length === 0 ? (
          <EmptyState icon={Store} title={t.noProvidersInCity} />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {searchResults.map((p) => <ProviderCard key={p.id} provider={p} categoryName={categoryName[p.category_id]} />)}
          </div>
        )
      ) : categories.length === 0 ? (
        <EmptyState icon={Store} title={t.noCategoriesYet} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {categories.map((c) => {
              const Icon = providerIcon(c.icon);
              return (
                <Link
                  key={c.id}
                  to={`/providers/category/${c.id}${city !== "all" ? `?city=${city}` : ""}`}
                  className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border hover:bg-accent/40 transition-colors"
                >
                  <span className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="font-semibold text-[15px] text-foreground truncate">{localized(c, "name", t.langCode)}</span>
                    <span className="text-xs text-muted-foreground">{t.providerCount.replace("{n}", counts[c.id] || 0)}</span>
                  </span>
                </Link>
              );
            })}
          </div>

          {featured.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="flex items-center gap-1.5 font-bold text-foreground">
                <Star className="w-4 h-4 text-primary fill-primary" />
                {t.featuredProviders}
              </h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {featured.map((p) => <ProviderCard key={p.id} provider={p} categoryName={categoryName[p.category_id]} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
