"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { Column } from "@/components/board/column";
import { LeadCardBody } from "@/components/board/lead-card";
import { applyFilters, useFilters } from "@/lib/filters";
import { useBootstrap, useLeads, useMoveLead } from "@/lib/queries";
import type { Lead, Stage } from "@/lib/schema";
import { isClosedStage, isStage, resolveStages } from "@/lib/stage";

export function Board() {
  const { data, isPending, isError, refetch } = useLeads();
  // Urutan kolom datang dari bootstrap, bukan di-hardcode di komponen.
  const { data: bootstrapData } = useBootstrap();
  const stages = resolveStages(bootstrapData?.stages);
  const { filters, write } = useFilters();
  const move = useMoveLead();

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [landedId, setLandedId] = useState<string | null>(null);

  const sensors = useSensors(
    // Jarak aktivasi supaya klik biasa tetap membuka panel detail.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const all = useMemo(() => data?.items ?? [], [data]);
  const visible = useMemo(() => applyFilters(all, filters), [all, filters]);

  const byStage = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const stage of stages) map.set(stage.key, []);
    for (const lead of visible) map.get(lead.stage)?.push(lead);
    return map;
  }, [visible, stages]);

  const firstClosedKey = stages.find((s) => isClosedStage(s.key))?.key;
  const dragging = draggingId
    ? all.find((l) => l.id === draggingId)
    : undefined;

  function handleMove(leadId: string, next: Stage) {
    const lead = all.find((l) => l.id === leadId);
    if (!lead || lead.stage === next) return;
    setLandedId(leadId);
    window.setTimeout(() => setLandedId(null), 400);
    move.mutate({ id: leadId, stage: next });
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const target = event.over?.id;
    if (typeof target !== "string" || !isStage(target)) return;
    handleMove(String(event.active.id), target);
  }

  if (isError) {
    return (
      <BoardMessage
        title="Papan tidak bisa dimuat."
        body="Periksa koneksi lalu muat ulang."
        action={{ label: "Muat ulang", onClick: () => refetch() }}
      />
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(4,minmax(260px,1fr))] overflow-x-auto border-t border-line">
        {stages.map((stage) => (
          <Column
            key={stage.key}
            stage={stage}
            stages={stages}
            leads={byStage.get(stage.key) ?? []}
            isPending={isPending}
            landedId={landedId}
            isFirstClosed={stage.key === firstClosedKey}
            onMove={handleMove}
            onOpenDetail={(leadId) => write({ lead: leadId })}
          />
        ))}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="w-72 rotate-[0.6deg]">
            <LeadCardBody lead={dragging} dragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

export function BoardMessage({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 border-t border-line px-6 py-16 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-soft">{body}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 border border-line px-3 py-1.5 text-sm transition-colors hover:bg-surface"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
