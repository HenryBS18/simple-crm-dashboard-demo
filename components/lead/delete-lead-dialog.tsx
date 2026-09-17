"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeleteLead } from "@/lib/queries";
import type { Lead } from "@/lib/schema";

/**
 * Konfirmasi hapus lead. Dibangun di atas `Dialog` yang sudah dipakai dialog
 * lain di aplikasi ini, bukan primitive alert-dialog terpisah, supaya animasi,
 * overlay, dan bentuk footer-nya persis sama.
 */
export function DeleteLeadDialog({
  lead,
  open,
  onOpenChange,
  onDeleted,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Dipanggil setelah server mengonfirmasi — pemanggil yang menutup drawer
      atau pindah halaman, karena panel detailnya berdiri di dua tempat. */
  onDeleted?: () => void;
}) {
  const remove = useDeleteLead();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Hapus lead ini?</DialogTitle>
          <DialogDescription>
            <strong className="font-medium text-ink">{lead.name}</strong> akan
            hilang dari papan, tabel, dan statistik. Datanya diarsipkan, bukan
            dimusnahkan — tepat setelah ini masih ada tombol Urungkan.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={remove.isPending}
            onClick={() => onOpenChange(false)}
          >
            Batal
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={remove.isPending}
            onClick={() =>
              remove.mutate(lead.id, {
                onSuccess: () => {
                  onOpenChange(false);
                  onDeleted?.();
                },
              })
            }
          >
            {remove.isPending ? "Menghapus…" : "Hapus lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
