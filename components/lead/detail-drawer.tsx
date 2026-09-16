"use client";

import { LeadDetail } from "@/components/lead/detail";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useFilters } from "@/lib/filters";

/**
 * Drawer dikendalikan query param `?lead=`, jadi kartu yang sedang dibuka ikut
 * tersimpan di URL bersama filter dan bisa dibagikan saat demo.
 */
export function LeadDetailDrawer() {
  const { openLeadId, write } = useFilters();

  return (
    <Sheet
      open={Boolean(openLeadId)}
      onOpenChange={(open) => {
        if (!open) write({ lead: null });
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[27rem]"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Detail lead</SheetTitle>
          <SheetDescription>
            Kontak, alasan kategori, dan aktivitas terakhir.
          </SheetDescription>
        </SheetHeader>

        {openLeadId ? (
          <LeadDetail
            leadId={openLeadId}
            onDeleted={() => write({ lead: null })}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
