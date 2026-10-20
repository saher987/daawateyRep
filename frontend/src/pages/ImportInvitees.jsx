import React, { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { readSheet } from "read-excel-file/browser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import MobileSelect from "@/components/shared/MobileSelect";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT, translations } from "@/lib/i18n";
import { CITY_KEYS } from "@/lib/cities";
import SuffixPicker from "@/components/events/SuffixPicker";
import { FileSpreadsheet, Send, CheckCircle2, Phone, MapPin, Users as UsersIcon, Search, UserPlus, X } from "lucide-react";
import CitySelect from "@/components/shared/CitySelect";

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
};
const FIELD_ORDER = ["nickname", "first_name", "last_name", "name_suffix", "phone", "city", "guests_count"];

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

// Last 9 digits — matches "05..." against "9725..." when comparing with
// phones already stored on the event's recipients.
const phoneKey = (phone) => (phone || "").replace(/\D/g, "").slice(-9);

function parseRows(sheet) {
  if (!sheet.length) return [];
  const header = sheet[0].map((h) => clean(h).toLowerCase());
  const columns = {};
  for (const field of FIELD_ORDER) {
    const idx = header.findIndex((h) => HEADER_ALIASES[field].includes(h));
    if (idx !== -1) columns[field] = idx;
  }
  const hasHeader = Object.keys(columns).length > 0;
  if (!hasHeader) FIELD_ORDER.forEach((field, i) => (columns[field] = i));

  return sheet
    .slice(hasHeader ? 1 : 0)
    .map((cells, i) => {
      const get = (field) => (columns[field] === undefined ? "" : cells[columns[field]]);
      const cityText = clean(get("city"));
      const guests = parseInt(clean(get("guests_count")), 10);
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
      };
    })
    .filter((row) => row.nickname || row.first_name || row.last_name || row.phone);
}

// Stands in for "no city" in the city picker.
const NO_CITY = "__none__";

const EMPTY_MANUAL = { nickname: "", first_name: "", last_name: "", name_suffix: "", phone: "", city: "", guests_count: "1" };

export default function ImportInvitees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT();
  const fileInputRef = useRef(null);
  // Row ids stay unique across file loads and manual additions.
  const nextIdRef = useRef(0);
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [search, setSearch] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState(EMPTY_MANUAL);
  const [sendingIds, setSendingIds] = useState(() => new Set());
  // Rows sent in this session — the durable indication is the event's own
  // recipient list (sentPhones below), this just covers the moment between
  // the POST returning and that list refetching.
  const [sentIds, setSentIds] = useState(() => new Set());

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ["events"],
    queryFn: () => base44.entities.Event.list(),
    enabled: isPrivileged,
  });

  const { data: recipients = [], isLoading: recipientsLoading } = useQuery({
    queryKey: ["recipients", eventId],
    queryFn: async () => (await base44.functions.invoke("getEventRecipients", { eventId })).recipients,
    enabled: !!eventId,
  });

  const sentPhones = useMemo(() => new Set(recipients.map((r) => phoneKey(r.phone)).filter(Boolean)), [recipients]);
  // Already a recipient of the selected event (matched by phone) — either
  // invited before this import or just sent from it.
  const isInEvent = (row) => !!row.phone && sentPhones.has(phoneKey(row.phone));
  const isSent = (row) => sentIds.has(row.id) || isInEvent(row);

  // Not-yet-invited rows first; Array.prototype.sort is stable, so each
  // group keeps the file's order.
  const visibleRows = useMemo(() => {
    const q = search.trim();
    const filtered = q ? rows.filter((r) => [r.nickname, r.first_name, r.last_name, r.phone].join(" ").includes(q)) : [...rows];
    const sent = (r) => sentIds.has(r.id) || (!!r.phone && sentPhones.has(phoneKey(r.phone)));
    return filtered.sort((a, b) => Number(sent(a)) - Number(sent(b)));
  }, [rows, search, sentIds, sentPhones]);

  const sentCount = rows.filter(isSent).length;

  if (!isPrivileged) {
    navigate("/profile");
    return null;
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const sheet = await readSheet(file);
      const parsed = parseRows(sheet).map((row) => ({ ...row, id: nextIdRef.current++ }));
      // A new file replaces the previous file's rows; manually added ones stay.
      setRows((prev) => [...prev.filter((r) => r.manual), ...parsed]);
      setFileName(file.name);
      toast({ title: t.importLoaded.replace("{count}", parsed.length) });
    } catch (err) {
      toast({ title: t.importReadError, description: err.message, variant: "destructive" });
    }
  };

  const sendInvitation = async (row) => {
    setSendingIds((s) => new Set(s).add(row.id));
    try {
      await base44.functions.invoke("createInvitationRecipient", {
        eventId,
        nickname: row.nickname || undefined,
        first_name: row.first_name || undefined,
        last_name: row.last_name || undefined,
        name_suffix: row.name_suffix || undefined,
        phone: row.phone,
        town: row.city || undefined,
        guestsCount: row.guests_count,
      });
      setSentIds((s) => new Set(s).add(row.id));
      toast({ title: t.importSent, description: [row.nickname, row.first_name, row.last_name, row.name_suffix].filter(Boolean).join(" ") });
    } catch (err) {
      if (err.status === 409) {
        // Already a recipient of this event — it was sent before.
        setSentIds((s) => new Set(s).add(row.id));
        toast({ title: t.importAlreadyInvited });
      } else {
        toast({ title: t.inviteError, description: err.message, variant: "destructive" });
      }
    } finally {
      setSendingIds((s) => {
        const next = new Set(s);
        next.delete(row.id);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["recipients", eventId] });
    }
  };

  const addManualRow = (e) => {
    e.preventDefault();
    const phone = normalizePhone(manual.phone);
    const hasName = [manual.nickname, manual.first_name, manual.last_name].some((v) => clean(v));
    if (!hasName || !phone) {
      toast({ title: t.importNeedNameOrPhone, variant: "destructive" });
      return;
    }
    const guests = parseInt(manual.guests_count, 10);
    const row = {
      id: nextIdRef.current++,
      manual: true,
      nickname: clean(manual.nickname),
      first_name: clean(manual.first_name),
      last_name: clean(manual.last_name),
      name_suffix: clean(manual.name_suffix),
      phone,
      city: manual.city || null,
      cityText: "",
      guests_count: Number.isFinite(guests) && guests >= 1 ? guests : 1,
    };
    setRows((prev) => [row, ...prev]);
    setManual(EMPTY_MANUAL);
    toast({ title: t.importRowAdded });
  };

  const setManualField = (field) => (e) => setManual((m) => ({ ...m, [field]: e.target.value }));

  const eventOptions = events.map((ev) => ({ value: ev.id, label: ev.title }));

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title={t.importInviteesTitle} subtitle={t.importInviteesSubtitle} />

      <Card className="p-5 mb-6 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>{t.importSelectEvent}</Label>
            {eventsLoading ? (
              <LoadingSpinner />
            ) : (
              <MobileSelect value={eventId} onValueChange={setEventId} options={eventOptions} placeholder={t.importSelectEvent} />
            )}
          </div>
          <div className="space-y-2">
            <Label>{t.importFile}</Label>
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" className="h-12 w-full rounded-xl gap-2" onClick={() => fileInputRef.current?.click()}>
              <FileSpreadsheet className="w-4 h-4" />
              <span className="truncate">{fileName || t.importChooseFile}</span>
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t.importColumnsHint}</p>
        {!showManual && (
          <Button type="button" variant="outline" className="w-full rounded-xl gap-2" onClick={() => setShowManual(true)}>
            <UserPlus className="w-4 h-4" />
            {t.importAddManually}
          </Button>
        )}
      </Card>

      {showManual && (
        <Card className="p-5 mb-6">
          <form onSubmit={addManualRow} className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                {t.importAddManually}
              </h3>
              <Button type="button" variant="ghost" size="icon" onClick={() => setShowManual(false)}>
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
            <Button type="submit" className="w-full sm:w-auto gap-2">
              <UserPlus className="w-4 h-4" />
              {t.importAddRow}
            </Button>
          </form>
        </Card>
      )}

      {rows.length > 0 && (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <p className="text-sm font-medium">
              {t.importProgress.replace("{sent}", sentCount).replace("{total}", rows.length)}
            </p>
            <div className="relative sm:w-64">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.importSearch} className="pr-9 h-10 rounded-xl" />
            </div>
          </div>

          {!eventId && <p className="text-sm text-destructive mb-4">{t.importPickEventFirst}</p>}

          <div className="space-y-2">
            {visibleRows.map((row) => {
              const sent = isSent(row);
              const alreadyInvited = isInEvent(row) && !sentIds.has(row.id);
              const sending = sendingIds.has(row.id);
              const name = [row.nickname, row.first_name, row.last_name, row.name_suffix].filter(Boolean).join(" ");
              return (
                <Card
                  key={row.id}
                  className={`p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between transition-colors ${sent ? "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-900" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span dir="ltr">{row.phone || t.importNoPhone}</span>
                      </span>
                      <span className={`flex items-center gap-1 ${!row.city && row.cityText ? "text-destructive" : ""}`}>
                        <MapPin className="w-3 h-3" />
                        {row.city
                          ? t[row.city] || row.city
                          : row.cityText
                          ? `${row.cityText} (${t.importUnknownCity})`
                          : t.importNoCity}
                      </span>
                      <span className="flex items-center gap-1">
                        <UsersIcon className="w-3 h-3" />
                        {row.guests_count}
                      </span>
                    </div>
                  </div>
                  {sent ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                      {alreadyInvited ? t.importAlreadyInEvent : t.importSent}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      disabled={!eventId || recipientsLoading || !row.phone || sending}
                      title={!row.phone ? t.importNoPhone : undefined}
                      onClick={() => sendInvitation(row)}
                    >
                      <Send className="w-4 h-4" />
                      {sending ? t.importSending : t.importSendInvitation}
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
