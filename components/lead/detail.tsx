"use client";

import { cn } from "cn";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { ActivityTimeline } from "@/components/lead/activity-timeline";
import { ContactBlock } from "@/components/lead/contact-block";
import { DeleteLeadDialog } from "@/components/lead/delete-lead-dialog";
import { NoteComposer } from "@/components/lead/note-composer";
import { SegmentTag } from "@/components/shell/segment-tag";
import { StaleDot } from "@/components/shell/stale-mark";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { relativeTime, sourceLabel } from "@/lib/format";
import {
  useAssignLead,
  useBootstrap,
  useLead,
  useMoveLead,
} from "@/lib/queries";
import type { Lead, Stage } from "@/lib/schema";
import { resolveStages, STAGE_LABELS } from "@/lib/stage";

export function LeadDetail({
  leadId,
  onDeleted,
}: {
  leadId: string;
  /** Drawer harus menyingkir sendiri setelah lead-nya dihapus. */
  onDeleted?: () => void;
}) {
  const { data, isPending, isError, refetch } = useLead(leadId);
  const bootstrapQuery = useBootstrap();
  const move = useMoveLead();
  const assign = useAssignLead();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const stages = resolveStages(bootstrapQuery.data?.stages);
  const sales = bootstrapQuery.data?.sales ?? [];

  if (isPending) return <DetailSkeleton />;

  if (isError || !data) {
    return (
      <div className="px-5 py-10 text-center">
        <p className="text-sm font-medium text-ink">
          Detail lead tidak bisa dimuat.
        </p>
        <p className="mt-1 text-sm text-ink-soft">
          Lead mungkin sudah dihapus. Coba muat ulang.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 border border-line px-3 py-1.5 text-sm transition-colors hover:bg-surface"
        >
          Muat ulang
        </button>
      </div>
    );
  }

  const lead: Lead = data.lead;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Identitas */}
      <div className="px-5 pb-4 pt-1">
        <div className="flex items-start gap-2">
          {lead.is_stale ? <StaleDot className="mt-3" /> : null}
          <h1 className="min-w-0 flex-1 text-xl font-semibold leading-7 tracking-tight text-ink">
            {lead.name}
          </h1>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SegmentTag type={lead.type} size="lg" />
          <span className="inline-flex h-6 items-center border border-line bg-surface px-1.5 text-xs text-ink">
            {STAGE_LABELS[lead.stage]}
          </span>
          <span className="type-micro text-ink-soft">
            Aktivitas terakhir {relativeTime(lead.last_activity_at)}
          </span>
        </div>
      </div>

      <ContactBlock lead={lead} />

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {/* Baris ini yang membuktikan kategorisasinya bukan asal. */}
        {lead.classify_reason ? (
          <p
            className={cn(
              "border-l-2 py-1 pl-3 text-sm leading-5 text-ink",
              lead.type === "B2B" ? "border-l-b2b" : "border-l-b2c",
            )}
          >
            <span className="text-ink-soft">Alasan kategori — </span>
            {lead.classify_reason}
          </p>
        ) : null}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Field label="Sumber lead" value={sourceLabel(lead.source)} />
          <Field label="Sales" value={lead.owner_name || "Belum ada sales"} />
          {lead.type === "B2C" ? (
            <Field
              label="Jumlah order"
              value={String(lead.order_count)}
              numeric
            />
          ) : null}
          <Field label="Masuk" value={relativeTime(lead.created_at)} />
        </dl>

        {lead.notes ? (
          <div>
            <p className="type-micro font-medium text-ink-soft">Catatan</p>
            <p className="mt-1 text-sm leading-5 text-ink">{lead.notes}</p>
          </div>
        ) : null}

        {/* Aksi */}
        <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div className="space-y-1">
            <span className="type-micro font-medium text-ink-soft">Stage</span>
            <Select
              value={lead.stage}
              onValueChange={(value) =>
                move.mutate({ id: lead.id, stage: value as Stage })
              }
            >
              <SelectTrigger size="sm" className="w-full" aria-label="Stage">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stages.map((stage) => (
                  <SelectItem key={stage.key} value={stage.key}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <span className="type-micro font-medium text-ink-soft">Sales</span>
            <Select
              value={lead.owner_id || "none"}
              onValueChange={(value) =>
                assign.mutate({
                  id: lead.id,
                  ownerId: value === "none" ? undefined : value,
                })
              }
            >
              <SelectTrigger size="sm" className="w-full" aria-label="Sales">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Tentukan otomatis</SelectItem>
                {sales.map((person) => (
                  <SelectItem key={person.id} value={person.id}>
                    {person.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Aktivitas */}
        <div className="space-y-3 border-t border-line pt-4">
          <p className="type-micro font-medium text-ink-soft">Aktivitas</p>
          <NoteComposer leadId={lead.id} actor={lead.owner_name} />
          <ActivityTimeline activities={data.activities} />
        </div>

        {/* Aksi merusak ditaruh paling bawah, jauh dari tombol sehari-hari. */}
        <div className="border-t border-line pt-4">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 aria-hidden />
            Hapus lead
          </Button>
        </div>
      </div>

      <DeleteLeadDialog
        lead={lead}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onDeleted={onDeleted}
      />
    </div>
  );
}

function Field({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="type-micro font-medium text-ink-soft">{label}</dt>
      <dd
        className={cn("mt-0.5 text-sm text-ink", numeric && "font-mono")}
        data-numeric={numeric ? "" : undefined}
      >
        {value}
      </dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 px-5 py-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-5 w-32" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}
