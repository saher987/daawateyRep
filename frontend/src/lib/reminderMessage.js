// Event reminder texts. The backend fills them for each guest when sending
// (events.py _fill_reminder); this mirrors it for the dialog's preview —
// keep the placeholders and tidy-up rules in sync.
import { recipientDisplayName } from "@/lib/recipientName";
import { publicAppOrigin } from "@/lib/publicUrl";

export const REMINDER_PLACEHOLDERS = ["target_string", "event_title", "day", "date", "time", "venue", "invite_link"];

// For guests who accepted.
export const DEFAULT_REMINDER_ACCEPTED =
  "[target_string]، نذكّركم بموعد [event_title] يوم [day] [date] الساعة [time] في [venue]. بانتظاركم! للتفاصيل والخريطة: [invite_link]";

// For guests who haven't replied yet (pending / maybe).
export const DEFAULT_REMINDER_PENDING =
  "[target_string]، نذكّركم بدعوتكم إلى [event_title] يوم [day] [date] الساعة [time] في [venue]. نرجو تأكيد حضوركم عبر الرابط: [invite_link]";

const WEEKDAYS_AR = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

// Event date/time in Israel time, whatever the viewer's zone — same as the backend.
function eventDateParts(isoDate) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      weekday: "short", day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(isoDate)).map(p => [p.type, p.value])
  );
  const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return {
    day: WEEKDAYS_AR[weekdayIndex] || "",
    date: `${parts.day}/${parts.month}/${parts.year}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function fillReminder(template, event, recipient) {
  const when = event?.date ? eventDateParts(event.date) : { day: "", date: "", time: "" };
  const values = {
    target_string: recipientDisplayName(recipient),
    event_title: event?.title || "",
    ...when,
    venue: event?.venue_name || "",
    invite_link: `${publicAppOrigin()}/i/${recipient?.personal_token || ""}`,
  };
  return template
    .replace(/\[(\w+)\]/g, (match, key) => (key in values ? values[key] : match))
    .split("\n")
    .map(line => line.replace(/[ \t]{2,}/g, " ").replace(/ ([،,.!؟?])/g, "$1").trim())
    .join("\n");
}
