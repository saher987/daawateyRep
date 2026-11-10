import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowRight, Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/shared/LoadingSpinner";
import { useT } from "@/lib/i18n";
import { publicAppOrigin } from "@/lib/publicUrl";

// Printable A4 sign for the entrance: the event name, one line of
// instructions and a big QR code that opens /checkin/:eventId.
export default function CheckInSign() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const t = useT();
  const [qr, setQr] = useState("");
  const url = `${publicAppOrigin()}/checkin/${eventId}`;

  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: async () => (await base44.entities.Event.filter({ id: eventId }))[0],
  });

  useEffect(() => {
    QRCode.toDataURL(url, { width: 900, margin: 1, errorCorrectionLevel: "M" }).then(setQr).catch(() => setQr(""));
  }, [url]);

  if (!event) return <LoadingSpinner />;

  return (
    <div dir={t.dir} className="min-h-screen bg-white text-black">
      <div className="flex gap-2 p-4 print:hidden">
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="w-4 h-4" />
          {t.signPrint}
        </Button>
        <Button variant="ghost" className="gap-2" onClick={() => navigate(`/events/${eventId}`)}>
          {t.backToEvents}
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
      <div className="max-w-[180mm] mx-auto flex flex-col items-center text-center gap-6 py-10 print:py-0">
        <h1 className="text-4xl font-bold">{event.title}</h1>
        <p className="text-2xl">{event.seating_enabled ? t.signScan : t.signScanNoSeating}</p>
        {qr ? <img src={qr} alt={url} className="w-[120mm] h-[120mm]" /> : <LoadingSpinner />}
        <p className="text-sm text-gray-500" dir="ltr">{url}</p>
      </div>
    </div>
  );
}
