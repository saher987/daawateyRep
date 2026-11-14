import React, { useMemo, useState } from "react";
import { BookUser, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { base44 } from "@/api/base44Client";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";
import { contactsSupported, contactToGuest, isNativeContacts, loadDeviceContacts, pickWebContacts } from "@/lib/contacts";

// "From contacts" (DAW-57): pick guests from the phone's contact list and
// save them to the event's waiting list (imported_invitees.py). Nothing is
// sent here — the team sends the invitations from the import page. Used on
// ImportInvitees (team) and MyEvent (the event's owner).
//
// Renders nothing where the device can't pick contacts (desktop browsers,
// iPhone Safari). onSaved({ added, skipped }) runs after a save.
export default function ContactsImportButton({ eventId, onSaved, className = "", variant = "outline" }) {
  const t = useT();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  // Installed app only: the contacts to choose from (null = picker closed).
  const [deviceContacts, setDeviceContacts] = useState(null);

  if (!contactsSupported()) return null;

  const save = async (contacts) => {
    if (!contacts.length) return;
    setBusy(true);
    try {
      const result = await base44.imports.save(eventId, contacts.map(contactToGuest));
      toast({
        title: t.contactsSaved.replace("{count}", result.added),
        description: result.skipped > 0 ? t.importSkippedNote.replace("{count}", result.skipped) : undefined,
      });
      onSaved?.(result);
    } catch (err) {
      toast({ title: t.addError, description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const open = async () => {
    setBusy(true);
    try {
      if (isNativeContacts()) {
        const list = await loadDeviceContacts();
        if (!list.length) toast({ title: t.contactsEmpty });
        else setDeviceContacts(list);
      } else {
        // The browser shows its own picker and returns only what was chosen.
        const chosen = await pickWebContacts();
        setBusy(false);
        await save(chosen);
      }
    } catch (err) {
      toast({
        title: err.code === "denied" ? t.contactsDenied : t.contactsFailed,
        description: err.code === "denied" ? t.contactsDeniedHint : undefined,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant={variant} className={`gap-2 ${className}`} disabled={busy} onClick={open}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookUser className="w-4 h-4" />}
        {t.contactsButton}
      </Button>
      {deviceContacts && (
        <ContactsPickerDialog
          contacts={deviceContacts}
          onClose={() => setDeviceContacts(null)}
          onConfirm={async (chosen) => {
            setDeviceContacts(null);
            await save(chosen);
          }}
        />
      )}
    </>
  );
}

// The app's own picker (installed app): search, tick, add.
export function ContactsPickerDialog({ contacts, onClose, onConfirm }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  useBackButton({ isOpen: true, onClose });

  const visible = useMemo(() => {
    const q = query.trim();
    if (!q) return contacts;
    return contacts.filter((c) => `${c.first_name} ${c.last_name} ${c.phone}`.includes(q));
  }, [contacts, query]);

  const toggle = (id) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisiblePicked = visible.length > 0 && visible.every((c) => picked.has(c.id));
  const toggleAllVisible = () =>
    setPicked((s) => {
      const next = new Set(s);
      for (const c of visible) {
        if (allVisiblePicked) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md flex flex-col max-h-[90dvh] p-0 gap-0" dir="rtl">
        <DialogHeader className="px-5 pt-5 pb-3 border-b flex-shrink-0">
          <DialogTitle>{t.contactsPickTitle}</DialogTitle>
        </DialogHeader>
        <div className="px-5 py-3 space-y-2 border-b flex-shrink-0">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.importSearch} className="pr-9 h-11 rounded-xl" />
          </div>
          <label className="flex items-center gap-3 text-sm cursor-pointer min-h-10">
            <Checkbox checked={allVisiblePicked} onCheckedChange={toggleAllVisible} />
            {t.contactsSelectAll.replace("{count}", visible.length)}
          </label>
        </div>
        <ul className="flex-1 overflow-y-auto divide-y">
          {visible.map((c) => (
            <li key={c.id}>
              <label className="flex items-center gap-3 px-5 py-3 cursor-pointer min-h-12">
                <Checkbox checked={picked.has(c.id)} onCheckedChange={() => toggle(c.id)} />
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{[c.first_name, c.last_name].filter(Boolean).join(" ")}</span>
                  <span className="block text-xs text-muted-foreground" dir="ltr">{c.phone}</span>
                </span>
              </label>
            </li>
          ))}
          {visible.length === 0 && <li className="px-5 py-8 text-center text-sm text-muted-foreground">{t.noResults}</li>}
        </ul>
        <div className="flex gap-3 px-5 py-4 border-t flex-shrink-0">
          <Button
            className="flex-1 h-11 rounded-xl"
            disabled={picked.size === 0}
            onClick={() => onConfirm(contacts.filter((c) => picked.has(c.id)))}
          >
            {t.contactsAdd.replace("{count}", picked.size)}
          </Button>
          <Button variant="outline" className="h-11 rounded-xl px-6" onClick={onClose}>
            {t.cancel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
