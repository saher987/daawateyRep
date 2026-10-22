import React from "react";
import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { useT } from "@/lib/i18n";
import { localized } from "@/lib/providerIcons";

// One row in a providers list: thumbnail + name, category/city, a line of
// description and the starting price.
export default function ProviderCard({ provider, categoryName }) {
  const t = useT();
  const image = provider.cover_url || provider.logo_url || provider.gallery_urls?.[0];
  const description = localized(provider, "description", t.langCode);
  const subtitle = [categoryName, provider.city && (t[provider.city] || provider.city)].filter(Boolean).join(" · ");

  return (
    <Link
      to={`/providers/${provider.id}`}
      className={`flex gap-3 p-2.5 rounded-2xl bg-card border transition-colors hover:bg-accent/40 ${provider.is_featured ? "border-primary/50" : "border-border"}`}
    >
      <div className="w-24 h-24 rounded-xl bg-muted flex-shrink-0 overflow-hidden flex items-center justify-center">
        {image ? <img src={image} alt="" className="w-full h-full object-cover" loading="lazy" /> : <Store className="w-7 h-7 text-muted-foreground/60" />}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 py-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-[15px] text-foreground">{provider.name}</span>
          {provider.is_featured && (
            <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{t.featuredBadge}</span>
          )}
        </div>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        {description && <span className="text-sm text-foreground/80 line-clamp-1">{description}</span>}
        {provider.price_from != null && (
          <span className="text-xs text-muted-foreground">{t.priceFrom.replace("{n}", provider.price_from.toLocaleString("en-US"))}</span>
        )}
      </div>
    </Link>
  );
}
