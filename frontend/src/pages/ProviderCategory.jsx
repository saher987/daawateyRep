import React, { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Store } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import EmptyState from "@/components/shared/EmptyState";
import ProviderCard from "@/components/providers/ProviderCard";
import { localized } from "@/lib/providerIcons";

// One category's providers (featured first — the backend's order), with
// a chip per city that actually has providers here.
export default function ProviderCategory() {
  const t = useT();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const city = searchParams.get("city") || "all";

  const { data: categories = [] } = useQuery({
    queryKey: ["provider-categories"],
    queryFn: () => base44.providers.listCategories(),
  });
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["providers", "category", id],
    queryFn: () => base44.providers.list({ category_id: id }),
  });

  const category = categories.find((c) => c.id === id);
  const cities = useMemo(() => [...new Set(providers.map((p) => p.city).filter(Boolean))], [providers]);
  const shown = city === "all" ? providers : providers.filter((p) => p.city === city);
  const setCity = (value) => setSearchParams(value === "all" ? {} : { city: value }, { replace: true });

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-display font-bold text-foreground flex-1">{category ? localized(category, "name", t.langCode) : ""}</h1>
        {!isLoading && <span className="text-sm text-muted-foreground">{t.providerCount.replace("{n}", shown.length)}</span>}
      </div>

      {cities.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
          {["all", ...cities].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCity(c)}
              aria-pressed={city === c}
              className={`h-9 px-4 rounded-full whitespace-nowrap text-sm font-medium border transition-colors ${
                city === c ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
              }`}
            >
              {c === "all" ? t.allCities : t[c] || c}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Store} title={providers.length === 0 ? t.noProvidersYet : t.noProvidersInCity} />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((p) => (
            <ProviderCard key={p.id} provider={p} categoryName={category ? localized(category, "name", t.langCode) : ""} />
          ))}
        </div>
      )}
    </div>
  );
}
