import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Heart, Phone, Calendar, User, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MobileSelect from "@/components/shared/MobileSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import { CITY_KEYS } from "@/lib/cities";
import moment from "moment";

export default function PlannedWeddings() {
  const { user } = useAuth();
  const t = useT();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [form, setForm] = useState({ owner_name: "", phone: "", date: "", city: "" });
  const [cityFilter, setCityFilter] = useState("__all__");

  const isAdmin = user?.role === "admin" || user?.role === "manager";
  const isVenueOwner = user?.role === "venue_owner";

  const { data: weddings = [], isLoading } = useQuery({
    queryKey: ["planned-weddings"],
    queryFn: () => base44.entities.PlannedWedding.list("date"),
  });

  // Fetch venues to determine the venue owner's default city
  const { data: venues = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: () => base44.entities.Venue.list(),
    enabled: isVenueOwner,
  });

  const myVenueCity = useMemo(() => {
    if (!isVenueOwner || !venues.length) return null;
    const myVenues = venues.filter(
      (v) => Array.isArray(v.owner_emails) && v.owner_emails.includes(user?.email)
    );
    return myVenues.map((v) => v.city).find((c) => !!c) || null;
  }, [venues, user, isVenueOwner]);

  // Default the city filter to the venue's city for venue owners
  useEffect(() => {
    if (isVenueOwner && myVenueCity && cityFilter === "__all__") {
      setCityFilter(myVenueCity);
    }
  }, [isVenueOwner, myVenueCity, cityFilter]);

  const saveMutation = useMutation({
    mutationFn: async ({ editing, data }) => {
      if (editing) return base44.entities.PlannedWedding.update(editing.id, data);
      return base44.entities.PlannedWedding.create(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planned-weddings"] });
      toast({ title: t.saved });
      setDialogOpen(false);
    },
    onError: () => toast({ title: t.addError, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PlannedWedding.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planned-weddings"] });
      toast({ title: t.venueDeleted });
      setDeleteId(null);
    },
  });

  const openAdd = () => {
    setEditing(null);
    setForm({ owner_name: "", phone: "", date: "", city: "" });
    setDialogOpen(true);
  };

  const openEdit = (w) => {
    setEditing(w);
    setForm({
      owner_name: w.owner_name || "",
      phone: w.phone || "",
      date: w.date ? moment(w.date).format("YYYY-MM-DD") : "",
      city: w.city || "",
    });
    setDialogOpen(true);
  };

  const submit = () => {
    if (!form.owner_name || !form.date) {
      toast({ title: t.nameRequired, variant: "destructive" });
      return;
    }
    saveMutation.mutate({ editing, data: form });
  };

  const fmtDate = (d) => (d ? moment(d).format("DD/MM/YYYY") : "—");

  const filteredWeddings = useMemo(() => {
    if (cityFilter === "__all__") return weddings;
    return weddings.filter((w) => w.city === cityFilter);
  }, [weddings, cityFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <Heart className="w-6 h-6 text-primary" />
            {isAdmin ? t.upcomingWeddings : t.plannedWeddings}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t.plannedWeddingsSubtitle}</p>
        </div>
        {isAdmin && (
          <Button onClick={openAdd} className="gap-2">
            <Plus className="w-4 h-4" />
            {t.addWedding}
          </Button>
        )}
      </div>

      {/* City filter dropdown */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t.filterByCity}:</span>
        </div>
        <MobileSelect
          value={cityFilter}
          onValueChange={setCityFilter}
          options={[
            { value: "__all__", label: t.allCities },
            ...CITY_KEYS.map((key) => ({ value: key, label: t[key] || key })),
          ]}
          placeholder={t.allCities}
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : filteredWeddings.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>{t.noWeddings}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredWeddings.map((w) => (
            <Card key={w.id} className="overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4 flex-wrap">
                <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <p className="font-semibold text-sm">{w.owner_name}</p>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {w.phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        <span dir="ltr">{w.phone}</span>
                      </p>
                    )}
                    {w.city && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {t[w.city] || w.city}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  {fmtDate(w.date)}
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(w)} aria-label={t.editWedding}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {user?.role === "admin" && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => setDeleteId(w.id)} aria-label={t.deleteBtn}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t.editWedding : t.addWedding}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{t.weddingOwnerName} *</Label>
              <Input
                value={form.owner_name}
                onChange={(e) => setForm({ ...form, owner_name: e.target.value })}
                placeholder={t.weddingOwnerNamePlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.mobilePhoneOptional}</Label>
              <Input
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="050-1234567"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.weddingDate} *</Label>
              <Input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t.weddingCity}</Label>
              <MobileSelect
                value={form.city || "__none__"}
                onValueChange={(v) => setForm({ ...form, city: v === "__none__" ? "" : v })}
                options={[
                  { value: "__none__", label: "—" },
                  ...CITY_KEYS.map((key) => ({ value: key, label: t[key] || key })),
                ]}
                placeholder={t.allCities}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t.cancel}
            </Button>
            <Button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? t.saving : t.saveChanges}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteWeddingConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {t.deleteBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}