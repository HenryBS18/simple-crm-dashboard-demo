"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { SegmentTag } from "@/components/shell/segment-tag";
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
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFilters } from "@/lib/filters";
import { sourceLabel } from "@/lib/format";
import { useCreateLead } from "@/lib/queries";
import {
  type DataOf,
  type LeadDraft,
  leadDraftSchema,
  type Sales,
} from "@/lib/schema";

type CreateResult = DataOf<"leads.create">;

/** Radix Select tidak menerima string kosong, jadi "otomatis" butuh sentinel. */
const AUTO = "auto";

export function CreateLeadDialog({
  sources,
  sales,
}: {
  sources: string[];
  sales: Sales[];
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const create = useCreateLead();
  const { write } = useFilters();

  const form = useForm<LeadDraft>({
    resolver: zodResolver(leadDraftSchema),
    defaultValues: {
      name: "",
      phone: "",
      address: "",
      source: "manual",
      orderCount: 0,
      notes: "",
      ownerId: "",
    },
  });

  // Backend menerima ownerId apa adanya tanpa memeriksa `active`, jadi sales
  // nonaktif sengaja tidak ditawarkan di sini — memilihnya akan diterima diam-diam.
  const assignable = sales.filter((person) => person.active);

  function reset() {
    form.reset();
    setResult(null);
  }

  function submit(values: LeadDraft) {
    // ownerId kosong berarti biarkan backend yang menugaskan.
    create.mutate(
      { ...values, ownerId: values.ownerId || undefined },
      { onSuccess: setResult },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus aria-hidden />
          Tambah lead
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[30rem]">
        {result ? (
          <CreateResultView
            result={result}
            onOpenLead={() => {
              setOpen(false);
              write({ lead: result.lead.id });
              reset();
            }}
            onAddAnother={reset}
          />
        ) : (
          <form onSubmit={form.handleSubmit(submit)}>
            <DialogHeader>
              <DialogTitle>Tambah lead</DialogTitle>
              <DialogDescription>
                Segmen ditentukan otomatis. Sales boleh dipilih sendiri, atau
                biarkan backend yang menugaskan.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 space-y-3">
              <Field
                label="Nama"
                error={form.formState.errors.name?.message}
                htmlFor="lead-name"
              >
                <Input
                  id="lead-name"
                  autoComplete="off"
                  placeholder="Nama orang atau nama usaha"
                  {...form.register("name")}
                />
              </Field>

              <Field
                label="Nomor telepon"
                error={form.formState.errors.phone?.message}
                htmlFor="lead-phone"
              >
                <Input
                  id="lead-phone"
                  inputMode="tel"
                  autoComplete="off"
                  placeholder="0812-3456-7890"
                  className="font-mono"
                  {...form.register("phone")}
                />
              </Field>

              <Field label="Alamat" htmlFor="lead-address">
                <Input
                  id="lead-address"
                  autoComplete="off"
                  placeholder="Jalan, kelurahan, kota"
                  {...form.register("address")}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Sumber" htmlFor="lead-source">
                  {/* Terkontrol lewat form supaya ikut bersih saat "Tambah lagi". */}
                  <Select
                    value={form.watch("source") || "manual"}
                    onValueChange={(value) => form.setValue("source", value)}
                  >
                    <SelectTrigger id="lead-source" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {sources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {sourceLabel(source)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Jumlah order" htmlFor="lead-orders">
                  <Input
                    id="lead-orders"
                    type="number"
                    min={0}
                    className="font-mono"
                    {...form.register("orderCount", { valueAsNumber: true })}
                  />
                </Field>
              </div>

              <Field label="Sales" htmlFor="lead-owner">
                <Select
                  value={form.watch("ownerId") || AUTO}
                  onValueChange={(value) =>
                    form.setValue("ownerId", value === AUTO ? "" : value)
                  }
                >
                  <SelectTrigger id="lead-owner" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO}>Tentukan otomatis</SelectItem>
                    {assignable.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        {person.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <Field label="Catatan" htmlFor="lead-notes">
                <Textarea
                  id="lead-notes"
                  rows={2}
                  className="resize-none"
                  placeholder="Kebutuhan, janji tindak lanjut, atau info lain"
                  {...form.register("notes")}
                />
              </Field>

              <p className="border-l-2 border-l-line-strong py-1 pl-3 text-xs leading-5 text-ink-soft">
                Segmen B2B atau B2C ditentukan otomatis dari nama, alamat, dan
                jumlah order. Kalau sales dibiarkan otomatis, lead jatuh ke
                sales aktif dengan beban paling ringan. Hasilnya ditampilkan
                setelah simpan.
              </p>
            </div>

            <DialogFooter className="mt-5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" size="sm" disabled={create.isPending}>
                {create.isPending ? "Menyimpan…" : "Simpan lead"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Momen yang dipakai saat demo live: hasil kategorisasi dan assignment
 * dinyatakan eksplisit, bukan cuma toast yang lewat.
 */
function CreateResultView({
  result,
  onOpenLead,
  onAddAnother,
}: {
  result: CreateResult;
  onOpenLead: () => void;
  onAddAnother: () => void;
}) {
  const { lead, duplicate, categorization, assignment } = result;

  return (
    <div>
      <DialogHeader>
        <DialogTitle>
          {duplicate ? "Nomor ini sudah terdaftar" : "Lead tersimpan"}
        </DialogTitle>
        <DialogDescription>
          {duplicate
            ? "Tidak ada kartu baru dibuat. Ini lead yang sudah ada."
            : "Kartu baru masuk ke kolom To Do."}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-4 border border-line">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="min-w-0 flex-1 truncate text-base font-medium text-ink">
            {lead.name}
          </span>
          <SegmentTag
            type={lead.type}
            size="lg"
            className="animate-tag-settle"
          />
        </div>

        <div className="space-y-2 px-4 py-3 text-sm leading-6 text-ink">
          <p>
            Masuk sebagai <strong className="font-medium">{lead.type}</strong>{" "}
            {categorization?.reason
              ? `karena ${lowerFirst(stripPrefix(categorization.reason))}`
              : lead.classify_reason
                ? `karena ${lowerFirst(stripPrefix(lead.classify_reason))}`
                : "berdasarkan aturan kategorisasi backend"}
            .
          </p>
          <p>
            <AssignmentLine
              duplicate={duplicate}
              ownerName={assignment?.ownerName || lead.owner_name}
              rule={assignment?.rule}
            />
          </p>
        </div>
      </div>

      <DialogFooter className="mt-5">
        <Button type="button" variant="ghost" size="sm" onClick={onAddAnother}>
          Tambah lagi
        </Button>
        <Button type="button" size="sm" onClick={onOpenLead}>
          Lihat lead
        </Button>
      </DialogFooter>
    </div>
  );
}

/**
 * Membedakan sales yang dipilih user dari yang ditugaskan backend. Tanpa ini,
 * demo bisa mengklaim penugasan otomatis padahal barusan dipilih tangan.
 */
function AssignmentLine({
  duplicate,
  ownerName,
  rule,
}: {
  duplicate: boolean;
  ownerName: string;
  rule?: string;
}) {
  const name = <strong className="font-medium">{ownerName}</strong>;

  if (duplicate) {
    return ownerName ? (
      <>Lead ini sudah dipegang {name}.</>
    ) : (
      <>Lead ini belum ada sales-nya.</>
    );
  }

  if (!ownerName) {
    return <>Belum ada sales yang cocok, lead ini menunggu ditugaskan.</>;
  }

  if (rule === "manual") {
    return <>Ditugaskan ke {name} sesuai pilihan Anda.</>;
  }

  return (
    <>Ditugaskan otomatis ke {name}, sales aktif dengan beban paling ringan.</>
  );
}

/** Backend menutup alasan dengan ", dikategorikan B2B" — itu sudah disebut di kalimat. */
function stripPrefix(reason: string): string {
  return reason.replace(/,?\s*dikategorikan\s+B2[BC]\s*$/i, "");
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
