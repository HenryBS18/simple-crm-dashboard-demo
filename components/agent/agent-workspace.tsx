"use client";

import { ApprovalQueue } from "@/components/agent/approval-queue";
import { Prospector } from "@/components/agent/prospector";
import { Topbar } from "@/components/shell/topbar";
import { useAiBootstrap } from "@/lib/queries";

/**
 * Dua kolom, dan urutannya mengikuti urutan cerita saat demo: agen mencari di
 * kiri, manusia memutuskan di kanan. Sengaja tidak memakai `Workspace` —
 * filter lead dan strip angka di sana tidak berlaku di layar ini.
 */
export function AgentWorkspace() {
  const bootstrap = useAiBootstrap();
  const scoring = bootstrap.data?.scoring;

  return (
    <>
      <Topbar>
        {scoring?.tiers?.length ? (
          <span
            className="type-micro text-ink-soft"
            title={Object.entries(scoring.weights)
              .map(([key, value]) => `${key}: ${value}`)
              .join(" · ")}
          >
            Skor 0–100 dari {Object.keys(scoring.weights).length} sinyal listing
          </span>
        ) : null}
      </Topbar>

      <div className="grid min-h-0 flex-1 grid-cols-1 border-t border-line lg:grid-cols-[1fr_24rem]">
        <Prospector bootstrap={bootstrap.data} />
        <ApprovalQueue />
      </div>
    </>
  );
}
