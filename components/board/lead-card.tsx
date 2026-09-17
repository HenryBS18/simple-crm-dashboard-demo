"use client";

import { useDraggable } from "@dnd-kit/core";
import { cn } from "cn";
import { useState } from "react";
import { MoveMenu } from "@/components/board/move-menu";
import { DeleteLeadDialog } from "@/components/lead/delete-lead-dialog";
import { SegmentRail, SegmentTag } from "@/components/shell/segment-tag";
import { StaleDot, StaleNote } from "@/components/shell/stale-mark";
import { formatPhone } from "@/lib/format";
import type { Lead, Stage, StageInfo } from "@/lib/schema";

/** Isi kartu tanpa perilaku — dipakai juga oleh DragOverlay. */
export function LeadCardBody({
  lead,
  dragging,
  reserveMenuSpace = true,
}: {
  lead: Lead;
  dragging?: boolean;
  reserveMenuSpace?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative border border-line bg-paper py-2 pl-3 pr-1.5 text-left",
        dragging && "shadow-[0_8px_24px_-8px_rgba(19,26,25,0.35)]",
      )}
    >
      <SegmentRail type={lead.type} />

      <div className="flex items-start gap-1.5">
        {lead.is_stale ? <StaleDot className="mt-[7px]" /> : null}
        <span className="min-w-0 flex-1 truncate text-[15px] font-medium leading-5 text-ink">
          {lead.name}
        </span>
        <SegmentTag type={lead.type} className="mt-0.5" />
        {reserveMenuSpace ? (
          <span aria-hidden className="size-6 shrink-0" />
        ) : null}
      </div>

      <div className="mt-1 flex items-baseline gap-2 pr-1.5">
        <span data-numeric className="font-mono text-xs text-ink-soft">
          {formatPhone(lead.phone)}
        </span>
        <span className="ml-auto truncate text-xs text-ink-soft">
          {lead.owner_name || "belum ada sales"}
        </span>
      </div>

      <div className="mt-0.5 flex items-baseline gap-2 pr-1.5">
        <span className="min-w-0 flex-1 truncate type-micro text-ink-soft">
          {lead.address || "Alamat belum diisi"}
        </span>
        {lead.is_stale ? (
          <StaleNote lastActivityAt={lead.last_activity_at} />
        ) : null}
      </div>
    </div>
  );
}

/**
 * Kartu adalah satu tombol sungguhan, dan menu "Pindahkan ke" duduk di
 * sampingnya sebagai sibling yang menumpuk di pojok — bukan tombol di dalam
 * tombol. Tombol itu sekaligus jadi pegangan drag, jadi pengguna keyboard
 * bisa memindahkan kartu lewat KeyboardSensor tanpa elemen tambahan.
 */
export function LeadCard({
  lead,
  stages,
  onMove,
  onOpenDetail,
  justLanded,
}: {
  lead: Lead;
  stages: StageInfo[];
  onMove: (stage: Stage) => void;
  onOpenDetail: () => void;
  justLanded?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useDraggable({ id: lead.id, data: { stage: lead.stage } });
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative",
        isDragging && "opacity-35",
        justLanded && "animate-card-land",
      )}
    >
      <button
        type="button"
        ref={setActivatorNodeRef}
        onClick={onOpenDetail}
        className="block w-full cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <LeadCardBody lead={lead} />
      </button>

      <div className="absolute right-1.5 top-2">
        <MoveMenu
          stages={stages}
          current={lead.stage}
          onMove={onMove}
          onOpenDetail={onOpenDetail}
          onDelete={() => setConfirmDelete(true)}
          leadName={lead.name}
        />
      </div>

      {/* Di luar pegangan drag dan di luar menu — Radix meng-unmount isi menu
          saat itemnya dipilih, dan dialognya mem-portal ke body jadi transform
          drag tidak menyentuhnya. */}
      <DeleteLeadDialog
        lead={lead}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
      />
    </div>
  );
}
