import React from "react";
import { Link } from "react-router-dom";
import { motion, MotionConfig } from "framer-motion";
import { Check, Download, Headphones, MessageCircle, Star, UserRound } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { usePublicLanguage, useT } from "@/lib/i18n";
import { fmt } from "@/lib/seating";
import samirDinaNames from "@/assets/home/samir-dina.jpg";
import logoUrl from "@/assets/logo.png";

// "ابدأ مناسبتك معنا" opens a WhatsApp chat with us: new events are set up
// by the team with the host, not self-serve.
const WHATSAPP_NUMBER = "972545641116";
const WHATSAPP_DISPLAY = "054-5641116";

// Where "مناسباتي" leads, by role — the same first tab BottomTabBar shows.
function myEventsPath(role) {
  if (role === "admin" || role === "manager") return "/events";
  if (role === "venue_owner") return "/venue-schedule";
  return "/my-event";
}

const STEPS = [1, 2, 3, 4, 5];
// Step numbers in the digits used in Israel (1, 2, 3…), in both languages.
const STEP_NUMERALS = ["1", "2", "3", "4", "5"];
// Real customers' words, shown as they wrote them (Arabic) in both UI
// languages. Add new ones here; the section lays them out in a grid.
const REVIEWS = [
  {
    id: "samir-dina",
    namesImage: samirDinaNames,
    couple: "سمير ودينا مجدلاني",
    author: "سامي مجدلاني",
    stars: 5,
    quote:
      "عنجد تجربة رائعة من كل النواحي! أكتر إشي ميّزهم هو المعاملة الحلوة والراقية، وسهولة التواصل معهم، وسرعتهم بالرد على أي سؤال أو طلب. كانوا دايمًا متعاونين ومهتمين بأدق التفاصيل، وساعدوني كتير بتنظيم معازيم العرس. شكرًا من القلب على الخدمة الرائعة، وبنصح فيهم بكل محبة!",
  },
];

const OCCASIONS = ["homeOcc1", "homeOcc2", "homeOcc3", "homeOcc4", "homeOcc5", "homeOcc6"];

// Fade-up used for the hero on load and for sections as they scroll in.
const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.8, delay, ease: [0.2, 0.7, 0.2, 1] },
});
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] },
});

// The app's first page ("/"), public: the story of an invitation, from the
// first "تشرّفونا" to the last "شكراً". Visitors get it with its own evening
// header (login + language); signed-in users get it inside AppLayout
// (HomeLayout in App.tsx), where login becomes "مناسباتي".
export default function Home() {
  const t = useT();
  const { user, isAuthenticated } = useAuth();
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t.homeWhatsappText)}`;
  const display = "home-display font-bold";

  return (
    <MotionConfig reducedMotion="user">
      <div dir={t.dir || "rtl"} className="bg-[#FBFAF7] text-[#171C26]">
        <section className="relative overflow-hidden text-white bg-[radial-gradient(120%_90%_at_50%_0%,#2A3245_0%,#171C26_60%)]">
          <span className="home-twinkle absolute top-[18%] right-[12%] w-1 h-1 rounded-full bg-[#E2C68F]" aria-hidden="true" />
          <span className="home-twinkle-2 absolute top-[30%] left-[9%] w-[3px] h-[3px] rounded-full bg-white" aria-hidden="true" />
          <span className="home-twinkle-3 absolute top-[12%] left-[30%] w-[3px] h-[3px] rounded-full bg-[#E2C68F]" aria-hidden="true" />
          <span className="home-twinkle absolute top-[44%] right-[28%] w-0.5 h-0.5 rounded-full bg-white" aria-hidden="true" />

          {!isAuthenticated && <GuestHeader t={t} />}

          <div className="relative max-w-3xl mx-auto px-5 pt-8 sm:pt-10 text-center flex flex-col items-center gap-4">
            {isAuthenticated && user?.first_name && (
              <motion.p {...rise(0)} className="text-[#E2C68F]">
                {fmt(t.homeHello, { name: user.first_name })}
              </motion.p>
            )}
            <motion.p {...rise(0)} className="text-sm tracking-wide text-[#E2C68F]">
              {t.homeEyebrow}
            </motion.p>
            <motion.h1 {...rise(0.15)} className={`${display} text-[36px] sm:text-[52px] leading-snug`}>
              {t.homeTitle1}
              <br />
              <span className="text-[#E2C68F]">{t.homeTitle2}</span>
            </motion.h1>
            <motion.p {...rise(0.3)} className="max-w-xl text-base sm:text-[17px] leading-8 text-[#D5D8DE]">
              {t.homeLead}
            </motion.p>
            <motion.div {...rise(0.45)} className="w-full sm:w-auto flex flex-col sm:flex-row flex-wrap justify-center gap-3 mt-1">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2.5 h-14 px-7 rounded-full bg-[#E2C68F] text-[#171C26] text-[17px] font-extrabold transition-transform hover:-translate-y-1"
              >
                <MessageCircle className="w-5 h-5" aria-hidden="true" />
                {t.homeStart}
              </a>
              {isAuthenticated ? (
                <Link
                  to={myEventsPath(user?.role)}
                  className="inline-flex items-center justify-center h-14 px-7 rounded-full border border-white/35 text-white font-semibold hover:bg-white/10"
                >
                  {t.homeMyEvents}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center h-14 px-7 rounded-full border border-white/35 text-white font-semibold hover:bg-white/10"
                >
                  {t.homeHaveAccount}
                </Link>
              )}
            </motion.div>
            <motion.p {...rise(0.6)} className="text-[13px] text-[#AEB3BD]">
              {t.homeReplyNote} <span dir="ltr">{WHATSAPP_DISPLAY}</span>
            </motion.p>
            <motion.div {...rise(0.6)}>
              <Envelope t={t} />
            </motion.div>
          </div>
        </section>

        <section id="how" className="max-w-6xl mx-auto px-5 pt-14 pb-6 scroll-mt-16">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <p className="text-sm font-bold text-[#8C6422] mb-1.5">{t.homeStepsKicker}</p>
              <h2 className={`${display} text-[27px] sm:text-4xl`}>{t.homeStepsTitle}</h2>
            </div>
            <p className="max-w-sm text-[15px] leading-7 text-[#4A4F59]">{t.homeStepsSub}</p>
          </div>
          <motion.div
            className="hidden sm:block h-0.5 mb-5 origin-right bg-gradient-to-l from-[#A3762A] to-[#A3762A]/15"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.6, ease: [0.2, 0.7, 0.2, 1] }}
          />
          <ol className="grid grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(190px,1fr))] sm:gap-4 border-s-2 border-[#E6D3AE] ps-4 sm:border-0 sm:ps-0">
            {STEPS.map((n, i) => (
              <motion.li key={n} {...reveal(i * 0.12)} className="flex flex-col gap-2 py-3.5 border-b border-[#EFE7DA] sm:border-0 sm:py-1">
                <span className={`${display} text-[40px] leading-none text-[#C9A86A]`} aria-hidden="true">
                  {STEP_NUMERALS[i]}
                </span>
                <span
                  className={`self-start text-xs font-bold rounded-full px-2.5 py-1 ${
                    n === 5 ? "bg-[#171C26] text-white" : "bg-[#F3E8D3] text-[#5E4216]"
                  }`}
                >
                  {t[`homeStep${n}Tag`]}
                </span>
                <h3 className="text-lg font-extrabold">{t[`homeStep${n}Title`]}</h3>
                <p className="text-sm leading-7 text-[#3A404C]">{t[`homeStep${n}Text`]}</p>
              </motion.li>
            ))}
          </ol>
          <motion.div {...reveal(0.2)} className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] bg-[#171C26] text-white px-5 py-4">
            <span className="shrink-0 w-11 h-11 rounded-full bg-[#E2C68F]/20 flex items-center justify-center">
              <Headphones className="w-5 h-5 text-[#E2C68F]" aria-hidden="true" />
            </span>
            <span className="flex-[1_1_240px]">
              <strong className="block text-[17px]">{t.homeSupportTitle}</strong>
              <span className="text-sm text-[#D5D8DE]">{t.homeSupportText}</span>
            </span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center h-11 px-5 rounded-full bg-[#E2C68F] text-[#171C26] text-sm font-extrabold"
            >
              {t.homeSupportCta}
            </a>
          </motion.div>
        </section>

        <section id="sides" className="max-w-6xl mx-auto px-5 py-10 scroll-mt-16">
          <motion.div {...reveal()} className="flex flex-wrap rounded-[28px] overflow-hidden border border-[#EFE7DA]">
            <div className="flex-[1_1_320px] bg-white px-6 sm:px-7 py-8 flex flex-col gap-3.5">
              <p className="text-sm font-bold text-[#8C6422]">{t.homeGuestKicker}</p>
              <h2 className={`${display} text-[27px] sm:text-[30px]`}>{t.homeGuestTitle}</h2>
              <ul className="flex flex-col gap-2.5 text-[15px]">
                {["homeGuest1", "homeGuest2", "homeGuest3", "homeGuest4"].map((k) => (
                  <Point key={k} text={t[k]} />
                ))}
              </ul>
              <div className="mt-1 flex gap-2.5 items-start rounded-2xl bg-[#FBF7EF] border border-[#EFE7DA] p-3 text-[15px]">
                <span className="shrink-0 w-[22px] h-[22px] rounded-full bg-[#8C6422] flex items-center justify-center">
                  <Download className="w-3 h-3 text-white" aria-hidden="true" />
                </span>
                <span>
                  <strong>{t.homeGuestAppTitle}</strong> {t.homeGuestAppText}
                </span>
              </div>
            </div>
            <div className="flex-[1_1_320px] bg-[#171C26] text-white px-6 sm:px-7 py-8 flex flex-col gap-3.5">
              <p className="text-sm font-bold text-[#E2C68F]">{t.homeHostKicker}</p>
              <h2 className={`${display} text-[27px] sm:text-[30px]`}>{t.homeHostTitle}</h2>
              <ul className="flex flex-col gap-2.5 text-[15px] text-[#E6E8EC]">
                {["homeHost1", "homeHost2", "homeHost3", "homeHost4"].map((k) => (
                  <Point key={k} text={t[k]} dark />
                ))}
              </ul>
            </div>
          </motion.div>
        </section>

        <section id="reviews" className="max-w-6xl mx-auto px-5 pt-4 pb-12 scroll-mt-16">
          <div className="text-center mb-6">
            <p className="text-sm font-bold text-[#8C6422] mb-1.5">{t.homeReviewsKicker}</p>
            <h2 className={`${display} text-[27px] sm:text-[32px]`}>{t.homeReviewsTitle}</h2>
          </div>
          <div className={`grid gap-5 ${REVIEWS.length > 1 ? "md:grid-cols-2" : "max-w-2xl mx-auto"}`}>
            {REVIEWS.map((r) => (
              <motion.figure
                key={r.id}
                {...reveal()}
                className="bg-white border border-[#EFE7DA] rounded-[28px] overflow-hidden shadow-[0_12px_40px_rgba(140,100,34,0.08)]"
              >
                <div className="bg-[#F5F2E9] px-6 pt-5 pb-3 flex justify-center">
                  <img src={r.namesImage} alt={r.couple} className="h-16 sm:h-20 w-auto" loading="lazy" />
                </div>
                <div className="px-6 sm:px-8 pt-4 pb-7 flex flex-col items-center text-center gap-3">
                  <div className="flex gap-1" role="img" aria-label={fmt(t.homeReviewStars, { n: r.stars })}>
                    {Array.from({ length: r.stars }, (_, i) => (
                      <Star key={i} className="w-5 h-5 fill-[#E2A93B] text-[#E2A93B]" aria-hidden="true" />
                    ))}
                  </div>
                  <blockquote dir="rtl" lang="ar" className="text-[16px] sm:text-[17px] leading-8 text-[#2A2F3A]">
                    «{r.quote}»
                  </blockquote>
                  <figcaption className="flex flex-col items-center gap-0.5">
                    <strong className="text-[#171C26]">{r.author}</strong>
                    <span className="text-sm text-[#5E4216]">{fmt(t.homeReviewWedding, { names: r.couple })}</span>
                  </figcaption>
                </div>
              </motion.figure>
            ))}
          </div>
        </section>

        <section id="occasions" className="max-w-6xl mx-auto px-5 pt-4 pb-12 text-center scroll-mt-16">
          <h2 className={`${display} text-[27px] sm:text-[32px] mb-5`}>{t.homeOccasionsTitle}</h2>
          <ul className="flex flex-wrap justify-center gap-2.5">
            {OCCASIONS.map((k, i) => (
              <motion.li
                key={k}
                {...reveal(i * 0.06)}
                className="inline-flex items-center h-12 px-5 rounded-full bg-white border border-[#EFE7DA] font-bold"
              >
                {t[k]}
              </motion.li>
            ))}
          </ul>
        </section>

        <section className="bg-[#F3E8D3]">
          <motion.div {...reveal()} className="max-w-3xl mx-auto px-5 py-12 text-center flex flex-col items-center gap-3.5">
            <p className={`${display} text-[30px] sm:text-[40px] leading-snug`}>
              {t.homeClosing1} <span className="text-[#8C6422]">{t.homeClosing2}</span>
            </p>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2.5 h-14 px-7 rounded-full bg-[#171C26] text-white text-[17px] font-extrabold transition-transform hover:-translate-y-1"
            >
              <MessageCircle className="w-5 h-5 text-[#E2C68F]" aria-hidden="true" />
              {t.homeStart}
            </a>
            <p className="text-sm text-[#5E4216]">
              {t.homeWhatsappLabel} <span dir="ltr">{WHATSAPP_DISPLAY}</span>
            </p>
          </motion.div>
        </section>

        {/* Phone, visitors only: the main button stays one tap away. Signed-in
            users already have AppLayout's bottom tab bar there. */}
        {!isAuthenticated && (
          <div className="sm:hidden sticky bottom-0 z-20 px-4 pt-2.5 pb-[calc(10px+env(safe-area-inset-bottom))] bg-[#FBFAF7]/95 backdrop-blur border-t border-[#EFE7DA]">
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2.5 h-[52px] rounded-full bg-[#171C26] text-white font-extrabold"
            >
              <MessageCircle className="w-5 h-5 text-[#E2C68F]" aria-hidden="true" />
              {t.homeStart}
            </a>
          </div>
        )}

        <footer className="bg-[#171C26] text-[#AEB3BD] px-5 py-6 text-sm">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <img src={logoUrl} alt="" className="w-8 h-8" />
              <span className={`${display} text-[22px] text-white`}>دعوتي</span>
            </span>
            <span className="flex flex-wrap gap-x-5 gap-y-1.5">
              <Link to="/terms" className="hover:text-white">{t.termsOfUse}</Link>
              <Link to="/privacy" className="hover:text-white">{t.homePrivacy}</Link>
              <span>
                {t.homeWhatsappLabel} <span dir="ltr">{WHATSAPP_DISPLAY}</span>
              </span>
            </span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}

function Point({ text, dark = false }) {
  return (
    <li className="flex gap-2.5 items-start">
      <span
        className={`shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center ${
          dark ? "bg-[#E2C68F]/20 text-[#E2C68F]" : "bg-[#F3E8D3] text-[#8C6422]"
        }`}
      >
        <Check className="w-3 h-3" strokeWidth={3} aria-hidden="true" />
      </span>
      <span>{text}</span>
    </li>
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
    <header className="relative max-w-6xl mx-auto px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2" style={{ paddingTop: "max(16px, env(safe-area-inset-top))" }}>
      <Link to="/" className="flex items-center gap-2.5 flex-1 sm:flex-none">
        <img src={logoUrl} alt="" className="w-10 h-10 shrink-0" />
        <span className="home-display text-[26px] font-bold text-white">دعوتي</span>
      </Link>
      <nav className="hidden sm:flex flex-1 gap-6 text-[15px]">
        <a href="#how" className="py-2.5 text-[#D5D8DE] hover:text-white">{t.homeNavHow}</a>
        <a href="#sides" className="py-2.5 text-[#D5D8DE] hover:text-white">{t.homeNavSides}</a>
        <a href="#reviews" className="py-2.5 text-[#D5D8DE] hover:text-white">{t.homeNavReviews}</a>
        <a href="#occasions" className="py-2.5 text-[#D5D8DE] hover:text-white">{t.homeNavOccasions}</a>
      </nav>
      <div className="flex items-center gap-1 rounded-full border border-white/20 p-1">
        {[{ code: "ar", label: "ع" }, { code: "he", label: "ע" }].map(({ code, label }) => (
          <button
            key={code}
            type="button"
            onClick={() => switchLanguage(code)}
            aria-pressed={lang === code}
            aria-label={code === "ar" ? "العربية" : "עברית"}
            className={`w-9 h-9 text-xs font-semibold rounded-full ${lang === code ? "bg-[#E2C68F] text-[#171C26]" : "text-[#D5D8DE]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Link
        to="/login"
        className="inline-flex items-center gap-2 h-11 px-4 rounded-full border border-[#E2C68F]/60 text-[#E2C68F] text-sm font-bold"
      >
        <UserRound className="w-4 h-4" aria-hidden="true" />
        {t.homeLoginShort}
      </Link>
    </header>
  );
}

// A sample invitation card rising out of a sealed envelope.
function Envelope({ t }) {
  return (
    <div className="relative w-[300px] h-[250px] mt-4" aria-hidden="true">
      <div className="home-rise absolute inset-x-[30px] top-0 h-[200px]">
        <div className="home-sway h-full rounded-[14px] bg-[#FBFAF7] text-[#171C26] shadow-[0_18px_40px_rgba(0,0,0,0.35)] px-4 py-[18px] flex flex-col items-center gap-1.5">
          <span className="text-[10px] tracking-wide text-[#8C6422]">{t.homeCardTo}</span>
          <span className="home-display text-[26px] font-bold">{t.homeCardNames}</span>
          <span className="w-[60px] h-px bg-[#A3762A]" />
          <span className="text-[11px] text-[#3A404C]">{t.homeCardDate}</span>
          <span className="mt-1 text-[11px] font-bold text-white bg-[#8C6422] rounded-full px-3 py-1">{t.homeCardYes}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[96px] rounded-b-[14px] rounded-t-md bg-gradient-to-b from-[#A3762A] to-[#8C6422]" />
      <div className="absolute inset-x-0 bottom-0 h-[96px] rounded-b-[14px] bg-[#7A5620] [clip-path:polygon(0_0,50%_55%,100%_0,100%_100%,0_100%)]" />
      <span className="home-display absolute left-1/2 bottom-[34px] -ml-[19px] w-[38px] h-[38px] rounded-full bg-[#5E1F2A] text-[#E2C68F] flex items-center justify-center font-bold shadow-[0_4px_10px_rgba(0,0,0,0.3)]">
        د
      </span>
    </div>
  );
}
