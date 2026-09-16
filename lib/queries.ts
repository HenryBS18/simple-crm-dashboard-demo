"use client";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import * as crm from "@/lib/crm";
import { crmSourceStore } from "@/lib/crm";
import type { DataOf, Lead, PayloadOf } from "@/lib/schema";

export const keys = {
  bootstrap: ["bootstrap"] as const,
  leads: ["leads"] as const,
  lead: (id: string) => ["lead", id] as const,
  sales: ["sales"] as const,
};

type LeadsList = DataOf<"leads.list">;

/* ── Baca ────────────────────────────────────────────────────────────────── */

export function useBootstrap() {
  return useQuery({
    queryKey: keys.bootstrap,
    queryFn: crm.bootstrap,
    staleTime: 5 * 60_000,
  });
}

/**
 * Seluruh papan hidup dari satu entri cache. Datanya belasan baris, jadi
 * pembagian ke kolom dan filter dikerjakan di client — dan optimistic update
 * drag-and-drop cuma perlu menambal satu tempat.
 */
export function useLeads() {
  return useQuery({
    queryKey: keys.leads,
    queryFn: () => crm.listLeads({ limit: 100 }),
  });
}

export function useLead(id: string | null) {
  return useQuery({
    queryKey: keys.lead(id ?? ""),
    queryFn: () => crm.getLead(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Halaman kelola sales butuh `phone`, sedangkan `bootstrap` tidak mengirimnya.
 * Jadi daftar lengkapnya diambil terpisah lewat `sales.list`.
 */
export function useSalesList() {
  return useQuery({
    queryKey: keys.sales,
    queryFn: crm.listSales,
  });
}

/** Badge "Data contoh" ikut menyala kalau n8n mati di tengah demo. */
export function useCrmSource() {
  return useSyncExternalStore(
    crmSourceStore.subscribe,
    crmSourceStore.getSnapshot,
    crmSourceStore.getServerSnapshot,
  );
}

/* ── Tulis ───────────────────────────────────────────────────────────────── */

function patchLeadInCache(client: QueryClient, next: Lead) {
  client.setQueryData<LeadsList>(keys.leads, (current) =>
    current
      ? {
          ...current,
          items: current.items.map((l) => (l.id === next.id ? next : l)),
        }
      : current,
  );
}

type OptimisticContext = { previous?: LeadsList };

export function useMoveLead() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: PayloadOf<"leads.move">) => crm.moveLead(payload),

    onMutate: async (payload): Promise<OptimisticContext> => {
      await client.cancelQueries({ queryKey: keys.leads });
      const previous = client.getQueryData<LeadsList>(keys.leads);
      client.setQueryData<LeadsList>(keys.leads, (current) =>
        current
          ? {
              ...current,
              items: current.items.map((l) =>
                l.id === payload.id
                  ? { ...l, stage: payload.stage, is_stale: false }
                  : l,
              ),
            }
          : current,
      );
      return { previous };
    },

    onError: (_error, _payload, context) => {
      if (context?.previous) client.setQueryData(keys.leads, context.previous);
      toast.error(
        "Gagal memindahkan kartu. Perubahan dikembalikan, coba lagi.",
      );
    },

    onSuccess: (data) => {
      patchLeadInCache(client, data.lead);
      client.invalidateQueries({ queryKey: keys.lead(data.lead.id) });
    },

    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.leads });
    },
  });
}

export function useAssignLead() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: PayloadOf<"leads.assign">) => crm.assignLead(payload),

    onMutate: async (payload): Promise<OptimisticContext> => {
      await client.cancelQueries({ queryKey: keys.leads });
      const previous = client.getQueryData<LeadsList>(keys.leads);
      if (payload.ownerId) {
        client.setQueryData<LeadsList>(keys.leads, (current) =>
          current
            ? {
                ...current,
                items: current.items.map((l) =>
                  l.id === payload.id
                    ? { ...l, owner_id: payload.ownerId as string }
                    : l,
                ),
              }
            : current,
        );
      }
      return { previous };
    },

    onError: (_error, _payload, context) => {
      if (context?.previous) client.setQueryData(keys.leads, context.previous);
      toast.error("Gagal mengganti sales. Perubahan dikembalikan, coba lagi.");
    },

    onSuccess: (data) => {
      patchLeadInCache(client, data.lead);
      toast.success(
        data.lead.owner_name
          ? `Lead dipegang ${data.lead.owner_name}`
          : "Sales dikosongkan",
      );
      client.invalidateQueries({ queryKey: keys.lead(data.lead.id) });
    },

    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.leads });
    },
  });
}

/**
 * Menghapus lead itu soft delete di n8n: barisnya diarsipkan, jadi "Urungkan"
 * di toast benar-benar bisa mengembalikannya, bukan sekadar basa-basi.
 */
export function useRestoreLead() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => crm.restoreLead(id),
    onSuccess: (data) => {
      client.invalidateQueries({ queryKey: keys.leads });
      client.invalidateQueries({ queryKey: keys.bootstrap });
      client.invalidateQueries({ queryKey: keys.lead(data.lead.id) });
      toast.success(`${data.lead.name} dipulihkan`);
    },
    onError: () => {
      toast.error("Lead gagal dipulihkan. Coba lagi.");
    },
  });
}

export function useDeleteLead() {
  const client = useQueryClient();
  const restore = useRestoreLead();

  return useMutation({
    mutationFn: (id: string) => crm.deleteLead(id),

    onMutate: async (id): Promise<OptimisticContext> => {
      await client.cancelQueries({ queryKey: keys.leads });
      const previous = client.getQueryData<LeadsList>(keys.leads);
      client.setQueryData<LeadsList>(keys.leads, (current) =>
        current
          ? {
              ...current,
              items: current.items.filter((l) => l.id !== id),
              total: Math.max(0, current.total - 1),
            }
          : current,
      );
      return { previous };
    },

    onError: (_error, _id, context) => {
      if (context?.previous) client.setQueryData(keys.leads, context.previous);
      toast.error("Lead gagal dihapus. Daftar dikembalikan, coba lagi.");
    },

    onSuccess: (data) => {
      // Ditandai basi tanpa refetch: panel detailnya sedang ditutup pemanggil,
      // memaksa ambil ulang cuma memunculkan kedipan "tidak bisa dimuat".
      client.invalidateQueries({
        queryKey: keys.lead(data.lead.id),
        refetchType: "none",
      });
      toast.success(`${data.lead.name} dihapus`, {
        action: {
          label: "Urungkan",
          onClick: () => restore.mutate(data.lead.id),
        },
      });
    },

    onSettled: () => {
      client.invalidateQueries({ queryKey: keys.leads });
      // lead_count sales ikut turun, dan bootstrap yang mengisi angkanya.
      client.invalidateQueries({ queryKey: keys.bootstrap });
    },
  });
}

/** Tidak optimistic: hasil kategorisasi dan assignment harus datang dari server. */
export function useCreateLead() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: PayloadOf<"leads.create">) => crm.createLead(payload),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.leads });
      client.invalidateQueries({ queryKey: keys.bootstrap });
    },
    onError: () => {
      toast.error(
        "Lead belum tersimpan. Periksa nama dan nomor, lalu simpan ulang.",
      );
    },
  });
}

/**
 * Tidak optimistic: sales baru baru punya `id` setelah server membalas.
 * bootstrap ikut di-invalidate karena dialah yang mengisi dropdown sales di
 * filter bar, dialog tambah lead, dan panel detail.
 */
export function useUpsertSales() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: PayloadOf<"sales.upsert">) =>
      crm.upsertSales(payload),
    onSuccess: (data) => {
      client.invalidateQueries({ queryKey: keys.sales });
      client.invalidateQueries({ queryKey: keys.bootstrap });
      toast.success(`${data.sales.name} tersimpan`);
    },
    onError: () => {
      toast.error("Sales belum tersimpan. Periksa isian lalu simpan ulang.");
    },
  });
}

export function useCreateActivity() {
  const client = useQueryClient();

  return useMutation({
    mutationFn: (payload: PayloadOf<"activities.create">) =>
      crm.createActivity(payload),
    onSuccess: (data) => {
      client.invalidateQueries({
        queryKey: keys.lead(String(data.activity.lead_id)),
      });
      client.invalidateQueries({ queryKey: keys.leads });
      toast.success("Catatan tersimpan");
    },
    onError: () => {
      toast.error("Catatan belum terkirim. Coba simpan lagi.");
    },
  });
}
