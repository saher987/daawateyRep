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
import { FileSpreadsheet, Send, CheckCircle2, Phone, MapPin, Users as UsersIcon, Search } from "lucide-react";

// Default town for a row whose city cell is empty — the imported guest
// lists so far have all been Nazareth-based, with only the out-of-town
// guests' city filled in.
const DEFAULT_CITY = "nazareth";

// Header names accepted per column (lower-cased, trimmed), so the import
// works with the English headers of the template file as well as Arabic/
// Hebrew ones. A sheet with none of them falls back to column order:
// nickname, first name, last name, phone, city, number of guests.
const HEADER_ALIASES = {
  nickname: ["nick name", "nickname", "اللقب", "כינוי", "תואר"],
  first_name: ["first name", "الاسم الأول", "الاسم الاول", "שם פרטי"],
  last_name: ["last name", "اسم العائلة", "العائلة", "שם משפחה"],
  phone: ["phone", "الهاتف", "رقم الهاتف", "טלפון"],
  city: ["city", "town", "المدينة", "البلد", "עיר", "ישוב"],
  guests_count: ["number of guests", "guests", "العدد", "عدد المدعوين", "מספר אורחים"],
};
const FIELD_ORDER = ["nickname", "first_name", "last_name", "phone", "city", "guests_count"];

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
        phone: normalizePhone(get("phone")),
        city: cityText ? CITY_LOOKUP.get(cityText) || null : DEFAULT_CITY,
        cityText,
        guests_count: Number.isFinite(guests) && guests >= 1 ? guests : 1,
      };
    })
    .filter((row) => row.nickname || row.first_name || row.last_name || row.phone);
}

export default function ImportInvitees() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT();
  const fileInputRef = useRef(null);
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const [eventId, setEventId] = useState("");
  const [rows, setRows] = useState([]);
  const [fileName, setFileName] = useState("");
  const [search, setSearch] = useState("");
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

  const { data: recipients = [] } = useQuery({
    queryKey: ["recipients", eventId],
    queryFn: async () => (await base44.functions.invoke("getEventRecipients", { eventId })).recipients,
    enabled: !!eventId,
  });

  const sentPhones = useMemo(() => new Set(recipients.map((r) => phoneKey(r.phone)).filter(Boolean)), [recipients]);
  const isSent = (row) => sentIds.has(row.id) || (!!row.phone && sentPhones.has(phoneKey(row.phone)));

  const visibleRows = useMemo(() => {
    const q = search.trim();
    if (!q) return rows;
    return rows.filter((r) => [r.nickname, r.first_name, r.last_name, r.phone].join(" ").includes(q));
  }, [rows, search]);

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
      const parsed = parseRows(sheet);
      setRows(parsed);
      setFileName(file.name);
      setSentIds(new Set());
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
        phone: row.phone,
        town: row.city || undefined,
        guestsCount: row.guests_count,
      });
      setSentIds((s) => new Set(s).add(row.id));
      toast({ title: t.importSent, description: [row.nickname, row.first_name, row.last_name].filter(Boolean).join(" ") });
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
      </Card>

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
              const sending = sendingIds.has(row.id);
              const name = [row.nickname, row.first_name, row.last_name].filter(Boolean).join(" ");
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
                      <span className={`flex items-center gap-1 ${row.city ? "" : "text-destructive"}`}>
                        <MapPin className="w-3 h-3" />
                        {row.city ? t[row.city] || row.city : `${row.cityText} (${t.importUnknownCity})`}
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
                      {t.importSent}
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      disabled={!eventId || !row.phone || sending}
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
