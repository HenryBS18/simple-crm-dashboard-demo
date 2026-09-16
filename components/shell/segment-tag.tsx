import { cn } from "cn";
import type { LeadType } from "@/lib/schema";

/**
 * Kode segmen klien: hijau B2B, biru B2C. Warna ini konsisten di kartu,
 * tabel, badge, dan panel detail — sekali user paham hijau berarti B2B,
 * labelnya tidak perlu dibaca lagi.
 */
export const SEGMENT_TEXT: Record<LeadType, string> = {
  B2B: "text-b2b",
  B2C: "text-b2c",
};

export const SEGMENT_BG: Record<LeadType, string> = {
  B2B: "bg-b2b",
  B2C: "bg-b2c",
};

export function SegmentTag({
  type,
  size = "sm",
  className,
}: {
  type: LeadType;
  size?: "sm" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center border font-medium tracking-wide",
        size === "sm" ? "h-[17px] px-1 text-[10px]" : "h-6 px-1.5 text-xs",
        type === "B2B"
          ? "border-b2b/30 bg-b2b/8 text-b2b"
          : "border-b2c/30 bg-b2c/8 text-b2c",
        className,
      )}
    >
      {type}
    </span>
  );
}

/** Rel kiri penuh tinggi kartu — pembawa utama kode warna segmen. */
export function SegmentRail({ type }: { type: LeadType }) {
  return (
    <span
      aria-hidden
      className={cn(
        "absolute inset-y-0 left-0 w-[3px]",
        type === "B2B" ? "bg-b2b" : "bg-b2c",
      )}
    />
  );
}
