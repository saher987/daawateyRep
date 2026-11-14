import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookUser, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";
import ContactsImportButton from "@/components/events/ContactsImportButton";
import { contactsSupported } from "@/lib/contacts";
import { useT } from "@/lib/i18n";

// MyEvent (the event owner's page), DAW-57: the owner picks guests from
// their phone's contacts. They land in the event's waiting list
// (imported_invitees.py) — nothing is sent; the Daawatey team reviews the
// list and sends the invitations. The owner sees who is waiting and can
// remove a name added by mistake.
export default function OwnerContactsCard({ event }) {
  const t = useT();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const key = ["imported-invitees", event.id];
  const { data: rows = [] } = useQuery({ queryKey: key, queryFn: () => base44.imports.list(event.id) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });

  const remove = async (row) => {
    try {
      await base44.imports.remove(row.id);
    } catch (err) {
      toast({ title: t.addError, description: err.message, variant: "destructive" });
    }
    refresh();
  };

  const canPick = contactsSupported();
  // Nothing to offer on a computer with an empty list.
  if (!canPick && rows.length === 0) {
    return (
      <Card className="p-4 flex items-start gap-3 border-dashed">
        <BookUser className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground leading-6">{t.contactsOpenOnPhone}</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-xl bg-primary/10 flex items-center justify-center">
          <BookUser className="w-5 h-5 text-primary" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold">{t.contactsCardTitle}</p>
          <p className="text-sm text-muted-foreground leading-6">{t.contactsCardHint}</p>
        </div>
      </div>
      <ContactsImportButton eventId={event.id} onSaved={refresh} variant="default" className="w-full h-12 rounded-xl" />
      {!canPick && <p className="text-xs text-muted-foreground">{t.contactsOpenOnPhone}</p>}

      {rows.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{t.contactsWaiting.replace("{count}", rows.length)}</p>
          <ul className="divide-y rounded-xl border max-h-64 overflow-y-auto">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 ps-3 pe-1 py-1">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">
                    {[row.nickname, row.first_name, row.last_name, row.name_suffix].filter(Boolean).join(" ") || "—"}
                  </span>
                  <span className="block text-xs text-muted-foreground" dir="ltr">{row.phone || ""}</span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-muted-foreground hover:text-destructive"
                  aria-label={t.importDeleteAria}
                  onClick={() => remove(row)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
