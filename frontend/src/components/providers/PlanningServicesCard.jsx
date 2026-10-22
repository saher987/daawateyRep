import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Heart } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { localized, providerIcon } from "@/lib/providerIcons";

// Shown on My Event: a way into the providers directory from where people
// are actually planning, plus the Upcoming Weddings link that used to be a
// bottom tab (BottomTabBar gave that slot to /providers).
export default function PlanningServicesCard() {
  const t = useT();
  const { data: categories = [] } = useQuery({
    queryKey: ["provider-categories"],
    queryFn: () => base44.providers.listCategories(),
  });

  return (
    <div className="space-y-3 mt-6">
      {categories.length > 0 && (
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4 space-y-3">
          <div>
            <h2 className="font-bold text-foreground">{t.planningCardTitle}</h2>
            <p className="text-sm text-muted-foreground">{t.planningCardDesc}</p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {categories.slice(0, 4).map((c) => {
              const Icon = providerIcon(c.icon);
              return (
                <Link key={c.id} to={`/providers/category/${c.id}`} className="flex flex-col items-center gap-1.5 text-center">
                  <span className="w-12 h-12 rounded-xl bg-card border border-border flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                  </span>
                  <span className="text-xs font-medium text-foreground line-clamp-1">{localized(c, "name", t.langCode)}</span>
                </Link>
              );
            })}
          </div>
          <Link to="/providers" className="flex h-11 items-center justify-center rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
            {t.viewAllServices}
          </Link>
        </div>
      )}
      <Link to="/planned-weddings" className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 hover:bg-accent/40 transition-colors">
        <Heart className="w-5 h-5 text-primary" />
        <span className="flex-1 font-semibold text-sm">{t.upcomingWeddings}</span>
        <ChevronLeft className="w-4 h-4 text-muted-foreground" />
      </Link>
    </div>
  );
}
