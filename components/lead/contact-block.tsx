"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPhone, waLink } from "@/lib/format";
import type { Lead } from "@/lib/schema";

/**
 * Blok kontak adalah bukti kedua yang diminta klien: nomor, alamat, dan cara
 * langsung menghubungi. Nomor memakai mono supaya digitnya sejajar dan mudah
 * dibacakan keras saat demo.
 */
export function ContactBlock({ lead }: { lead: Lead }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(lead.phone);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-y border-line bg-surface px-5 py-4">
      <div className="flex flex-col gap-2">
        <a
          href={`tel:+${lead.phone}`}
          data-numeric
          className="font-mono text-base font-medium tracking-tight text-ink underline-offset-4 hover:underline"
        >
          {formatPhone(lead.phone)}
        </a>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="xs" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? "Tersalin" : "Salin nomor"}
          </Button>

          <Button variant="outline" size="xs" asChild>
            <a href={waLink(lead.phone)} target="_blank" rel="noreferrer">
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
          </Button>
        </div>
      </div>

      {lead.phone_raw && lead.phone_raw !== lead.phone ? (
        <p className="mt-1 type-micro text-ink-soft">
          Ditulis sales sebagai {lead.phone_raw}
        </p>
      ) : null}

      <p className="mt-3 text-sm leading-6 text-ink">
        {lead.address || "Alamat belum diisi."}
      </p>
    </div>
  );
}
