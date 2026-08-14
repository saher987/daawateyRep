// Language switch for the pre-auth pages (Login/Register/ForgotPassword/
// ResetPassword) — mounted once in AuthLayout.jsx so every page that uses
// it gets it for free. Shows each language's own name in its own script
// (not translated into the current UI language) — a Hebrew reader looking
// at an Arabic-language screen still needs to recognize "עברית" written in
// Hebrew to switch to it, not "העברית" transliterated into Arabic. Same
// reasoning most apps use for their own language pickers.
import React from "react";

const LANGUAGES = [
  { code: "ar", label: "العربية" },
  { code: "he", label: "עברית" },
];

export default function AuthLanguageToggle({ lang, onChange }) {
  return (
    <div className="flex justify-center gap-1 mb-6" role="group" aria-label="Language / اللغة / שפה">
      {LANGUAGES.map(({ code, label }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={active}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              active
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
