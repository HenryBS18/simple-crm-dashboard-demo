"use client";

import { useMemo } from "react";
import { CreateLeadDialog } from "@/components/lead/create-lead-dialog";
import { LeadDetailDrawer } from "@/components/lead/detail-drawer";
import { FilterBar } from "@/components/shell/filter-bar";
import { StatStrip } from "@/components/shell/stat-strip";
import { Topbar } from "@/components/shell/topbar";
import { applyFilters, useFilters } from "@/lib/filters";
import { useBootstrap, useCrmSource, useLeads } from "@/lib/queries";

const DEFAULT_SOURCES = [
  "meta_ads",
  "dm",
  "organic",
  "komunitas",
  "canvassing",
  "referral",
  "manual",
];

/**
 * Kerangka yang dipakai board dan tabel: topbar, filter, strip angka, lalu
 * isi. Keduanya berbagi state filter di URL dan drawer detail yang sama.
 */
export function Workspace({ children }: { children: React.ReactNode }) {
  const bootstrapQuery = useBootstrap();
  const leadsQuery = useLeads();
  const { filters } = useFilters();
  const source = useCrmSource();

  const sales = bootstrapQuery.data?.sales ?? [];
  const sources = bootstrapQuery.data?.sources ?? DEFAULT_SOURCES;

  const all = useMemo(() => leadsQuery.data?.items ?? [], [leadsQuery.data]);
  const visible = useMemo(() => applyFilters(all, filters), [all, filters]);

  return (
    <>
      <Topbar>
        <CreateLeadDialog sources={sources} sales={sales} />
      </Topbar>

      {source === "mock" && bootstrapQuery.isError ? (
        <p className="border-b border-line bg-signal/8 px-6 py-2 text-xs text-signal">
          Tidak bisa menghubungi backend. Yang tampil data contoh.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-2.5">
        <StatStrip leads={all} filtered={visible.length} />
        <FilterBar sales={sales} />
      </div>

      {children}

      <LeadDetailDrawer />
    </>
  );
}
