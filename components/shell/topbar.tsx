"use client";

import { cn } from "cn";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ResetDialog } from "@/components/shell/reset-dialog";

const VIEWS = [
  { href: "/", label: "Papan" },
  { href: "/leads", label: "Tabel" },
  { href: "/sales", label: "Sales" },
  { href: "/agent", label: "Agen AI" },
] as const;

export function Topbar({ children }: { children?: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="flex h-12 items-center gap-4 px-6">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="text-sm font-semibold tracking-tight">
            CRM
          </Link>
        </div>

        <span aria-hidden className="h-5 w-px bg-line" />

        <nav className="flex items-center gap-1" aria-label="Tampilan">
          {VIEWS.map((view) => {
            const active = pathname === view.href;
            return (
              <Link
                key={view.href}
                href={view.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-2 py-1 text-sm transition-colors",
                  active
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-ink-soft hover:text-ink",
                )}
              >
                {view.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {children}
          <ResetDialog />
        </div>
      </div>
    </header>
  );
}
