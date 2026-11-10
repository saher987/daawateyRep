import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, Minus, Plus, QrCode } from "lucide-react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import GuestTableCard from "@/components/seating/GuestTableCard";
import { useT } from "@/lib/i18n";
import { fmt } from "@/lib/seating";

const MAX_PEOPLE = 30;

// Public page behind the QR sign at the entrance. Recognises the guest by
// the invitation token InvitationPage remembered on this phone, or by the
// phone number they type. Shows their current table (when seating is
// published) and records how many of them arrived; scanning again updates
// the count instead of adding to it.
export default function CheckIn() {
  const { eventId } = useParams();
  const t = useT();
  const savedToken = (() => {
    try {
      return localStorage.getItem(`daawatey_checkin_${eventId}`) || "";
    } catch {
      return "";
    }
  })();

  const [step, setStep] = useState(savedToken ? "auto" : "phone"); // auto | phone | confirm | done
  const [key, setKey] = useState(savedToken ? { personalToken: savedToken } : null);
  const [phone, setPhone] = useState("");
  const [guest, setGuest] = useState(null);
  const [people, setPeople] = useState(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: info, isLoading, error: infoError } = useQuery({
    queryKey: ["checkin-event", eventId],
    queryFn: () => base44.checkin.event(eventId),
    retry: false,
  });

  const explain = (err) => {
    if (err?.status === 429) return t.checkinTooMany;
    if (err?.status === 409) return t.checkinClosed;
    return t.checkinNotFound;
  };

  const lookup = async (lookupKey, { silent } = {}) => {
    setBusy(true);
    setError("");
    try {
      const found = await base44.checkin.lookup(eventId, lookupKey);
      setKey(lookupKey);
      setGuest(found);
      setPeople(found.people_arrived || found.expected_people || 1);
      setStep("confirm");
    } catch (err) {
      setStep("phone");
      if (!silent) setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  // Recognised from the saved invitation link: skip the phone step.
  useEffect(() => {
    if (info?.open && step === "auto" && savedToken) lookup({ personalToken: savedToken }, { silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.open]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await base44.checkin.checkIn(eventId, { ...key, peopleArrived: people });
      setGuest(saved);
      setStep("done");
    } catch (err) {
      setError(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setGuest(null);
    setKey(null);
    setPhone("");
    setError("");
    setStep("phone");
  };

  const header = (
    <div className="bg-[#171C26] text-white text-center px-6 pt-8 pb-6 space-y-1">
      <p className="text-xs font-semibold text-[#E2C68F]">{t.checkinBrand}</p>
      {info && <h1 className="text-2xl font-bold">{info.event_title}</h1>}
      {info && (
        <p className="text-sm text-[#D5D8DE]">
          {info.venue_name} · {format(new Date(info.event_date), "dd/MM/yyyy HH:mm")}
        </p>
      )}
    </div>
  );

  const shell = (body) => (
    <div dir={t.dir || "rtl"} className="min-h-screen bg-[#FBFAF7]">
      {header}
      <div className="max-w-md mx-auto px-5 py-6 space-y-4">{body}</div>
    </div>
  );

  if (isLoading) return shell(<Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />);
  if (infoError || !info) return shell(<Card className="p-6 text-center">{t.checkinUnavailable}</Card>);
  if (!info.open) {
    return shell(
      <Card className="p-6 text-center space-y-2">
        <p className="font-semibold">{t.checkinClosed}</p>
        <p className="text-sm text-muted-foreground">
          {fmt(t.checkinClosedAt, { date: format(new Date(info.opens_at), "dd/MM/yyyy HH:mm") })}
        </p>
      </Card>,
    );
  }

  if (step === "auto" || (busy && !guest)) {
    return shell(<Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />);
  }

  if (step === "phone") {
    return shell(
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (phone.replace(/\D/g, "").length < 9) {
            setError(t.checkinNotFound);
            return;
          }
          lookup({ phone });
        }}
      >
        <div className="space-y-1">
          <h2 className="text-xl font-bold">{t.checkinWelcome}</h2>
          <p className="text-[#3A404C]">{t.checkinPhonePrompt}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="checkin-phone">{t.checkinPhoneLabel}</Label>
          <Input
            id="checkin-phone"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setError("");
            }}
            placeholder="05X-XXXXXXX"
            className="h-12 text-lg text-left"
          />
        </div>
        {error && (
          <p role="alert" className="rounded-xl bg-[#FBE9E7] text-[#9B2C1F] px-3 py-2 text-sm">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="w-full h-12 text-base font-bold">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.checkinFind}
        </Button>
        <p className="text-xs text-muted-foreground text-center">{t.checkinAutoNote}</p>
        <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-[#D8CFBF] bg-white p-3 text-xs text-muted-foreground">
          <QrCode className="w-8 h-8 shrink-0" />
          {info.seating ? t.signScan : t.signScanNoSeating}
        </div>
      </form>,
    );
  }

  if (step === "confirm") {
    return shell(
      <div className="space-y-4">
        {key?.personalToken && (
          <p role="status" className="flex items-center gap-2 rounded-xl bg-[#E6F2EF] text-[#1D5A50] px-3 py-2 text-sm">
            <Check className="w-4 h-4 shrink-0" />
            {t.checkinRecognized}
          </p>
        )}
        <h2 className="text-xl font-bold">{fmt(t.checkinHello, { name: guest.display_name || "" })}</h2>
        <GuestTableCard tables={guest.tables} hallPlan={guest.hall_plan} showNote={false} />
        <Card className="p-4 space-y-2">
          <p className="font-semibold">{t.checkinHowMany}</p>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="icon" className="w-12 h-12" aria-label="−" onClick={() => setPeople((n) => Math.max(1, n - 1))}>
              <Minus className="w-5 h-5" />
            </Button>
            <span className="text-4xl font-bold font-display" aria-live="polite">{people}</span>
            <Button type="button" variant="outline" size="icon" className="w-12 h-12" aria-label="+" onClick={() => setPeople((n) => Math.min(MAX_PEOPLE, n + 1))}>
              <Plus className="w-5 h-5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{fmt(t.checkinExpected, { n: guest.expected_people })}</p>
        </Card>
        {error && (
          <p role="alert" className="rounded-xl bg-[#FBE9E7] text-[#9B2C1F] px-3 py-2 text-sm">
            {error}
          </p>
        )}
        <Button className="w-full h-12 text-base font-bold" disabled={busy} onClick={confirm}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {t.checkinConfirm}
        </Button>
        <button type="button" className="w-full text-sm underline text-primary min-h-10" onClick={startOver}>
          {t.checkinNotMe}
        </button>
      </div>,
    );
  }

  return shell(
    <div className="space-y-4 text-center">
      <div className="mx-auto rounded-full bg-[#E6F2EF] text-[#1D5A50] flex items-center justify-center p-4 w-fit">
        <Check className="w-10 h-10" />
      </div>
      <h2 className="text-xl font-bold">{guest.tables?.length ? t.checkinDone : t.checkinNoSeating}</h2>
      <p className="text-[#3A404C]">
        {fmt(t.checkinDonePeople, { n: guest.people_arrived })} · {guest.display_name}
      </p>
      <GuestTableCard tables={guest.tables} hallPlan={guest.hall_plan} showNote={false} className="text-start" />
      <p className="text-lg font-semibold">{t.checkinEnjoy}</p>
      <button type="button" className="text-sm underline text-primary min-h-10" onClick={startOver}>
        {t.checkinAnother}
      </button>
    </div>,
  );
}
