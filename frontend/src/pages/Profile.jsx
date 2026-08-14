import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useT } from "@/lib/i18n";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import PageHeader from "@/components/shared/PageHeader";
import { Link } from "react-router-dom";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { CITY_KEYS, sortCityKeysForDisplay } from "@/lib/cities";
import {
  LogOut, Mail, Shield, Trash2, AlertTriangle, Save, Loader2, Users, Camera
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Profile() {
  const { user, checkAppState } = useAuth();
  const t = useT();
  const { toast } = useToast();
  const navigate = useNavigate();
  const wasIncomplete = user && (!user.first_name || !user.last_name || !user.town || !user.phone);
  const isPrivileged = user?.role === "admin" || user?.role === "manager";
  const lang = user?.preferred_language || "ar";
  const sortedCityKeys = sortCityKeysForDisplay(CITY_KEYS, t, lang);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    nickname: "",
    phone: "",
    town: "",
    preferred_language: "ar",
  });

  useEffect(() => {
    base44.auth.me().then(async freshUser => {
      if (!freshUser) return;
      const baseForm = {
        first_name: freshUser.first_name || "",
        last_name: freshUser.last_name || "",
        nickname: freshUser.nickname || "",
        phone: freshUser.phone || "",
        town: freshUser.town || "",
        preferred_language: freshUser.preferred_language || "ar",
      };
      // If profile is empty, try to pre-fill from InvitationRecipient
      if (!freshUser.first_name && !freshUser.last_name) {
        let invitationRecord = null;
        // 1. Search by user_id (set after OTP verification)
        const byUserId = await base44.entities.InvitationRecipient.filter({ user_id: freshUser.id });
        if (byUserId.length > 0) invitationRecord = byUserId[0];
        // 2. Fallback: search by email
        if (!invitationRecord && freshUser.email) {
          const byEmail = await base44.entities.InvitationRecipient.filter({ email: freshUser.email });
          if (byEmail.length > 0) invitationRecord = byEmail[0];
        }
        // 3. Fallback: search by phone
        if (!invitationRecord && freshUser.phone) {
          const byPhone = await base44.entities.InvitationRecipient.filter({ phone: freshUser.phone });
          if (byPhone.length > 0) invitationRecord = byPhone[0];
        }
        if (invitationRecord) {
          if (invitationRecord.first_name) baseForm.first_name = invitationRecord.first_name;
          if (invitationRecord.last_name) baseForm.last_name = invitationRecord.last_name;
          if (invitationRecord.nickname) baseForm.nickname = invitationRecord.nickname;
          if (invitationRecord.phone && !baseForm.phone) baseForm.phone = invitationRecord.phone;
        }
      }
      setForm(baseForm);
    });
  }, []);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setForm(prev => ({ ...prev, photo_url: file_url }));
    await base44.auth.updateMe({ photo_url: file_url });
    setUploadingPhoto(false);
    toast({ title: t.photoUploaded, description: t.photoUploadedDesc, duration: 3000 });
  };

  const handleSave = async () => {
    setSaving(true);
    await base44.auth.updateMe({
      first_name: form.first_name,
      last_name: form.last_name,
      nickname: form.nickname,
      phone: form.phone,
      town: form.town,
      preferred_language: form.preferred_language,
      photo_url: form.photo_url,
    });
    setSaving(false);
    toast({ title: t.profileSaved, description: t.profileSavedDesc, duration: 3000 });
    await checkAppState?.();
    if (wasIncomplete && form.first_name && form.last_name && form.town && form.phone) {
      navigate("/");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await base44.functions.invoke('deleteAccount', {});
      await base44.auth.logout("/");
    } catch {
      setDeleting(false);
      toast({ title: t.deleteError, description: t.deleteErrorDesc, variant: "destructive" });
    }
  };

  const roleLabel = { admin: t.roleAdmin, manager: t.roleManager, user: t.roleUser };

  return (
    <div>
      <PageHeader title={t.profileTitle} subtitle={t.profileSubtitle}>
        {isPrivileged && (
          <Button asChild variant="outline" className="gap-2">
            <Link to="/users">
              <Users className="w-4 h-4" />
              {t.manageUsers}
            </Link>
          </Button>
        )}
      </PageHeader>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="relative mb-3 group">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden">
            {form.photo_url ? (
              <img src={form.photo_url} alt="صورة الملف" className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-primary">
                {(form.first_name || user?.full_name)?.[0]?.toUpperCase() || "U"}
              </span>
            )}
          </div>
          <label className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
            {uploadingPhoto
              ? <Loader2 className="w-5 h-5 text-white animate-spin" />
              : <Camera className="w-5 h-5 text-white" />}
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
          </label>
        </div>
        <h2 className="text-xl font-semibold">
          {[form.nickname, form.first_name, form.last_name].filter(Boolean).join(" ") || user?.full_name || "—"}
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
        <Badge variant="outline" className="mt-2 gap-1">
          <Shield className="w-3 h-3" />
          {roleLabel[user?.role] || user?.role}
        </Badge>
      </div>

      {/* Edit Form */}
      <Card className="p-6 mb-4 space-y-5">
        <h3 className="font-semibold text-base">{t.personalInfo}</h3>

        <div className="space-y-2">
          <Label>{t.nicknameLabel} <span className="text-muted-foreground font-normal text-xs">{t.nicknameHint}</span></Label>
          <Input
            value={form.nickname}
            onChange={e => setForm(prev => ({ ...prev, nickname: e.target.value }))}
            placeholder={t.nicknamePlaceholder}
            className="h-11 rounded-xl text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{t.firstName}</Label>
            <Input
              value={form.first_name}
              onChange={e => setForm(prev => ({ ...prev, first_name: e.target.value }))}
              placeholder={t.firstName}
              className="h-11 rounded-xl text-base"
            />
          </div>
          <div className="space-y-2">
            <Label>{t.lastName}</Label>
            <Input
              value={form.last_name}
              onChange={e => setForm(prev => ({ ...prev, last_name: e.target.value }))}
              placeholder={t.lastName}
              className="h-11 rounded-xl text-base"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t.email}</Label>
          <div className="relative">
            <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={user?.email || ""}
              disabled
              className="h-11 rounded-xl text-base pr-10 bg-muted/40"
              dir="ltr"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t.phoneLabel} <span className="text-destructive">*</span></Label>
          <Input
            value={form.phone}
            onChange={e => setForm(prev => ({ ...prev, phone: e.target.value }))}
            placeholder="05x-xxx-xxxx"
            className="h-11 rounded-xl text-base"
            dir="ltr"
          />
        </div>

        <div className="space-y-2">
          <Label>{t.town}</Label>
          <Select value={form.town} onValueChange={v => setForm(prev => ({ ...prev, town: v }))}>
            <SelectTrigger className="h-11 rounded-xl text-base">
              <SelectValue placeholder={t.townPlaceholder}>
                {form.town ? (t[form.town] || form.town) : null}
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
          <Label>{t.preferredLanguage}</Label>
          <Select
            value={form.preferred_language}
            onValueChange={v => setForm(prev => ({ ...prev, preferred_language: v }))}
          >
            <SelectTrigger className="h-11 rounded-xl text-base">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ar">{t.langAr}</SelectItem>
              <SelectItem value="he">{t.langHe}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving || !form.phone.trim()}
          className="w-full h-11 rounded-xl gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.saveProfile}
        </Button>
      </Card>

      {/* Actions */}
      <div className="space-y-3">
        <Card className="overflow-hidden">
          <button
            onClick={() => base44.auth.logout()}
            className="w-full flex items-center gap-4 px-6 py-4 text-right hover:bg-accent transition-colors"
          >
            <LogOut className="w-5 h-5 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">{t.logout}</span>
          </button>
        </Card>

        <Card className="overflow-hidden border-destructive/20">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full flex items-center gap-4 px-6 py-4 text-right hover:bg-destructive/5 transition-colors">
                <Trash2 className="w-5 h-5 text-destructive flex-shrink-0" />
                <div className="flex-1 text-right">
                  <p className="text-sm font-medium text-destructive">{t.deleteAccount}</p>
                  <p className="text-xs text-muted-foreground">{t.deleteAccountDesc}</p>
                </div>
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                  <AlertTriangle className="w-5 h-5" />
                  {t.confirmDeleteAccount}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t.confirmDeleteDesc}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>{t.cancel}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                >
                  {deleting ? t.deleting : t.yesDelete}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Card>
      </div>
    </div>
  );
}