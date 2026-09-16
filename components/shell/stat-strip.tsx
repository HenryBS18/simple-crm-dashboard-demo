import { cn } from "cn";
import type { Lead } from "@/lib/schema";

/**
 * Satu baris angka, bukan deretan kartu KPI. Alat kerja sales butuh
 * ringkasan yang terbaca sekilas, bukan dashboard hero.
 */
export function StatStrip({
  leads,
  filtered,
  className,
}: {
  leads: Lead[];
  filtered: number;
  className?: string;
}) {
  const b2b = leads.filter((l) => l.type === "B2B").length;
  const b2c = leads.filter((l) => l.type === "B2C").length;
  const unassigned = leads.filter((l) => !l.owner_id).length;
  const stale = leads.filter((l) => l.is_stale).length;
  const hidden = leads.length - filtered;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft",
        className,
      )}
    >
      <Stat value={leads.length} label="lead" />
      <Dot />
      <Stat value={b2b} label="B2B" tone="b2b" />
      <Dot />
      <Stat value={b2c} label="B2C" tone="b2c" />
      <Dot />
      <Stat value={unassigned} label="belum ada sales" />
      {stale > 0 ? (
        <>
          <Dot />
          <Stat value={stale} label="mandek" tone="signal" />
        </>
      ) : null}
      {hidden > 0 ? (
        <>
          <Dot />
          <span>{hidden} disembunyikan filter</span>
        </>
      ) : null}
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: "b2b" | "b2c" | "signal";
}) {
  return (
    <span className="whitespace-nowrap">
      <span
        data-numeric
        className={cn(
          "font-mono text-[13px] font-medium",
          tone === "b2b" && "text-b2b",
          tone === "b2c" && "text-b2c",
          tone === "signal" && "text-signal",
          !tone && "text-ink",
        )}
      >
        {value}
      </span>{" "}
      {label}
    </span>
  );
}

function Dot() {
  return (
    <span aria-hidden className="text-line-strong">
      ·
    </span>
  );
}
