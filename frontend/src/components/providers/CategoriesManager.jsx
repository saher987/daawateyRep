import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { PROVIDER_ICONS, localized, providerIcon } from "@/lib/providerIcons";

const emptyForm = { name_ar: "", name_he: "", icon: "camera", is_active: true };

// The categories tab of ManageProviders: add/edit/hide, move up/down (the
// order users see), and — admin only — delete an empty category.
export default function CategoriesManager() {
  const t = useT();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [form, setForm] = useState(emptyForm);
  const isAdmin = user?.role === "admin";

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["manage-provider-categories"],
    queryFn: () => base44.providers.manageListCategories(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["manage-provider-categories"] });
    queryClient.invalidateQueries({ queryKey: ["provider-categories"] });
  };
  const onError = (e) =>
    toast({
      title: t.addError,
      description: e?.message === "category_has_providers" ? t.categoryHasProviders : e?.message || t.addErrorDesc,
      variant: "destructive",
    });

  const save = useMutation({
    mutationFn: (data) => (editing?.id ? base44.providers.manageUpdateCategory(editing.id, data) : base44.providers.manageCreateCategory(data)),
    onSuccess: () => { refresh(); setEditing(null); toast({ title: t.providerSaved }); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id) => base44.providers.manageDeleteCategory(id),
    onSuccess: () => { refresh(); setEditing(null); toast({ title: t.providerDeleted }); },
    onError,
  });
  const reorder = useMutation({
    mutationFn: (ids) => base44.providers.manageReorderCategories(ids),
    onSuccess: refresh,
    onError,
  });

  const move = (index, delta) => {
    const ids = categories.map((c) => c.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    // Optimistic: the list reorders right away, the server catches up.
    queryClient.setQueryData(["manage-provider-categories"], ids.map((id) => categories.find((c) => c.id === id)));
    reorder.mutate(ids);
  };

  const openNew = () => { setForm(emptyForm); setEditing({}); };
  const openEdit = (c) => { setForm({ name_ar: c.name_ar, name_he: c.name_he, icon: c.icon, is_active: c.is_active }); setEditing(c); };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button className="gap-2 h-11 rounded-xl" onClick={openNew}>
          <Plus className="w-4 h-4" />
          {t.addCategory}
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
        {categories.map((c, i) => {
          const Icon = providerIcon(c.icon);
          return (
            <div key={c.id} className={`flex items-center gap-3 px-3 py-2.5 ${c.is_active ? "" : "bg-muted/50"}`}>
              <div className="flex flex-col">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={t.moveUp} className="p-1 text-muted-foreground disabled:opacity-30">
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === categories.length - 1} aria-label={t.moveDown} className="p-1 text-muted-foreground disabled:opacity-30">
                  <ArrowDown className="w-4 h-4" />
                </button>
              </div>
              <span className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${c.is_active ? "bg-primary/10" : "bg-muted"}`}>
                <Icon className={`w-5 h-5 ${c.is_active ? "text-primary" : "text-muted-foreground"}`} />
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-semibold truncate ${c.is_active ? "" : "text-muted-foreground"}`}>{localized(c, "name", t.langCode)}</span>
                <span className="block text-xs text-muted-foreground truncate">
                  {localized(c, "name", t.langCode === "he" ? "ar" : "he")} · {t.providerCount.replace("{n}", c.provider_count)}
                  {!c.is_active && ` · ${t.categoryHidden}`}
                </span>
              </span>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => openEdit(c)} aria-label={t.editCategory}>
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? t.editCategory : t.addCategory}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); save.mutate(form); }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="f-categoryNameAr">{t.categoryNameAr}</Label>
                <Input id="f-categoryNameAr" value={form.name_ar} onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))} className="h-11 rounded-xl" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="f-categoryNameHe">{t.categoryNameHe}</Label>
                <Input id="f-categoryNameHe" value={form.name_he} onChange={(e) => setForm((p) => ({ ...p, name_he: e.target.value }))} className="h-11 rounded-xl" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.categoryIcon}</Label>
              <div className="grid grid-cols-8 gap-1.5">
                {Object.entries(PROVIDER_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, icon: key }))}
                    aria-pressed={form.icon === key}
                    aria-label={key}
                    className={`aspect-square rounded-lg flex items-center justify-center border ${
                      form.icon === key ? "border-primary border-2 bg-primary/10 text-primary" : "border-border text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 cursor-pointer">
              <span className="flex-1 text-sm font-semibold">{t.categoryActive}</span>
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((p) => ({ ...p, is_active: v }))} />
            </label>
            <div className="flex gap-3">
              <Button type="submit" disabled={save.isPending} className="flex-1 h-11 rounded-xl gap-2">
                {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.saveBtn}
              </Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} className="h-11 rounded-xl">{t.cancel}</Button>
              {editing?.id && isAdmin && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove.mutate(editing.id)}
                  disabled={remove.isPending || editing.provider_count > 0}
                  title={editing.provider_count > 0 ? t.categoryHasProviders : t.deletePermanently}
                  aria-label={t.deletePermanently}
                  className="h-11 w-11 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
