"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Taby su skutocne routy, nie React state - kazdy tab ma vlastnu URL,
 * da sa zdielat odkazom a Next.js ho prefetchne pri hoveri.
 */
const TABS = [
  { href: "", label: "Overview" },
  { href: "/board", label: "Board" },
  { href: "/maps", label: "Maps" },
  { href: "/parts", label: "Parts" },
  { href: "/files", label: "Files" },
  { href: "/links", label: "Links" },
  { href: "/notes", label: "Notes" },
  { href: "/timeline", label: "Timeline" },
  { href: "/settings", label: "Settings" },
];

export function ProjectTabs({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/p/${slug}`;

  return (
    <div className="no-print thin-scroll mt-5 -mb-px flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {TABS.map((tab) => {
        const href = `${base}${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "relative shrink-0 rounded-t-lg px-3.5 py-2.5 text-sm font-medium transition-colors",
              active
                ? "text-[var(--text)]"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {tab.label}
            {active && (
              <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--accent)]" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
