import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, Search, CheckCircle, XCircle, UserPlus, X as XIcon } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/AuthContext";
import MobileSelect from "@/components/shared/MobileSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBackButton } from "@/hooks/useBackButton";
import { CITY_KEYS, sortCityKeysForDisplay } from "@/lib/cities";
import { format } from "date-fns";

export default function EditEventDialog({ open, onOpenChange, event }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list("-name"),
  });

  const [form, setForm] = useState({});
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [ownerLookupStatus, setOwnerLookupStatus] = useState(null);
  const [ownerLookupName, setOwnerLookupName] = useState("");
  const [owners, setOwners] = useState([]);

  useEffect(() => {
    if (event) {
      setForm({
        title: event.title || "",
        event_type: event.event_type || "wedding",
        date: event.date ? format(new Date(event.date), "yyyy-MM-dd'T'HH:mm") : "",
        venue_name: event.venue_name || "",
        venue_address: event.venue_address || "",
        venue_map_url: event.venue_map_url || "",
        venue_city: event.venue_city || "",
        groom_name: event.groom_name || "",
        bride_name: event.bride_name || "",
        host_name: event.host_name || "",
        host_phone: event.host_phone || "",
        max_guests: event.max_guests || "",
        description: event.description || "",
        invitation_greeting: event.invitation_greeting || "",
      });
      // Load existing owners from owner_emails
      const existingEmails = event.owner_emails || (event.owner_email ? [event.owner_email] : []);
      setOwners(existingEmails.map(e => ({ email: e, name: e, phone: "" })));
      // Pre-select venue if it matches one in the list
      setSelectedVenueId("__manual__");
    }
  }, [event]);

  // Once venues load, try to match the current event venue by name
  useEffect(() => {
    if (venues.length > 0 && event?.venue_name) {
      const matched = venues.find(v => v.name === event.venue_name);
      setSelectedVenueId(matched ? matched.id : "__manual__");
    }
  }, [venues, event]);

  const handleOwnerLookup = async (value) => {
    setOwnerInput(value);
    setOwnerLookupStatus(null);
    setOwnerLookupName("");
    if (value.length < 5) return;
    const isEmail = value.includes("@");
    const users = isEmail
      ? await base44.entities.User.filter({ email: value })
      : await base44.entities.User.filter({ phone: value });
    if (users.length > 0) {
      setOwnerLookupStatus("found");
      setOwnerLookupName(users[0].full_name);
    } else {
      setOwnerLookupStatus("not_found");
    }
  };

  const addOwner = async () => {
    if (ownerLookupStatus !== "found") return;
    const isEmail = ownerInput.includes("@");
    const users = isEmail
      ? await base44.entities.User.filter({ email: ownerInput })
      : await base44.entities.User.filter({ phone: ownerInput });
    if (users.length === 0) return;
    const u = users[0];
    if (owners.find(o => o.email === u.email)) return;
    setOwners(prev => [...prev, { email: u.email, name: u.full_name, phone: u.phone || "" }]);
    setOwnerInput("");
    setOwnerLookupStatus(null);
    setOwnerLookupName("");
  };

  const removeOwner = (email) => setOwners(prev => prev.filter(o => o.email !== email));

  const [notifying, setNotifying] = useState(false);
  const t = useT();
  const { user } = useAuth();
  const sortedCityKeys = sortCityKeysForDisplay(CITY_KEYS, t, user?.preferred_language || "ar");
  useBackButton({ isOpen: open, onClose: () => onOpenChange(false) });

  const eventTypes = [
    { value: "wedding", label: t.eventTypeWedding },
    { value: "engagement", label: t.eventTypeEngagement },
    { value: "birthday", label: t.eventTypeBirthday },
    { value: "graduation", label: t.eventTypeGraduation },
    { value: "corporate", label: t.eventTypeCorporate },
    { value: "other", label: t.eventTypeOther },
  ];

  const mutation = useMutation({
    mutationFn: ({ data }) => base44.entities.Event.update(event.id, data),
    onSuccess: async (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["event", event.id] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      onOpenChange(false);

      if (variables.shouldNotify) {
        setNotifying(true);
        try {
          const res = await base44.functions.invoke('notifyEventUpdate', { eventId: event.id });
          toast({
            title: t.savedAndNotified,
            description: `${res.data?.smsSent || 0} SMS, ${res.data?.emailSent || 0} email`,
          });
        } catch {
          toast({ title: t.saved, description: t.savedDesc });
        }
        setNotifying(false);
      } else {
        toast({ title: t.saved, description: t.savedDesc });
      }
    },
  });

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.max_guests) data.max_guests = Number(data.max_guests);
    else delete data.max_guests;
    data.owner_emails = owners.map(o => o.email);

    // Check if date or venue changed
    const dateChanged = form.date && event.date &&
      new Date(form.date).getTime() !== new Date(event.date).getTime();
    const venueChanged = form.venue_name !== (event.venue_name || "") ||
      form.venue_address !== (event.venue_address || "");
    const descriptionChanged = form.description !== (event.description || "");
    const shouldNotify = dateChanged || venueChanged || descriptionChanged;

    mutation.mutate({ data, shouldNotify });
  };

  const isWedding = form.event_type === "wedding" || form.event_type === "engagement";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.editEventDialogTitle}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label>{t.eventNameLabel}</Label>
            <Input
              value={form.title}
              onChange={e => handleChange("title", e.target.value)}
              className="h-11 rounded-xl"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t.eventTypeLabel}</Label>
              <MobileSelect
                value={form.event_type}
                onValueChange={v => handleChange("event_type", v)}
                options={eventTypes.map(et => ({ value: et.value, label: et.label }))}
                placeholder={t.eventTypeLabel}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.dateTimeLabel}</Label>
              <Input
                type="datetime-local"
                value={form.date}
                onChange={e => handleChange("date", e.target.value)}
                className="h-11 rounded-xl"
              />
            </div>
          </div>

          {isWedding && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t.groomName}</Label>
                <Input value={form.groom_name} onChange={e => handleChange("groom_name", e.target.value)} className="h-11 rounded-xl" />
              </div>
              <div className="space-y-2">
                <Label>{t.brideName}</Label>
                <Input value={form.bride_name} onChange={e => handleChange("bride_name", e.target.value)} className="h-11 rounded-xl" />
              </div>
            </div>
          )}

          {/* Venue selector */}
          <div className="space-y-2">
            <Label>{t.venueNameLabel}</Label>
            <MobileSelect
              value={selectedVenueId}
              onValueChange={(id) => {
                setSelectedVenueId(id);
                if (id === "__manual__") {
                  handleChange("venue_name", "");
                  handleChange("venue_address", "");
                  handleChange("venue_map_url", "");
                  handleChange("venue_city", "");
                  handleChange("max_guests", "");
                } else {
                  const v = venues.find(v => v.id === id);
                  if (v) {
                    handleChange("venue_name", v.name);
                    handleChange("venue_address", v.address || "");
                    handleChange("venue_map_url", v.map_url || "");
                    handleChange("venue_city", v.city || "");
                    if (v.max_guests) handleChange("max_guests", String(v.max_guests));
                  }
                }
              }}
              options={[...venues.map(v => ({ value: v.id, label: `${v.name}${v.city ? ` - ${t[v.city] || v.city}` : ""}` })), { value: "__manual__", label: t.manualEntry }]}
              placeholder={t.venueSelectPlaceholder}
            />
          </div>

          {/* Venue detail fields — shown always, auto-filled from venue selection */}
          <div className="space-y-2">
            <Label>{t.venueNameLabel}</Label>
            <Input value={form.venue_name} onChange={e => handleChange("venue_name", e.target.value)} className="h-11 rounded-xl" required />
          </div>

          <div className="space-y-2">
            <Label>{t.cityLabel}</Label>
            <Select value={form.venue_city || ""} onValueChange={v => handleChange("venue_city", v)}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder={t.cityPlaceholder}>
                  {form.venue_city ? (t[form.venue_city] || form.venue_city) : null}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sortedCityKeys.map(key => (
                  <SelectItem key={key} value={key}>{t[key] || key}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t.addressLabel}</Label>
            <Input value={form.venue_address} onChange={e => handleChange("venue_address", e.target.value)} className="h-11 rounded-xl" />
          </div>

          <div className="space-y-2">
            <Label>{t.mapUrlLabel}</Label>
            <Input value={form.venue_map_url} onChange={e => handleChange("venue_map_url", e.target.value)} className="h-11 rounded-xl" dir="ltr" placeholder="https://maps.google.com/..." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t.hostNameLabel}</Label>
              <Input value={form.host_name} onChange={e => handleChange("host_name", e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label>{t.hostPhoneLabel}</Label>
              <Input value={form.host_phone} onChange={e => handleChange("host_phone", e.target.value)} className="h-11 rounded-xl" dir="ltr" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t.maxGuestsLabel}</Label>
            <Input type="number" value={form.max_guests} onChange={e => handleChange("max_guests", e.target.value)} className="h-11 rounded-xl" placeholder={t.optional} />
          </div>

          <div className="space-y-3">
            <Label>{t.eventOwners}</Label>
            {owners.length > 0 && (
              <div className="space-y-2">
                {owners.map(o => (
                  <div key={o.email} className="flex items-center justify-between bg-success/10 rounded-xl px-4 py-2">
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{o.email}</p>
                    </div>
                    <button type="button" onClick={() => removeOwner(o.email)}>
                      <XIcon className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  placeholder="05xxxxxxxx أو email@example.com"
                  value={ownerInput}
                  onChange={e => handleOwnerLookup(e.target.value)}
                  className="h-11 rounded-xl pl-10"
                  dir="ltr"
                />
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                  {ownerLookupStatus === "found" && <CheckCircle className="w-4 h-4 text-success" />}
                  {ownerLookupStatus === "not_found" && <XCircle className="w-4 h-4 text-destructive" />}
                  {!ownerLookupStatus && <Search className="w-4 h-4 text-muted-foreground" />}
                </div>
              </div>
              <Button type="button" variant="outline" className="h-11 rounded-xl gap-1" disabled={ownerLookupStatus !== "found"} onClick={addOwner}>
                <UserPlus className="w-4 h-4" />
                {t.addOwner}
              </Button>
            </div>
            {ownerLookupStatus === "found" && <p className="text-sm text-success">{t.ownerFound} {ownerLookupName}</p>}
            {ownerLookupStatus === "not_found" && <p className="text-sm text-destructive">{t.ownerNotFoundShort}</p>}
          </div>

          <div className="space-y-2">
            <Label>{t.invitationGreetingSection}</Label>
            <p className="text-xs text-muted-foreground">{t.invitationGreetingHint}</p>
            <Textarea
              value={form.invitation_greeting}
              onChange={e => handleChange("invitation_greeting", e.target.value)}
              className="rounded-xl min-h-[80px]"
              placeholder={t.invitationGreetingPlaceholder}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.descriptionSection}</Label>
            <Textarea value={form.description} onChange={e => handleChange("description", e.target.value)} className="rounded-xl min-h-[80px]" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={mutation.isPending || notifying} className="flex-1 h-11 rounded-xl gap-2">
              {(mutation.isPending || notifying) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {notifying ? t.notifying : t.saveAndNotify}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-6">
              {t.cancel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}