"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "cn";
import { LeadCard } from "@/components/board/lead-card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Lead, Stage, StageInfo } from "@/lib/schema";
import { EMPTY_COLUMN_COPY, isClosedStage } from "@/lib/stage";

export function Column({
  stage,
  leads,
  stages,
  onMove,
  onOpenDetail,
  landedId,
  isFirstClosed,
  isPending,
}: {
  stage: StageInfo;
  leads: Lead[];
  stages: StageInfo[];
  onMove: (leadId: string, next: Stage) => void;
  onOpenDetail: (leadId: string) => void;
  landedId: string | null;
  /** Kolom pertama yang sudah "selesai" membawa garis pemisah berat. */
  isFirstClosed: boolean;
  isPending: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.key });
  const closed = isClosedStage(stage.key);

  return (
    <section
      ref={setNodeRef}
      aria-label={stage.label}
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-y-auto border-l",
        // Satu garis berat membelah papan: kiri masih jalan, kanan sudah selesai.
        isFirstClosed ? "border-l-2 border-l-line-strong" : "border-l-line",
        closed ? "bg-surface" : "bg-paper",
        isOver && "bg-b2b/6",
      )}
    >
      <header
        className={cn(
          "sticky top-0 z-10 flex items-baseline gap-2 px-3 py-2",
          closed ? "bg-surface" : "bg-paper",
          stage.key === "won" && "border-b-2 border-b-ink",
          stage.key === "lost" &&
            "border-b-2 border-dashed border-b-line-strong",
          !closed && "border-b border-b-line",
        )}
      >
        <h2 className="text-[13px] font-semibold tracking-tight text-ink">
          {stage.label}
        </h2>
        <span data-numeric className="font-mono text-xs text-ink-soft">
          {leads.length}
          <span className="sr-only"> lead</span>
        </span>
      </header>

      <div className="flex flex-1 flex-col gap-px p-2">
        {isPending ? (
          Array.from({ length: 3 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder statis
            <Skeleton key={i} className="h-[74px] w-full" />
          ))
        ) : leads.length === 0 ? (
          <p className="px-1 py-6 text-xs leading-5 text-ink-soft">
            {EMPTY_COLUMN_COPY[stage.key as Stage]}
          </p>
        ) : (
          leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              stages={stages}
              justLanded={landedId === lead.id}
              onMove={(next) => onMove(lead.id, next)}
              onOpenDetail={() => onOpenDetail(lead.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}
