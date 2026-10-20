import React, { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { useToast } from "@/components/ui/use-toast";
import { useT } from "@/lib/i18n";
import { BUILD_LABEL, formatDiagnostics } from "@/lib/diagnostics";

// "الإصدار 1.6 (43)" — the installed app's version and build number, read
// from the native app (CFBundleShortVersionString/CFBundleVersion on iOS,
// versionName/versionCode on Android). On the web there is no installed
// version, so it shows the web build's CI run number instead. Tapping copies
// the full diagnostics, for bug reports.
export default function AppVersion({ className = "" }) {
  const t = useT();
  const { toast } = useToast();
  const [native, setNative] = useState(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    CapacitorApp.getInfo()
      .then((info) => setNative(`${info.version} (${info.build})`))
      .catch(() => {});
  }, []);

  const label = native ? `${t.appVersion} ${native}` : `${t.appVersion} web ${BUILD_LABEL}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${label}\n${formatDiagnostics()}`);
      toast({ title: t.versionCopied });
    } catch {
      // Clipboard can be unavailable (permissions, old WebView) — the label
      // is still on screen to read off.
    }
  };

  return (
    <button type="button" onClick={copy} dir="ltr" className={`text-[11px] text-muted-foreground/70 hover:text-muted-foreground ${className}`}>
      {label}
    </button>
  );
}
