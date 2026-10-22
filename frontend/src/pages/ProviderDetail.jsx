import React, { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Phone, MessageCircle, Instagram, Facebook, Globe, MapPin, Share2, Banknote, Store } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import EmptyState from "@/components/shared/EmptyState";
import { localized } from "@/lib/providerIcons";
import { toIntlPhone } from "@/lib/thankYouMessage";
import { publicAppOrigin } from "@/lib/publicUrl";

export default function ProviderDetail() {
  const t = useT();
  const { id } = useParams();
  const { toast } = useToast();
  const [openImage, setOpenImage] = useState(null);

  const { data: provider, isLoading, isError } = useQuery({
    queryKey: ["provider", id],
    queryFn: () => base44.providers.get(id),
    retry: false,
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["provider-categories"],
    queryFn: () => base44.providers.listCategories(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (isError || !provider) return <EmptyState icon={Store} title={t.providerNotFound} />;

  const category = categories.find((c) => c.id === provider.category_id);
  const subtitle = [category && localized(category, "name", t.langCode), provider.city && (t[provider.city] || provider.city)]
    .filter(Boolean)
    .join(" · ");
  const description = localized(provider, "description", t.langCode);
  const whatsappNumber = provider.whatsapp || provider.phone;
  const track = (kind) => base44.providers.recordContactClick(provider.id, kind);

  const actions = [
    whatsappNumber && {
      kind: "whatsapp",
      label: t.contactWhatsapp,
      icon: MessageCircle,
      // wa.me wants digits only — numbers are often typed "050-123-4567".
      href: `https://wa.me/${toIntlPhone(whatsappNumber).replace(/\D/g, "")}?text=${encodeURIComponent(t.providerWhatsappGreeting)}`,
      className: "bg-[#1E7448] text-white hover:bg-[#1E7448]/90",
    },
    provider.phone && { kind: "phone", label: t.contactCall, icon: Phone, href: `tel:${provider.phone}`, className: "bg-primary text-primary-foreground hover:bg-primary/90" },
    provider.instagram_url && { kind: "instagram", label: t.contactInstagram, icon: Instagram, href: provider.instagram_url },
    provider.facebook_url && { kind: "facebook", label: t.contactFacebook, icon: Facebook, href: provider.facebook_url },
    provider.website_url && { kind: "website", label: t.contactWebsite, icon: Globe, href: provider.website_url },
  ].filter(Boolean);

  const share = async () => {
    const url = `${publicAppOrigin()}/providers/${provider.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: provider.name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast({ title: t.providerLinkCopied });
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="max-w-3xl mx-auto -mt-4 lg:mt-0">
      <div className="relative -mx-4 lg:mx-0 h-52 sm:h-64 bg-muted lg:rounded-2xl overflow-hidden">
        {provider.cover_url ? (
          <img src={provider.cover_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center"><Store className="w-10 h-10 text-muted-foreground/50" /></div>
        )}
        <button
          type="button"
          onClick={share}
          aria-label={t.shareProvider}
          className="absolute top-3 left-3 w-11 h-11 rounded-full bg-background/90 flex items-center justify-center text-foreground shadow"
        >
          <Share2 className="w-5 h-5" />
        </button>
      </div>

      <div className="space-y-5">
        <div className="px-1">
          <div className="w-20 h-20 -mt-10 relative rounded-full border-4 border-background bg-card overflow-hidden flex items-center justify-center">
            {provider.logo_url ? (
              <img src={provider.logo_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-bold text-primary">{provider.name.trim()[0]}</span>
            )}
          </div>
          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <h1 className="text-xl font-bold text-foreground">{provider.name}</h1>
            {provider.is_featured && (
              <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">{t.featuredBadge}</span>
            )}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>

        {actions.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {actions.map((a) => (
              <a
                key={a.kind}
                href={a.href}
                target={a.kind === "phone" ? undefined : "_blank"}
                rel="noreferrer"
                onClick={() => track(a.kind)}
                className={`h-12 rounded-xl flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors ${
                  a.className || "border border-border bg-card text-foreground hover:bg-accent/40"
                }`}
              >
                <a.icon className="w-4 h-4" />
                {a.label}
              </a>
            ))}
          </div>
        )}

        {description && (
          <section className="space-y-1.5">
            <h2 className="font-bold text-foreground">{t.aboutProvider}</h2>
            <p className="text-sm leading-7 text-foreground/80 whitespace-pre-line">{description}</p>
          </section>
        )}

        {(provider.price_from != null || provider.address || provider.map_url || provider.phone) && (
          <section className="rounded-2xl border border-border bg-card divide-y divide-border">
            {provider.price_from != null && (
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <Banknote className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="font-semibold">{t.priceFrom.replace("{n}", provider.price_from.toLocaleString("en-US"))}</span>
              </div>
            )}
            {(provider.address || provider.map_url) && (
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="flex-1">{provider.address || (provider.city && (t[provider.city] || provider.city))}</span>
                {provider.map_url && (
                  <a href={provider.map_url} target="_blank" rel="noreferrer" onClick={() => track("map")} className="text-primary font-semibold text-sm">
                    {t.showOnMap}
                  </a>
                )}
              </div>
            )}
            {provider.phone && (
              <div className="flex items-center gap-3 px-4 py-3 text-sm">
                <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                <a href={`tel:${provider.phone}`} onClick={() => track("phone")} dir="ltr" className="font-semibold text-foreground">{provider.phone}</a>
              </div>
            )}
          </section>
        )}

        {provider.gallery_urls.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-bold text-foreground">{t.ourWork}</h2>
            <div className="grid grid-cols-3 gap-1.5">
              {provider.gallery_urls.map((url) => (
                <button key={url} type="button" onClick={() => setOpenImage(url)} className="aspect-square rounded-xl overflow-hidden bg-muted">
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <Dialog open={!!openImage} onOpenChange={(open) => !open && setOpenImage(null)}>
        <DialogContent className="max-w-2xl p-2 bg-black border-0">
          {openImage && <img src={openImage} alt="" className="w-full max-h-[80vh] object-contain rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
