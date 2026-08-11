import React, { useState, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Loader2, UserPlus, Search, UserCheck, ChevronRight } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import debounce from "lodash/debounce";
import { useT } from "@/lib/i18n";
import { useBackButton } from "@/hooks/useBackButton";

const emptyDetails = {
  nickname: "",
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  guests_count: "1",
  group_label: "",
};

export default function AddInviteeDialog({ open, onOpenChange, eventId }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null); // null = not searched yet, [] = no results
  const [selectedUser, setSelectedUser] = useState(null); // existing User record
  const [showNewForm, setShowNewForm] = useState(false);
  const [details, setDetails] = useState(emptyDetails);

  const set = (field) => (e) => setDetails(prev => ({ ...prev, [field]: e.target.value }));

  const doSearch = useCallback(
    debounce(async (q) => {
      if (!q.trim()) { setResults(null); setSearching(false); return; }
      setSearching(true);
      try {
        // Search users by name or phone
        const [byPhone, all] = await Promise.all([
          base44.entities.User.filter({ phone: q.trim() }),
          base44.entities.User.list('-created_date', 200),
        ]);
        const lower = q.toLowerCase();
        const byName = all.filter(u =>
          (u.full_name && u.full_name.toLowerCase().includes(lower)) ||
          (u.first_name && u.first_name.toLowerCase().includes(lower)) ||
          (u.last_name && u.last_name.toLowerCase().includes(lower))
        );
        const merged = [...byPhone, ...byName].filter(
          (u, i, arr) => arr.findIndex(x => x.id === u.id) === i
        );
        setResults(merged);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400),
    []
  );

  const handleQueryChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    setResults(null);
    setSelectedUser(null);
    setShowNewForm(false);
    doSearch(val);
  };

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setShowNewForm(false);
  };

  const handleAddNew = () => {
    // Pre-fill phone if query looks like a number
    const looksLikePhone = /^\d+$/.test(query.trim());
    setDetails(prev => ({
      ...emptyDetails,
      phone: looksLikePhone ? query.trim() : "",
    }));
    setShowNewForm(true);
    setSelectedUser(null);
  };

  const mutation = useMutation({
    mutationFn: (data) => base44.functions.invoke('createInvitationRecipient', data),
    onSuccess: () => {
      handleClose(false);
      const t2 = toast({ title: t.addedSuccess, description: t.addedSuccessDesc });
      setTimeout(() => t2.dismiss(), 3000);
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ["event-recipients", eventId] }), 300);
    },
    onError: (err) => {
      const status = err?.response?.status || err?.status;
      if (status === 409) {
      toast({ title: t.duplicateInvitee, description: t.duplicateInviteeDesc, variant: "destructive" });
      } else {
      toast({ title: t.addError, description: t.addErrorDesc, variant: "destructive" });
      }
    },
  });

  const submitExisting = () => {
    mutation.mutate({
      userId: selectedUser.id,
      externalFullName: selectedUser.full_name || `${selectedUser.first_name || ""} ${selectedUser.last_name || ""}`.trim(),
      nickname: selectedUser.nickname || null,
      first_name: selectedUser.first_name || null,
      last_name: selectedUser.last_name || null,
      phone: selectedUser.phone || "",
      email: selectedUser.email || null,
      eventId,
      guestsCount: 1,
    });
  };

  const submitNew = (e) => {
    e.preventDefault();
    const fullName = [details.nickname, details.first_name, details.last_name].filter(Boolean).join(' ') || details.phone;
    mutation.mutate({
      externalFullName: fullName,
      nickname: details.nickname || null,
      first_name: details.first_name || null,
      last_name: details.last_name || null,
      phone: details.phone,
      email: details.email || null,
      eventId,
      guestsCount: Number(details.guests_count) || 1,
      groupLabel: details.group_label || null,
    });
  };

  const handleClose = (v) => {
    setQuery("");
    setResults(null);
    setSelectedUser(null);
    setShowNewForm(false);
    setDetails(emptyDetails);
    onOpenChange(v);
  };

  const t = useT();
  useBackButton({ isOpen: open, onClose: () => handleClose(false) });
  const hasContact = details.phone.trim() || details.email.trim();
  const hasName = details.first_name.trim() || details.last_name.trim();
  const canSubmitNew = hasContact && hasName;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {t.addInviteeTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search field */}
          <div className="space-y-2">
            <Label>{t.searchInvitee}</Label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t.searchPlaceholder}
                value={query}
                onChange={handleQueryChange}
                className="h-11 rounded-xl text-base pr-9"
              />
              {searching && <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />}
            </div>
          </div>

          {/* Results list */}
          {results !== null && !showNewForm && (
            <div className="space-y-2">
              {results.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">{t.selectOrAdd}</p>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border p-1">
                    {results.map(user => {
                      const displayName = [user.nickname, user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.phone;
                      return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleSelectUser(user)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-right transition-colors
                          ${selectedUser?.id === user.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted"}`}
                      >
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
                          {(displayName)[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{displayName}</p>
                          {user.phone && <p className="text-xs text-muted-foreground" dir="ltr">{user.phone}</p>}
                        </div>
                        {selectedUser?.id === user.id && <UserCheck className="w-4 h-4 text-primary flex-shrink-0" />}
                      </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={handleAddNew}
                    className="flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    {t.addNotInList}
                  </button>
                </>
              ) : (
                <div className="rounded-xl border border-dashed p-4 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">{t.noSearchResults}</p>
                  <Button type="button" variant="outline" onClick={handleAddNew} className="gap-2 h-10 rounded-xl">
                    <UserPlus className="w-4 h-4" />
                    {t.addNewInvitee}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Selected existing user summary */}
          {selectedUser && !showNewForm && (
            <div className="rounded-xl p-3 bg-primary/5 border border-primary/20 flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-primary flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{[selectedUser.nickname, selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || selectedUser.full_name || selectedUser.phone}</p>
                {selectedUser.phone && <p className="text-xs text-muted-foreground" dir="ltr">{selectedUser.phone}</p>}
              </div>
            </div>
          )}

          {/* New invitee form */}
          {showNewForm && (
            <form onSubmit={submitNew} className="space-y-4">
              <div className="space-y-2">
                <Label>{t.nicknameOptional} <span className="text-muted-foreground text-xs font-normal">{t.nicknameOptionalHint}</span></Label>
                <Input placeholder={t.nicknamePlaceholder2} value={details.nickname} onChange={set("nickname")} className="h-11 rounded-xl text-base" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>{t.firstNameRequired} <span className="text-destructive">*</span></Label>
                  <Input placeholder={t.firstNameRequired} value={details.first_name} onChange={set("first_name")} className="h-11 rounded-xl text-base" />
                </div>
                <div className="space-y-2">
                  <Label>{t.lastNameRequired} <span className="text-destructive">*</span></Label>
                  <Input placeholder={t.lastNameRequired} value={details.last_name} onChange={set("last_name")} className="h-11 rounded-xl text-base" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t.phoneOptional} <span className="text-muted-foreground text-xs font-normal">{t.nicknameOptionalHint}</span></Label>
                <Input type="tel" placeholder="05xxxxxxxx" value={details.phone} onChange={set("phone")} className="h-11 rounded-xl text-base" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t.emailRequired} <span className="text-destructive">*</span> <span className="text-muted-foreground text-xs font-normal">{t.emailRequiredHint}</span></Label>
                <Input type="email" placeholder="example@email.com" value={details.email} onChange={set("email")} className="h-11 rounded-xl text-base" dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t.groupLabel}</Label>
                  <Input placeholder={t.groupPlaceholder} value={details.group_label} onChange={set("group_label")} className="h-11 rounded-xl text-base" />
                </div>
                <div className="space-y-2">
                  <Label>{t.guestsCount}</Label>
                  <Input type="number" min="1" value={details.guests_count} onChange={set("guests_count")} className="h-11 rounded-xl text-base" />
                </div>
              </div>
              {!hasContact && (hasName || details.nickname.trim()) && (
                <p className="text-xs text-destructive">{t.contactRequired}</p>
              )}
              {!hasName && hasContact && (
                <p className="text-xs text-destructive">{t.nameRequired}</p>
              )}
              <DialogFooter className="gap-2 pt-2">
                <Button type="submit" disabled={mutation.isPending || !canSubmitNew} className="gap-2 h-11 rounded-xl flex-1">
                  {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  {t.addInviteeBtn}
                </Button>
              </DialogFooter>
            </form>
          )}

          {/* Submit button for existing user */}
          {selectedUser && !showNewForm && (
            <DialogFooter className="gap-2 pt-2">
              <Button onClick={submitExisting} disabled={mutation.isPending} className="gap-2 h-11 rounded-xl flex-1">
                {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                {t.addInviteeBtn}
              </Button>
            </DialogFooter>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}