"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { setProjectStatus, setProjectPriority } from "@/server/projects";
import { PROJECT_STATUS, PRIORITY } from "@/lib/constants";
import type { ProjectStatus, Priority } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

/** Stav a priorita sa menia priamo v hlavicke, bez otvarania nastaveni. */
export function StatusControls({
  projectId,
  status,
  priority,
}: {
  projectId: string;
  status: ProjectStatus;
  priority: Priority;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className={cn("no-print flex gap-2", pending && "opacity-60")}>
      <InlineSelect
        value={status}
        options={Object.entries(PROJECT_STATUS).map(([v, m]) => ({ value: v, label: m.label }))}
        className={PROJECT_STATUS[status].color}
        dot={PROJECT_STATUS[status].dot}
        ariaLabel="Project status"
        onChange={(v) =>
          startTransition(async () => {
            try {
              await setProjectStatus(projectId, v);
            } catch {
              toast.error("Failed to change status");
            }
          })
        }
      />
      <InlineSelect
        value={priority}
        options={Object.entries(PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))}
        className={PRIORITY[priority].color}
        ariaLabel="Project priority"
        onChange={(v) =>
          startTransition(async () => {
            try {
              await setProjectPriority(projectId, v);
            } catch {
              toast.error("Failed to change priority");
            }
          })
        }
      />
    </div>
  );
}

function InlineSelect({
  value,
  options,
  className,
  dot,
  ariaLabel,
  onChange,
}: {
  value: string;
  options: { value: string; label: string }[];
  className: string;
  dot?: string;
  ariaLabel: string;
  onChange: (v: string) => void;
}) {
  return (
    <span className={cn("relative inline-flex items-center rounded-full border", className)}>
      {dot && (
        <span
          className="pointer-events-none absolute left-2.5 size-1.5 rounded-full"
          style={{ background: dot }}
          aria-hidden
        />
      )}
      <select
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "focus-ring cursor-pointer appearance-none rounded-full bg-transparent py-0.5 pr-6 text-xs font-medium",
          dot ? "pl-6" : "pl-2.5",
        )}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-[var(--surface)] text-[var(--text)]">
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-2 text-[9px] opacity-60">▼</span>
    </span>
  );
}
