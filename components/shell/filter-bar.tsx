"use client";

import { cn } from "cn";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFilters } from "@/lib/filters";
import type { Sales } from "@/lib/schema";

const SEGMENTS = [
  { value: "all", label: "Semua segmen" },
  { value: "B2B", label: "B2B" },
  { value: "B2C", label: "B2C" },
] as const;

export function FilterBar({
  sales,
  className,
}: {
  sales: Sales[];
  className?: string;
}) {
  const { filters, write, activeCount } = useFilters();
  const [draft, setDraft] = useState(filters.q);

  // URL adalah sumber kebenaran; input disinkronkan kalau URL berubah dari luar
  // (tombol back, link yang dibagikan).
  useEffect(() => {
    setDraft(filters.q);
  }, [filters.q]);

  // Diketik dulu, baru URL menyusul — supaya history tidak penuh per huruf.
  useEffect(() => {
    if (draft === filters.q) return;
    const timer = setTimeout(() => write({ q: draft }), 250);
    return () => clearTimeout(timer);
  }, [draft, filters.q, write]);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-soft"
        />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Cari nama atau nomor"
          aria-label="Cari nama atau nomor"
          className="h-8 w-52 border border-line bg-paper pl-7 pr-2 text-sm placeholder:text-ink-soft focus-visible:border-b2b focus-visible:outline-none"
        />
      </div>

      <Select
        value={filters.segment}
        onValueChange={(value) =>
          write({ segment: value as "all" | "B2B" | "B2C" })
        }
      >
        <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Segmen">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SEGMENTS.map((segment) => (
            <SelectItem key={segment.value} value={segment.value}>
              {segment.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={filters.ownerId || "all"}
        onValueChange={(value) =>
          write({ ownerId: value === "all" ? "" : value })
        }
      >
        <SelectTrigger size="sm" className="w-[9.5rem]" aria-label="Sales">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Semua sales</SelectItem>
          {sales.map((person) => (
            <SelectItem key={person.id} value={person.id}>
              {person.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeCount > 0 ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => write({ segment: "all", ownerId: "", q: "" })}
        >
          <X aria-hidden />
          Bersihkan filter
        </Button>
      ) : null}
    </div>
  );
}
