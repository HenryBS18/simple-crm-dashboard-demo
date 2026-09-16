"use client";

import { MessageSquare } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useDecideAiTask } from "@/lib/queries";
import type { AiTask, FollowupResult } from "@/lib/schema";

/**
 * Draf bisa disunting sebelum disetujui, dan teks yang disunting itulah yang
 * tercatat sebagai activity. Kalau tidak, timeline lead akan mengklaim sesuatu
 * yang berbeda dari pesan yang benar-benar dikirim.
 */
export function DraftDialog({
  task,
  open,
  onOpenChange,
}: {
  task: AiTask;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const payload = task.payload as { text?: string; goal?: string };
  const [text, setText] = useState(String(payload.text ?? ""));
  const decide = useDecideAiTask();
  const empty = text.trim().length === 0;

  function submit(decision: "approve" | "reject") {
    decide.mutate(
      {
        id: task.id,
        decision,
        actor: "Operator",
        overrides: decision === "approve" ? { text } : undefined,
      },
      {
        onSuccess: (data) => {
          onOpenChange(false);
          if (decision !== "approve" || data.task.status !== "approved") return;

          const result = data.result as FollowupResult | null;
          if (!result?.waUrl) return;

          // Pemblokir popup bisa menolak jendela yang dibuka setelah panggilan
          // async. Kalau itu terjadi, tautannya tetap harus sampai ke tangan
          // operator — bukan hilang diam-diam.
          const opened = window.open(result.waUrl, "_blank", "noopener");
          if (!opened) {
            toast.success("Pesan tercatat", {
              description: "Browser menahan jendela baru.",
              action: {
                label: "Buka WhatsApp",
                onClick: () => {
                  window.location.href = result.waUrl;
                },
              },
            });
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>Draf pesan WhatsApp</DialogTitle>
          <DialogDescription>
            Boleh disunting dulu. Yang tersimpan di riwayat lead adalah teks
            yang Anda setujui, dan WhatsApp terbuka dengan pesan sudah terisi —
            tombol kirimnya tetap Anda yang tekan.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={8}
            className="resize-none text-sm leading-6"
            aria-label="Isi pesan"
          />

          <p className="border-l-2 border-l-line-strong py-1 pl-3 text-xs leading-5 text-ink-soft">
            <span className="font-medium text-ink">Dasar pemilihan — </span>
            {task.reason}
          </p>
        </div>

        <DialogFooter className="mt-5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={decide.isPending}
            onClick={() => submit("reject")}
          >
            Tolak usulan
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={decide.isPending || empty}
            onClick={() => submit("approve")}
          >
            <MessageSquare aria-hidden />
            {decide.isPending ? "Menyimpan…" : "Setujui & buka WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
