import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, MapPin, Users, Phone, Loader2, ImagePlus, X, UserPlus, UserMinus } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useToast } from "@/components/ui/use-toast";
import { CITY_KEYS, sortCityKeysForDisplay } from "@/lib/cities";
import { useT } from "@/lib/i18n";

const emptyForm = { name: "", city: "", address: "", max_guests: "", map_url: "", phone: "", notes: "", image_url: "", owner_emails: [] };

function VenueOwnerManager({ venue, onUpdate }) {
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const owners = venue.owner_emails || [];

  const handleSearch = async (val) => {
    setSearchInput(val);
    if (val.trim().length < 2) { setSearchResults([]); return; }
    setSearching(true);
    const users = await base44.entities.User.list();
    const q = val.trim().toLowerCase();
    const filtered = users.filter(u =>
      (u.full_name && u.full_name.toLowerCase().includes(q)) ||
      (u.first_name && u.first_name.toLowerCase().includes(q)) ||
      (u.last_name && u.last_name.toLowerCase().includes(q)) ||
      (u.phone && u.phone.includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    );
    setSearchResults(filtered.slice(0, 5));
    setSearching(false);
  };

  const addOwner = async (email) => {
    const e = email.trim().toLowerCase();
    if (!e) return;
    if (owners.includes(e)) { toast({ title: "המייל כבר קיים ברשימה" }); return; }
    setLoading(true);
    await base44.entities.Venue.update(venue.id, { owner_emails: [...owners, e] });
    onUpdate();
    setSearchInput("");
    setSearchResults([]);
    setLoading(false);
    toast({ title: "בעל אולם נוסף בהצלחה" });
  };

  const removeOwner = async (email) => {
    setLoading(true);
    await base44.entities.Venue.update(venue.id, { owner_emails: owners.filter(e => e !== email) });
    onUpdate();
    setLoading(false);
  };

  return (
    <div className="space-y-2">
      <Label>בעלי האולם</Label>
      {owners.length > 0 && (
        <div className="space-y-1">
          {owners.map(email => (
            <div key={email} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-1.5 text-sm">
              <span dir="ltr">{email}</span>
              <button type="button" onClick={() => removeOwner(email)} className="text-destructive hover:text-destructive/80 ml-2">
                <UserMinus className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="relative">
        <div className="flex gap-2">
          <Input
            value={searchInput}
            onChange={e => handleSearch(e.target.value)}
            placeholder="חפש לפי שם, טלפון או מייל"
            className="h-9 rounded-xl flex-1"
          />
          {searching && <Loader2 className="w-4 h-4 animate-spin absolute left-3 top-2.5 text-muted-foreground" />}
        </div>
        {searchResults.length > 0 && (
          <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-xl shadow-lg z-10 overflow-hidden">
            {searchResults.map(u => (
              <button
                key={u.id}
                type="button"
                onClick={() => addOwner(u.email)}
                disabled={loading}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent text-sm text-right transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-semibold text-primary">{u.full_name?.[0] || "?"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{u.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate" dir="ltr">{u.phone || u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">חפש משתמש לפי שם, טלפון או מייל כדי להוסיפו כבעל אולם.</p>
    </div>
  );
}


export default function Venues() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const t = useT();
  const sortedCityKeys = sortCityKeysForDisplay(CITY_KEYS, t, user?.preferred_language || "ar");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [ownerDialogVenue, setOwnerDialogVenue] = useState(null);
  const [selectedCity, setSelectedCity] = useState("all");
  const [uploadingImage, setUploadingImage] = useState(false);

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Venue.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); closeDialog(); toast({ title: t.venueAdded }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Venue.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); closeDialog(); toast({ title: t.venueUpdated }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Venue.delete(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["venues"] }); toast({ title: t.venueDeleted }); },
  });

  const cities = useMemo(() => [...new Set(venues.map(v => v.city).filter(Boolean))], [venues]);
  const filteredVenues = useMemo(() => selectedCity === "all" ? venues : venues.filter(v => v.city === selectedCity), [venues, selectedCity]);

  const openCreate = () => { setEditingVenue(null); setForm(emptyForm); setDialogOpen(true); };
  const openEdit = (v) => { setEditingVenue(v); setForm({ name: v.name || "", city: v.city || "", address: v.address || "", max_guests: v.max_guests || "", map_url: v.map_url || "", phone: v.phone || "", notes: v.notes || "", image_url: v.image_url || "" }); setDialogOpen(true); };
  const closeDialog = () => { setDialogOpen(false); setEditingVenue(null); setForm(emptyForm); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = { ...form };
    if (data.max_guests) data.max_guests = Number(data.max_guests); else delete data.max_guests;
    if (!data.map_url) delete data.map_url;
    if (!data.phone) delete data.phone;
    if (!data.notes) delete data.notes;
    if (editingVenue) updateMutation.mutate({ id: editingVenue.id, data });
    else createMutation.mutate(data);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingImage(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(p => ({ ...p, image_url: file_url }));
    setUploadingImage(false);
  };

  if (!isPrivileged) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">{t.noPagePermission}</div>;
  }

  return (
    <div>
      <PageHeader title={t.venues} subtitle={t.venuesSubtitle}>
        <Button className="gap-2 h-11 rounded-xl" onClick={openCreate}>
          <Plus className="w-4 h-4" />
          {t.addVenue}
        </Button>
      </PageHeader>

      {cities.length > 0 && (
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => setSelectedCity("all")} className={`px-4 py-2 rounded-xl whitespace-nowrap text-sm font-medium transition-colors ${selectedCity === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
            {t.allCities}
          </button>
          {cities.map(city => (
            <button key={city} onClick={() => setSelectedCity(city)} className={`px-4 py-2 rounded-xl whitespace-nowrap text-sm font-medium transition-colors ${selectedCity === city ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
              {t[city] || city}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : venues.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
          <MapPin className="w-10 h-10 opacity-30" />
          <p>{t.noVenuesYet}</p>
        </div>
      ) : filteredVenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground">
          <MapPin className="w-10 h-10 opacity-30" />
          <p>{t.noVenuesInCity}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVenues.map(v => (
            <Card key={v.id} className="overflow-hidden space-y-3">
              {v.image_url && (
                <img src={v.image_url} alt={v.name} className="w-full h-40 object-cover" />
              )}
              <div className="p-5 pt-3 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                <h3 className="font-semibold text-base">{v.name}</h3>
                {v.city && <p className="text-xs text-muted-foreground">{t[v.city] || v.city}</p>}
              </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" title="ניהול בעלים" onClick={() => setOwnerDialogVenue(v)}>
                    <UserPlus className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(v)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteMutation.mutate(v.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {v.address && (
                <div className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>{v.address}</span>
                </div>
              )}
              {v.max_guests && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{t.upToGuests.replace('{n}', v.max_guests)}</span>
                </div>
              )}
              {v.phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span dir="ltr">{v.phone}</span>
                </div>
              )}
              {v.map_url && (
                <a href={v.map_url} target="_blank" rel="noreferrer" className="text-xs text-primary underline">
                  {t.showOnMap}
                </a>
              )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Owner management dialog */}
      <Dialog open={!!ownerDialogVenue} onOpenChange={open => !open && setOwnerDialogVenue(null)}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>ניהול בעלי האולם – {ownerDialogVenue?.name}</DialogTitle>
          </DialogHeader>
          {ownerDialogVenue && (
            <VenueOwnerManager
              venue={venues.find(v => v.id === ownerDialogVenue.id) || ownerDialogVenue}
              onUpdate={() => queryClient.invalidateQueries({ queryKey: ["venues"] })}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md flex flex-col max-h-[90vh] p-0 gap-0" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle>{editingVenue ? t.editVenue : t.addNewVenue}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <div className="space-y-2">
                <Label>{t.venueNameRequired}</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="h-11 rounded-xl" required placeholder={t.venueNamePlaceholder2} />
              </div>
              <div className="space-y-2">
                <Label>{t.cityLabel}</Label>
                <Select value={form.city} onValueChange={v => setForm(p => ({ ...p, city: v }))}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder={t.cityPlaceholder}>
                      {form.city ? (t[form.city] || form.city) : null}
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
                <Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="h-11 rounded-xl" placeholder={t.addressPlaceholder} />
              </div>
              <div className="space-y-2">
                <Label>{t.maxGuestsLabel}</Label>
                <Input type="number" value={form.max_guests} onChange={e => setForm(p => ({ ...p, max_guests: e.target.value }))} className="h-11 rounded-xl" placeholder="500" />
              </div>
              <div className="space-y-2">
                <Label>{t.venuePhone}</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} className="h-11 rounded-xl" dir="ltr" placeholder="05x-xxx-xxxx" />
              </div>
              <div className="space-y-2">
                <Label>{t.mapUrlLabel}</Label>
                <Input value={form.map_url} onChange={e => setForm(p => ({ ...p, map_url: e.target.value }))} className="h-11 rounded-xl" dir="ltr" placeholder="https://maps.google.com/..." />
              </div>
              <div className="space-y-2">
                <Label>{t.venueImage}</Label>
                {form.image_url ? (
                  <div className="relative">
                    <img src={form.image_url} alt={t.venueImage} className="w-full h-40 object-cover rounded-xl" />
                    <button type="button" onClick={() => setForm(p => ({ ...p, image_url: "" }))} className="absolute top-2 left-2 bg-black/50 text-white rounded-full p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/50 transition-colors">
                    {uploadingImage ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <><ImagePlus className="w-6 h-6 text-muted-foreground mb-1" /><span className="text-sm text-muted-foreground">{t.uploadVenueImage}</span></>}
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                  </label>
                )}
              </div>
              <div className="space-y-2">
                <Label>{t.venueNotes}</Label>
                <Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className="rounded-xl min-h-[80px]" placeholder={t.venueNotesPlaceholder} />
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0 bg-background">
              <Button type="submit" disabled={isPending} className="flex-1 h-11 rounded-xl gap-2">
                {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingVenue ? t.saveVenue : t.addVenueBtn}
              </Button>
              <Button type="button" variant="outline" onClick={closeDialog} className="h-11 rounded-xl">{t.cancel}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}