"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { dropIdParams } from "@/lib/filters";
import { useLeads, useResetDemo } from "@/lib/queries";

export function ResetDialog() {
  const [open, setOpen] = useState(false);
  const reset = useResetDemo();
  const leads = useLeads();
  const router = useRouter();
  const pathname = usePathname();

  // `window.location.search` dibaca di dalam handler, bukan saat render:
  // `useSearchParams` di sini akan menggagalkan prerender /sales dan /agent,
  // yang merender Topbar tanpa batas Suspense.
  const clearIdParams = () => {
    const query = dropIdParams(window.location.search);
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  // Angka diambil dari cache papan, bukan request tambahan. Ini jumlah yang
  // tampak di layar — bukan hitungan baris fisik di n8n, yang bisa berbeda
  // karena baris soft-deleted ikut terhapus tapi tidak pernah tampil di papan.
  const leadCount = leads.data?.total ?? 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Reset demo
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kembalikan data demo ke awal?</DialogTitle>
          <DialogDescription>
            {leadCount} lead yang saat ini ada di papan, beserta seluruh
            activity, sales, dan antrian agen, akan dihapus dan diganti seluruh
            data seed dari n8n. Tidak bisa dibatalkan.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={reset.isPending}
            onClick={() =>
              reset.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  clearIdParams();
                },
              })
            }
          >
            {reset.isPending ? "Mereset…" : "Reset sekarang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
