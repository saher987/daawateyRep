const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const fa = require("react-icons/fa");

const NAVY = "171C26", NAVY2 = "232A38", GOLD = "B07D2C", GOLD_L = "E8C98A", TINT = "F8F3EA",
  INK = "1E2330", MUTED = "5F6675", WHITE = "FFFFFF", GREEN = "2E8B57", RED = "B5473A", AMBER = "C98A1B",
  LINE = "E3DCCF", GREEN_T = "E6F2EB", RED_T = "F7E6E3", AMBER_T = "FBF0DA";
const FONT = "Arial";
const W = 13.33;

const iconCache = {};
async function icon(name, color) {
  const k = name + color;
  if (iconCache[k]) return iconCache[k];
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(fa[name], { color: "#" + color, size: 256 }));
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer();
  return (iconCache[k] = "image/png;base64," + buf.toString("base64"));
}

function T(slide, text, o) {
  slide.addText(text, Object.assign({ fontFace: FONT, rtlMode: true, align: "right", lang: "ar-SA", isTextBox: true, color: INK, valign: "top" }, o));
}
const C = (slide, text, o) => T(slide, text, Object.assign({ align: "center" }, o));

async function iconCircle(slide, name, x, y, d, bg, fg) {
  slide.addShape("ellipse", { x, y, w: d, h: d, fill: { color: bg }, line: { color: bg } });
  const p = d * 0.26;
  slide.addImage({ data: await icon(name, fg), x: x + p, y: y + p, w: d - 2 * p, h: d - 2 * p });
}

function title(slide, text, sub) {
  T(slide, text, { x: 0.6, y: 0.4, w: 12.13, h: 0.8, fontSize: 34, bold: true, color: NAVY, margin: 0 });
  if (sub) T(slide, sub, { x: 0.6, y: 1.2, w: 12.13, h: 0.45, fontSize: 17, color: MUTED, margin: 0 });
}

function card(slide, x, y, w, h, fill, noShadow) {
  const o = { x, y, w, h, rectRadius: 0.15, fill: { color: fill || TINT }, line: { color: fill || TINT } };
  if (!noShadow) o.shadow = { type: "outer", color: "000000", opacity: 0.12, blur: 8, offset: 2, angle: 90 };
  slide.addShape("roundRect", o);
}

function stepBadge(slide, n, x, y) {
  slide.addShape("ellipse", { x, y, w: 0.55, h: 0.55, fill: { color: GOLD }, line: { color: GOLD } });
  slide.addText(String(n), { x, y, w: 0.55, h: 0.55, fontSize: 18, bold: true, color: WHITE, align: "center", valign: "middle", fontFace: FONT, isTextBox: true, margin: 0 });
}

// Phone mock; returns inner screen rect
function phone(slide, x, y, w, h) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.35, fill: { color: NAVY }, line: { color: NAVY },
    shadow: { type: "outer", color: "000000", opacity: 0.25, blur: 12, offset: 4, angle: 90 } });
  const s = { x: x + 0.13, y: y + 0.38, w: w - 0.26, h: h - 0.62 };
  slide.addShape("roundRect", { ...s, rectRadius: 0.18, fill: { color: WHITE }, line: { color: WHITE } });
  slide.addShape("roundRect", { x: x + w / 2 - 0.45, y: y + 0.14, w: 0.9, h: 0.1, rectRadius: 0.05, fill: { color: NAVY2 }, line: { color: NAVY2 } });
  return s;
}

function pill(slide, text, x, y, w, h, bg, fg, fs) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: h / 2, fill: { color: bg }, line: { color: bg } });
  slide.addText(text, { x, y, w, h, fontSize: fs || 11, bold: true, color: fg, align: "center", valign: "middle", fontFace: FONT, rtlMode: true, lang: "ar-SA", isTextBox: true, margin: 0 });
}

(async () => {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";
  pres.rtlMode = true;
  pres.lang = "ar-SA";
  pres.title = "دعوتي – طريقة استخدام التطبيق";

  // 1. Title
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addShape("ellipse", { x: 9.2, y: -1.6, w: 6, h: 6, fill: { color: NAVY2 }, line: { color: NAVY2 } });
    s.addShape("ellipse", { x: -1.8, y: 4.6, w: 4.5, h: 4.5, fill: { color: NAVY2 }, line: { color: NAVY2 } });
    await iconCircle(s, "FaEnvelopeOpenText", 11.2, 0.55, 1.2, GOLD, WHITE);
    T(s, "دعوتي · Daawatey", { x: 0.8, y: 2.0, w: 11.7, h: 0.6, fontSize: 24, color: GOLD_L, bold: true, margin: 0 });
    T(s, "كيف نستخدم تطبيق دعوتي؟", { x: 0.8, y: 2.7, w: 11.7, h: 1.1, fontSize: 50, bold: true, color: WHITE, margin: 0 });
    T(s, "من طلب فتح المناسبة… حتى تأكيد حضور آخر ضيف", { x: 0.8, y: 3.9, w: 11.7, h: 0.6, fontSize: 22, color: "C9CFDA", margin: 0 });
    T(s, "مقدَّم من: [اسم القاعة]", { x: 0.8, y: 6.3, w: 11.7, h: 0.5, fontSize: 18, color: GOLD_L, margin: 0 });
    s.addNotes("أهلاً وسهلاً. اليوم سنتعرف على تطبيق دعوتي، الذي ستديرون من خلاله دعوات مناسبتكم عندنا في القاعة. (قبل العرض: استبدلوا [اسم القاعة] باسم قاعتكم.)");
  }

  // 2. Journey overview
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "الصورة الكاملة: 5 خطوات", "هكذا تسير المناسبة في التطبيق من البداية حتى النهاية");
    const steps = [
      { ic: "FaClipboardList", h: "طلب فتح مناسبة", d: "صاحب المناسبة يطلب ويسلّم التفاصيل وقائمة المدعوين" },
      { ic: "FaImage", h: "تجهيز المناسبة", d: "إدخال التفاصيل، صورة الدعوة المصممة، والمدعوين" },
      { ic: "FaSms", h: "إرسال الدعوات", d: "رسالة SMS مع رابط شخصي لكل مدعو" },
      { ic: "FaCheckCircle", h: "المدعو يرد", d: "يفتح الدعوة ويؤكد: حاضر أو معتذر" },
      { ic: "FaChartPie", h: "متابعة وتقرير", d: "إحصائيات مباشرة وتصدير القائمة إلى Excel" },
    ];
    const w = 2.2, gap = 0.28, y = 2.3;
    const total = steps.length * w + (steps.length - 1) * gap;
    const x0 = (W - total) / 2;
    for (let i = 0; i < steps.length; i++) {
      const x = W - x0 - w - i * (w + gap);
      card(s, x, y, w, 4.2);
      stepBadge(s, i + 1, x + w / 2 - 0.275, y - 0.27);
      await iconCircle(s, steps[i].ic, x + w / 2 - 0.6, y + 0.55, 1.2, i === 3 ? GOLD : NAVY, i === 3 ? WHITE : GOLD_L);
      C(s, steps[i].h, { x: x + 0.05, y: y + 2.0, w: w - 0.1, h: 0.5, fontSize: 16, bold: true, color: NAVY, margin: 0 });
      C(s, steps[i].d, { x: x + 0.15, y: y + 2.65, w: w - 0.3, h: 1.4, fontSize: 14, color: MUTED, margin: 0 });
      if (i < steps.length - 1) s.addImage({ data: await icon("FaChevronLeft", GOLD), x: x - gap / 2 - 0.11, y: y + 1.05, w: 0.22, h: 0.22 });
    }
    s.addNotes("هذه نظرة عامة على المسار كله. في الشرائح التالية سنمر على كل خطوة بالتفصيل.");
  }

  // 2a. Login with phone number
  {
    const s = pres.addSlide();
    s.background = { color: TINT };
    title(s, "تسجيل الدخول: رقم الهاتف فقط", "بدون كلمة مرور وبدون بريد إلكتروني – خطوتان وتدخل");
    const ph = [{ x: 3.75 }, { x: 0.6 }];
    // screen 1: phone number
    let sc = phone(s, ph[0].x, 1.8, 2.85, 5.45);
    C(s, "مرحباً بك في دعوتي", { x: sc.x, y: sc.y + 0.25, w: sc.w, h: 0.4, fontSize: 13, bold: true, color: NAVY, margin: 0 });
    await iconCircle(s, "FaPhoneAlt", sc.x + sc.w / 2 - 0.35, sc.y + 0.8, 0.7, GOLD, WHITE);
    C(s, "التحقق من رقم هاتفك", { x: sc.x, y: sc.y + 1.65, w: sc.w, h: 0.35, fontSize: 11, bold: true, color: INK, margin: 0 });
    s.addShape("roundRect", { x: sc.x + 0.2, y: sc.y + 2.1, w: sc.w - 0.4, h: 0.45, rectRadius: 0.08, fill: { color: WHITE }, line: { color: GOLD, width: 1.5 } });
    s.addText("050-1234567", { x: sc.x + 0.2, y: sc.y + 2.1, w: sc.w - 0.4, h: 0.45, fontSize: 13, color: INK, align: "center", valign: "middle", fontFace: FONT, isTextBox: true, margin: 0 });
    C(s, "سنرسل رمز تحقق مكوناً من 6 أرقام إلى رقمك", { x: sc.x + 0.15, y: sc.y + 2.65, w: sc.w - 0.3, h: 0.5, fontSize: 9, color: MUTED, margin: 0 });
    pill(s, "إرسال رمز التحقق", sc.x + 0.2, sc.y + 3.3, sc.w - 0.4, 0.45, GOLD, WHITE, 11);
    // arrow
    s.addImage({ data: await icon("FaArrowLeft", GOLD), x: 3.47, y: 4.3, w: 0.3, h: 0.3 });
    // screen 2: code
    sc = phone(s, ph[1].x, 1.8, 2.85, 5.45);
    C(s, "أدخل رمز التحقق", { x: sc.x, y: sc.y + 0.25, w: sc.w, h: 0.4, fontSize: 13, bold: true, color: NAVY, margin: 0 });
    await iconCircle(s, "FaSms", sc.x + sc.w / 2 - 0.35, sc.y + 0.8, 0.7, NAVY, GOLD_L);
    C(s, "وصلك برسالة SMS", { x: sc.x, y: sc.y + 1.65, w: sc.w, h: 0.35, fontSize: 11, color: MUTED, margin: 0 });
    const digits = ["4", "8", "2", "7", "1", "5"], bw = 0.32, bg = 0.06;
    const startX = sc.x + (sc.w - (6 * bw + 5 * bg)) / 2;
    for (let i = 0; i < 6; i++) {
      const x = startX + i * (bw + bg);
      s.addShape("roundRect", { x, y: sc.y + 2.1, w: bw, h: 0.45, rectRadius: 0.06, fill: { color: WHITE }, line: { color: GOLD, width: 1.5 } });
      s.addText(digits[i], { x, y: sc.y + 2.1, w: bw, h: 0.45, fontSize: 14, bold: true, color: INK, align: "center", valign: "middle", fontFace: FONT, isTextBox: true, margin: 0 });
    }
    pill(s, "تأكيد الرمز", sc.x + 0.2, sc.y + 3.3, sc.w - 0.4, 0.45, GOLD, WHITE, 11);
    C(s, "إعادة إرسال الرمز", { x: sc.x, y: sc.y + 3.9, w: sc.w, h: 0.3, fontSize: 9, color: "1A6FD1", margin: 0 });
    // right content
    const rows = [
      { ic: "FaMobileAlt", h: "1. يكتب رقم هاتفه", d: "ويضغط «إرسال رمز التحقق»" },
      { ic: "FaSms", h: "2. يدخل الرمز الذي وصله", d: "رمز من 6 أرقام برسالة SMS – وهذا كل شيء" },
      { ic: "FaLink", h: "دعواته تنتظره تلقائياً", d: "كل دعوة أُرسلت إلى هذا الرقم تظهر فوراً في «دعواتي»" },
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 1.85 + i * 1.5;
      card(s, 7.0, y, 5.73, 1.3, WHITE);
      await iconCircle(s, rows[i].ic, 11.75, y + 0.23, 0.82, i === 2 ? GOLD : NAVY, i === 2 ? WHITE : GOLD_L);
      T(s, rows[i].h, { x: 7.3, y: y + 0.18, w: 4.3, h: 0.45, fontSize: 19, bold: true, color: NAVY, margin: 0 });
      T(s, rows[i].d, { x: 7.3, y: y + 0.66, w: 4.3, h: 0.55, fontSize: 14, color: MUTED, margin: 0 });
    }
    T(s, "على iPhone يمكن أيضاً الدخول عبر حساب Apple", { x: 7.0, y: 6.45, w: 5.73, h: 0.4, fontSize: 13, color: MUTED, margin: 0 });
    s.addNotes("أسهل طريقة للدخول: رقم الهاتف فقط. يكتب الرقم، يصله رمز من 6 أرقام برسالة SMS، يدخله – وانتهى. لا حاجة لتذكر كلمة مرور. والأهم: لأن الدخول برقم الهاتف، كل الدعوات التي أُرسلت لهذا الرقم تظهر له تلقائياً. الأرقام في الصورة مثال فقط.");
  }

  // 2b. Profile
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "الملف الشخصي «حسابي»", "مرة واحدة فقط بعد الدخول الأول – ثم يفتح التطبيق كاملاً");
    const sc = phone(s, 0.9, 1.75, 3.3, 5.55);
    T(s, "حسابي", { x: sc.x + 0.2, y: sc.y + 0.1, w: sc.w - 0.4, h: 0.38, fontSize: 14, bold: true, color: NAVY, margin: 0 });
    s.addShape("ellipse", { x: sc.x + sc.w / 2 - 0.35, y: sc.y + 0.5, w: 0.7, h: 0.7, fill: { color: GOLD_L }, line: { color: GOLD_L } });
    s.addImage({ data: await icon("FaUser", GOLD), x: sc.x + sc.w / 2 - 0.2, y: sc.y + 0.65, w: 0.4, h: 0.4 });
    const fields = [
      { l: "الاسم الأول *", v: "أحمد" },
      { l: "اسم العائلة *", v: "خطيب" },
      { l: "البلد / المدينة *", v: "الناصرة" },
      { l: "رقم الهاتف", v: "050-1234567" },
    ];
    for (let i = 0; i < fields.length; i++) {
      const y = sc.y + 1.3 + i * 0.58;
      T(s, fields[i].l, { x: sc.x + 0.2, y, w: sc.w - 0.4, h: 0.22, fontSize: 9, bold: true, color: MUTED, margin: 0 });
      s.addShape("roundRect", { x: sc.x + 0.2, y: y + 0.23, w: sc.w - 0.4, h: 0.32, rectRadius: 0.06, fill: { color: WHITE }, line: { color: LINE } });
      T(s, fields[i].v, { x: sc.x + 0.3, y: y + 0.23, w: sc.w - 0.6, h: 0.32, fontSize: 11, color: INK, valign: "middle", margin: 0 });
    }
    const ly = sc.y + 1.3 + 4 * 0.58;
    T(s, "اللغة المفضلة", { x: sc.x + 0.2, y: ly, w: sc.w - 0.4, h: 0.22, fontSize: 9, bold: true, color: MUTED, margin: 0 });
    const lw = (sc.w - 0.5) / 3;
    pill(s, "العربية", sc.x + sc.w - 0.2 - lw, ly + 0.25, lw - 0.05, 0.3, NAVY, WHITE, 9);
    pill(s, "עברית", sc.x + sc.w - 0.2 - 2 * lw, ly + 0.25, lw - 0.05, 0.3, TINT, INK, 9);
    pill(s, "English", sc.x + 0.25, ly + 0.25, lw - 0.05, 0.3, TINT, INK, 9);
    pill(s, "حفظ التغييرات", sc.x + 0.2, ly + 0.68, sc.w - 0.4, 0.42, GOLD, WHITE, 11);
    // right content
    const rows = [
      { ic: "FaIdCard", h: "الاسم الأول، اسم العائلة والمدينة", d: "حقول إلزامية – بعد تعبئتها يمكن استخدام التطبيق" },
      { ic: "FaPhoneAlt", h: "رقم الهاتف محفوظ تلقائياً", d: "من دخل برقم هاتفه لا يحتاج لكتابته مرة أخرى" },
      { ic: "FaGlobe", h: "اللغة المفضلة", d: "العربية، العبرية أو الإنجليزية – التطبيق كله يتحول للغة المختارة" },
      { ic: "FaCamera", h: "صورة شخصية ولقب", d: "اختياري – مثلاً: الحاج، الدكتور، الأستاذ" },
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 1.8 + i * 1.3;
      card(s, 4.9, y, 7.83, 1.12, TINT);
      await iconCircle(s, rows[i].ic, 11.85, y + 0.19, 0.74, GOLD, WHITE);
      T(s, rows[i].h, { x: 5.2, y: y + 0.14, w: 6.45, h: 0.42, fontSize: 18, bold: true, color: NAVY, margin: 0 });
      T(s, rows[i].d, { x: 5.2, y: y + 0.58, w: 6.45, h: 0.42, fontSize: 14, color: MUTED, margin: 0 });
    }
    s.addNotes("بعد الدخول الأول، يطلب التطبيق إكمال الملف الشخصي: الاسم الأول، اسم العائلة والمدينة. رقم الهاتف موجود مسبقاً لأن الدخول تم به. يمكن أيضاً اختيار لغة التطبيق. الأسماء والأرقام في الصورة مثال فقط.");
  }

  // 3. Request event
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "الخطوة 1: صاحب المناسبة يطلب فتح مناسبة", "من داخل التطبيق: صفحة «دعواتي» ← زر «طلب فتح مناسبة»");
    // right: how
    const rows = [
      { ic: "FaMobileAlt", h: "يحمّل التطبيق ويدخل برقم هاتفه", d: "رمز SMS يصل إلى الهاتف – بدون كلمة مرور"},
      { ic: "FaIdCard", h: "يكمل الملف الشخصي", d: "الاسم والمدينة – ويدخل بنفس رقم الهاتف الذي أعطاه للقاعة" },
      { ic: "FaClipboardList", h: "يضغط «طلب فتح مناسبة»", d: "يكتب اسم المناسبة والتفاصيل ورقم هاتف للتواصل، ونحن نتواصل معه" },
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 2.0 + i * 1.6;
      card(s, 5.4, y, 7.33, 1.35);
      await iconCircle(s, rows[i].ic, 11.6, y + 0.22, 0.9, GOLD, WHITE);
      T(s, rows[i].h, { x: 5.75, y: y + 0.2, w: 5.7, h: 0.5, fontSize: 20, bold: true, color: NAVY, margin: 0 });
      T(s, rows[i].d, { x: 5.75, y: y + 0.72, w: 5.7, h: 0.5, fontSize: 15, color: MUTED, margin: 0 });
    }
    // left: checklist
    card(s, 0.6, 2.0, 4.5, 4.55, NAVY, true);
    T(s, "ماذا يجهّز صاحب المناسبة؟", { x: 0.9, y: 2.25, w: 3.9, h: 0.55, fontSize: 19, bold: true, color: GOLD_L, margin: 0 });
    const items = ["تفاصيل المناسبة: الاسم، النوع، التاريخ والساعة", "اسم القاعة والعنوان", "صورة الدعوة المصممة", "قائمة المدعوين: الاسم + رقم الهاتف لكل مدعو"];
    for (let i = 0; i < items.length; i++) {
      const y = 3.0 + i * 0.85;
      s.addImage({ data: await icon("FaCheck", GOLD_L), x: 4.5, y: y + 0.05, w: 0.3, h: 0.3 });
      T(s, items[i], { x: 0.9, y, w: 3.45, h: 0.75, fontSize: 15, color: WHITE, margin: 0 });
    }
    s.addNotes("صاحب المناسبة لا يحتاج أن يفهم بالتكنولوجيا: يحمّل التطبيق، يسجل، ويضغط على «طلب فتح مناسبة». الأهم: أن يجهز قائمة المدعوين مع أرقام الهواتف، لأن الدعوة تُرسل لكل واحد عبر SMS.");
  }

  // 4. Setting up the event
  {
    const s = pres.addSlide();
    s.background = { color: TINT };
    title(s, "الخطوة 2: تجهيز المناسبة في النظام", "تُدخل التفاصيل والصورة والمدعوين – وتصبح المناسبة جاهزة للإرسال");
    const c = [
      { ic: "FaCalendarAlt", h: "تفاصيل المناسبة", items: ["اسم المناسبة ونوعها", "التاريخ والساعة", "القاعة والعنوان ورابط الخريطة", "أسماء العريس والعروس / المضيف"] },
      { ic: "FaImage", h: "صورة الدعوة المصممة", items: ["رفع صورة بطاقة الدعوة", "نص الدعوة الذي يظهر في الرسالة", "هكذا يراها كل مدعو عند فتح الرابط"] },
      { ic: "FaUsers", h: "قائمة المدعوين", items: ["الاسم ورقم الهاتف", "عدد الضيوف المتوقع", "مجموعة: أهل العريس، أهل العروس، أصدقاء…"] },
    ];
    const w = 3.85, gap = 0.29;
    for (let i = 0; i < c.length; i++) {
      const x = W - 0.6 - w - i * (w + gap);
      card(s, x, 2.0, w, 4.75, WHITE);
      await iconCircle(s, c[i].ic, x + w - 1.25, 2.3, 0.9, NAVY, GOLD_L);
      T(s, c[i].h, { x: x + 0.3, y: 3.35, w: w - 0.6, h: 0.55, fontSize: 21, bold: true, color: NAVY, margin: 0 });
      T(s, c[i].items.map((t, j) => ({ text: t, options: { bullet: true, breakLine: j < c[i].items.length - 1 } })),
        { x: x + 0.3, y: 4.05, w: w - 0.6, h: 2.5, fontSize: 15, color: INK, paraSpaceAfter: 8, margin: 0 });
    }
    s.addNotes("هنا تدخل كل المعلومات: تفاصيل المناسبة، صورة الدعوة كما صممها صاحب المناسبة، وقائمة المدعوين. يمكن إضافة مدعوين في أي وقت، حتى بعد الإرسال.");
  }

  // 5. Sending: SMS + push
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "الخطوة 3: النظام يرسل الدعوات", null);
    // phone with SMS (left)
    const sc = phone(s, 0.9, 1.35, 3.1, 5.85);
    C(s, "رسائل", { x: sc.x, y: sc.y + 0.1, w: sc.w, h: 0.35, fontSize: 12, bold: true, color: MUTED, margin: 0 });
    s.addShape("roundRect", { x: sc.x + 0.15, y: sc.y + 0.6, w: sc.w - 0.45, h: 2.3, rectRadius: 0.15, fill: { color: "ECEEF2" }, line: { color: "ECEEF2" } });
    T(s, [
      { text: "عائلة أحمد تتشرف بدعوتكم لحفل زفاف ابنها", options: { breakLine: true } },
      { text: "لفتح الدعوة وتأكيد الحضور:", options: { breakLine: true } },
      { text: "daawatey.com/i/…", options: { color: "1A6FD1", bold: true } },
    ], { x: sc.x + 0.28, y: sc.y + 0.72, w: sc.w - 0.7, h: 2.1, fontSize: 12, color: INK, margin: 0, paraSpaceAfter: 6 });
    // push banner on phone
    s.addShape("roundRect", { x: sc.x + 0.1, y: sc.y + 3.25, w: sc.w - 0.2, h: 1.0, rectRadius: 0.12, fill: { color: TINT }, line: { color: LINE },
      shadow: { type: "outer", color: "000000", opacity: 0.15, blur: 6, offset: 2, angle: 90 } });
    s.addImage({ data: await icon("FaBell", GOLD), x: sc.x + sc.w - 0.48, y: sc.y + 3.38, w: 0.28, h: 0.28 });
    T(s, [{ text: "دعوتي", options: { bold: true, breakLine: true } }, { text: "لديك دعوة جديدة إلى مناسبة" }],
      { x: sc.x + 0.2, y: sc.y + 3.33, w: sc.w - 0.75, h: 0.85, fontSize: 11, color: INK, margin: 0 });
    // right content
    const f = [
      { ic: "FaSms", h: "رسالة SMS لكل مدعو", d: "تصل لكل رقم في القائمة رسالة مع رابط شخصي للدعوة – لا حاجة لتطبيق لفتحها" },
      { ic: "FaBell", h: "إشعار في التطبيق", d: "من لديه تطبيق دعوتي يتلقى أيضاً إشعاراً فورياً بأنه مدعو لمناسبة جديدة" },
      { ic: "FaLink", h: "رابط شخصي لكل واحد", d: "لذلك نعرف بالضبط من فتح الدعوة ومن ردّ – ويمكن أيضاً المشاركة عبر واتساب" },
    ];
    for (let i = 0; i < f.length; i++) {
      const y = 1.55 + i * 1.85;
      card(s, 4.7, y, 8.03, 1.6);
      await iconCircle(s, f[i].ic, 11.65, y + 0.3, 0.95, GOLD, WHITE);
      T(s, f[i].h, { x: 5.05, y: y + 0.25, w: 6.4, h: 0.5, fontSize: 21, bold: true, color: NAVY, margin: 0 });
      T(s, f[i].d, { x: 5.05, y: y + 0.78, w: 6.4, h: 0.7, fontSize: 15, color: MUTED, margin: 0 });
    }
    s.addNotes("بعد تجهيز المناسبة، النظام يرسل رسالة SMS لكل مدعو مع رابط شخصي. ومن عنده التطبيق يحصل أيضاً على إشعار. نص الرسالة في الصورة مثال فقط.");
  }

  // 6. Guest opens invitation and responds
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "الخطوة 4: المدعو يفتح الدعوة ويرد", null);
    const sc = phone(s, 0.9, 1.35, 3.1, 5.85);
    // invitation image
    s.addShape("roundRect", { x: sc.x + 0.12, y: sc.y + 0.12, w: sc.w - 0.24, h: 1.7, rectRadius: 0.12, fill: { color: "0B2228" }, line: { color: "0B2228" } });
    s.addImage({ path: "wedding-invitation.png", x: sc.x + sc.w / 2 - 0.612, y: sc.y + 0.12, w: 1.224, h: 1.7 });
    T(s, [
      { text: "حفل زفاف أحمد وسارة", options: { bold: true, fontSize: 13, color: NAVY, breakLine: true } },
      { text: "الجمعة · 20:00", options: { breakLine: true } },
      { text: "قاعة [اسم القاعة]" },
    ], { x: sc.x + 0.2, y: sc.y + 1.95, w: sc.w - 0.4, h: 0.95, fontSize: 11, color: MUTED, margin: 0 });
    const bw = (sc.w - 0.4) / 3;
    pill(s, "حاضر", sc.x + sc.w - 0.15 - bw, sc.y + 3.0, bw - 0.05, 0.42, GREEN, WHITE);
    pill(s, "ربما", sc.x + sc.w - 0.15 - 2 * bw, sc.y + 3.0, bw - 0.05, 0.42, AMBER_T, AMBER);
    pill(s, "اعتذر", sc.x + 0.2, sc.y + 3.0, bw - 0.05, 0.42, RED_T, RED);
    T(s, "عدد الضيوف:  2", { x: sc.x + 0.2, y: sc.y + 3.6, w: sc.w - 0.4, h: 0.35, fontSize: 11, color: INK, margin: 0 });
    pill(s, "Waze", sc.x + sc.w / 2 + 0.03, sc.y + 4.1, sc.w / 2 - 0.23, 0.38, "E4F6FD", "1A86B3", 10);
    pill(s, "Google Maps", sc.x + 0.2, sc.y + 4.1, sc.w / 2 - 0.23, 0.38, "E8F0FE", "1A73E8", 10);

    const rows = [
      { ic: "FaHandPointer", h: "يضغط على الرابط", d: "تفتح الدعوة مباشرة في الهاتف – حتى بدون تطبيق" },
      { ic: "FaEnvelopeOpenText", h: "يرى الدعوة كاملة", d: "صورة الدعوة المصممة، التاريخ والساعة، القاعة والعنوان" },
      { ic: "FaCheckCircle", h: "يؤكد: حاضر / ربما / اعتذر", d: "ويختار عدد الضيوف، ويمكنه كتابة تهنئة لأصحاب الفرح" },
      { ic: "FaMapMarkedAlt", h: "يصل إلى القاعة بسهولة", d: "زر للملاحة مباشرة عبر Waze أو Google Maps" },
    ];
    for (let i = 0; i < rows.length; i++) {
      const y = 1.45 + i * 1.42;
      await iconCircle(s, rows[i].ic, 11.8, y + 0.1, 0.9, i === 2 ? GOLD : NAVY, i === 2 ? WHITE : GOLD_L);
      T(s, rows[i].h, { x: 4.8, y: y + 0.08, w: 6.75, h: 0.5, fontSize: 21, bold: true, color: NAVY, margin: 0 });
      T(s, rows[i].d, { x: 4.8, y: y + 0.6, w: 6.75, h: 0.5, fontSize: 15, color: MUTED, margin: 0 });
    }
    s.addNotes("هذا ما يراه المدعو. الأمر بسيط حتى لكبار السن: ضغطة على الرابط، ثم ضغطة على «حاضر» أو «اعتذر». الرد يصل فوراً لصاحب المناسبة.");
  }

  // 7. My invitations
  {
    const s = pres.addSlide();
    s.background = { color: TINT };
    title(s, "«دعواتي»: كل دعواتك في مكان واحد", "كل مستخدم يرى قائمة المناسبات المدعو إليها");
    const sc = phone(s, 8.9, 1.8, 3.4, 5.4);
    T(s, "دعواتي", { x: sc.x + 0.2, y: sc.y + 0.12, w: sc.w - 0.4, h: 0.45, fontSize: 16, bold: true, color: NAVY, margin: 0 });
    const ev = [
      { t: "حفل زفاف أحمد وسارة", d: "الجمعة 16/10 · قاعة النور", st: "حاضر", bg: GREEN_T, fg: GREEN },
      { t: "خطوبة محمد وليلى", d: "السبت 24/10 · قاعة الزهور", st: "بانتظار الرد", bg: AMBER_T, fg: AMBER },
      { t: "عيد ميلاد يوسف", d: "الخميس 05/11 · البيت", st: "اعتذر", bg: RED_T, fg: RED },
    ];
    for (let i = 0; i < ev.length; i++) {
      const y = sc.y + 0.7 + i * 1.3;
      s.addShape("roundRect", { x: sc.x + 0.12, y, w: sc.w - 0.24, h: 1.12, rectRadius: 0.1, fill: { color: TINT }, line: { color: LINE } });
      T(s, ev[i].t, { x: sc.x + 0.25, y: y + 0.1, w: sc.w - 0.5, h: 0.35, fontSize: 12, bold: true, color: NAVY, margin: 0 });
      T(s, ev[i].d, { x: sc.x + 0.25, y: y + 0.42, w: sc.w - 0.5, h: 0.3, fontSize: 10, color: MUTED, margin: 0 });
      pill(s, ev[i].st, sc.x + sc.w - 0.25 - 1.3, y + 0.74, 1.3, 0.28, ev[i].bg, ev[i].fg, 9);
    }
    const pts = [
      { ic: "FaListUl", h: "قائمة واحدة لكل المناسبات", d: "المناسبات القادمة والسابقة، مع حالة ردّك على كل واحدة" },
      { ic: "FaPhoneAlt", h: "تُربط تلقائياً برقم الهاتف", d: "كل دعوة أُرسلت إلى رقمك تظهر هنا فور تسجيل الدخول بنفس الرقم" },
      { ic: "FaSyncAlt", h: "تغيير الرد في أي وقت", d: "تغيرت الخطط؟ ادخل إلى الدعوة وحدّث ردّك" },
    ];
    for (let i = 0; i < pts.length; i++) {
      const y = 1.9 + i * 1.65;
      card(s, 0.6, y, 7.8, 1.4, WHITE);
      await iconCircle(s, pts[i].ic, 7.35, y + 0.25, 0.9, GOLD, WHITE);
      T(s, pts[i].h, { x: 0.95, y: y + 0.2, w: 6.2, h: 0.5, fontSize: 20, bold: true, color: NAVY, margin: 0 });
      T(s, pts[i].d, { x: 0.95, y: y + 0.72, w: 6.2, h: 0.55, fontSize: 15, color: MUTED, margin: 0 });
    }
    s.addNotes("من يحمّل التطبيق يرى في صفحة «دعواتي» كل المناسبات التي دُعي إليها. الشرط الوحيد: التسجيل بنفس رقم الهاتف الذي وصلت إليه الدعوة.");
  }

  // 8. Stats + Excel
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "الخطوة 5: إحصائيات مباشرة وتقرير Excel", "متاحة لصاحب المناسبة، للمدير ولمسؤول النظام (الأدمين)");
    const stats = [
      { n: "250", l: "إجمالي المدعوين", c: NAVY },
      { n: "180", l: "مؤكد الحضور", c: GREEN },
      { n: "15", l: "اعتذر", c: RED },
      { n: "55", l: "بانتظار الرد", c: AMBER },
    ];
    for (let i = 0; i < stats.length; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = col === 0 ? 10.0 : 7.15, y = 1.95 + row * 1.75;
      card(s, x, y, 2.73, 1.5);
      s.addText(stats[i].n, { x, y: y + 0.1, w: 2.73, h: 0.85, fontSize: 44, bold: true, color: stats[i].c, align: "center", valign: "middle", fontFace: FONT, isTextBox: true, margin: 0 });
      C(s, stats[i].l, { x, y: y + 0.95, w: 2.73, h: 0.4, fontSize: 15, color: MUTED, margin: 0 });
    }
    T(s, "* أرقام للتوضيح فقط", { x: 7.15, y: 5.45, w: 5.58, h: 0.3, fontSize: 11, color: MUTED, margin: 0 });
    // export callout
    card(s, 7.15, 5.85, 5.58, 1.05, NAVY, true);
    await iconCircle(s, "FaFileExcel", 11.75, 6.0, 0.75, GREEN, WHITE);
    T(s, [{ text: "تصدير إلى Excel", options: { bold: true, color: GOLD_L, breakLine: true } }, { text: "القائمة كاملة مع الردود وعدد الضيوف", options: { color: WHITE, fontSize: 13 } }],
      { x: 7.45, y: 5.97, w: 4.15, h: 0.85, fontSize: 17, margin: 0, valign: "middle" });
    // chart
    s.addChart(pres.charts.DOUGHNUT, [{ name: "الردود", labels: ["مؤكد الحضور", "اعتذر", "بانتظار الرد"], values: [180, 15, 55] }], {
      x: 0.6, y: 1.85, w: 6.2, h: 5.1, holeSize: 58, chartColors: [GREEN, RED, AMBER],
      showLegend: true, legendPos: "b", legendFontSize: 14, legendFontFace: FONT, legendColor: INK,
      showValue: true, showPercent: false, dataLabelColor: WHITE, dataLabelFontSize: 14, dataLabelFontBold: true,
      showTitle: true, title: "ملخص الردود", titleFontSize: 18, titleColor: NAVY, titleFontFace: FONT,
    });
    s.addNotes("هذه أهم شاشة لصاحب المناسبة: كم أكدوا الحضور، كم اعتذروا، ومن لم يرد بعد – وكلها تتحدث تلقائياً. ومن هنا يُصدَّر تقرير Excel نعتمد عليه في القاعة للعدد النهائي وترتيب الطاولات. (الملف بصيغة CSV ويفتح مباشرة في Excel.)");
  }

  // 9. Venue calendar
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "صاحب القاعة: تقويم الحجوزات", "يرى في تقويم شهري متى القاعة مشغولة ومتى متاحة");
    // calendar card (left)
    const cx = 0.6, cy = 1.9, cw = 7.0, ch = 5.05;
    card(s, cx, cy, cw, ch);
    C(s, "أكتوبر 2026", { x: cx, y: cy + 0.15, w: cw, h: 0.45, fontSize: 18, bold: true, color: NAVY, margin: 0 });
    const days = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];
    const cellW = (cw - 0.4) / 7, cellH = 0.66, gx = cx + 0.2, gy = cy + 0.75;
    for (let d = 0; d < 7; d++) {
      const x = gx + (6 - d) * cellW;
      C(s, days[d], { x, y: gy, w: cellW, h: 0.3, fontSize: 11, bold: true, color: MUTED, margin: 0 });
    }
    // Oct 1 2026 is Thursday (index 4)
    const busy = new Set([2, 3, 9, 10, 16, 17, 22, 23, 24, 30, 31]);
    for (let day = 1; day <= 31; day++) {
      const idx = 4 + day - 1, row = Math.floor(idx / 7), col = idx % 7;
      const x = gx + (6 - col) * cellW + 0.04, y = gy + 0.38 + row * cellH;
      const b = busy.has(day);
      s.addShape("roundRect", { x, y, w: cellW - 0.08, h: cellH - 0.08, rectRadius: 0.08, fill: { color: b ? GOLD : WHITE }, line: { color: b ? GOLD : LINE } });
      s.addText(String(day), { x, y, w: cellW - 0.08, h: cellH - 0.08, fontSize: 13, bold: b, color: b ? WHITE : INK, align: "center", valign: "middle", fontFace: FONT, isTextBox: true, margin: 0 });
    }
    // right explanation
    const legend = [
      { bg: GOLD, l: "مشغول – توجد مناسبة في هذا اليوم" },
      { bg: WHITE, l: "متاح – اليوم فارغ" },
    ];
    for (let i = 0; i < legend.length; i++) {
      const y = 2.05 + i * 0.6;
      s.addShape("roundRect", { x: 12.33, y: y + 0.05, w: 0.4, h: 0.4, rectRadius: 0.06, fill: { color: legend[i].bg }, line: { color: legend[i].bg === WHITE ? MUTED : legend[i].bg } });
      T(s, legend[i].l, { x: 8.0, y, w: 4.2, h: 0.5, fontSize: 16, color: INK, valign: "middle", margin: 0 });
    }
    const pts = [
      { ic: "FaCalendarAlt", h: "نظرة شهرية واضحة", d: "التنقل بين الأشهر ورؤية الأيام المحجوزة فوراً" },
      { ic: "FaListUl", h: "مناسبات هذا الشهر", d: "قائمة بكل مناسبة: الاسم، التاريخ والساعة" },
      { ic: "FaBuilding", h: "لكل قاعة تقويمها", d: "من يملك أكثر من قاعة يختار القاعة من القائمة" },
    ];
    for (let i = 0; i < pts.length; i++) {
      const y = 3.45 + i * 1.18;
      await iconCircle(s, pts[i].ic, 12.0, y, 0.75, NAVY, GOLD_L);
      T(s, pts[i].h, { x: 8.0, y: y - 0.02, w: 3.85, h: 0.42, fontSize: 18, bold: true, color: NAVY, margin: 0 });
      T(s, pts[i].d, { x: 8.0, y: y + 0.4, w: 3.85, h: 0.6, fontSize: 14, color: MUTED, margin: 0 });
    }
    s.addNotes("هذه الشاشة لأصحاب القاعات: تقويم يبين الأيام المحجوزة باللون الذهبي والأيام المتاحة بالأبيض. التواريخ في الصورة للتوضيح فقط.");
  }

  // 10. Venue page
  {
    const s = pres.addSlide();
    s.background = { color: TINT };
    title(s, "صاحب القاعة: صفحة القاعة", "لكل قاعة صفحة خاصة تعرض كل تفاصيلها");
    // venue page mock (left)
    const mx = 0.6, my = 1.9, mw = 6.6, mh = 5.05;
    card(s, mx, my, mw, mh, WHITE);
    s.addShape("roundRect", { x: mx + 0.2, y: my + 0.2, w: mw - 0.4, h: 1.75, rectRadius: 0.12, fill: { color: NAVY2 }, line: { color: NAVY2 } });
    s.addImage({ data: await icon("FaBuilding", GOLD_L), x: mx + mw / 2 - 0.35, y: my + 0.45, w: 0.7, h: 0.7 });
    C(s, "صورة القاعة", { x: mx + 0.2, y: my + 1.3, w: mw - 0.4, h: 0.4, fontSize: 13, color: GOLD_L, margin: 0 });
    T(s, "[اسم القاعة]", { x: mx + 0.35, y: my + 2.1, w: mw - 0.7, h: 0.55, fontSize: 22, bold: true, color: NAVY, margin: 0 });
    const det = [
      { ic: "FaMapMarkerAlt", t: "المدينة والعنوان الكامل" },
      { ic: "FaUsers", t: "حتى 500 ضيف" },
      { ic: "FaPhoneAlt", t: "هاتف القاعة" },
      { ic: "FaStickyNote", t: "ملاحظات إضافية" },
    ];
    for (let i = 0; i < det.length; i++) {
      const col = i % 2, row = Math.floor(i / 2);
      const x = col === 0 ? mx + mw / 2 : mx + 0.35, y = my + 2.85 + row * 0.55;
      s.addImage({ data: await icon(det[i].ic, GOLD), x: x + mw / 2 - 0.75, y: y + 0.05, w: 0.28, h: 0.28 });
      T(s, det[i].t, { x, y, w: mw / 2 - 0.85, h: 0.4, fontSize: 13, color: INK, valign: "middle", margin: 0 });
    }
    pill(s, "Waze", mx + mw / 2 + 0.1, my + 4.15, mw / 2 - 0.45, 0.48, "E4F6FD", "1A86B3", 13);
    pill(s, "Google Maps", mx + 0.35, my + 4.15, mw / 2 - 0.45, 0.48, "E8F0FE", "1A73E8", 13);
    // right
    const pts = [
      { ic: "FaInfoCircle", h: "كل التفاصيل في مكان واحد", d: "الاسم، الصورة، المدينة والعنوان، السعة القصوى، الهاتف والملاحظات" },
      { ic: "FaMapMarkedAlt", h: "خريطة وملاحة", d: "أزرار مباشرة لـ Waze و-Google Maps للوصول إلى القاعة" },
      { ic: "FaCalendarCheck", h: "المناسبات القادمة في القاعة", d: "قائمة المناسبات المحجوزة، مرتبطة بتقويم الحجوزات" },
    ];
    for (let i = 0; i < pts.length; i++) {
      const y = 1.9 + i * 1.72;
      card(s, 7.55, y, 5.18, 1.5, WHITE);
      await iconCircle(s, pts[i].ic, 11.8, y + 0.28, 0.75, GOLD, WHITE);
      T(s, pts[i].h, { x: 7.85, y: y + 0.2, w: 3.8, h: 0.45, fontSize: 18, bold: true, color: NAVY, margin: 0 });
      T(s, pts[i].d, { x: 7.85, y: y + 0.68, w: 3.8, h: 0.75, fontSize: 14, color: MUTED, margin: 0 });
    }
    s.addNotes("كل صاحب قاعة لديه صفحة خاصة بقاعته مع كل التفاصيل. الأرقام والتفاصيل في الصورة مثال فقط.");
  }

  // 11. Who sees what
  {
    const s = pres.addSlide();
    s.background = { color: WHITE };
    title(s, "من يرى ماذا؟", "كل مستخدم يرى فقط ما يخصه");
    const yes = { text: "✓", options: { color: GREEN, bold: true, align: "center", fontSize: 20 } };
    const no = { text: "—", options: { color: "B9BEC8", align: "center", fontSize: 16 } };
    const hdr = (t) => ({ text: t, options: { bold: true, color: WHITE, fill: { color: NAVY }, align: "center", fontSize: 15 } });
    const rowL = (t) => ({ text: t, options: { bold: true, color: NAVY, align: "right", fontSize: 15 } });
    const rows = [
      [hdr("الميزة"), hdr("المدعو"), hdr("صاحب المناسبة"), hdr("صاحب القاعة"), hdr("مدير / أدمين")],
      [rowL("فتح الدعوة وتأكيد الحضور"), yes, yes, yes, yes],
      [rowL("«دعواتي» – قائمة المناسبات المدعو إليها"), yes, yes, yes, yes],
      [rowL("طلب فتح مناسبة"), yes, yes, no, yes],
      [rowL("إحصائيات الردود وتصدير Excel"), no, yes, no, yes],
      [rowL("تقويم الحجوزات وصفحة القاعة"), no, no, yes, yes],
    ];
    s.addTable(rows, { x: 0.6, y: 1.95, w: 12.13, colW: [4.53, 1.9, 1.9, 1.9, 1.9], rowH: 0.78, fontFace: FONT, rtlMode: true, lang: "ar-SA",
      border: { type: "solid", pt: 1, color: LINE }, valign: "middle", fill: { color: WHITE } });
    s.addNotes("ملخص سريع للصلاحيات. صاحب المناسبة يرى الإحصائيات لمناسبته فقط، وصاحب القاعة يرى قاعته فقط.");
  }

  // 12. Closing
  {
    const s = pres.addSlide();
    s.background = { color: NAVY };
    s.addShape("ellipse", { x: -1.6, y: -1.8, w: 5.5, h: 5.5, fill: { color: NAVY2 }, line: { color: NAVY2 } });
    T(s, "حمّلوا التطبيق الآن", { x: 4.6, y: 1.9, w: 8.1, h: 1.0, fontSize: 44, bold: true, color: WHITE, margin: 0 });
    T(s, "امسحوا الرمز بكاميرا الهاتف – سينقلكم مباشرة إلى متجر التطبيقات المناسب (Android / iPhone)", { x: 4.6, y: 3.0, w: 8.1, h: 1.0, fontSize: 20, color: "C9CFDA", margin: 0 });
    s.addText("daawatey.com/get", { x: 4.6, y: 4.2, w: 8.1, h: 0.6, fontSize: 26, bold: true, color: GOLD_L, align: "right", fontFace: FONT, isTextBox: true, margin: 0 });
    T(s, "أسئلة؟ يسعدنا مساعدتكم", { x: 4.6, y: 5.4, w: 8.1, h: 0.6, fontSize: 22, color: WHITE, margin: 0 });
    s.addShape("roundRect", { x: 0.9, y: 1.7, w: 3.3, h: 3.3, rectRadius: 0.15, fill: { color: WHITE }, line: { color: WHITE } });
    s.addImage({ path: "qr.png", x: 1.1, y: 1.9, w: 2.9, h: 2.9 });
    s.addNotes("اتركوا هذه الشريحة على الشاشة وقت الأسئلة، حتى يتمكن الجميع من مسح الرمز وتحميل التطبيق.");
  }

  await pres.writeFile({ fileName: "daawatey-presentation-ar.pptx" });
  console.log("done");
})();
