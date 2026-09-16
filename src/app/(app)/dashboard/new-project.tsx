"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createProject } from "@/server/projects";
import { PROJECT_STATUS, PRIORITY, DEFAULT_CATEGORIES } from "@/lib/constants";
import { Button, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

const COLORS = ["#7c8cff", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#38bdf8", "#fb923c"];

export function NewProjectButton({ categories }: { categories: string[] }) {
  const [open, setOpen] = useState(false);
  const [color, setColor] = useState(COLORS[0]);

  const allCategories = [...new Set([...categories, ...DEFAULT_CATEGORIES])];

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="New Project"
      description="You can change the basic details anytime in the project's settings."
      trigger={
        <Button variant="primary">
          <Plus className="size-4" />
          New Project
        </Button>
      }
    >
      {/* createProject na konci presmeruje na detail projektu */}
      <form action={createProject} className="space-y-4">
        <Field label="Name">
          <Input name="title" required autoFocus placeholder="Spotify display with ESP32" />
        </Field>

        <Field label="Description">
          <Textarea
            name="description"
            rows={3}
            placeholder="A display showing the currently playing track…"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Category">
            <Input
              name="category"
              list="hf-categories"
              defaultValue="ESP32"
              placeholder="ESP32"
            />
            <datalist id="hf-categories">
              {allCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>

          <Field label="Due date (optional)">
            <Input name="dueDate" type="date" />
          </Field>

          <Field label="Status">
            <NativeSelect name="status" defaultValue="IDEA">
              {Object.entries(PROJECT_STATUS).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Priority">
            <NativeSelect name="priority" defaultValue="MEDIUM">
              {Object.entries(PRIORITY).map(([key, meta]) => (
                <option key={key} value={key}>
                  {meta.label}
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

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <SubmitButton>Create Project</SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
