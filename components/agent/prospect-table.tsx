"use client";

import { cn } from "cn";
import { Check, ExternalLink } from "lucide-react";
import { formatPhone } from "@/lib/format";
import type { ProspectCandidate } from "@/lib/schema";

/**
 * Tabel ditulis tangan, bukan primitive shadcn — repo ini memang tidak punya
 * `components/ui/table`, dan tabel lead yang sudah ada memakai pola yang sama.
 * Kotak pilih juga digambar sendiri supaya tidak perlu menambah dependensi
 * hanya untuk satu layar.
 */
export function ProspectTable({
  candidates,
  selected,
  onToggle,
  onToggleAll,
}: {
  candidates: ProspectCandidate[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
}) {
  const selectable = candidates.filter((c) => !c.alreadyInCrm);
  const allSelected =
    selectable.length > 0 &&
    selectable.every((c) => selected.has(c.prospectId));

  return (
    <table className="w-full min-w-[52rem] border-collapse text-sm">
      <thead>
        <tr className="border-b border-line text-left">
          <Th className="w-[3%]">
            <CheckBox
              checked={allSelected}
              onChange={onToggleAll}
              label="Pilih semua prospek yang belum ada di CRM"
              disabled={selectable.length === 0}
            />
          </Th>
          <Th className="w-[30%]">Prospek</Th>
          <Th className="w-[13%]">Area</Th>
          <Th className="w-[15%]">Kontak</Th>
          <Th className="w-[12%]">Listing</Th>
          <Th className="w-[8%]">Skor</Th>
        </tr>
      </thead>
      <tbody>
        {candidates.map((candidate, index) => (
          <Row
            key={candidate.prospectId}
            candidate={candidate}
            index={index}
            checked={selected.has(candidate.prospectId)}
            onToggle={() => onToggle(candidate.prospectId)}
          />
        ))}
      </tbody>
    </table>
  );
}

function Row({
  candidate,
  index,
  checked,
  onToggle,
}: {
  candidate: ProspectCandidate;
  index: number;
  checked: boolean;
  onToggle: () => void;
}) {
  const locked = candidate.alreadyInCrm;

  return (
    <tr
      className={cn(
        "animate-row-reveal border-b border-line/70 align-top transition-colors",
        locked ? "opacity-55" : "cursor-pointer hover:bg-surface",
        checked && "bg-b2b/6",
      )}
      // Baris muncul menyusul satu per satu; urutannya membaca sebagai
      // peringkat, bukan sebagai daftar yang dimuat sekaligus.
      style={{ animationDelay: `${Math.min(index, 12) * 28}ms` }}
      onClick={locked ? undefined : onToggle}
      onKeyDown={(event) => {
        if (locked) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle();
        }
      }}
      tabIndex={locked ? -1 : 0}
    >
      <Td>
        <CheckBox
          checked={checked}
          onChange={onToggle}
          disabled={locked}
          label={`Pilih ${candidate.name}`}
        />
      </Td>

      <Td>
        <div className="font-medium text-ink">{candidate.name}</div>
        <div className="mt-0.5 type-micro text-ink-soft">
          {candidate.categoryLabel} · {candidate.unitLabel} ·{" "}
          {candidate.priceNote}
        </div>
        {/* Alasan skor dibuka apa adanya, sejajar dengan "Alasan kategori" di
            panel lead. Ini yang membedakan penilaian dari angka ajaib. */}
        <p className="mt-1.5 border-l-2 border-l-line-strong py-0.5 pl-2 type-micro leading-4 text-ink-soft">
          {candidate.scoreReason}
        </p>
        {candidate.matchedOn.length > 0 ? (
          <p className="mt-1 type-micro text-b2b">
            Cocok lewat {candidate.matchedOn.join(", ")}
          </p>
        ) : null}
      </Td>

      <Td>
        <div>{candidate.areaLabel}</div>
        <div className="mt-0.5 type-micro text-ink-soft">
          {candidate.address}
        </div>
      </Td>

      <Td>
        <div className="font-mono text-xs" data-numeric>
          {formatPhone(candidate.phone)}
        </div>
        <div className="mt-0.5 type-micro text-ink-soft">
          {candidate.hasWhatsapp ? "WhatsApp aktif" : "Tanpa WhatsApp"}
        </div>
        {locked ? (
          <div className="mt-1 type-micro font-medium text-signal">
            Sudah ada di CRM
          </div>
        ) : null}
      </Td>

      <Td>
        <a
          href={candidate.listingUrl}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          {candidate.sourceLabel}
          <ExternalLink aria-hidden className="size-3" />
        </a>
        <div className="mt-0.5 type-micro text-ink-soft">
          Rating {String(candidate.rating).replace(".", ",")} ·{" "}
          {candidate.reviewCount} ulasan
        </div>
        <div className="type-micro text-ink-soft">
          Diperbarui {candidate.lastSeenLabel}
        </div>
      </Td>

      <Td>
        <ScoreMeter score={candidate.score} tier={candidate.scoreTier} />
      </Td>
    </tr>
  );
}

function ScoreMeter({ score, tier }: { score: number; tier: string }) {
  return (
    <div>
      <div className="font-mono text-base leading-none text-ink" data-numeric>
        {score}
      </div>
      <div
        aria-hidden
        className="mt-1.5 h-1 w-full bg-line"
        title={`${score} dari 100`}
      >
        <div
          className={cn(
            "h-full",
            score >= 80 ? "bg-b2b" : score >= 60 ? "bg-b2c" : "bg-line-strong",
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      <div className="mt-1 type-micro text-ink-soft">{tier}</div>
    </div>
  );
}

/**
 * Input asli, bukan tombol ber-role: pembaca layar mengumumkan keadaan
 * tercentang tanpa bantuan, dan `peer` menangani tampilannya.
 */
function CheckBox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="relative inline-grid size-3.5 place-items-center align-middle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        onChange={onChange}
        // Baris induknya juga bisa diklik; tanpa ini satu klik membatalkan
        // dirinya sendiri.
        onClick={(event) => event.stopPropagation()}
        className="peer absolute inset-0 size-full appearance-none border border-line-strong bg-paper transition-colors checked:border-b2b checked:bg-b2b enabled:hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      />
      <Check
        aria-hidden
        className="pointer-events-none size-2.5 text-paper opacity-0 peer-checked:opacity-100"
      />
    </span>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 type-micro font-medium text-ink-soft uppercase tracking-wide",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-3 py-2.5", className)}>{children}</td>;
}
