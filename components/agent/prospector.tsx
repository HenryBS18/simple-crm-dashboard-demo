"use client";

import { cn } from "cn";
import { Check, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { ProspectTable } from "@/components/agent/prospect-table";
import { BoardMessage } from "@/components/board/board";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { prospectDecisions } from "@/lib/prospects";
import { useAiTasks, useCreateAiTask, useProspectSearch } from "@/lib/queries";
import type { DataOf } from "@/lib/schema";

type SearchResult = DataOf<"ai.prospect.search">;
type Bootstrap = DataOf<"ai.bootstrap">;

export function Prospector({ bootstrap }: { bootstrap?: Bootstrap }) {
  const search = useProspectSearch();
  const queue = useCreateAiTask();
  // Query key-nya sama dengan panel antrian di sebelah, jadi ini memakai cache
  // yang sudah ada — dan ikut segar sendiri tiap usulan dibuat atau diputuskan.
  const tasks = useAiTasks();

  const [query, setQuery] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const areas = bootstrap?.areas ?? [];
  const categories = bootstrap?.categories ?? [];

  const decisions = useMemo(
    () => prospectDecisions(tasks.data?.items ?? []),
    [tasks.data],
  );

  /** Yang sudah mengantri atau sudah jadi lead disisihkan di sini, bukan di
      n8n: `ai.prospect.search` hanya mencocokkan nomor dengan `crm_leads` dan
      tidak pernah membaca `crm_ai_tasks`. */
  const visible = useMemo(
    () =>
      (result?.candidates ?? []).filter(
        (candidate) => !decisions.hidden.has(candidate.prospectId),
      ),
    [result, decisions],
  );
  const hiddenCount = (result?.candidates.length ?? 0) - visible.length;

  /** Pilihan bisa basi: prospek yang sama dapat diantrikan dari tab lain selagi
      hasil ini masih di layar. Yang sudah tidak bisa dipilih jangan ikut
      terhitung, apalagi ikut terkirim. */
  const activeSelected = useMemo(
    () =>
      visible
        .filter(
          (candidate) =>
            !candidate.alreadyInCrm && selected.has(candidate.prospectId),
        )
        .map((candidate) => candidate.prospectId),
    [visible, selected],
  );

  function run() {
    setResult(null);
    setSelected(new Set());

    search.mutate(
      {
        query: query.trim() || undefined,
        area: area || undefined,
        category: category || undefined,
      },
      { onSuccess: setResult },
    );
  }

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** "Pilih semua" melewati yang pernah ditolak: keputusan itu diambil sadar,
      jadi tidak boleh dibatalkan oleh satu klik borongan. Mencentangnya satu
      per satu tetap boleh. */
  function toggleAll() {
    const selectable = visible.filter(
      (c) => !c.alreadyInCrm && !decisions.rejectedAt.has(c.prospectId),
    );
    setSelected((current) =>
      selectable.every((c) => current.has(c.prospectId))
        ? new Set()
        : new Set(selectable.map((c) => c.prospectId)),
    );
  }

  function clearFilters() {
    setArea("");
    setCategory("");
    setQuery("");
  }

  return (
    <section className="flex min-h-0 flex-col">
      <div className="space-y-3 px-6 py-4">
        <div>
          <h2 className="text-sm font-semibold text-ink">Prospektor</h2>
          {/* Setelah daftar langkah dicabut, kalimat ini satu-satunya yang
              menjelaskan alur kerja agen di layar. */}
          <p className="mt-0.5 text-xs leading-5 text-ink-soft">
            Agen menelusuri kolam prospek penginapan — daftar di luar CRM — lalu
            menandai yang nomornya sudah terdaftar supaya tidak terpilih dua
            kali, dan memberi skor. Yang sudah Anda antrikan ikut disisihkan.
            Hasilnya belum ditulis ke mana pun sampai Anda menyetujuinya di
            antrian sebelah.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") run();
            }}
            placeholder="Kata kunci, mis. gathering atau rombongan"
            className="h-8 w-64"
            aria-label="Kata kunci prospek"
          />
          <Button size="sm" onClick={run} disabled={search.isPending}>
            {search.isPending ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <Search aria-hidden />
            )}
            {search.isPending ? "Menelusuri…" : "Jalankan agen"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <ChipRow
            label="Area"
            value={area}
            options={areas}
            onChange={setArea}
          />
          <ChipRow
            label="Kategori"
            value={category}
            options={categories}
            onChange={setCategory}
          />
        </div>
      </div>

      {search.isPending ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-hidden border-t border-line px-6 py-4">
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholder statis
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : result ? (
        visible.length === 0 ? (
          // Habis karena sudah diantrikan adalah cerita lain daripada tidak ada
          // yang cocok — membersihkan filter tidak akan mengembalikannya.
          hiddenCount > 0 ? (
            <BoardMessage
              title="Semua kandidat yang cocok sudah di antrian atau sudah jadi lead."
              body="Putuskan dulu usulan di antrian sebelah, atau longgarkan filter untuk menelusuri kolam yang lain."
              action={{ label: "Bersihkan filter", onClick: clearFilters }}
            />
          ) : (
            <BoardMessage
              title="Tidak ada prospek yang cocok."
              body="Longgarkan kata kunci, atau lepas filter area dan kategori."
              action={{ label: "Bersihkan filter", onClick: clearFilters }}
            />
          )
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-auto border-t border-line">
              <ProspectTable
                candidates={visible}
                selected={selected}
                rejectedAt={decisions.rejectedAt}
                failedAt={decisions.failedAt}
                onToggle={toggle}
                onToggleAll={toggleAll}
              />
            </div>

            <footer className="flex items-center gap-3 border-t border-line px-6 py-3">
              <span className="text-xs text-ink-soft">
                {activeSelected.length > 0
                  ? `${activeSelected.length} prospek dipilih`
                  : // Yang disisihkan harus ikut disebut, kalau tidak angka ini
                    // tidak cocok dengan jumlah baris di atasnya.
                    `${visible.length} dari ${result.total} kandidat ditampilkan${
                      hiddenCount > 0
                        ? ` · ${hiddenCount} sudah di antrian`
                        : ""
                    }`}
              </span>
              <Button
                size="sm"
                className="ml-auto"
                disabled={activeSelected.length === 0 || queue.isPending}
                onClick={() =>
                  queue.mutate(
                    {
                      kind: "prospect_batch",
                      prospectIds: activeSelected,
                      actor: "Operator",
                    },
                    { onSuccess: () => setSelected(new Set()) },
                  )
                }
              >
                <Check aria-hidden />
                {queue.isPending
                  ? "Mengantrikan…"
                  : `Antrikan ${activeSelected.length || ""} untuk persetujuan`.trim()}
              </Button>
            </footer>
          </>
        )
      ) : null}
    </section>
  );
}

function ChipRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { key: string; label: string; count: number }[];
  onChange: (next: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      <span className="type-micro font-medium text-ink-soft">{label}</span>
      <Chip active={value === ""} onClick={() => onChange("")}>
        Semua
      </Chip>
      {options.map((option) => (
        <Chip
          key={option.key}
          active={value === option.key}
          onClick={() => onChange(value === option.key ? "" : option.key)}
        >
          {option.label}
          <span className="ml-1 opacity-60" data-numeric>
            {option.count}
          </span>
        </Chip>
      ))}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "border px-2 py-0.5 type-micro transition-colors",
        active
          ? "border-ink bg-ink text-paper"
          : "border-line text-ink-soft hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
