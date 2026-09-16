"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createTask, updateTask, deleteTask } from "@/server/tasks";
import { PRIORITY, TASK_STATUS } from "@/lib/constants";
import type { TaskStatus } from "@/generated/prisma/client";
import { Button, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import type { BoardTask } from "./kanban-board";

export function NewTaskButton({
  projectId,
  status = "TODO",
  compact,
}: {
  projectId: string;
  status?: TaskStatus;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="New Task"
      trigger={
        compact ? (
          <button className="focus-ring mt-2 flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]">
            <Plus className="size-3.5" />
            Add
          </button>
        ) : (
          <Button variant="primary" size="sm">
            <Plus className="size-4" />
            New Task
          </Button>
        )
      }
    >
      <form
        action={async (fd) => {
          try {
            await createTask(projectId, fd);
            setOpen(false);
          } catch {
            toast.error("Failed to create task");
          }
        }}
        className="space-y-4"
      >
        <Field label="Name">
          <Input name="title" required autoFocus placeholder="Wire up the display" />
        </Field>
        <Field label="Description">
          <Textarea name="description" rows={3} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Column">
            <NativeSelect name="status" defaultValue={status}>
              {Object.entries(TASK_STATUS).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Priority">
            <NativeSelect name="priority" defaultValue="MEDIUM">
              {Object.entries(PRIORITY).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due Date">
            <Input name="dueDate" type="date" />
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton>Add Task</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

export function EditTaskButton({ task }: { task: BoardTask }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Edit Task"
      trigger={
        <button
          className="focus-ring rounded p-1 text-[var(--text-muted)] opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100 hover:text-[var(--text)]"
          aria-label={`Edit task ${task.title}`}
        >
          <Pencil className="size-3.5" />
        </button>
      }
    >
      <form
        action={async (fd) => {
          try {
            await updateTask(task.id, fd);
            setOpen(false);
          } catch {
            toast.error("Save failed");
          }
        }}
        className="space-y-4"
      >
        <Field label="Name">
          <Input name="title" required defaultValue={task.title} />
        </Field>
        <Field label="Description">
          <Textarea name="description" rows={4} defaultValue={task.description ?? ""} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <NativeSelect name="priority" defaultValue={task.priority}>
              {Object.entries(PRIORITY).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Due Date">
            <Input
              name="dueDate"
              type="date"
              defaultValue={task.dueDate ? task.dueDate.slice(0, 10) : ""}
            />
          </Field>
        </div>

        <div className="flex justify-between gap-2 pt-1">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteTask(task.id);
                  setOpen(false);
                } catch {
                  toast.error("Delete failed");
                }
              })
            }
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Save</SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
