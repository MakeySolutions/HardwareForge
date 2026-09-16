"use client";

import Link from "next/link";
import { FileDown, Printer } from "lucide-react";

const buttonClass =
  "focus-ring inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-xs font-medium transition-all hover:bg-[var(--surface-hover)]";

export function ProjectActions({ projectId, slug }: { projectId: string; slug: string }) {
  return (
    <div className="no-print flex shrink-0 gap-2">
      {/* Tlacova verzia v tom istom okne - desktop appka nove okna neotvara */}
      <Link href={`/print/${slug}`} className={buttonClass} title="Printable version of the project to save as PDF">
        <Printer className="size-3.5" />
        PDF
      </Link>

      {/* Obycajny <a>, nie <Link> - odpoved je subor na stiahnutie,
          klientska navigacia by ho neotvorila. */}
      <a href={`/api/projects/${projectId}/shopping-list`} className={buttonClass}>
        <FileDown className="size-3.5" />
        Shopping List
      </a>
    </div>
  );
}
