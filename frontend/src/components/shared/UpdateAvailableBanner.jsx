// Native Android only: nudges someone running an older bundled build
// toward the Play Store update. Capacitor bundles the web build into the
// APK at build time (capacitor.config.ts has no server.url, so there's no
// live-reload from daawatey.com) — an installed app keeps running whatever
// JS shipped at its last update regardless of what's since been deployed
// to the backend/web, and Play Store's own auto-update can lag or be
// disabled by the user. GET /api/app-version returns the versionCode of
// the most recently uploaded build (an env var bumped by hand after each
// Play Console upload — see BUSINESS_LOGIC.md); comparing it against this
// install's own build number (CapacitorApp.getInfo().build) is the only
// way the app itself can know it's behind.
//
// Same dismissible-banner pattern as InstallAppBanner.jsx, but keyed per
// version: dismissing this update doesn't suppress the *next* one.
import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { base44 } from "@/api/base44Client";

const DISMISS_KEY_PREFIX = "daawatey_update_dismissed_";
const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.daawatey.app";

export default function UpdateAvailableBanner() {
  const t = useT();
  const [latestVersion, setLatestVersion] = useState(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
    (async () => {
      try {
        const [info, versionInfo] = await Promise.all([
          CapacitorApp.getInfo(),
          base44.app.getVersionInfo(),
        ]);
        const latest = versionInfo?.android_version_code;
        const current = parseInt(info.build, 10);
        if (!latest || !Number.isFinite(current) || latest <= current) return;
        if (localStorage.getItem(DISMISS_KEY_PREFIX + latest) === "1") return;
        setLatestVersion(latest);
      } catch {
        // Never block the app over this — same "bonus channel" reasoning
        // as InstallAppBanner/push notifications.
      }
    })();
  }, []);

  if (!latestVersion) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY_PREFIX + latestVersion, "1");
    setLatestVersion(null);
  };

  return (
    <div className="mb-4 flex items-center gap-3 bg-primary/10 border border-primary/30 rounded-xl px-4 py-3">
      <Download className="w-5 h-5 flex-shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{t.updateAppTitle}</p>
        <p className="text-xs text-muted-foreground">{t.updateAppSubtitle}</p>
      </div>
      <Button size="sm" className="flex-shrink-0" asChild>
        <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer">
          {t.updateAppCta}
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
