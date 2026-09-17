"use client";

import { Loader2, Sparkles } from "lucide-react";
import { TaskCard } from "@/components/agent/task-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAiTasks, useGenerateAiTasks } from "@/lib/queries";

export function ApprovalQueue() {
  const { data, isPending, isError, refetch } = useAiTasks();
  const generate = useGenerateAiTasks();

  const items = data?.items ?? [];
  const pending = items.filter((task) => task.status === "pending");
  const decided = items.filter((task) => task.status !== "pending");

  return (
    <aside className="flex min-h-0 flex-col border-l border-line bg-surface/40">
      <header className="flex items-start gap-2 px-4 py-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            Antrian persetujuan
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-ink-soft">
            Agen mengusulkan, Anda yang memutuskan. Tidak ada yang berubah di
            CRM sebelum tombol Setujui ditekan.
          </p>
        </div>
      </header>

      <div className="px-4 pb-3">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={generate.isPending}
          onClick={() => generate.mutate({})}
        >
          {generate.isPending ? (
            <Loader2 aria-hidden className="animate-spin" />
          ) : (
            <Sparkles aria-hidden />
          )}
          {generate.isPending ? "Memindai CRM…" : "Cari usulan baru"}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {isError ? (
          <div className="border border-line bg-paper px-3.5 py-3">
            <p className="text-sm font-medium text-ink">
              Antrian tidak bisa dimuat.
            </p>
            <p className="mt-1 text-xs text-ink-soft">
              Periksa koneksi lalu muat ulang.
            </p>
            <Button
              size="xs"
              variant="outline"
              className="mt-2"
              onClick={() => refetch()}
            >
              Muat ulang
            </Button>
          </div>
        ) : isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholder statis
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-line-strong px-3.5 py-6 text-center">
            <p className="text-sm font-medium text-ink">Antrian kosong.</p>
            <p className="mt-1 text-xs leading-5 text-ink-soft">
              Tekan “Cari usulan baru” — agen akan memindai lead yang lama tidak
              disentuh dan prospek yang belum masuk CRM.
            </p>
          </div>
        ) : (
          <>
            {pending.length > 0 ? (
              <ul className="space-y-2">
                {pending.map((task) => (
                  <TaskCard key={task.id} task={task} />
                ))}
              </ul>
            ) : (
              <p className="border border-dashed border-line-strong px-3.5 py-4 text-center text-xs leading-5 text-ink-soft">
                Semua usulan sudah diputuskan.
              </p>
            )}

            {decided.length > 0 ? (
              <>
                <h3 className="mt-5 mb-2 type-micro font-medium text-ink-soft uppercase tracking-wide">
                  Sudah diputuskan
                </h3>
                <ul className="space-y-2">
                  {decided.map((task) => (
                    <TaskCard key={task.id} task={task} />
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}
