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
 * Jalur pindah tanpa drag. Wajib ada: drag di trackpad saat presentasi
 * gampang meleset, dan di layar sempit drag praktis tidak terpakai.
 */
export function MoveMenu({
  stages,
  current,
  onMove,
  onOpenDetail,
  leadName,
}: {
  stages: StageInfo[];
  current: Stage;
  onMove: (stage: Stage) => void;
  onOpenDetail: () => void;
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
