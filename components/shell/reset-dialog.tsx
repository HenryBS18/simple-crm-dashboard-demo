"use client";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLeads, useResetDemo } from "@/lib/queries";

const PHRASE = "RESET";

export function ResetDialog() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const reset = useResetDemo();
  const leads = useLeads();

  // Angka diambil dari cache papan, bukan request tambahan. Ini jumlah yang
  // tampak di layar — bukan hitungan baris fisik di n8n, yang bisa berbeda
  // karena baris soft-deleted ikut terhapus tapi tidak pernah tampil di papan.
  const leadCount = leads.data?.total ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
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

        <div className="grid gap-2">
          <Label htmlFor="reset-confirm">
            Ketik <span className="font-mono font-medium">{PHRASE}</span> untuk
            melanjutkan
          </Label>
          <Input
            id="reset-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button
            variant="destructive"
            disabled={typed !== PHRASE || reset.isPending}
            onClick={() =>
              reset.mutate(undefined, { onSuccess: () => setOpen(false) })
            }
          >
            {reset.isPending ? "Mereset…" : "Reset sekarang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
