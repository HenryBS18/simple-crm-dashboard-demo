import { cn } from "cn";
import { daysSince } from "@/lib/format";

/**
 * Penanda mandek sengaja halus: satu kotak kecil warna sinyal, bukan border
 * atau latar merah. Warna sinyal hanya untuk kondisi yang butuh tindakan.
 */
export function StaleDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-[5px] shrink-0 bg-signal", className)}
    />
  );
}

export function StaleNote({
  lastActivityAt,
  className,
}: {
  lastActivityAt: string;
  className?: string;
}) {
  const days = daysSince(lastActivityAt);
  return (
    <span
      className={cn("type-micro text-signal whitespace-nowrap", className)}
      data-numeric
    >
      diam {days} hari
    </span>
  );
}
