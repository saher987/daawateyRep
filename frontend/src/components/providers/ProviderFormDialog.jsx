import React, { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Loader2, Plus, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";
import CitySelect from "@/components/shared/CitySelect";
import MobileSelect from "@/components/shared/MobileSelect";
import { localized } from "@/lib/providerIcons";

const MAX_GALLERY = 10;

const emptyForm = {
  category_id: "", name: "", city: "", address: "", map_url: "", phone: "", whatsapp: "",
  instagram_url: "", facebook_url: "", website_url: "", description_ar: "", description_he: "",
  logo_url: "", cover_url: "", gallery_urls: [], price_from: "", is_published: true, is_featured: false,
};

function toForm(provider) {
  const form = { ...emptyForm };
  for (const key of Object.keys(emptyForm)) {
    if (provider[key] !== null && provider[key] !== undefined) form[key] = provider[key];
  }
  return form;
}

// Every text field the backend stores as nullable: "" from an untouched
// input goes up as null, not as an empty string. An owner's own listing
// never sends the publish/featured switches — those stay with admins.
function toPayload(form, owner) {
  const data = { ...form };
  if (owner) {
    delete data.is_published;
    delete data.is_featured;
  }
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && !value.trim()) data[key] = null;
  }
  data.price_from = form.price_from === "" || form.price_from === null ? null : Number(form.price_from);
  return data;
}

function ImageSlot({ label, url, uploading, onPick, onClear, round }) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {url ? (
        <div className={`relative overflow-hidden bg-muted ${round ? "w-24 h-24 rounded-full" : "h-24 rounded-xl"}`}>
          <img src={url} alt={label} className="w-full h-full object-cover" />
          <button type="button" onClick={onClear} aria-label="x" className="absolute top-1.5 left-1.5 bg-black/50 text-white rounded-full p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center border-2 border-dashed border-border cursor-pointer hover:bg-muted/50 transition-colors ${round ? "w-24 h-24 rounded-full" : "h-24 rounded-xl"}`}>
          {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
          <span className="text-xs text-muted-foreground mt-1">{t.uploadImage}</span>
          <input type="file" accept="image/*" className="hidden" onChange={onPick} disabled={uploading} />
        </label>
      )}
    </div>
  );
}

// `owner`: a business editing its own listing ("List your business") —
// goes through /api/my-providers, needs a phone, and has no publish/featured
// switches; every save goes to admin review.
export default function ProviderFormDialog({ open, onOpenChange, provider, categories, owner = false }) {
  const t = useT();
  const { user, checkAppState } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isAdmin = user?.role === "admin";

  // Reset only when the dialog opens — not on every categories refetch,
  // which would wipe what's being typed.
  useEffect(() => {
    if (open) setForm(provider ? toForm(provider) : { ...emptyForm, category_id: categories[0]?.id || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  const set = (key) => (e) => setForm((p) => ({ ...p, [key]: e?.target ? e.target.value : e }));

  const onDone = (title) => {
    queryClient.invalidateQueries({ queryKey: ["manage-providers"] });
    queryClient.invalidateQueries({ queryKey: ["manage-provider-categories"] });
    queryClient.invalidateQueries({ queryKey: ["providers"] });
    queryClient.invalidateQueries({ queryKey: ["provider"] });
    queryClient.invalidateQueries({ queryKey: ["provider-categories"] });
    if (owner) {
      queryClient.invalidateQueries({ queryKey: ["my-providers"] });
      // /api/me's owns_provider drives the "My business" menu item.
      checkAppState?.();
    }
    toast({ title });
    onOpenChange(false);
  };
  const onError = (e) => toast({
    title: t.addError,
    description: e?.message === "listing_limit_reached" ? t.listingLimitReached : e?.message || t.addErrorDesc,
    variant: "destructive",
  });

  const save = useMutation({
    mutationFn: (data) => {
      if (owner) return provider ? base44.providers.myUpdate(provider.id, data) : base44.providers.mySubmit(data);
      return provider ? base44.providers.manageUpdate(provider.id, data) : base44.providers.manageCreate(data);
    },
    onSuccess: () => onDone(owner ? t.businessSubmitted : t.providerSaved),
    onError,
  });
  const remove = useMutation({
    mutationFn: () => (owner ? base44.providers.myDelete(provider.id) : base44.providers.manageDelete(provider.id)),
    onSuccess: () => onDone(t.providerDeleted),
    onError,
  });

  const upload = (slot) => async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(slot);
    try {
      if (slot === "gallery") {
        const room = MAX_GALLERY - form.gallery_urls.length;
        const urls = [];
        for (const file of files.slice(0, room)) {
          const { file_url } = await base44.integrations.Core.UploadFile({ file });
          urls.push(file_url);
        }
        setForm((p) => ({ ...p, gallery_urls: [...p.gallery_urls, ...urls].slice(0, MAX_GALLERY) }));
      } else {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: files[0] });
        setForm((p) => ({ ...p, [slot]: file_url }));
      }
    } catch (err) {
      onError(err);
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    save.mutate(toPayload(form, owner));
  };

  const categoryOptions = categories.map((c) => ({ value: c.id, label: localized(c, "name", t.langCode) }));

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg flex flex-col max-h-[90vh] p-0 gap-0" dir="rtl">
          <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
            <DialogTitle>{owner ? (provider ? t.editMyBusiness : t.listYourBusiness) : provider ? t.editProvider : t.addProvider}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              <div className="flex gap-4 items-start">
                <ImageSlot round label={t.logoLabel} url={form.logo_url} uploading={uploading === "logo_url"} onPick={upload("logo_url")} onClear={() => setForm((p) => ({ ...p, logo_url: "" }))} />
                <div className="flex-1">
                  <ImageSlot label={t.coverLabel} url={form.cover_url} uploading={uploading === "cover_url"} onPick={upload("cover_url")} onClear={() => setForm((p) => ({ ...p, cover_url: "" }))} />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="f-providerName">{t.providerName}</Label>
                <Input id="f-providerName" value={form.name} onChange={set("name")} className="h-11 rounded-xl" required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.providerCategory}</Label>
                  <MobileSelect value={form.category_id} onValueChange={set("category_id")} options={categoryOptions} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label>{t.providerCity}</Label>
                  <CitySelect value={form.city} onValueChange={set("city")} placeholder={t.cityPlaceholder} className="h-11" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="f-descriptionAr">{t.descriptionAr}</Label>
                <Textarea id="f-descriptionAr" value={form.description_ar} onChange={set("description_ar")} className="rounded-xl min-h-[80px]" dir="rtl" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-descriptionHe">{t.descriptionHe}</Label>
                <Textarea id="f-descriptionHe" value={form.description_he} onChange={set("description_he")} className="rounded-xl min-h-[80px]" dir="rtl" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="f-providerPhone">{t.providerPhone}</Label>
                  <Input id="f-providerPhone" type="tel" value={form.phone} onChange={set("phone")} className="h-11 rounded-xl" dir="ltr" placeholder="05x-xxx-xxxx" required={owner} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-providerWhatsapp">{t.providerWhatsapp}</Label>
                  <Input id="f-providerWhatsapp" type="tel" value={form.whatsapp} onChange={set("whatsapp")} className="h-11 rounded-xl" dir="ltr" placeholder="05x-xxx-xxxx" />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-instagramLink">{t.instagramLink}</Label>
                <Input id="f-instagramLink" value={form.instagram_url} onChange={set("instagram_url")} className="h-11 rounded-xl" dir="ltr" placeholder="https://instagram.com/..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-facebookLink">{t.facebookLink}</Label>
                <Input id="f-facebookLink" value={form.facebook_url} onChange={set("facebook_url")} className="h-11 rounded-xl" dir="ltr" placeholder="https://facebook.com/..." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-websiteLink">{t.websiteLink}</Label>
                <Input id="f-websiteLink" value={form.website_url} onChange={set("website_url")} className="h-11 rounded-xl" dir="ltr" placeholder="https://..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="f-priceFromLabel">{t.priceFromLabel}</Label>
                  <Input id="f-priceFromLabel" type="number" min="0" inputMode="numeric" value={form.price_from} onChange={set("price_from")} className="h-11 rounded-xl" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="f-providerMapUrl">{t.providerMapUrl}</Label>
                  <Input id="f-providerMapUrl" value={form.map_url} onChange={set("map_url")} className="h-11 rounded-xl" dir="ltr" placeholder="https://maps..." />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-providerAddress">{t.providerAddress}</Label>
                <Input id="f-providerAddress" value={form.address} onChange={set("address")} className="h-11 rounded-xl" />
              </div>

              <div className="space-y-2">
                <Label>{t.galleryLabel.replace("{n}", form.gallery_urls.length)}</Label>
                <div className="grid grid-cols-4 gap-1.5">
                  {form.gallery_urls.map((url) => (
                    <div key={url} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => setForm((p) => ({ ...p, gallery_urls: p.gallery_urls.filter((u) => u !== url) }))}
                        className="absolute top-1 left-1 bg-black/50 text-white rounded-full p-0.5"
                        aria-label="x"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {form.gallery_urls.length < MAX_GALLERY && (
                    <label className="aspect-square rounded-lg border-2 border-dashed border-border flex items-center justify-center cursor-pointer hover:bg-muted/50">
                      {uploading === "gallery" ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <Plus className="w-5 h-5 text-primary" />}
                      <input type="file" accept="image/*" multiple className="hidden" onChange={upload("gallery")} disabled={uploading === "gallery"} />
                    </label>
                  )}
                </div>
              </div>

              {owner ? (
                <p className="rounded-xl bg-muted px-4 py-3 text-xs text-muted-foreground">{t.businessReviewHint}</p>
              ) : (
              <div className="rounded-xl border border-border divide-y divide-border">
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{t.publishedLabel}</span>
                    <span className="block text-xs text-muted-foreground">{t.publishedHint}</span>
                  </span>
                  <Switch checked={form.is_published} onCheckedChange={(v) => setForm((p) => ({ ...p, is_published: v }))} />
                </label>
                <label className="flex items-center gap-3 px-4 py-3 cursor-pointer">
                  <span className="flex-1">
                    <span className="block text-sm font-semibold">{t.featuredLabel}</span>
                    <span className="block text-xs text-muted-foreground">{t.featuredHint}</span>
                  </span>
                  <Switch checked={form.is_featured} onCheckedChange={(v) => setForm((p) => ({ ...p, is_featured: v }))} />
                </label>
              </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t flex-shrink-0 bg-background">
              <Button type="submit" disabled={save.isPending || !!uploading || !form.category_id} className="flex-1 h-11 rounded-xl gap-2">
                {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {owner ? t.submitForReview : t.saveBtn}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl">{t.cancel}</Button>
              {provider && (isAdmin || owner) && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} className="h-11 w-11 text-destructive hover:text-destructive" aria-label={t.deletePermanently}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deletePermanently}</AlertDialogTitle>
            <AlertDialogDescription>{owner ? t.confirmDeleteMyBusiness : t.confirmDeleteProvider}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t.deletePermanently}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
