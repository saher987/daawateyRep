// Nudges logged-in users already browsing the web app (Events, My
// Invitations, ...) toward the native Android app — not the one-time
// invitation-link guest, who should never see any app-install prompt
// (see BUSINESS_LOGIC.md's Android section). This is the pattern
// Instagram/LinkedIn/Pinterest/Airbnb all use for mobile-web visitors: a
// slim, dismissible banner, never a blocking interstitial.
//
// Only shown when all of:
// - not already inside the native app (Capacitor.isNativePlatform())
// - the browser's user agent is Android (no point suggesting an Android
//   app to an iPhone or desktop visitor — there's nothing to install)
// - not previously dismissed (persisted in localStorage, so it doesn't
//   nag again on every page load once closed)
import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";

const DISMISS_KEY = "daawatey_install_banner_dismissed";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.daawatey.app";

function isAndroidBrowser() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export default function InstallAppBanner() {
  const t = useT();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    if (!isAndroidBrowser()) return;
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    setDismissed(false);
  }, []);

  if (dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="mb-4 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
      <Smartphone className="w-5 h-5 flex-shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{t.installAppTitle}</p>
        <p className="text-xs text-muted-foreground">{t.installAppSubtitle}</p>
      </div>
      <Button size="sm" className="flex-shrink-0" asChild>
        <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
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
