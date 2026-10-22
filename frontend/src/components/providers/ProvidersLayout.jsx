import React, { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { usePublicLanguage, useT } from "@/lib/i18n";
import AppLayout from "@/components/layout/AppLayout";
import InstallAppBanner from "@/components/shared/InstallAppBanner";
import { Button } from "@/components/ui/button";

const Spinner = () => (
  <div className="flex justify-center py-12">
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  </div>
);

// The providers directory is public — a provider's page is a link people
// share on WhatsApp. Signed-in users get it inside the normal app shell
// (sidebar + bottom tabs); anyone else gets this slim header instead of
// being bounced to /login.
export default function ProvidersLayout() {
  const { isAuthenticated, isLoadingAuth } = useAuth();
  if (isLoadingAuth) {
    return <div className="fixed inset-0 flex items-center justify-center bg-background"><Spinner /></div>;
  }
  if (isAuthenticated) return <AppLayout />;
  return <GuestShell />;
}

function GuestShell() {
  const t = useT();
  const [lang, setLang] = usePublicLanguage();
  const switchLanguage = (code) => {
    if (code === lang) return;
    setLang(code);
    // I18nProvider reads the stored language once per render of the app
    // root — a reload is the simplest way to apply it everywhere.
    window.location.reload();
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-3xl mx-auto px-4 min-h-14 flex items-center gap-3">
          <Link to="/providers" className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69c3f1e5c5d379e64b05a015/168b83f89_daawateylogo.png" alt="Daawatey Logo" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-display font-bold text-foreground">دعوتي</span>
          </Link>
          <div className="flex-1" />
          <div className="flex items-center gap-1 bg-muted rounded-xl p-1">
            {[{ code: "ar", label: "ع" }, { code: "he", label: "ע" }].map(({ code, label }) => (
              <button
                key={code}
                type="button"
                onClick={() => switchLanguage(code)}
                aria-pressed={lang === code}
                className={`w-8 py-1 text-xs font-semibold rounded-lg ${lang === code ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button asChild size="sm" className="rounded-xl">
            <Link to="/login">{t.login}</Link>
          </Button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto p-4 pb-12">
        <InstallAppBanner />
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
