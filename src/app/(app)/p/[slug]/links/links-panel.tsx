"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";
import { createLink, deleteLink } from "@/server/content";
import { LINK_TYPE } from "@/lib/constants";
import type { LinkType } from "@/generated/prisma/client";
import { Button, Card, EmptyState, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

type LinkRow = {
  id: string;
  url: string;
  title: string;
  type: LinkType;
  notes: string | null;
};

const TYPE_COLOR: Record<LinkType, string> = {
  GITHUB: "#e8eaf0",
  YOUTUBE: "#f87171",
  DATASHEET: "#a78bfa",
  SHOP: "#34d399",
  DOCS: "#38bdf8",
  INSPIRATION: "#fb923c",
  OTHER: "#94a3b8",
};

export function LinksPanel({ projectId, links }: { projectId: string; links: LinkRow[] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Zoskupenie podla typu - datasheety pokope, obchody pokope
  const groups = Object.keys(LINK_TYPE)
    .map((t) => ({ type: t as LinkType, items: links.filter((l) => l.type === t) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Links</h2>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Add Link
        </Button>
      </div>

      {links.length === 0 ? (
        <EmptyState
          icon={<Link2 className="size-9" />}
          title="No links yet"
          description="Save a GitHub repo, a YouTube tutorial, a datasheet, or an AliExpress product."
          action={
            <Button variant="primary" onClick={() => setOpen(true)}>
              <Plus className="size-4" />
              Add Link
            </Button>
          }
        />
      ) : (
        groups.map((g) => (
          <div key={g.type}>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
              {LINK_TYPE[g.type]}
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((l) => (
                <Card key={l.id} className="card-hover flex items-start gap-3 p-3.5">
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: TYPE_COLOR[l.type] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring block truncate text-sm font-medium hover:text-[var(--accent)]"
                      title={l.title}
                    >
                      {l.title}
                    </a>
                    <p className="truncate text-[11px] text-[var(--text-muted)]">{l.url}</p>
                    {l.notes && (
                      <p className="mt-1 text-xs text-[var(--text-muted)]">{l.notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-0.5">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="focus-ring rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                      aria-label={`Open ${l.title}`}
                    >
                      <ExternalLink className="size-3.5" />
                    </a>
                    <button
                      onClick={() =>
                        startTransition(async () => {
                          try {
                            await deleteLink(l.id);
                          } catch {
                            toast.error("Delete failed");
                          }
                        })
                      }
                      className="focus-ring rounded p-1.5 text-[var(--text-muted)] hover:text-red-400"
                      aria-label={`Delete ${l.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      <Modal open={open} onOpenChange={setOpen} title="New Link">
        <form
          action={async (fd) => {
            try {
              await createLink(projectId, fd);
              setOpen(false);
            } catch {
              toast.error("Enter a valid URL including https://");
            }
          }}
          className="space-y-4"
        >
          <Field label="URL">
            <Input name="url" type="url" required autoFocus placeholder="https://github.com/…" />
          </Field>
          <Field label="Name" hint="If left empty, the domain is used">
            <Input name="title" placeholder="TFT_eSPI library" />
          </Field>
          <Field label="Type" hint="Empty = guessed from the domain">
            <NativeSelect name="type" defaultValue="">
              <option value="">Guess automatically</option>
              {Object.entries(LINK_TYPE).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Note">
            <Textarea name="notes" rows={2} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton>Add</SubmitButton>
          </div>
        </form>
      </Modal>
    </div>
  );
}
