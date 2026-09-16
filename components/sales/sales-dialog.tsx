"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpsertSales } from "@/lib/queries";
import { type Sales, type SalesDraft, salesDraftSchema } from "@/lib/schema";

const BLANK: SalesDraft = { id: undefined, name: "", phone: "", active: true };

/** Satu dialog untuk dua keperluan: ada `sales` berarti edit, kosong berarti tambah. */
export function SalesDialog({
  open,
  onOpenChange,
  sales,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  sales?: Sales;
}) {
  const upsert = useUpsertSales();
  const form = useForm<SalesDraft>({
    resolver: zodResolver(salesDraftSchema),
    defaultValues: BLANK,
  });
  const { reset } = form;

  // Dialognya cuma satu dan dipakai bergantian untuk baris mana pun, jadi
  // isiannya harus ditanam ulang tiap kali targetnya berganti.
  useEffect(() => {
    if (!open) return;
    reset(
      sales
        ? {
            id: sales.id,
            name: sales.name,
            phone: sales.phone,
            active: sales.active,
          }
        : BLANK,
    );
  }, [open, sales, reset]);

  const editing = Boolean(sales);

  function submit(values: SalesDraft) {
    upsert.mutate(values, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[26rem]">
        <form onSubmit={form.handleSubmit(submit)}>
          <DialogHeader>
            <DialogTitle>{editing ? "Ubah sales" : "Tambah sales"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Sales nonaktif tidak pernah kebagian lead baru, tapi lead yang sudah dipegangnya tetap utuh."
                : "Sales baru langsung ikut antrean penugasan otomatis begitu statusnya aktif."}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <Field
              label="Nama"
              error={form.formState.errors.name?.message}
              htmlFor="sales-name"
            >
              <Input
                id="sales-name"
                autoComplete="off"
                placeholder="Nama sales"
                {...form.register("name")}
              />
            </Field>

            <Field label="Nomor telepon" htmlFor="sales-phone">
              <Input
                id="sales-phone"
                inputMode="tel"
                autoComplete="off"
                placeholder="6281200000000"
                className="font-mono"
                {...form.register("phone")}
              />
            </Field>

            <Field label="Status" htmlFor="sales-active">
              <Select
                value={form.watch("active") ? "active" : "inactive"}
                onValueChange={(value) =>
                  form.setValue("active", value === "active")
                }
              >
                <SelectTrigger id="sales-active" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="inactive">Nonaktif</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <p className="border-l-2 border-l-line-strong py-1 pl-3 text-xs leading-5 text-ink-soft">
              {editing
                ? "Mengganti nama tidak mengubah nama yang sudah tercatat di lead lama — itu tersimpan terpisah saat lead ditugaskan."
                : "Sales tidak bisa dihapus setelah dibuat. Kalau sudah tidak dipakai, ubah statusnya jadi nonaktif."}
            </p>
          </div>

          <DialogFooter className="mt-5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={upsert.isPending}>
              {upsert.isPending ? "Menyimpan…" : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
