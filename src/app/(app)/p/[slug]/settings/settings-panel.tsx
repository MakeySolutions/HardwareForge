"use client";

import { useState, useTransition } from "react";
import { Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { updateProject, deleteProject, archiveProject } from "@/server/projects";
import { PROJECT_STATUS, PRIORITY, DEFAULT_CATEGORIES } from "@/lib/constants";
import { Button, Card, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/modal";

const COLORS = ["#7c8cff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#38bdf8", "#fb923c"];

type ProjectData = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  status: keyof typeof PROJECT_STATUS;
  priority: keyof typeof PRIORITY;
  color: string;
  dueDate: string;
  archived: boolean;
};

export function SettingsPanel({ project }: { project: ProjectData }) {
  const [color, setColor] = useState(project.color);
  const [, startTransition] = useTransition();

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <Card>
        <h2 className="mb-4 text-sm font-semibold">Project Details</h2>
        <form
          action={async (fd) => {
            try {
              await updateProject(project.id, fd);
              toast.success("Saved");
            } catch {
              toast.error("Save failed");
            }
          }}
          className="space-y-4"
        >
          <Field label="Name">
            <Input name="title" required defaultValue={project.title} />
          </Field>
          <Field label="Description">
            <Textarea name="description" rows={4} defaultValue={project.description ?? ""} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category">
              <Input name="category" list="hf-cat-settings" defaultValue={project.category} />
              <datalist id="hf-cat-settings">
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Due Date">
              <Input name="dueDate" type="date" defaultValue={project.dueDate} />
            </Field>
            <Field label="Status">
              <NativeSelect name="status" defaultValue={project.status}>
                {Object.entries(PROJECT_STATUS).map(([v, m]) => (
                  <option key={v} value={v}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Priority">
              <NativeSelect name="priority" defaultValue={project.priority}>
                {Object.entries(PRIORITY).map(([v, m]) => (
                  <option key={v} value={v}>
                    {m.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Color">
            <input type="hidden" name="color" value={color} />
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  className="focus-ring size-7 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c,
                    outline: color === c ? "2px solid var(--text)" : "none",
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </Field>

          <p className="text-xs text-[var(--text-muted)]">
            Changing the name also changes the project&apos;s address — old links will stop working.
          </p>

          <div className="flex justify-end">
            <SubmitButton>Save Changes</SubmitButton>
          </div>
        </form>
      </Card>

      <div className="space-y-5">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Archive</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            An archived project disappears from the main list, but nothing is deleted.
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              startTransition(async () => {
                await archiveProject(project.id, !project.archived);
                toast.success(project.archived ? "Restored" : "Archived");
              })
            }
          >
            <Archive className="size-3.5" />
            {project.archived ? "Restore from Archive" : "Archive Project"}
          </Button>
        </Card>

        <Card className="border-red-500/25">
          <h2 className="mb-1.5 text-sm font-semibold text-red-300">Danger Zone</h2>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Deletes the project along with all tasks, parts, links, notes, maps, and uploaded
            files. Cannot be undone (except by restoring from a backup).
          </p>
          <ConfirmButton
            title="Delete project?"
            message={`The project "${project.title}" and all its content will be permanently deleted. This action cannot be undone.`}
            confirmLabel="Delete Permanently"
            onConfirm={() => deleteProject(project.id)}
          >
            <Button variant="danger" size="sm">
              <Trash2 className="size-3.5" />
              Delete Project
            </Button>
          </ConfirmButton>
        </Card>
      </div>
    </div>
  );
}
