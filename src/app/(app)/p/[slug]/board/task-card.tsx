"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, GripVertical } from "lucide-react";
import { PRIORITY } from "@/lib/constants";
import { cn, formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui";
import type { BoardTask } from "./kanban-board";
import { EditTaskButton } from "./task-dialog";

export function TaskCard({ task, overlay }: { task: BoardTask; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: overlay,
  });

  const priority = PRIORITY[task.priority];
  const overdue =
    task.dueDate && task.status !== "DONE" && new Date(task.dueDate) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "card group/card p-3 transition-shadow",
        isDragging && !overlay && "opacity-35",
      )}
    >
      <div className="flex items-start gap-1.5">
        {/* Uchopenie len za rukovat - inak by sa nedal oznacit text ani kliknut na upravu */}
        <button
          {...attributes}
          {...listeners}
          className="focus-ring -ml-1 cursor-grab touch-none rounded p-0.5 text-[var(--text-muted)] opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
          aria-label={`Move task ${task.title}`}
        >
          <GripVertical className="size-3.5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm leading-snug font-medium">{task.title}</p>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">
              {task.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge className={priority.color}>{priority.label}</Badge>
            {task.dueDate && (
              <span
                className={cn(
                  "tabular inline-flex items-center gap-1 text-[11px]",
                  overdue ? "text-red-400" : "text-[var(--text-muted)]",
                )}
              >
                <CalendarDays className="size-3" />
                {formatDate(task.dueDate)}
              </span>
            )}
          </div>
        </div>

        {!overlay && <EditTaskButton task={task} />}
      </div>
    </div>
  );
}
