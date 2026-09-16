"use client";

import { cn } from "cn";
import { Plus } from "lucide-react";
import { useState } from "react";
import { BoardMessage } from "@/components/board/board";
import { SalesDialog } from "@/components/sales/sales-dialog";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhone } from "@/lib/format";
import { useSalesList } from "@/lib/queries";
import type { Sales } from "@/lib/schema";

/**
 * Daftar sales beserta bebannya. Sengaja tidak memakai `Workspace`: filter bar
 * dan strip angka di sana khusus lead dan tidak ada artinya di layar ini.
 */
export function SalesManager() {
  const { data, isPending, isError, refetch } = useSalesList();
  const [target, setTarget] = useState<Sales | undefined>(undefined);
  const [open, setOpen] = useState(false);

  function add() {
    setTarget(undefined);
    setOpen(true);
  }

  function edit(person: Sales) {
    setTarget(person);
    setOpen(true);
  }

  return (
    <>
      <Topbar>
        <Button size="sm" onClick={add}>
          <Plus aria-hidden />
          Tambah sales
        </Button>
      </Topbar>

      {isError ? (
        <BoardMessage
          title="Daftar sales tidak bisa dimuat."
          body="Periksa koneksi lalu muat ulang."
          action={{ label: "Muat ulang", onClick: () => refetch() }}
        />
      ) : isPending ? (
        <div className="space-y-px border-t border-line px-6 py-3">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder statis
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : data.sales.length === 0 ? (
        <BoardMessage
          title="Belum ada sales."
          body="Tambahkan minimal satu sales supaya lead baru bisa ditugaskan otomatis."
          action={{ label: "Tambah sales", onClick: add }}
        />
      ) : (
        <SalesTable sales={data.sales} onEdit={edit} />
      )}

      <SalesDialog open={open} onOpenChange={setOpen} sales={target} />
    </>
  );
}

function SalesTable({
  sales,
  onEdit,
}: {
  sales: Sales[];
  onEdit: (person: Sales) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-auto border-t border-line">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <Th className="w-[32%]">Nama</Th>
            <Th className="w-[22%]">Nomor</Th>
            <Th className="w-[16%]">Status</Th>
            <Th className="w-[16%]">Beban</Th>
            <Th className="w-[14%]">
              <span className="sr-only">Aksi</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {sales.map((person) => (
            <tr
              key={person.id}
              className="border-b border-line/70 transition-colors hover:bg-surface"
            >
              <Td>
                <span className="truncate font-medium text-ink">
                  {person.name}
                </span>
              </Td>
              <Td>
                <span data-numeric className="font-mono text-xs text-ink-soft">
                  {person.phone ? formatPhone(person.phone) : "—"}
                </span>
              </Td>
              <Td>
                <span
                  className={cn(
                    "text-xs",
                    person.active ? "text-ink" : "text-ink-soft",
                  )}
                >
                  {person.active ? "Aktif" : "Nonaktif"}
                </span>
              </Td>
              <Td>
                <span data-numeric className="font-mono text-xs text-ink-soft">
                  {person.lead_count} lead
                </span>
              </Td>
              <Td>
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEdit(person)}
                  >
                    Ubah
                  </Button>
                </div>
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
