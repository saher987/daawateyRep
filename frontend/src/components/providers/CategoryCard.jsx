import React from "react";
import { useT } from "@/lib/i18n";
import { providerIcon } from "@/lib/providerIcons";

// One tile of the services page's category grid. With an image_url it's a
// photo card (dark fade at the bottom so the title stays readable on any
// photo); without one it falls back to the category's icon on a soft gold
// glow, at the same size, so a category without a photo never looks broken.
// Also used as the live preview in the categories manager.
export default function CategoryCard({ name, icon, imageUrl, count }) {
  const t = useT();
  const Icon = providerIcon(icon);
  const countLabel = count > 0 ? t.providerCount.replace("{n}", count) : t.categorySoon;

  return (
    <div className="group relative h-36 sm:h-44 rounded-2xl overflow-hidden border border-border bg-card">
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover saturate-[.85] transition-transform duration-700 group-hover:scale-105"
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,hsl(var(--primary)/0.22),transparent_60%)]">
          <Icon className="absolute top-6 inset-x-0 mx-auto w-12 h-12 sm:w-16 sm:h-16 text-primary/80" strokeWidth={1} />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <span
        className={`absolute top-2.5 end-2.5 text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap bg-black/50 backdrop-blur-sm ${
          count > 0 ? "border-primary/50 text-primary" : "border-white/25 text-white/75"
        }`}
      >
        {countLabel}
      </span>
      <span className="absolute inset-x-3 bottom-3 flex items-center gap-1.5">
        <Icon className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="font-bold text-[15px] sm:text-base text-white leading-tight line-clamp-2">{name}</span>
      </span>
    </div>
  );
}
