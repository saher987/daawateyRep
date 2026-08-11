import React from "react";
import { Link } from "react-router-dom";
import { useT } from "@/lib/i18n";

export default function Footer() {
  const t = useT();
  return (
    <footer className="bg-card border-t border-border mt-12" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <div className="flex flex-col gap-4 text-sm text-muted-foreground">
          <div className="flex flex-wrap gap-4 justify-center">
            <Link to="/terms" className="hover:text-primary transition-colors">
              {t.termsOfUse}
            </Link>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {t.footerRights} © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}