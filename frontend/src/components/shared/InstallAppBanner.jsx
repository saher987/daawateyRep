// Nudges visitors browsing the web app (Login, Events, My Invitations,
// ...) toward the native app for their platform — not the one-time
// invitation-link guest, who should never see any app-install prompt
// (see BUSINESS_LOGIC.md's Android section). This is the pattern
// Instagram/LinkedIn/Pinterest/Airbnb all use for mobile-web visitors: a
// slim, dismissible banner, never a blocking interstitial.
//
// 2026-09-26: extended from Android-only to also cover iOS. This banner
// is deliberately NOT what the wedding-venue QR codes point at, though —
// a dismissible banner can be missed or dismissed by accident, which
// matters a lot more for a one-shot physical QR code than for an organic
// web visitor. GetApp.jsx (routed at /get) is the actual answer for that:
// an instant, un-missable redirect with nothing to notice or dismiss.
// This banner's job is the softer, ongoing nudge for anyone who's
// already browsing the site through some other path.
//
// Only shown when all of:
// - not already inside the native app (Capacitor.isNativePlatform())
// - the browser's user agent is Android or iOS (no point suggesting an
//   app to a desktop visitor — there's nothing to install)
// - not previously dismissed (persisted in localStorage, so it doesn't
//   nag again on every page load once closed)
import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { PLAY_STORE_URL, APP_STORE_URL, detectMobilePlatform } from "@/lib/appStoreLinks";

const DISMISS_KEY = "daawatey_install_banner_dismissed";

export default function InstallAppBanner({ t: tProp } = {}) {
  // useT() reads I18nContext, which tracks the signed-in user's
  // preferred_language — meaningless on a pre-auth page like Login.jsx,
  // which drives its own visible language via usePublicLanguage() instead
  // (a separate localStorage-backed useState, not wired into that
  // context). Callers on such a page pass their own `t` down instead of
  // relying on this falling back to a context that can't see it — without
  // this the banner silently stayed in whatever language the context
  // last resolved to (Arabic, the default) even after the visible toggle
  // switched the rest of the page to Hebrew.
  const contextT = useT();
  const t = tProp || contextT;
  const [platform, setPlatform] = useState(null);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const detected = detectMobilePlatform();
    if (!detected) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setPlatform(detected);
  }, []);

  if (!platform) return null;

  const storeUrl = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setPlatform(null);
  };

  return (
    <div className="mb-4 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
      <Smartphone className="w-5 h-5 flex-shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{t.installAppTitle}</p>
        <p className="text-xs text-muted-foreground">{t.installAppSubtitle}</p>
      </div>
      <Button size="sm" className="flex-shrink-0" asChild>
        <a href={storeUrl} target="_blank" rel="noreferrer">
          {t.installAppCta}
        </a>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="flex-shrink-0 text-muted-foreground"
        onClick={dismiss}
        aria-label={t.dismiss}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
