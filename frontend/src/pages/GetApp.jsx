// Dedicated instant-redirect landing page for the QR codes printed on
// physical wedding materials (entrance signage, envelopes, table cards)
// — see InstallAppBanner.jsx's own docstring for why this exists
// separately from that dismissible banner. A banner can be missed or
// closed by accident; for a one-shot physical QR code scanned once at a
// real event, that risk isn't worth it. This page instead redirects
// straight to the matching app store the instant it detects a phone's
// OS, with nothing on screen to notice or dismiss.
//
// Not lazy-loaded (see App.tsx) — same reasoning as Login.jsx: this is
// on the critical "first thing a guest sees" path, and an extra async
// chunk fetch before the redirect logic even runs would undercut the
// whole point of being instant.
//
// Desktop/undetected visitors (no phone OS in the user agent) fall
// through to a manual-choice screen instead of redirecting — there's
// nothing to install on a desktop, so guessing would just be wrong.
import { useEffect, useState } from 'react'
import { Loader2, Smartphone } from 'lucide-react'
import { translations, usePublicLanguage } from '../lib/i18n'
import { PLAY_STORE_URL, APP_STORE_URL, detectMobilePlatform } from '../lib/appStoreLinks'

export default function GetApp() {
  const [lang, setLang] = usePublicLanguage()
  const t = translations[lang]
  const [platform] = useState(() => detectMobilePlatform())

  useEffect(() => {
    if (platform === 'ios') {
      window.location.replace(APP_STORE_URL)
    } else if (platform === 'android') {
      window.location.replace(PLAY_STORE_URL)
    }
  }, [platform])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-6 text-center bg-background" dir={t.dir}>
      {platform ? (
        <>
          <Loader2 className="w-9 h-9 animate-spin text-primary" />
          <p className="text-muted-foreground">{t.getAppRedirecting}</p>
        </>
      ) : (
        <>
          <Smartphone className="w-10 h-10 text-primary" />
          <p className="font-medium max-w-xs">{t.getAppDesktopHint}</p>
          <div className="flex gap-4">
            <a href={APP_STORE_URL} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
              App Store
            </a>
            <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="text-primary underline text-sm">
              Google Play
            </a>
          </div>
        </>
      )}

      {/* Same language toggle Login.jsx exposes, in case a desktop
          visitor lands here directly and wants the hint in the other
          language before deciding what to do next. */}
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => setLang('ar')}
          className={`text-xs px-2 py-1 rounded ${lang === 'ar' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
        >
          العربية
        </button>
        <button
          type="button"
          onClick={() => setLang('he')}
          className={`text-xs px-2 py-1 rounded ${lang === 'he' ? 'font-semibold text-primary' : 'text-muted-foreground'}`}
        >
          עברית
        </button>
      </div>
    </div>
  )
}
