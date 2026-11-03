import React, { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

// What a guest sees when the host allows gifts: the host's Bit number,
// PayBox link and/or bank details. Payment happens in those apps — nothing
// is paid or recorded here. `gift` is the API's GiftOptionsOut; `t` is
// passed in because the public invitation page picks its own language.
function CopyButton({ text, t }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-lg flex-shrink-0" onClick={copy}>
      {copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
      {copied ? t.giftCopied : t.giftCopy}
    </Button>
  );
}

export default function GiftSection({ gift, t }) {
  if (!gift) return null;
  return (
    <div className="space-y-4">
      {gift.note && <p className="text-sm text-muted-foreground text-center whitespace-pre-line">{gift.note}</p>}

      {gift.bit_phone && (
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <p className="text-sm font-semibold">Bit</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-muted-foreground">{t.giftBitHint}</span>
            <span className="font-semibold tabular-nums" dir="ltr">{gift.bit_phone}</span>
          </div>
          <div className="flex justify-end">
            <CopyButton text={gift.bit_phone} t={t} />
          </div>
        </div>
      )}

      {gift.paybox_url && (
        <Button asChild variant="outline" className="w-full h-12 rounded-xl gap-2">
          <a href={gift.paybox_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4" />
            {t.giftPayboxBtn}
          </a>
        </Button>
      )}

      {gift.bank_details && (
        <div className="rounded-xl border border-border p-3 space-y-1.5">
          <p className="text-sm font-semibold">{t.giftBankHint}</p>
          <p className="text-sm whitespace-pre-line">{gift.bank_details}</p>
          <div className="flex justify-end">
            <CopyButton text={gift.bank_details} t={t} />
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">{t.giftDisclaimer}</p>
    </div>
  );
}
