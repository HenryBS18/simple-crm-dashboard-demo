"use client";

import { Label } from "@/components/ui/label";

/** Label, kontrol, dan pesan error dalam satu susunan — dipakai semua form dialog. */
export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-ink-soft">
        {label}
      </Label>
      {children}
      {error ? <p className="text-xs text-signal">{error}</p> : null}
    </div>
  );
}
