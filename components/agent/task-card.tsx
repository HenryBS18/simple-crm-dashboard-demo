"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { DraftDialog } from "@/components/agent/draft-dialog";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/lib/format";
import { useDecideAiTask } from "@/lib/queries";
import type {
  AiTask,
  ProspectBatchResult,
  StageMoveResult,
} from "@/lib/schema";
import { stageLabel } from "@/lib/stage";

const KIND_LABELS: Record<AiTask["kind"], string> = {
  prospect_batch: "Prospek baru",
  followup: "Follow-up",
  stage_move: "Pindah stage",
};

const STATUS_TEXT: Record<AiTask["status"], string> = {
  pending: "Menunggu keputusan",
  approved: "Disetujui & dijalankan",
  rejected: "Ditolak",
  failed: "Gagal dijalankan",
};

export function TaskCard({ task }: { task: AiTask }) {
  const decide = useDecideAiTask();
  const [draftOpen, setDraftOpen] = useState(false);
  const pending = task.status === "pending";

  return (
    <li
      className={cn(
        "border border-line bg-paper px-3.5 py-3",
        task.status === "failed" && "border-signal/40 bg-signal/5",
        !pending && task.status !== "failed" && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "border px-1.5 py-0.5 type-micro font-medium",
            task.kind === "prospect_batch"
              ? "border-b2b/40 bg-b2b/8 text-b2b"
              : task.kind === "followup"
                ? "border-b2c/40 bg-b2c/8 text-b2c"
                : "border-line-strong bg-surface text-ink-soft",
          )}
        >
          {KIND_LABELS[task.kind]}
        </span>
        <span
          className="ml-auto font-mono type-micro text-ink-soft"
          data-numeric
          title="Prioritas 0–100, dihitung dari lamanya diam, nilai order, dan segmen"
        >
          {task.priority}
        </span>
      </div>

      <p className="mt-2 text-sm leading-5 font-medium text-ink">
        {task.title}
      </p>

      {/* Tanpa baris ini tombol Setujui cuma tebak-tebakan. */}
      <p className="mt-1.5 border-l-2 border-l-line-strong py-0.5 pl-2.5 text-xs leading-5 text-ink-soft">
        {task.reason}
      </p>

      {pending ? (
        <div className="mt-3 flex items-center gap-2">
          {task.kind === "followup" ? (
            <Button size="xs" onClick={() => setDraftOpen(true)}>
              Tinjau draf
            </Button>
          ) : (
            <Button
              size="xs"
              disabled={decide.isPending}
              onClick={() =>
                decide.mutate({
                  id: task.id,
                  decision: "approve",
                  actor: "Operator",
                })
              }
            >
              Setujui
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            disabled={decide.isPending}
            onClick={() =>
              decide.mutate({
                id: task.id,
                decision: "reject",
                actor: "Operator",
              })
            }
          >
            Tolak
          </Button>
        </div>
      ) : (
        <div className="mt-2.5 border-t border-line pt-2">
          <p className="type-micro text-ink-soft">
            {STATUS_TEXT[task.status]}
            {task.actor ? ` oleh ${task.actor}` : ""}
            {task.decidedAt ? ` · ${relativeTime(task.decidedAt)}` : ""}
          </p>
          <TaskOutcome task={task} />
        </div>
      )}

      {task.kind === "followup" ? (
        <DraftDialog task={task} open={draftOpen} onOpenChange={setDraftOpen} />
      ) : null}
    </li>
  );
}

/** Hasil nyata dari keputusan. Ini yang membuat antrian jadi catatan, bukan
    sekadar daftar tombol yang sudah ditekan. */
function TaskOutcome({ task }: { task: AiTask }) {
  const result = task.result as Record<string, unknown> | null;
  if (!result) return null;

  if (task.status === "failed") {
    const error = result.error as { message?: string } | undefined;
    return (
      <p className="mt-1 text-xs leading-5 text-signal">
        {error?.message ?? "Tindakan tidak selesai."}
      </p>
    );
  }

  if (task.status === "rejected") return null;

  if (result.kind === "prospect_batch") {
    const batch = result as unknown as ProspectBatchResult;
    return (
      <div className="mt-1.5 space-y-1.5">
        <p className="text-xs text-ink">
          {batch.created} lead dibuat
          {batch.duplicates > 0
            ? `, ${batch.duplicates} duplikat dilewati`
            : ""}
          {batch.invalid > 0 ? `, ${batch.invalid} gagal` : ""}.
        </p>
        <ul className="space-y-1">
          {batch.leads.map((lead) => {
            const owner = batch.assignments.find((a) => a.leadId === lead.id);
            const category = batch.categorizations.find(
              (c) => c.leadId === lead.id,
            );
            return (
              <li key={lead.id} className="type-micro leading-4 text-ink-soft">
                <Link
                  href={`/?lead=${lead.id}`}
                  className="font-medium text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
                >
                  {lead.name}
                </Link>
                {" — "}
                {category ? `${category.reason}. ` : ""}
                {owner?.ownerName
                  ? `Dipegang ${owner.ownerName}.`
                  : "Belum ada sales."}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (result.kind === "stage_move") {
    const move = result as unknown as StageMoveResult;
    return (
      <p className="mt-1 text-xs leading-5 text-ink">
        <Link
          href={`/?lead=${move.lead.id}`}
          className="font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          {move.lead.name}
        </Link>{" "}
        pindah dari {stageLabel(move.from)} ke {stageLabel(move.to)}.
      </p>
    );
  }

  return (
    <p className="mt-1 text-xs leading-5 text-ink">
      Pesan tercatat di riwayat{" "}
      {task.leadId ? (
        <Link
          href={`/?lead=${task.leadId}`}
          className="font-medium underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          {task.leadName}
        </Link>
      ) : (
        "lead"
      )}
      .
    </p>
  );
}
