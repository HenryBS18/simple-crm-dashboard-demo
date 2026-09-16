"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCreateActivity } from "@/lib/queries";
import type { ActivityType } from "@/lib/schema";

const TYPES: { value: ActivityType; label: string }[] = [
  { value: "note", label: "Catatan" },
  { value: "call", label: "Telepon" },
  { value: "wa", label: "WhatsApp" },
  { value: "visit", label: "Kunjungan" },
];

export function NoteComposer({
  leadId,
  actor,
}: {
  leadId: string;
  actor: string;
}) {
  const [content, setContent] = useState("");
  const [type, setType] = useState<ActivityType>("note");
  const create = useCreateActivity();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    create.mutate(
      { leadId, type, content: trimmed, actor: actor || undefined },
      { onSuccess: () => setContent("") },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={2}
        placeholder="Tulis hasil kontak terakhir"
        aria-label="Catatan cepat"
        className="resize-none text-sm"
      />
      <div className="flex items-center gap-2">
        <Select
          value={type}
          onValueChange={(value) => setType(value as ActivityType)}
        >
          <SelectTrigger
            size="sm"
            className="w-32"
            aria-label="Jenis aktivitas"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="submit"
          size="sm"
          className="ml-auto"
          disabled={!content.trim() || create.isPending}
        >
          {create.isPending ? "Menyimpan…" : "Simpan catatan"}
        </Button>
      </div>
    </form>
  );
}
