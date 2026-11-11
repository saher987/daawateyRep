import React, { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Save, UserPlus, X as XIcon, ImagePlus, Wand2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import MobileSelect from "@/components/shared/MobileSelect";
import { useBackButton } from "@/hooks/useBackButton";
import { format } from "date-fns";
import CitySelect from "@/components/shared/CitySelect";
import { whatsappInvitationPreview } from "@/lib/whatsappTemplate";
import InvitationCardEditor from "@/components/events/InvitationCardEditor";
import EventFeaturesFields from "@/components/events/EventFeaturesFields";
import { useAuth } from "@/lib/AuthContext";

export default function EditEventDialog({ open, onOpenChange, event }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list("-name"),
  });

  const { user } = useAuth();
  const isTeam = user?.role === "admin" || user?.role === "manager";
  const [form, setForm] = useState({});
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [ownerSearchInput, setOwnerSearchInput] = useState("");
  const [ownerSearchResults, setOwnerSearchResults] = useState([]);
  const [ownerSearching, setOwnerSearching] = useState(false);
  const [owners, setOwners] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cardEditorOpen, setCardEditorOpen] = useState(false);

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
        whatsapp_invitation_text: event.whatsapp_invitation_text || "",
        invitation_image_url: event.invitation_image_url || "",
        thank_you_message: event.thank_you_message || "",
        thank_you_event_name: event.thank_you_event_name || "",
        thank_you_event_owners: event.thank_you_event_owners || "",
        seating_enabled: !!event.seating_enabled,
        checkin_enabled: !!event.checkin_enabled,
      });
      // Load existing owners from owner_phones
      const existingPhones = event.owner_phones || [];
      setOwners(existingPhones.map(p => ({ phone: p, name: p, email: "" })));
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

  // Search by name, phone, or email — see CreateEvent.jsx's matching
  // handler for why this replaced an exact-match-only lookup: it also
  // silently stored a typed email string into owner_phones as a fake
  // phone whenever the matched user had none on file.
  const handleOwnerSearch = async (val) => {
    setOwnerSearchInput(val);
    if (val.trim().length < 2) { setOwnerSearchResults([]); return; }
    setOwnerSearching(true);
    const users = await base44.entities.User.list();
    const q = val.trim().toLowerCase();
    const filtered = users.filter(u =>
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.first_name && u.first_name.toLowerCase().includes(q)) ||
      (u.last_name && u.last_name.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
    setOwnerSearchResults(filtered.slice(0, 5));
    setOwnerSearching(false);
  };

  const addOwner = (u) => {
    if (!u.phone) return;
    if (owners.find(o => o.phone === u.phone)) return;
    setOwners(prev => [...prev, { email: u.email, name: u.full_name, phone: u.phone }]);
    setOwnerSearchInput("");
    setOwnerSearchResults([]);
  };

  const removeOwner = (phone) => setOwners(prev => prev.filter(o => o.phone !== phone));

  const [notifying, setNotifying] = useState(false);
  const t = useT();
  useBackButton({ isOpen: open, onClose: () => onOpenChange(false) });

  const eventTypes = [
    { value: "wedding", label: t.eventTypeWedding },
    { value: "engagement", label: t.eventTypeEngagement },
    { value: "birthday", label: t.eventTypeBirthday },
    { value: "graduation", label: t.eventTypeGraduation },
    { value: "corporate", label: t.eventTypeCorporate },
    { value: "appreciation", label: t.eventTypeAppreciation },
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

  // Same upload as CreateEvent.jsx's; the new URL only reaches the event
  // when the dialog is saved, like every other field here.
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      handleChange("invitation_image_url", file_url);
    } catch {
      toast({ title: t.addError, variant: "destructive" });
    } finally {
      setUploadingImage(false);
      e.target.value = "";
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.max_guests) data.max_guests = Number(data.max_guests);
    else delete data.max_guests;
    data.owner_phones = owners.map(o => o.phone);
    if (!isTeam) {
      // Not the owner's to change; leave them out rather than resend.
      delete data.owner_phones;
      delete data.manager_phones;
      delete data.seating_enabled;
      delete data.checkin_enabled;
    }

    // Check if date or venue changed — compare using form.date (still the
    // raw local datetime-local string here) before it's converted below;
    // new Date() on a naive "yyyy-MM-ddTHH:mm" string is correctly
    // interpreted as local time per the JS date parsing spec, same as
    // new Date(event.date) correctly parses the backend's timezone-aware
    // ISO string, so both sides land on the same absolute instant for
    // comparison regardless of this conversion.
    const dateChanged = form.date && event.date &&
      new Date(form.date).getTime() !== new Date(event.date).getTime();
    const venueChanged = form.venue_name !== (event.venue_name || "") ||
      form.venue_address !== (event.venue_address || "");
    const descriptionChanged = form.description !== (event.description || "");
    const shouldNotify = dateChanged || venueChanged || descriptionChanged;

    // Same naive-local-string issue as CreateEvent.jsx's handleSubmit —
    // sent as-is, the backend stores the typed wall-clock time as if it
    // were already UTC, shifting the actual moment by this browser's
    // UTC offset. This is the literal cause of Trello #17: an edited
    // hour "not applying" was actually applying, just to the wrong
    // absolute instant, so the next fetch displayed a different (and
    // therefore seemingly-reverted) hour once reconverted to local time.
    if (data.date) data.date = new Date(data.date).toISOString();

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
            <CitySelect value={form.venue_city || ""} onValueChange={v => handleChange("venue_city", v)} placeholder={t.cityPlaceholder} className="h-11" />
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

          {/* Services and owners are set by the team (update_event refuses
              changes from anyone else). */}
          {isTeam && (
          <EventFeaturesFields
            seatingEnabled={form.seating_enabled}
            checkinEnabled={form.checkin_enabled}
            onChange={handleChange}
          />
          )}

          {isTeam && (
          <div className="space-y-3">
            <Label>{t.eventOwners}</Label>
            {owners.length > 0 && (
              <div className="space-y-2">
                {owners.map(o => (
                  <div key={o.phone} className="flex items-center justify-between bg-success/10 rounded-xl px-4 py-2">
                    <div>
                      <p className="text-sm font-medium">{o.name}</p>
                      <p className="text-xs text-muted-foreground" dir="ltr">{o.phone}</p>
                    </div>
                    <button type="button" onClick={() => removeOwner(o.phone)}>
                      <XIcon className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="relative">
              <div className="relative">
                <Input
                  type="text"
                  placeholder={t.ownerSearchPlaceholder}
                  value={ownerSearchInput}
                  onChange={e => handleOwnerSearch(e.target.value)}
                  className="h-11 rounded-xl pl-10"
                  dir="ltr"
                />
                {ownerSearching && (
                  <Loader2 className="w-4 h-4 animate-spin absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                )}
              </div>
              {ownerSearchResults.length > 0 && (
                <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
                  {ownerSearchResults.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => addOwner(u)}
                      disabled={!u.phone}
                      title={!u.phone ? t.ownerNoPhoneHint : undefined}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-sm text-right transition-colors disabled:opacity-40"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate" dir="ltr">{u.phone || u.email}</p>
                      </div>
                      <UserPlus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t.invitationImageSection}</Label>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setCardEditorOpen(true)}>
                <Wand2 className="w-4 h-4" />
                {t.designCardBtn}
              </Button>
            </div>
            {form.invitation_image_url ? (
              <div className="relative w-full">
                <img
                  src={form.invitation_image_url}
                  alt="صورة الدعوة"
                  className="w-full max-h-64 object-contain rounded-xl border"
                />
                <button
                  type="button"
                  onClick={() => handleChange("invitation_image_url", "")}
                  className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                {uploadingImage ? (
                  <Loader2 className="w-7 h-7 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <ImagePlus className="w-7 h-7 text-muted-foreground mb-2" />
                    <span className="text-sm text-muted-foreground">{t.uploadInvitationImage}</span>
                  </>
                )}
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
              </label>
            )}
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
            <Label>{t.whatsappTextSection}</Label>
            <p className="text-xs text-muted-foreground">{t.whatsappTextHint}</p>
            <Textarea
              value={form.whatsapp_invitation_text}
              onChange={e => handleChange("whatsapp_invitation_text", e.target.value)}
              className="rounded-xl min-h-[80px]"
              placeholder={t.whatsappTextPlaceholder}
            />
            {form.whatsapp_invitation_text?.trim() && (
              <div className="rounded-xl border bg-muted/30 p-3 text-sm whitespace-pre-wrap" dir="auto">
                {whatsappInvitationPreview(form.whatsapp_invitation_text, t)}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t.thankYouSection}</Label>
            <p className="text-xs text-muted-foreground">{t.thankYouHint}</p>
            <Textarea
              value={form.thank_you_message}
              onChange={e => handleChange("thank_you_message", e.target.value)}
              className="rounded-xl min-h-[80px]"
              placeholder={t.thankYouPlaceholder}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.thankYouWhatsappSection}</Label>
            <p className="text-xs text-muted-foreground">{t.thankYouWhatsappHint}</p>
            <Label className="text-xs">{t.thankYouEventNameLabel}</Label>
            <Input
              value={form.thank_you_event_name}
              onChange={e => handleChange("thank_you_event_name", e.target.value)}
              className="h-11 rounded-xl"
              placeholder={t.thankYouEventNamePlaceholder}
            />
            <Label className="text-xs">{t.thankYouEventOwnersLabel}</Label>
            <Input
              value={form.thank_you_event_owners}
              onChange={e => handleChange("thank_you_event_owners", e.target.value)}
              className="h-11 rounded-xl"
              placeholder={t.thankYouEventOwnersPlaceholder}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.descriptionSection}</Label>
            <Textarea value={form.description} onChange={e => handleChange("description", e.target.value)} className="rounded-xl min-h-[80px]" />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={mutation.isPending || notifying || uploadingImage} className="flex-1 h-11 rounded-xl gap-2">
              {(mutation.isPending || notifying) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {notifying ? t.notifying : t.saveAndNotify}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl px-6">
              {t.cancel}
            </Button>
          </div>
        </form>
        <InvitationCardEditor
          open={cardEditorOpen}
          onOpenChange={setCardEditorOpen}
          onSaveUrl={(url) => handleChange("invitation_image_url", url)}
        />
      </DialogContent>
    </Dialog>
  );
}