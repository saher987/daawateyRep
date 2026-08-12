import React, { useState } from "react";
import { CITY_KEYS, sortCityKeysForDisplay } from "@/lib/cities";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Search, CheckCircle, XCircle, UserPlus, X as XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { ArrowRight, Save, Loader2, ImagePlus, X, Wand2 } from "lucide-react";
import MobileSelect from "@/components/shared/MobileSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import InvitationCardEditor from "@/components/events/InvitationCardEditor";

export default function CreateEvent() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const t = useT();
  const sortedCityKeys = sortCityKeysForDisplay(CITY_KEYS, t, user?.preferred_language || "ar");

  const eventTypes = [
    { value: "wedding", label: t.eventTypeWedding },
    { value: "engagement", label: t.eventTypeEngagement },
    { value: "birthday", label: t.eventTypeBirthday },
    { value: "graduation", label: t.eventTypeGraduation },
    { value: "corporate", label: t.eventTypeCorporate },
    { value: "other", label: t.eventTypeOther },
  ];

  const [form, setForm] = useState({
    title: "",
    title_ar: "",
    event_type: "wedding",
    date: "",
    venue_name: "",
    venue_address: "",
    venue_map_url: "",
    venue_city: "",
    description: "",
    groom_name: "",
    bride_name: "",
    host_name: "",
    host_phone: "",
    max_guests: "",
    status: "draft",
    invitation_image_url: "",
    invitation_greeting: "",
  });

  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list("-name"),
  });

  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cardEditorOpen, setCardEditorOpen] = useState(false);
  const [ownerPhoneInput, setOwnerPhoneInput] = useState("");
  const [ownerLookupStatus, setOwnerLookupStatus] = useState(null); // null | 'found' | 'not_found'
  const [ownerLookupName, setOwnerLookupName] = useState("");
  const [owners, setOwners] = useState([]); // [{phone, name, email}]

  const handleOwnerPhoneLookup = async (value) => {
    setOwnerPhoneInput(value);
    setOwnerLookupStatus(null);
    setOwnerLookupName("");
    if (value.length < 5) return;

    // Determine if input looks like email or phone
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
    const isEmail = ownerPhoneInput.includes("@");
    const users = isEmail
      ? await base44.entities.User.filter({ email: ownerPhoneInput })
      : await base44.entities.User.filter({ phone: ownerPhoneInput });
    if (users.length === 0) return;
    const u = users[0];
    if (owners.find(o => o.email === u.email)) return; // already added
    setOwners(prev => [...prev, { phone: u.phone || ownerPhoneInput, name: u.full_name, email: u.email }]);
    setOwnerPhoneInput("");
    setOwnerLookupStatus(null);
    setOwnerLookupName("");
  };

  const removeOwner = (email) => {
    setOwners(prev => prev.filter(o => o.email !== email));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    handleChange("invitation_image_url", file_url);
    setUploadingImage(false);
  };

  const mutation = useMutation({
    mutationFn: (data) => base44.entities.Event.create(data),
    onMutate: () => {
      // Optimistic: disable UI immediately, button feedback is instant
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast({ title: t.eventCreated, description: t.eventCreatedDesc });
      navigate(`/events/${result.id}`);
    },
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.max_guests) data.max_guests = Number(data.max_guests);
    else delete data.max_guests;
    if (!isPrivileged) {
      data.owner_emails = [user?.email];
    } else {
      data.owner_emails = owners.map(o => o.email);
    }
    mutation.mutate(data);
  };

  const isWedding = form.event_type === "wedding" || form.event_type === "engagement";

  if (!isPrivileged) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <p className="text-muted-foreground text-lg">{t.noPermission}</p>
        <Button variant="outline" onClick={() => navigate("/events")}>{t.backToEvents}</Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t.newEventTitle} subtitle={t.newEventSubtitle}>
        <Button variant="ghost" className="gap-2" onClick={() => navigate("/events")}>
          {t.back}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </PageHeader>

      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {/* Basic Info */}
        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">{t.basicInfo}</h2>
          
          <div className="space-y-2">
            <Label>{t.eventNameLabel}</Label>
            <Input
              placeholder={t.eventNamePlaceholder}
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              className="h-12 rounded-xl text-base"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t.eventTypeLabel}</Label>
            <MobileSelect
              value={form.event_type}
              onValueChange={(v) => handleChange("event_type", v)}
              options={eventTypes}
              placeholder={t.eventTypeLabel}
            />
          </div>

          <div className="space-y-2">
            <Label>{t.dateTimeLabel}</Label>
            <Input
              type="datetime-local"
              value={form.date}
              onChange={(e) => handleChange("date", e.target.value)}
              className="h-12 rounded-xl text-base"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>{t.maxGuestsLabel}</Label>
            <Input
              type="number"
              placeholder={t.optional}
              value={form.max_guests}
              onChange={(e) => handleChange("max_guests", e.target.value)}
              className="h-12 rounded-xl text-base"
            />
          </div>

          {isPrivileged && (
            <div className="space-y-3">
              <Label>{t.eventOwners}</Label>
              {/* Added owners list */}
              {owners.length > 0 && (
                <div className="space-y-2">
                  {owners.map(o => (
                    <div key={o.email} className="flex items-center justify-between bg-success/10 rounded-xl px-4 py-2">
                      <div>
                        <p className="text-sm font-medium">{o.name}</p>
                        <p className="text-xs text-muted-foreground" dir="ltr">{o.phone}</p>
                      </div>
                      <button type="button" onClick={() => removeOwner(o.email)}>
                        <XIcon className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {/* Phone input + add button */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    placeholder="05xxxxxxxx أو email@example.com"
                    value={ownerPhoneInput}
                    onChange={(e) => handleOwnerPhoneLookup(e.target.value)}
                    className="h-12 rounded-xl text-base pl-10"
                    dir="ltr"
                  />
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    {ownerLookupStatus === "found" && <CheckCircle className="w-5 h-5 text-success" />}
                    {ownerLookupStatus === "not_found" && <XCircle className="w-5 h-5 text-destructive" />}
                    {!ownerLookupStatus && <Search className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-12 rounded-xl gap-2"
                  disabled={ownerLookupStatus !== "found"}
                  onClick={addOwner}
                >
                  <UserPlus className="w-4 h-4" />
                  {t.addOwner}
                </Button>
              </div>
              {ownerLookupStatus === "found" && (
                <p className="text-sm text-success">{t.ownerFound} {ownerLookupName}</p>
              )}
              {ownerLookupStatus === "not_found" && (
                <p className="text-sm text-destructive">{t.ownerNotFound}</p>
              )}
              <p className="text-xs text-muted-foreground">{t.ownersHint}</p>
            </div>
          )}
        </Card>

        {/* Wedding-specific */}
        {isWedding && (
          <Card className="p-6 space-y-5">
            <h2 className="font-semibold text-lg">{t.coupleInfo}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t.groomName}</Label>
                <Input
                  placeholder={t.groomName}
                  value={form.groom_name}
                  onChange={(e) => handleChange("groom_name", e.target.value)}
                  className="h-12 rounded-xl text-base"
                />
              </div>
              <div className="space-y-2">
                <Label>{t.brideName}</Label>
                <Input
                  placeholder={t.brideName}
                  value={form.bride_name}
                  onChange={(e) => handleChange("bride_name", e.target.value)}
                  className="h-12 rounded-xl text-base"
                />
              </div>
            </div>
          </Card>
        )}

        {/* Venue */}
        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">{t.venueSection}</h2>
          {venues.length > 0 && (
            <div className="space-y-2">
              <Label>{t.venueSelectLabel}</Label>
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
                options={[...venues.map(v => ({ value: v.id, label: v.name })), { value: "__manual__", label: t.manualEntry }]}
                placeholder={t.venueSelectPlaceholder}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t.venueNameLabel}</Label>
            <Input
              placeholder={t.venueNamePlaceholder}
              value={form.venue_name}
              onChange={(e) => handleChange("venue_name", e.target.value)}
              className="h-12 rounded-xl text-base"
              required
            />
          </div>
          <div className="space-y-2">
            <Label>{t.cityLabel}</Label>
            <Select value={form.venue_city} onValueChange={v => handleChange("venue_city", v)}>
              <SelectTrigger className="h-12 rounded-xl text-base">
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
            <Input
              placeholder={t.addressPlaceholder}
              value={form.venue_address}
              onChange={(e) => handleChange("venue_address", e.target.value)}
              className="h-12 rounded-xl text-base"
            />
          </div>
          <div className="space-y-2">
            <Label>{t.mapUrlLabel}</Label>
            <Input
              placeholder={t.mapUrlPlaceholder}
              value={form.venue_map_url}
              onChange={(e) => handleChange("venue_map_url", e.target.value)}
              className="h-12 rounded-xl text-base"
              dir="ltr"
            />
          </div>
        </Card>

        {/* Host Info */}
        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">{t.hostSection}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t.hostNameLabel}</Label>
              <Input
                placeholder={t.hostNameLabel}
                value={form.host_name}
                onChange={(e) => handleChange("host_name", e.target.value)}
                className="h-12 rounded-xl text-base"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.hostPhoneLabel}</Label>
              <Input
                placeholder="05x-xxx-xxxx"
                value={form.host_phone}
                onChange={(e) => handleChange("host_phone", e.target.value)}
                className="h-12 rounded-xl text-base"
                dir="ltr"
              />
            </div>
          </div>
        </Card>

        {/* Invitation Image */}
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">{t.invitationImageSection}</h2>
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
                className="w-full max-h-80 object-contain rounded-xl border"
              />
              <button
                type="button"
                onClick={() => handleChange("invitation_image_url", "")}
                className="absolute top-2 left-2 bg-destructive text-destructive-foreground rounded-full p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
              {uploadingImage ? (
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <ImagePlus className="w-8 h-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">{t.uploadInvitationImage}</span>
                </>
              )}
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
            </label>
          )}
        </Card>

        {/* Invitation Greeting */}
        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">{t.invitationGreetingSection}</h2>
          <p className="text-sm text-muted-foreground">{t.invitationGreetingHint}</p>
          <Textarea
            placeholder={t.invitationGreetingPlaceholder}
            value={form.invitation_greeting}
            onChange={(e) => handleChange("invitation_greeting", e.target.value)}
            className="min-h-[100px] rounded-xl text-base"
          />
        </Card>

        {/* Description */}
        <Card className="p-6 space-y-5">
          <h2 className="font-semibold text-lg">{t.descriptionSection}</h2>
          <Textarea
            placeholder={t.descriptionPlaceholder}
            value={form.description}
            onChange={(e) => handleChange("description", e.target.value)}
            className="min-h-[120px] rounded-xl text-base"
          />
        </Card>

        <InvitationCardEditor
          open={cardEditorOpen}
          onOpenChange={setCardEditorOpen}
          onSaveUrl={(url) => handleChange("invitation_image_url", url)}
        />

        {/* Submit */}
        <div className="flex gap-4">
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="gap-2 h-12 px-8 rounded-xl text-base flex-1 sm:flex-none"
          >
            {mutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Save className="w-5 h-5" />
            )}
            {t.createEventBtn}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/events")}
            className="h-12 px-8 rounded-xl text-base"
          >
            {t.cancel}
          </Button>
        </div>
      </form>
    </div>
  );
}