"use client";

import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Stage, StageInfo } from "@/lib/schema";

/**
 * Menu aksi kartu. Jalur pindah tanpa drag wajib ada: drag di trackpad saat
 * presentasi gampang meleset, dan di layar sempit drag praktis tidak terpakai.
 *
 * `onDelete` tidak menghapus apa pun sendiri — dia membuka `DeleteLeadDialog`
 * yang sama dengan panel detail. Nama lead-nya terbaca dulu di dialog itu,
 * karena satu titik tiga yang salah tekan tidak boleh langsung menghilangkan
 * kartu. Toast Urungkan sesudahnya adalah lapis kedua, bukan satu-satunya.
 */
export function MoveMenu({
  stages,
  current,
  onMove,
  onOpenDetail,
  onDelete,
  leadName,
}: {
  stages: StageInfo[];
  current: Stage;
  onMove: (stage: Stage) => void;
  onOpenDetail: () => void;
  onDelete: () => void;
  leadName: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Aksi untuk ${leadName}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className="flex size-6 shrink-0 items-center justify-center text-ink-soft transition-colors hover:bg-surface hover:text-ink data-[state=open]:bg-surface data-[state=open]:text-ink"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={onOpenDetail}>Buka detail</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Pindahkan ke</DropdownMenuLabel>
        {stages.map((stage) => (
          <DropdownMenuItem
            key={stage.key}
            disabled={stage.key === current}
            onSelect={() => onMove(stage.key as Stage)}
          >
            {stage.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          Hapus lead
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
