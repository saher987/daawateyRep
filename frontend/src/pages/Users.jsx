import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import PageHeader from "@/components/shared/PageHeader";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import MobileSelect from "@/components/shared/MobileSelect";
import { Mail, Phone, MapPin, Pencil, Search, Clock, Users as UsersIcon, X, UserPlus } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar, he } from "date-fns/locale";
import { useT } from "@/lib/i18n";
import { CITY_KEYS } from "@/lib/cities";
const roleColor = {
  admin: "bg-destructive/10 text-destructive",
  manager: "bg-primary/10 text-primary",
  user: "bg-muted text-muted-foreground"
};

export default function Users() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const t = useT();
  const isPrivileged = user?.role === "admin" || user?.role === "manager";

  const roleLabel = { admin: t.roleAdmin, manager: t.roleManager, user: t.roleUser };

  const [search, setSearch] = useState("");
  const [filterTown, setFilterTown] = useState("all");
  const [filterFamily, setFilterFamily] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAddUser, setShowAddUser] = useState(false);
  const [addForm, setAddForm] = useState({ email: "", phone: "", role: "user" });
  const [inviting, setInviting] = useState(false);

  // All hooks must be called before any early return
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => base44.entities.User.list(),
    enabled: isPrivileged,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.User.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: t.userUpdated, description: t.userUpdatedDesc });
      setEditingUser(null);
    },
  });

  const towns = useMemo(() => {
    const set = new Set(users.map(u => u.town).filter(Boolean));
    return [...set].sort();
  }, [users]);

  const getFamilyName = (fullName) => {
    if (!fullName) return "";
    const parts = fullName.trim().split(/\s+/);
    return parts[parts.length - 1];
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      const matchesSearch =
        !search ||
        u.full_name?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.phone?.includes(search);
      const matchesTown = filterTown === "all" || u.town === filterTown;
      const matchesFamily =
        !filterFamily ||
        getFamilyName(u.full_name).toLowerCase().includes(filterFamily.toLowerCase());
      return matchesSearch && matchesTown && matchesFamily;
    });
  }, [users, search, filterTown, filterFamily]);

  // Early return after all hooks
  if (!isPrivileged) {
    navigate("/profile");
    return null;
  }

  const openEdit = (u) => {
    setEditingUser(u);
    setEditForm({
      first_name: u.first_name || "",
      last_name: u.last_name || "",
      nickname: u.nickname || "",
      phone: u.phone || "",
      role: u.role || "user",
      town: u.town || "",
    });
  };

  const handleSave = () => {
    updateMutation.mutate({ id: editingUser.id, data: editForm });
  };

  const handleInviteUser = async () => {
    if (!addForm.email) return;
    setInviting(true);
    try {
      // Adapted from the original: it invited-then-looked-up the freshly
      // provisioned User row to set phone on it. This app's invite is
      // lazily consumed (no User row exists until the invitee actually
      // signs in via Firebase — see PendingInvite's docstring), so phone
      // goes straight into the invite itself instead of a follow-up update.
      await base44.users.inviteUser(addForm.email, addForm.role, addForm.phone || undefined);
      toast({ title: t.inviteSent, description: `${t.inviteSentDesc} ${addForm.email}` });
      setShowAddUser(false);
      setAddForm({ email: "", phone: "", role: "user" });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast({ title: t.inviteError, description: e.message || t.inviteError, variant: "destructive" });
    }
    setInviting(false);
  };

  const formatLastLogin = (dateStr) => {
    if (!dateStr) return t.neverLoggedIn;
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: user?.preferred_language === "he" ? he : ar });
    } catch {
      return "—";
    }
  };

  if (isLoading) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader
        title={t.usersTitle}
        subtitle={`${users.length} ${t.usersRegistered}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-muted-foreground bg-muted rounded-xl px-3 py-2">
            <UsersIcon className="w-4 h-4" />
            <span className="text-sm font-medium">{filteredUsers.length} {t.usersVisible}</span>
          </div>
          <Button onClick={() => setShowAddUser(true)} className="gap-2 rounded-xl h-11">
            <UserPlus className="w-4 h-4" />
            {t.addUser}
          </Button>
        </div>
      </PageHeader>

      <div className="space-y-3 mb-6">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder={t.searchUsers}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-11 h-12 rounded-xl text-base"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <MobileSelect
              value={filterTown}
              onValueChange={setFilterTown}
              options={[{ value: "all", label: t.allCitiesFilter }, ...towns.map(town => ({ value: town, label: t[town] || town }))]}
              placeholder={t.filterByCity}
            />
          </div>

          <div className="flex-1 relative">
            <Input
              placeholder={t.filterByFamily}
              value={filterFamily}
              onChange={e => setFilterFamily(e.target.value)}
              className="h-11 rounded-xl"
            />
            {filterFamily && (
              <button onClick={() => setFilterFamily("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredUsers.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">{t.noUsersFound}</div>
        )}
        {filteredUsers.map(u => (
          <Card key={u.id} className="p-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-primary">{u.full_name?.[0] || "U"}</span>
              </div>

              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">
                    {[u.nickname, u.first_name, u.last_name].filter(Boolean).join(" ") || u.full_name || "—"}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[u.role] || roleColor.user}`}>
                    {roleLabel[u.role] || u.role}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm text-muted-foreground truncate" dir="ltr">{u.email}</span>
                </div>

                {u.phone && (
                  <div className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm text-muted-foreground" dir="ltr">{u.phone}</span>
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap pt-0.5">
                  {u.town && (
                    <div className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground">{t[u.town] || u.town}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">{formatLastLogin(u.last_login)}</span>
                  </div>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => openEdit(u)}
                className="flex-shrink-0"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={showAddUser} onOpenChange={open => { setShowAddUser(open); if (!open) setAddForm({ email: "", phone: "", role: "user" }); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              {t.addNewUser}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">{t.inviteUserDesc}</p>
            <div className="space-y-2">
              <Label>{t.emailLabel}</Label>
              <Input
                type="text"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={addForm.email}
                onChange={e => setAddForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="example@email.com"
                className="h-11 rounded-xl"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.phoneOptionalLabel}</Label>
              <Input
                type="tel"
                value={addForm.phone}
                onChange={e => setAddForm(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="05x-xxx-xxxx"
                className="h-11 rounded-xl"
                dir="ltr"
              />
            </div>
            <div className="space-y-2">
              <Label>{t.roleLabel}</Label>
              <MobileSelect
                value={addForm.role}
                onValueChange={v => setAddForm(prev => ({ ...prev, role: v }))}
                options={[
                  { value: "user", label: t.roleUser },
                  { value: "manager", label: t.roleManager },
                  ...(user?.role === "admin" ? [{ value: "admin", label: t.roleAdmin }] : []),
                ]}
                placeholder={t.roleLabel}
              />
            </div>
            <Button
              onClick={handleInviteUser}
              disabled={inviting || !addForm.email}
              className="w-full h-11 rounded-xl gap-2"
            >
              <UserPlus className="w-4 h-4" />
              {inviting ? t.sending : t.sendInvite}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingUser} onOpenChange={open => !open && setEditingUser(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t.editUserTitle}</DialogTitle>
          </DialogHeader>

          {editingUser && (
            <div className="space-y-4 mt-2">
              <div className="flex items-center gap-3 pb-3 border-b">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="font-bold text-primary">{editingUser.full_name?.[0] || "U"}</span>
                </div>
                <div>
                  <p className="font-semibold">{editingUser.full_name}</p>
                  <p className="text-sm text-muted-foreground">{editingUser.email}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.firstNameLabel}</Label>
                  <Input
                    value={editForm.first_name}
                    onChange={e => setEditForm(prev => ({ ...prev, first_name: e.target.value }))}
                    placeholder={t.firstNameLabel}
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t.lastNameLabel}</Label>
                  <Input
                    value={editForm.last_name}
                    onChange={e => setEditForm(prev => ({ ...prev, last_name: e.target.value }))}
                    placeholder={t.lastNameLabel}
                    className="h-11 rounded-xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t.nicknameEditLabel}</Label>
                <Input
                  value={editForm.nickname}
                  onChange={e => setEditForm(prev => ({ ...prev, nickname: e.target.value }))}
                  placeholder={t.nicknameEditPlaceholder}
                  className="h-11 rounded-xl"
                />
              </div>

              {user?.role === "admin" && (
                <div className="space-y-2">
                  <Label>{t.phoneLabel2}</Label>
                  <Input
                    value={editForm.phone}
                    onChange={e => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="05x-xxx-xxxx"
                    className="h-11 rounded-xl"
                    dir="ltr"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>{t.cityTownLabel}</Label>
                <Input
                  value={editForm.town}
                  onChange={e => setEditForm(prev => ({ ...prev, town: e.target.value }))}
                  placeholder={t.cityTownPlaceholder}
                  className="h-11 rounded-xl"
                />
              </div>

              {user?.role === "admin" && (
                <div className="space-y-2">
                  <Label>{t.roleLabel}</Label>
                  <MobileSelect
                    value={editForm.role}
                    onValueChange={v => setEditForm(prev => ({ ...prev, role: v }))}
                    options={[
                      { value: "user", label: t.roleUser },
                      { value: "manager", label: t.roleManager },
                      { value: "admin", label: t.roleAdmin },
                    ]}
                    placeholder={t.roleLabel}
                  />
                </div>
              )}

              <Button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="w-full h-11 rounded-xl"
              >
                {updateMutation.isPending ? t.saving2 : t.saveChanges}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}