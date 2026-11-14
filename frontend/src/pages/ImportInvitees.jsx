import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { readSheet } from "read-excel-file/browser";
import writeExcelFile from "write-excel-file/browser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT, translations } from "@/lib/i18n";
import { CITY_KEYS } from "@/lib/cities";
import SuffixPicker from "@/components/events/SuffixPicker";
import { CalendarHeart, Check, FileSpreadsheet, Send, CheckCircle2, Pencil, Phone, MapPin, Trash2, Users as UsersIcon, Search, UserPlus, X, Download } from "lucide-react";
import CitySelect from "@/components/shared/CitySelect";
import { SIDES, SIDE_COLOR, parseSide, sideLabel } from "@/lib/seating";
import { downloadFile } from "@/lib/downloadFile";
import ImportSendAllDialog from "@/components/events/ImportSendAllDialog";
import ContactsImportButton from "@/components/events/ContactsImportButton";

// Header names accepted per column (lower-cased, trimmed), so the import
// works with the English headers of the template file as well as Arabic/
// Hebrew ones. A sheet with none of them falls back to column order:
// nickname, first name, last name, suffix, phone, city, number of guests.
const HEADER_ALIASES = {
  nickname: ["nick name", "nickname", "اللقب", "כינוי", "תואר"],
  first_name: ["first name", "الاسم الأول", "الاسم الاول", "שם פרטי"],
  last_name: ["last name", "اسم العائلة", "العائلة", "שם משפחה"],
  name_suffix: ["suffix", "name suffix", "إضافة", "اضافة", "תוספת"],
  phone: ["phone", "الهاتف", "رقم الهاتف", "טלפון"],
  city: ["city", "town", "المدينة", "البلد", "עיר", "ישוב"],
  guests_count: ["number of guests", "guests", "العدد", "عدد المدعوين", "מספר אורחים"],
  // Seating groups — optional, read only when the file has a header row.
  side: ["side", "الطرف", "طرف", "צד"],
  group_label: ["group", "المجموعة", "مجموعة", "קבוצה"],
};
const OPTIONAL_FIELDS = ["side", "group_label"];
const FIELD_ORDER = ["nickname", "first_name", "last_name", "name_suffix", "phone", "city", "guests_count"];

// The example file behind "download example file": headers in the host's
// language, each one an entry of HEADER_ALIASES above so the same file
// imports back unchanged, plus three sample rows to overwrite. Side values
// are words parseSide() knows and cities are labels CITY_LOOKUP knows.
const TEMPLATE_HEADERS = {
  ar: { nickname: "اللقب", first_name: "الاسم الأول", last_name: "اسم العائلة", name_suffix: "إضافة", phone: "رقم الهاتف", city: "المدينة", guests_count: "عدد المدعوين", side: "الطرف", group_label: "المجموعة" },
  he: { nickname: "כינוי", first_name: "שם פרטי", last_name: "שם משפחה", name_suffix: "תוספת", phone: "טלפון", city: "עיר", guests_count: "מספר אורחים", side: "צד", group_label: "קבוצה" },
};
const TEMPLATE_ROWS = {
  ar: [
    { nickname: "السيد", first_name: "محمد", last_name: "خليل", name_suffix: "وعائلته", phone: "0501234567", city: "nazareth", guests_count: 4, side: "عريس", group_label: "أصدقاء العمل" },
    { nickname: "", first_name: "سارة", last_name: "عيسى", name_suffix: "وزوجها", phone: "0529876543", city: "haifa", guests_count: 2, side: "عروس", group_label: "أصدقاء المدرسة" },
    { nickname: "الحاج", first_name: "أحمد", last_name: "منصور", name_suffix: "", phone: "0541112233", city: "", guests_count: 1, side: "مشترك", group_label: "" },
  ],
  he: [
    { nickname: "מר", first_name: "דוד", last_name: "כהן", name_suffix: "ומשפחתו", phone: "0501234567", city: "nazareth", guests_count: 4, side: "חתן", group_label: "חברים מהעבודה" },
    { nickname: "", first_name: "שרה", last_name: "לוי", name_suffix: "ובעלה", phone: "0529876543", city: "haifa", guests_count: 2, side: "כלה", group_label: "חברות מבית הספר" },
    { nickname: "הרב", first_name: "משה", last_name: "מזרחי", name_suffix: "", phone: "0541112233", city: "", guests_count: 1, side: "משותף", group_label: "" },
  ],
};

// withSide: false for event types without groom/bride sides, so the
// example doesn't suggest a column the import would ignore.
async function buildTemplateFile(lang, withSide) {
  const code = TEMPLATE_HEADERS[lang] ? lang : "ar";
  const fields = [...FIELD_ORDER, ...OPTIONAL_FIELDS].filter((f) => withSide || f !== "side");
  const header = fields.map((f) => ({ value: TEMPLATE_HEADERS[code][f], fontWeight: "bold" }));
  const rows = TEMPLATE_ROWS[code].map((row) =>
    fields.map((f) => {
      if (f === "guests_count") return { type: Number, value: row[f] };
      // Phone as text, so Excel keeps the leading 0.
      const value = f === "city" ? (row.city ? translations[code][row.city] : "") : row[f];
      return value ? { type: String, value } : null;
    }),
  );
  return writeExcelFile([header, ...rows], {
    columns: fields.map((f) => ({ width: ["phone", "group_label"].includes(f) ? 18 : 14 })),
    rightToLeft: true,
    stickyRowsCount: 1,
  }).toBlob();
}

// City cell (Arabic label, Hebrew label, or the key itself) → city key.
const CITY_LOOKUP = (() => {
  const map = new Map();
  for (const key of CITY_KEYS) {
    map.set(key, key);
    for (const lang of ["ar", "he"]) {
      const label = translations[lang][key];
      if (label) map.set(label.trim(), key);
    }
  }
  return map;
})();

const clean = (value) => (value == null ? "" : String(value).replace(/ /g, " ").replace(/\s+/g, " ").trim());

// Excel often stores a phone as a number, dropping the leading 0.
function normalizePhone(value) {
  let digits = clean(value).replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) digits = digits.slice(3);
  return digits.startsWith("0") ? digits : `0${digits}`;
}

function parseRows(sheet) {
  if (!sheet.length) return [];
  const header = sheet[0].map((h) => clean(h).toLowerCase());
  const columns = {};
  for (const field of [...FIELD_ORDER, ...OPTIONAL_FIELDS]) {
    const idx = header.findIndex((h) => HEADER_ALIASES[field].includes(h));
    if (idx !== -1) columns[field] = idx;
  }
  const hasHeader = Object.keys(columns).length > 0;
  // Without a header row, the fixed column order — never the optional
  // side/group columns, so existing files keep importing the same way.
  if (!hasHeader) FIELD_ORDER.forEach((field, i) => (columns[field] = i));

  return sheet
    .slice(hasHeader ? 1 : 0)
    .map((cells, i) => {
      const get = (field) => (columns[field] === undefined ? "" : cells[columns[field]]);
      const cityText = clean(get("city"));
      const guests = parseInt(clean(get("guests_count")), 10);
      const sideText = clean(get("side"));
      const { side, unknown } = parseSide(sideText);
      return {
        id: i,
        nickname: clean(get("nickname")),
        first_name: clean(get("first_name")),
        last_name: clean(get("last_name")),
        name_suffix: clean(get("name_suffix")),
        phone: normalizePhone(get("phone")),
        // An empty city cell stays empty — no default town.
        city: cityText ? CITY_LOOKUP.get(cityText) || null : null,
        cityText,
        guests_count: Number.isFinite(guests) && guests >= 1 ? guests : 1,
        // A side typed in the file wins over the "side for this file" picker.
        side,
        sideText: unknown ? sideText : "",
        group_label: clean(get("group_label")),
      };
    })
    .filter((row) => row.nickname || row.first_name || row.last_name || row.phone);
}

// Stands in for "no city" in the city picker.
const NO_CITY = "__none__";

const EMPTY_MANUAL = { nickname: "", first_name: "", last_name: "", name_suffix: "", phone: "", city: "", guests_count: "1", side: "", group_label: "" };

export default function ImportInvitees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT();
  const fileInputRef = useRef(null);
  const formRef = useRef(null);
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  // Opened from the event's own page (/events/:id/import, EventDetails'
  // «استيراد مدعوين»), so the event is fixed — no event picker.
  const { id: eventId } = useParams();
  // "Side for this file": applied to every row without its own Side cell.
  const [fileSide, setFileSide] = useState("");
  const [fileName, setFileName] = useState("");
  const [search, setSearch] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  // The saved row being edited in the manual form (null = adding a new one).
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyIds, setBusyIds] = useState(() => new Set());
  // What the last file load did: { added, skipped }.
  const [lastSave, setLastSave] = useState(null);
  const [showSendAll, setShowSendAll] = useState(false);

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list(),
    enabled: isPrivileged,
  });

  // The saved import list (imported_invitees.py): rows stay here, on the
  // server, until their invitation is sent — leaving the page or switching
  // device loses nothing.
  const rowsKey = ["imported-invitees", eventId];
  const { data: rows = [], isLoading: rowsLoading } = useQuery({
    queryKey: rowsKey,
    queryFn: () => base44.imports.list(eventId),
    enabled: isPrivileged && !!eventId,
  });

  // Only for the group-name suggestions in the manual form.
  const { data: recipients = [] } = useQuery({
    queryKey: ["recipients", eventId],
    queryFn: async () => (await base44.functions.invoke("getEventRecipients", { eventId })).recipients,
    enabled: !!eventId,
  });

  const visibleRows = useMemo(() => {
    const q = search.trim();
    return q ? rows.filter((r) => [r.nickname, r.first_name, r.last_name, r.phone].join(" ").includes(q)) : rows;
  }, [rows, search]);

  const selectedEvent = events.find((ev) => ev.id === eventId);
  // Sides are a wedding thing; other event types use the group only.
  const usesSides = !selectedEvent || ["wedding", "engagement"].includes(selectedEvent.event_type);
  const groupSuggestions = [...new Set([...recipients, ...rows].map((r) => r.group_label).filter(Boolean))].sort();
  // «إرسال الدعوات للجميع»: every saved row that has a phone.
  const pendingRows = rows.filter((row) => row.phone);

  const downloadTemplate = async () => {
    try {
      // Latin file name: some browsers drop an Arabic/Hebrew one and save "download".
      await downloadFile(await buildTemplateFile(t.langCode, usesSides), "daawatey_invitees_example.xlsx");
    } catch {
      toast({ title: t.importTemplateFailed, variant: "destructive" });
    }
  };

  if (!isPrivileged) {
    navigate("/profile");
    return null;
  }

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: rowsKey });
    queryClient.invalidateQueries({ queryKey: ["recipients", eventId] });
    queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] });
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSaving(true);
    try {
      const sheet = await readSheet(file);
      const guests = parseRows(sheet).map((row) => ({
        nickname: row.nickname || null,
        first_name: row.first_name || null,
        last_name: row.last_name || null,
        name_suffix: row.name_suffix || null,
        phone: row.phone || null,
        town: row.city || null,
        // Kept as written when it isn't a town/side we know, shown as a warning.
        town_text: !row.city && row.cityText ? row.cityText : null,
        side_text: row.sideText || null,
        guests_count: row.guests_count,
        // A side typed in the file wins over the "side for this file" picker.
        side: usesSides ? row.side || fileSide || null : null,
        group_label: row.group_label || null,
      }));
      if (!guests.length) {
        toast({ title: t.importLoaded.replace("{count}", 0) });
        return;
      }
      const result = await base44.imports.save(eventId, guests);
      queryClient.setQueryData(rowsKey, result.rows);
      setFileName(file.name);
      setLastSave({ added: result.added, skipped: result.skipped });
    } catch (err) {
      toast({ title: t.importReadError, description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openManual = () => {
    setEditingId(null);
    setManual({ ...EMPTY_MANUAL, side: fileSide });
    setShowManual(true);
  };
  const closeManual = () => {
    setShowManual(false);
    setEditingId(null);
    setManual({ ...EMPTY_MANUAL, side: fileSide });
  };
  const editRow = (row) => {
    setEditingId(row.id);
    setManual({
      nickname: row.nickname || "",
      first_name: row.first_name || "",
      last_name: row.last_name || "",
      name_suffix: row.name_suffix || "",
      phone: row.phone || "",
      city: row.town || "",
      guests_count: String(row.guests_count || 1),
      side: row.side || "",
      group_label: row.group_label || "",
    });
    setShowManual(true);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };

  // The manual form: adds a new saved row, or saves the one being edited.
  const submitManual = async (e) => {
    e.preventDefault();
    const phone = normalizePhone(manual.phone);
    const hasName = [manual.nickname, manual.first_name, manual.last_name].some((v) => clean(v));
    if (!hasName || !phone) {
      toast({ title: t.importNeedNameOrPhone, variant: "destructive" });
      return;
    }
    const guests = parseInt(manual.guests_count, 10);
    const body = {
      nickname: clean(manual.nickname) || null,
      first_name: clean(manual.first_name) || null,
      last_name: clean(manual.last_name) || null,
      name_suffix: clean(manual.name_suffix) || null,
      phone,
      town: manual.city || null,
      guests_count: Number.isFinite(guests) && guests >= 1 ? guests : 1,
      side: usesSides ? manual.side || null : null,
      group_label: clean(manual.group_label) || null,
    };
    setSaving(true);
    try {
      if (editingId) {
        await base44.imports.update(editingId, body);
        toast({ title: t.importRowSaved });
        closeManual();
      } else {
        const result = await base44.imports.save(eventId, [body]);
        if (!result.added) {
          toast({ title: t.importDuplicatePhone, variant: "destructive" });
          return;
        }
        setManual({ ...EMPTY_MANUAL, side: fileSide });
        toast({ title: t.importRowAdded });
      }
      queryClient.invalidateQueries({ queryKey: rowsKey });
    } catch (err) {
      toast({ title: err.status === 409 ? t.importDuplicatePhone : t.addError, description: err.status === 409 ? undefined : err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const withBusy = async (row, fn) => {
    setBusyIds((s) => new Set(s).add(row.id));
    try {
      await fn();
    } catch (err) {
      toast({ title: t.inviteError, description: err.message, variant: "destructive" });
    } finally {
      setBusyIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
      refreshLists();
    }
  };

  const rowName = (row) => [row.nickname, row.first_name, row.last_name, row.name_suffix].filter(Boolean).join(" ");

  // One row's «إرسال دعوة»: on delivery it becomes a guest and leaves this list.
  const sendInvitation = (row) =>
    withBusy(row, async () => {
      const { results } = await base44.imports.send(eventId, [row.id]);
      const result = results[0];
      if (result?.already_invited) toast({ title: t.importAlreadyInvited });
      else if (result?.success) toast({ title: t.importMovedToGuests, description: rowName(row) });
      else toast({ title: t.importNotDelivered, description: rowName(row), variant: "destructive" });
    });

  const deleteRow = (row) =>
    withBusy(row, async () => {
      await base44.imports.remove(row.id);
      if (editingId === row.id) closeManual();
    });

  const setManualField = (field) => (e) => setManual((m) => ({ ...m, [field]: e.target.value }));

  const problemOf = (row) => {
    if (!row.phone) return t.importMissingPhone;
    if (row.last_error) return t.importNotDelivered;
    return null;
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title={t.importInviteesTitle} subtitle={t.importInviteesSubtitle} />

      <Card className="p-5 mb-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.importForEvent}</Label>
            {eventsLoading ? (
              <LoadingSpinner />
            ) : (
              <Link
                to={`/events/${eventId}`}
                className="flex items-center gap-2 h-12 rounded-xl border bg-muted/40 px-4 font-semibold hover:bg-muted"
              >
                <CalendarHeart className="w-4 h-4 shrink-0 text-primary" />
                <span className="truncate">{selectedEvent?.title || "—"}</span>
              </Link>
            )}
          </div>
          <div className="space-y-2">
            <Label>{t.importFile}</Label>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" className="h-12 w-full rounded-xl gap-2" disabled={saving} onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet className="w-4 h-4" />
              <span className="truncate">{fileName || t.importChooseFile}</span>
            </Button>
          </div>
        </div>
        {usesSides && (
          <div className="space-y-2">
            <Label>{t.sideForFile}</Label>
            <div className="flex flex-wrap gap-2">
              {["", ...SIDES].map((s) => (
                <Button
                  key={s || "none"}
                  type="button"
                  size="sm"
                  variant={fileSide === s ? "default" : "outline"}
                  className="rounded-full"
                  aria-pressed={fileSide === s}
                  onClick={() => {
                    setFileSide(s);
                    setManual((m) => ({ ...m, side: s }));
                  }}
                >
                  {s ? sideLabel(s, t) : t.sideNone}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t.sideForFileHint}</p>
          </div>
        )}
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t.importColumnsHint}</p>
          <Button type="button" variant="link" className="h-auto p-0 gap-1.5 text-sm" onClick={downloadTemplate}>
            <Download className="w-4 h-4" />
            {t.importTemplateDownload}
          </Button>
        </div>
        {/* Third way in, on phones: pick from the contact list (DAW-57). */}
        <ContactsImportButton
          eventId={eventId}
          className="w-full rounded-xl"
          onSaved={(result) => {
            setLastSave({ added: result.added, skipped: result.skipped });
            queryClient.setQueryData(rowsKey, result.rows);
          }}
        />
        {!showManual && (
          <Button type="button" variant="outline" className="w-full rounded-xl gap-2" onClick={openManual}>
            <UserPlus className="w-4 h-4" />
            {t.importAddManually}
          </Button>
        )}
      </Card>

      {showManual && (
        <Card className="p-5 mb-6">
          <form ref={formRef} onSubmit={submitManual} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                {editingId ? <Pencil className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
                {editingId ? t.importEditRow : t.importAddManually}
              </h3>
              <Button type="button" variant="ghost" size="icon" aria-label={t.cancel} onClick={closeManual}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t.nicknameOptional}</Label>
                <Input value={manual.nickname} onChange={setManualField("nickname")} placeholder={t.nicknamePlaceholder2} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t.firstName}</Label>
                <Input value={manual.first_name} onChange={setManualField("first_name")} className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t.lastName}</Label>
                <Input value={manual.last_name} onChange={setManualField("last_name")} className="h-10 rounded-xl" />
              </div>
            </div>
            <SuffixPicker compact value={manual.name_suffix} onChange={(v) => setManual((m) => ({ ...m, name_suffix: v }))} />
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-sm">{t.phone}</Label>
                <Input type="tel" dir="ltr" value={manual.phone} onChange={setManualField("phone")} placeholder="05X-XXXXXXX" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">
                  {t.town} <span className="text-muted-foreground text-xs font-normal">({t.optional})</span>
                </Label>
                <CitySelect
                  value={manual.city || NO_CITY}
                  onValueChange={(v) => setManual((m) => ({ ...m, city: v === NO_CITY ? "" : v }))}
                  placeholder={t.importNoCity}
                  leadingOptions={[{ value: NO_CITY, label: t.importNoCity }]}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">{t.guestsCount}</Label>
                <Input type="number" min={1} value={manual.guests_count} onChange={setManualField("guests_count")} className="h-10 rounded-xl" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {usesSides && (
                <div className="space-y-1.5">
                  <Label className="text-sm">{t.sideLabel}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {["", ...SIDES].map((s) => (
                      <Button
                        key={s || "none"}
                        type="button"
                        size="sm"
                        variant={manual.side === s ? "default" : "outline"}
                        className="rounded-full h-8"
                        aria-pressed={manual.side === s}
                        onClick={() => setManual((m) => ({ ...m, side: s }))}
                      >
                        {s ? sideLabel(s, t) : t.sideNone}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="manual-group" className="text-sm">
                  {t.groupNameLabel} <span className="text-muted-foreground text-xs font-normal">({t.optional})</span>
                </Label>
                <Input
                  id="manual-group"
                  list="import-group-names"
                  value={manual.group_label}
                  onChange={setManualField("group_label")}
                  placeholder={t.groupNamePlaceholder}
                  className="h-10 rounded-xl"
                />
                <datalist id="import-group-names">
                  {groupSuggestions.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
            </div>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto gap-2">
              {editingId ? <Check className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {editingId ? t.saveBtn : t.importAddRow}
            </Button>
          </form>
        </Card>
      )}

      {lastSave && (
        <div role="status" className="mb-4 flex items-start gap-2.5 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-success" />
          <span className="flex-1">
            <strong>{t.importSavedNote.replace("{count}", lastSave.added)}</strong>
            {lastSave.skipped > 0 && ` ${t.importSkippedNote.replace("{count}", lastSave.skipped)}`}
          </span>
          <button type="button" aria-label={t.batchClose} className="shrink-0 p-1 -m-1 text-muted-foreground" onClick={() => setLastSave(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-bold">{t.importWaiting.replace("{count}", rows.length)}</h2>
          <p className="text-xs text-muted-foreground">{t.importWaitingHint}</p>
        </div>
        {rows.length > 0 && (
          <div className="relative sm:w-64">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.importSearch} className="pr-9 h-10 rounded-xl" />
          </div>
        )}
      </div>

      {rowsLoading ? (
        <LoadingSpinner />
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground space-y-2">
          <p>{t.importEmpty}</p>
          <Link to={`/events/${eventId}`} className="text-primary font-semibold underline">{t.guestListTitle}</Link>
        </Card>
      ) : (
        <>
          {pendingRows.length > 0 && (
            <Button type="button" className="w-full sm:w-auto h-11 rounded-xl gap-2 mb-4" onClick={() => setShowSendAll(true)}>
              <Send className="w-4 h-4" />
              {t.importSendAll.replace("{count}", pendingRows.length)}
            </Button>
          )}

          <div className="space-y-2">
            {visibleRows.map((row) => {
              const busy = busyIds.has(row.id);
              const problem = problemOf(row);
              return (
                <Card
                  key={row.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between ${problem ? "border-destructive/40" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{rowName(row) || "—"}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span dir="ltr">{row.phone || t.importNoPhone}</span>
                      </span>
                      <span className={`flex items-center gap-1 ${!row.town && row.town_text ? "text-destructive" : ""}`}>
                        <MapPin className="w-3 h-3" />
                        {row.town
                          ? t[row.town] || row.town
                          : row.town_text
                          ? `${row.town_text} (${t.importUnknownCity})`
                          : t.importNoCity}
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersIcon className="w-3 h-3" />
                        {row.guests_count}
                      </span>
                      {(row.side || row.group_label || row.side_text) && (
                        <span className={`flex items-center gap-1 ${row.side_text ? "text-destructive" : ""}`}>
                          <span className="w-2 h-2 rounded-full" style={{ background: SIDE_COLOR[row.side || "none"] }} />
                          {row.side_text
                            ? `${row.side_text} (${t.sideUnknownWarning})`
                            : [row.side ? sideLabel(row.side, t) : null, row.group_label].filter(Boolean).join(" › ")}
                        </span>
                      )}
                    </div>
                    {problem && (
                      <span className="inline-block mt-2 rounded-full bg-destructive/10 text-destructive text-xs font-semibold px-2.5 py-0.5">
                        {problem}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
                    <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={t.importEditAria} disabled={busy} onClick={() => editRow(row)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11 text-muted-foreground hover:text-destructive"
                      aria-label={t.importDeleteAria}
                      disabled={busy}
                      onClick={() => deleteRow(row)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 h-10"
                      disabled={!row.phone || busy}
                      title={!row.phone ? t.importMissingPhone : undefined}
                      onClick={() => sendInvitation(row)}
                    >
                      <Send className="w-4 h-4" />
                      {busy ? t.importSending : t.importSendInvitation}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <ImportSendAllDialog
        open={showSendAll}
        onOpenChange={setShowSendAll}
        rows={pendingRows}
        eventId={eventId}
        onBatchDone={refreshLists}
      />
    </div>
  );
}
