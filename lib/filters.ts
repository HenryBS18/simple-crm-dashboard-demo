"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { normalizePhone } from "@/lib/format";
import type { Lead, LeadType } from "@/lib/schema";

export type Filters = {
  segment: LeadType | "all";
  ownerId: string;
  q: string;
};

export const EMPTY_FILTERS: Filters = { segment: "all", ownerId: "", q: "" };

/**
 * Seluruh state filter hidup di URL supaya link bisa dibagikan saat demo.
 * `lead` ikut di query yang sama, jadi satu URL membawa filter sekaligus
 * kartu yang sedang dibuka.
 */
export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo<Filters>(() => {
    const segment = params.get("seg");
    return {
      segment: segment === "B2B" || segment === "B2C" ? segment : "all",
      ownerId: params.get("sales") ?? "",
      q: params.get("q") ?? "",
    };
  }, [params]);

  const openLeadId = params.get("lead");

  const write = useCallback(
    (next: Partial<Filters & { lead: string | null }>) => {
      const search = new URLSearchParams(params.toString());

      const set = (key: string, value: string | null | undefined) => {
        if (!value || value === "all") search.delete(key);
        else search.set(key, value);
      };

      if ("segment" in next) set("seg", next.segment);
      if ("ownerId" in next) set("sales", next.ownerId);
      if ("q" in next) set("q", next.q);
      if ("lead" in next) set("lead", next.lead);

      const query = search.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [params, pathname, router],
  );

  const activeCount =
    (filters.segment !== "all" ? 1 : 0) +
    (filters.ownerId ? 1 : 0) +
    (filters.q ? 1 : 0);

  return { filters, openLeadId, write, activeCount };
}

/**
 * Reset demo menghapus lalu menyisipkan ulang seluruh baris, jadi dua param yang
 * menunjuk ID tidak lagi menunjuk apa pun. `seg` dan `q` tetap sahih, jadi filter
 * yang sedang dipasang saat presentasi tidak ikut hilang.
 */
export function dropIdParams(search: string): string {
  const next = new URLSearchParams(search);
  next.delete("lead");
  next.delete("sales");
  return next.toString();
}

/**
 * Filter dikerjakan di client atas satu hasil `leads.list`. Datanya belasan
 * baris; membuat request per filter cuma menambah latensi saat presentasi.
 */
export function applyFilters(leads: Lead[], filters: Filters): Lead[] {
  const q = filters.q.trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  const qPhone = qDigits.length >= 4 ? normalizePhone(q) : "";

  return leads.filter((lead) => {
    if (filters.segment !== "all" && lead.type !== filters.segment)
      return false;
    if (filters.ownerId && lead.owner_id !== filters.ownerId) return false;
    if (!q) return true;

    if (lead.name.toLowerCase().includes(q)) return true;
    if (lead.address.toLowerCase().includes(q)) return true;
    if (qDigits && lead.phone.includes(qDigits)) return true;
    if (qPhone && lead.phone.includes(qPhone)) return true;
    return lead.phone_raw.toLowerCase().includes(q);
  });
}
