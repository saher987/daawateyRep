import React from "react";
import { Link } from "react-router-dom";
import { Bell, Check, CircleDot, Heart, MessageCircle, QrCode, Send } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { usePublicLanguage, useT } from "@/lib/i18n";
import { fmt } from "@/lib/seating";

// "أنشئ مناسبتك" opens a WhatsApp chat with us: new events are set up by
// the team, not self-serve (same as RequestEventDialog's flow for users).
const WHATSAPP_NUMBER = "972545641116";
const WHATSAPP_DISPLAY = "054-5641116";
const LOGO = "https://media.base44.com/images/public/69c3f1e5c5d379e64b05a015/168b83f89_daawateylogo.png";

// Where "مناسباتي" leads, by role — the same first tab BottomTabBar shows.
function myEventsPath(role) {
  if (role === "admin" || role === "manager") return "/events";
  if (role === "venue_owner") return "/venue-schedule";
  return "/my-event";
}

const FEATURES = [
  { icon: Send, title: "homeF1Title", text: "homeF1Text" },
  { icon: Check, title: "homeF2Title", text: "homeF2Text" },
  { icon: Bell, title: "homeF3Title", text: "homeF3Text" },
  { icon: CircleDot, title: "homeF4Title", text: "homeF4Text" },
  { icon: QrCode, title: "homeF5Title", text: "homeF5Text" },
  { icon: Heart, title: "homeF6Title", text: "homeF6Text" },
];

const STEPS = [
  { title: "homeS1Title", text: "homeS1Text" },
  { title: "homeS2Title", text: "homeS2Text" },
  { title: "homeS3Title", text: "homeS3Text" },
];

// The app's first page ("/"), public. Visitors get it with its own header
// (login button + language switch); signed-in users get it inside
// AppLayout (HomeLayout in App.tsx), where "login" becomes "my events".
export default function Home() {
  const t = useT();
  const { user, isAuthenticated } = useAuth();
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.homeWhatsappText)}`;

  const createButton = (className = "") => (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center justify-center gap-2.5 h-14 px-6 rounded-2xl bg-[#8C6422] text-white text-[17px] font-bold shadow-[0_8px_20px_rgba(140,100,34,0.25)] hover:bg-[#7A5620] ${className}`}
    >
      <MessageCircle className="w-5 h-5" aria-hidden="true" />
      {t.homeCreate}
    </a>
  );

  return (
    <div dir={t.dir || "rtl"} className="bg-[#FBFAF7] text-[#171C26]">
      {!isAuthenticated && <GuestHeader t={t} />}

      <section className="bg-gradient-to-b from-[#F6F1E7] to-[#FBFAF7]">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 pt-6 sm:pt-10 pb-12 flex flex-wrap gap-6 items-stretch">
          <div className="flex-[999_1_420px] min-w-0 bg-white border border-[#EFE7DA] rounded-[28px] p-6 sm:p-8 flex flex-col gap-4 shadow-[0_12px_40px_rgba(140,100,34,0.08)]">
            <span className="self-start text-[13px] font-bold text-[#5E4216] bg-[#F3E8D3] border border-[#E6D3AE] rounded-full px-3.5 py-1.5">
              {t.homeBadge}
            </span>
            {isAuthenticated && user?.first_name && (
              <p className="text-base font-bold text-[#8C6422]">{fmt(t.homeHello, { name: user.first_name })}</p>
            )}
            <h1 className="text-3xl sm:text-[44px] leading-snug font-extrabold">
              {t.homeTitle1}
              <br />
              <span className="text-[#A3762A]">{t.homeTitle2}</span>
            </h1>
            <p className="text-lg font-bold">{t.homeLead}</p>
            <p className="text-base leading-8 text-[#3A404C]">{t.homeBody}</p>
            <div className="flex flex-wrap gap-3 mt-1">
              {createButton("flex-[1_1_200px]")}
              {isAuthenticated ? (
                <Link
                  to={myEventsPath(user?.role)}
                  className="flex-[1_1_200px] flex items-center justify-center h-14 rounded-2xl bg-[#171C26] text-white text-base font-bold hover:bg-[#232A38]"
                >
                  {t.homeMyEvents}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="flex-[1_1_200px] flex items-center justify-center h-14 rounded-2xl border-[1.5px] border-[#D8CFBF] bg-white text-base font-bold hover:bg-[#FBF7EF]"
                >
                  {t.login}
                </Link>
              )}
            </div>
            <p className="text-[13px] text-[#4A4F59] flex items-center gap-1.5 flex-wrap">
              <MessageCircle className="w-4 h-4 text-[#1E7D4F]" aria-hidden="true" />
              {t.homeWhatsappNote} <span dir="ltr">{WHATSAPP_DISPLAY}</span>
            </p>
          </div>

          <DemoBoard t={t} />
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-5 py-12 scroll-mt-16">
        <div className="text-center flex flex-col gap-2 mb-7">
          <h2 className="text-2xl sm:text-[32px] font-extrabold">
            {t.homeFeaturesTitle1} <span className="text-[#A3762A]">{t.homeFeaturesTitle2}</span>
          </h2>
          <p className="text-[#4A4F59]">{t.homeFeaturesSub}</p>
        </div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="bg-white border border-[#EFE7DA] rounded-[22px] p-5 flex flex-col gap-2">
              <span className="w-11 h-11 rounded-xl bg-[#F3E8D3] flex items-center justify-center">
                <Icon className="w-5 h-5 text-[#8C6422]" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-extrabold">{t[title]}</h3>
              <p className="text-[15px] leading-7 text-[#3A404C]">{t[text]}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how" className="max-w-6xl mx-auto px-4 sm:px-5 pb-12 scroll-mt-16">
        <div className="bg-gradient-to-b from-white to-[#F6F1E7] border border-[#EFE7DA] rounded-[28px] px-5 sm:px-6 py-9 flex flex-col gap-6">
          <div className="text-center flex flex-col gap-2">
            <h2 className="text-2xl sm:text-[32px] font-extrabold">
              {t.homeHowTitle1} <span className="text-[#A3762A]">{t.homeHowTitle2}</span>
            </h2>
            <p className="text-[#4A4F59]">{t.homeHowSub}</p>
          </div>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ title, text }, i) => (
              <div key={title} className="bg-white border border-[#EFE7DA] rounded-[22px] p-5 flex flex-col gap-2">
                <span
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-extrabold ${
                    i === STEPS.length - 1 ? "bg-[#8C6422] text-white" : "bg-[#171C26] text-[#E2C68F]"
                  }`}
                >
                  {i + 1}
                </span>
                <h3 className="text-lg font-extrabold">{t[title]}</h3>
                <p className="text-[15px] leading-7 text-[#3A404C]">{t[text]}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-5 pb-12">
        <div className="bg-[#171C26] text-white rounded-[28px] px-6 py-9 flex flex-wrap items-center justify-between gap-5">
          <div className="flex flex-col gap-1.5 flex-[1_1_260px]">
            <h2 className="text-2xl sm:text-[28px] font-extrabold">{t.homeCtaTitle}</h2>
            <p className="text-[#D5D8DE]">{t.homeCtaSub}</p>
          </div>
          {createButton("flex-[0_1_260px] w-full bg-[#A3762A] hover:bg-[#8C6422]")}
        </div>
      </section>

      <footer className="border-t border-[#EFE7DA] px-5 py-6 text-center text-sm text-[#4A4F59] flex flex-wrap justify-center gap-x-5 gap-y-1.5">
        <strong className="text-[#171C26]">دعوتي</strong>
        <span>
          {t.homeWhatsappLabel}: <span dir="ltr">{WHATSAPP_DISPLAY}</span>
        </span>
        <Link to="/terms" className="underline">{t.termsOfUse}</Link>
        <Link to="/privacy" className="underline">{t.homePrivacy}</Link>
      </footer>
    </div>
  );
}

function GuestHeader({ t }) {
  const [lang, setLang] = usePublicLanguage();
  const switchLanguage = (code) => {
    if (code === lang) return;
    setLang(code);
    // Same as ProvidersLayout: I18nProvider reads the stored language once.
    window.location.reload();
  };
  return (
    <header className="sticky top-0 z-30 bg-[#F6F1E7]/90 backdrop-blur-lg border-b border-[#EFE7DA]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-5 min-h-16 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link to="/" className="flex items-center gap-2">
          <img src={LOGO} alt="" className="w-9 h-9 rounded-xl object-cover" />
          <span className="text-xl font-extrabold">دعوتي</span>
        </Link>
        <nav className="hidden sm:flex items-center gap-5 text-[15px] font-semibold">
          <a href="#features" className="py-2.5 hover:text-[#8C6422]">{t.homeNavFeatures}</a>
          <a href="#how" className="py-2.5 hover:text-[#8C6422]">{t.homeNavHow}</a>
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-1 bg-white/70 rounded-xl p-1">
          {[{ code: "ar", label: "ع" }, { code: "he", label: "ע" }].map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => switchLanguage(code)}
              aria-pressed={lang === code}
              aria-label={code === "ar" ? "العربية" : "עברית"}
              className={`w-8 h-8 text-xs font-semibold rounded-lg ${lang === code ? "bg-[#8C6422] text-white" : "text-[#4A4F59]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <Link to="/login" className="flex items-center h-11 px-4 rounded-xl bg-[#171C26] text-white text-sm font-bold">
          {t.login}
        </Link>
      </div>
    </header>
  );
}

// A sample event board beside the hero, labelled as an example — shows
// what the host follows after the invitations go out.
function DemoBoard({ t }) {
  return (
    <div className="flex-[1_1_320px] min-w-0 bg-white border border-[#EFE7DA] rounded-[28px] p-4 sm:p-5 flex flex-col gap-3.5 shadow-[0_12px_40px_rgba(23,28,38,0.08)]" aria-label={t.homeDemoBoard}>
      <div className="flex items-center justify-between bg-[#FBF7EF] border border-[#EFE7DA] rounded-2xl px-3.5 py-2.5 text-sm">
        <span className="text-[#4A4F59]">{t.homeDemoBoard}</span>
        <span className="flex items-center gap-1.5 font-bold">
          <span className="w-2 h-2 rounded-full bg-[#1E7D4F]" />
          {t.homeDemoLive}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2.5 border border-[#EFE7DA] rounded-2xl p-3.5">
        <div className="flex items-center gap-2.5">
          <span className="w-11 h-11 rounded-xl bg-[#F3E8D3] flex items-center justify-center">
            <Heart className="w-5 h-5 text-[#8C6422]" aria-hidden="true" />
          </span>
          <span className="flex flex-col">
            <strong>{t.homeDemoEvent}</strong>
            <span className="text-[13px] text-[#4A4F59]">{t.homeDemoIn}</span>
          </span>
        </div>
        <span className="text-[13px] font-bold text-[#1E6B45] bg-[#E6F2EC] rounded-full px-3 py-1.5 whitespace-nowrap">{t.homeDemoConfirmed}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-[#FBF7EF] rounded-2xl p-4 text-center">
          <div className="text-3xl font-extrabold text-[#8C6422]">412</div>
          <div className="text-[13px] text-[#4A4F59]">{t.homeDemoSent}</div>
        </div>
        <div className="bg-[#F1F3F7] rounded-2xl p-4 text-center">
          <div className="text-3xl font-extrabold">180</div>
          <div className="text-[13px] text-[#4A4F59]">{t.homeDemoInvited}</div>
        </div>
      </div>
      <div className="bg-[#FBF7EF] rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-[#4A4F59]">{t.homeDemoRate}</span>
          <span className="text-[28px] font-extrabold">79%</span>
        </div>
        <div className="h-2 rounded-full bg-[#EFE7DA]">
          <div className="h-2 rounded-full bg-[#A3762A] w-[79%]" />
        </div>
        <div className="text-xs text-[#4A4F59] text-end">{t.homeDemoNoReply}</div>
      </div>
      <div className="grid grid-cols-2 gap-2.5" aria-hidden="true">
        <span className="flex items-center justify-center gap-2 h-11 rounded-2xl bg-[#171C26] text-white text-sm font-bold">
          <CircleDot className="w-4 h-4 text-[#E2C68F]" />
          {t.homeDemoTables}
        </span>
        <span className="flex items-center justify-center gap-2 h-11 rounded-2xl border border-[#D8CFBF] text-sm font-bold">
          <Bell className="w-4 h-4" />
          {t.homeDemoRemind}
        </span>
      </div>
    </div>
  );
}
