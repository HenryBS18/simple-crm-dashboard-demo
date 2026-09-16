"use client";

import { cn } from "cn";
import { useMemo } from "react";
import { BoardMessage } from "@/components/board/board";
import { SegmentTag } from "@/components/shell/segment-tag";
import { StaleDot } from "@/components/shell/stale-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { applyFilters, useFilters } from "@/lib/filters";
import { formatPhone, relativeTime } from "@/lib/format";
import { useLeads } from "@/lib/queries";
import { isClosedStage, STAGE_LABELS } from "@/lib/stage";

/**
 * Pelengkap untuk klien yang lebih nyaman membaca bentuk spreadsheet.
 * Sengaja tidak lebih kaya fitur daripada papan: filter, pencarian, dan
 * panel detailnya persis sama.
 */
export function LeadsTable() {
  const { data, isPending, isError, refetch } = useLeads();
  const { filters, write } = useFilters();

  const rows = useMemo(
    () => applyFilters(data?.items ?? [], filters),
    [data, filters],
  );

  if (isError) {
    return (
      <BoardMessage
        title="Tabel tidak bisa dimuat."
        body="Periksa koneksi lalu muat ulang."
        action={{ label: "Muat ulang", onClick: () => refetch() }}
      />
    );
  }

  if (isPending) {
    return (
      <div className="space-y-px border-t border-line px-6 py-3">
        {Array.from({ length: 8 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: placeholder statis
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <BoardMessage
        title="Tidak ada lead yang cocok."
        body="Longgarkan filter atau kosongkan kotak pencarian."
        action={{
          label: "Bersihkan filter",
          onClick: () => write({ segment: "all", ownerId: "", q: "" }),
        }}
      />
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto border-t border-line">
      <table className="w-full min-w-[56rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <Th className="w-[22%]">Nama</Th>
            <Th className="w-[6%]">Segmen</Th>
            <Th className="w-[15%]">Nomor</Th>
            <Th className="w-[27%]">Alamat</Th>
            <Th className="w-[10%]">Stage</Th>
            <Th className="w-[10%]">Sales</Th>
            <Th className="w-[10%]">Aktivitas</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((lead) => (
            <tr
              key={lead.id}
              tabIndex={0}
              onClick={() => write({ lead: lead.id })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  write({ lead: lead.id });
                }
              }}
              className="cursor-pointer border-b border-line/70 transition-colors hover:bg-surface"
            >
              <Td>
                <span className="flex items-center gap-1.5">
                  {lead.is_stale ? <StaleDot /> : null}
                  <span className="truncate font-medium text-ink">
                    {lead.name}
                  </span>
                </span>
              </Td>
              <Td>
                <SegmentTag type={lead.type} />
              </Td>
              <Td>
                <span data-numeric className="font-mono text-xs text-ink-soft">
                  {formatPhone(lead.phone)}
                </span>
              </Td>
              <Td>
                <span className="block truncate text-ink-soft">
                  {lead.address || "—"}
                </span>
              </Td>
              <Td>
                <span
                  className={cn(
                    "text-xs",
                    isClosedStage(lead.stage)
                      ? "font-medium text-ink"
                      : "text-ink-soft",
                  )}
                >
                  {STAGE_LABELS[lead.stage]}
                </span>
              </Td>
              <Td>
                <span className="truncate text-ink-soft">
                  {lead.owner_name || "—"}
                </span>
              </Td>
              <Td>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    lead.is_stale ? "text-signal" : "text-ink-soft",
                  )}
                >
                  {relativeTime(lead.last_activity_at)}
                </span>
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-3 py-2 type-micro font-medium text-ink-soft first:pl-6 last:pr-6",
        className,
      )}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="max-w-0 px-3 py-2 align-middle first:pl-6 last:pr-6">
      {children}
    </td>
  );
}
