// Ported unchanged from the original Base44 app (zaffaf/src/components/AuthLayout.jsx) —
// the card-with-icon-header shell shared by Login/Register/ForgotPassword/etc there.
import React from "react";
import { Link } from "react-router-dom";
import AuthLanguageToggle from "./AuthLanguageToggle";

export default function AuthLayout({
  icon: Icon,
  title,
  subtitle,
  footer,
  children,
  dir = "rtl",
  lang,
  onLanguageChange,
}) {
  return (
    <div dir={dir} className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {lang && onLanguageChange && (
          <AuthLanguageToggle lang={lang} onChange={onLanguageChange} />
        )}
        {/* Back to the home page from login / register / password pages. */}
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2 min-h-11 px-2 rounded-xl">
            <img src="https://media.base44.com/images/public/69c3f1e5c5d379e64b05a015/168b83f89_daawateylogo.png" alt="" className="w-8 h-8 rounded-lg object-cover" />
            <span className="font-display text-xl font-bold text-foreground">دعوتي</span>
          </Link>
        </div>
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4">
            <Icon className="w-7 h-7 text-primary-foreground" aria-hidden="true" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer && (
          <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        )}
      </div>
    </div>
  );
}
