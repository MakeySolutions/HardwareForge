"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { Plus, Pencil, Trash2, ExternalLink, Cpu } from "lucide-react";
import { toast } from "sonner";
import { createPart, updatePart, deletePart, togglePartAcquired } from "@/server/parts";
import { PART_CATEGORY } from "@/lib/constants";
import { totalCost, remainingCost, powerBudget, type PartCalcInput } from "@/lib/calc";
import { formatEur, cn } from "@/lib/utils";
import { Button, Card, EmptyState, Field, Input, NativeSelect, Stat, Textarea } from "@/components/ui";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";

export type PartRow = PartCalcInput & {
  id: string;
  name: string;
  category: keyof typeof PART_CATEGORY;
  imageUrl: string | null;
  shopUrl: string | null;
  partNumber: string | null;
  notes: string | null;
};

export function PartsTable({ projectId, parts }: { projectId: string; parts: PartRow[] }) {
  const [editing, setEditing] = useState<PartRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();

  const cost = totalCost(parts);
  const toBuy = remainingCost(parts);
  const power = powerBudget(parts);
  const acquired = parts.filter((p) => p.acquired).length;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Total cost"
          value={formatEur(cost)}
          sub={`${parts.length} items · ${acquired} bought`}
        />
        <Stat
          label="Still to buy"
          value={formatEur(toBuy)}
          sub={toBuy === 0 ? "Everything is bought" : `${parts.length - acquired} items missing`}
        />
        <Stat
          label="Estimated draw"
          value={power.countedParts ? `≈ ${power.totalWatts.toFixed(1)} W` : "—"}
          sub={
            power.recommended
              ? `Supply ≥ ${power.recommended.voltage} V / ${power.recommended.currentA.toFixed(1)} A`
              : "Add V and mA to your parts"
          }
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Parts</h2>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Add Part
        </Button>
      </div>

      {parts.length === 0 ? (
        <EmptyState
          icon={<Cpu className="size-9" />}
          title="No parts yet"
          description="Add ESP32s, displays, LED strips, or power supplies. Cost and power draw are calculated automatically."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Add Part
            </Button>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="w-10 px-3 py-2.5" />
                <th className="px-3 py-2.5 font-medium">Name</th>
                <th className="px-3 py-2.5 font-medium">Category</th>
                <th className="px-3 py-2.5 text-right font-medium">Qty</th>
                <th className="px-3 py-2.5 text-right font-medium">Unit Price</th>
                <th className="px-3 py-2.5 text-right font-medium">Total</th>
                <th className="px-3 py-2.5 text-right font-medium">Draw</th>
                <th className="w-24 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const line = p.unitPrice ? Number(p.unitPrice) * p.quantity : null;
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-hover)]",
                      p.acquired && "opacity-55",
                    )}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={p.acquired}
                        title={p.acquired ? "Mark as not bought" : "Mark as bought"}
                        aria-label={`${p.name} — bought`}
                        className="focus-ring size-4 cursor-pointer accent-[var(--accent)]"
                        onChange={() =>
                          startTransition(async () => {
                            try {
                              await togglePartAcquired(p.id);
                            } catch {
                              toast.error("Change failed");
                            }
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        {p.imageUrl ? (
                          <Image
                            src={p.imageUrl}
                            alt=""
                            width={32}
                            height={32}
                            unoptimized
                            className="size-8 shrink-0 rounded-md border border-[var(--border)] object-cover"
                          />
                        ) : (
                          <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-muted)]">
                            <Cpu className="size-3.5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className={cn("truncate font-medium", p.acquired && "line-through")}>
                            {p.name}
                          </p>
                          {p.partNumber && (
                            <p className="tabular truncate text-[11px] text-[var(--text-muted)]">
                              {p.partNumber}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">
                      {PART_CATEGORY[p.category]}
                    </td>
                    <td className="tabular px-3 py-2 text-right">{p.quantity}</td>
                    <td className="tabular px-3 py-2 text-right">
                      {p.unitPrice ? formatEur(p.unitPrice) : "—"}
                    </td>
                    <td className="tabular px-3 py-2 text-right font-medium">
                      {line !== null ? formatEur(line) : "—"}
                    </td>
                    <td className="tabular px-3 py-2 text-right text-xs text-[var(--text-muted)]">
                      {p.voltage && p.currentMa ? `${p.voltage} V · ${p.currentMa} mA` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {p.shopUrl && (
                          <a
                            href={p.shopUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="focus-ring rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                            aria-label={`Open shop for ${p.name}`}
                          >
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => setEditing(p)}
                          className="focus-ring rounded p-1.5 text-[var(--text-muted)] hover:text-[var(--text)]"
                          aria-label={`Edit ${p.name}`}
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-[var(--border-strong)] bg-[var(--bg-subtle)]">
                <td colSpan={5} className="px-3 py-2.5 text-xs text-[var(--text-muted)]">
                  Total
                </td>
                <td className="tabular px-3 py-2.5 text-right font-semibold">
                  {formatEur(cost)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </Card>
      )}

      {power.rails.length > 0 && (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Power Budget</h2>
          <div className="space-y-2">
            {power.rails.map((r) => (
              <div key={r.voltage} className="flex items-center gap-3">
                <span className="tabular w-16 shrink-0 text-sm">{r.voltage} V</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--bg-subtle)]">
                  <div
                    className="h-full rounded-full bg-[var(--accent)]"
                    style={{
                      width: `${power.totalWatts ? (r.watts / power.totalWatts) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="tabular w-36 shrink-0 text-right text-xs text-[var(--text-muted)]">
                  {r.currentMa.toFixed(0)} mA · {r.watts.toFixed(2)} W
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-[var(--text-muted)]">
            Currents add up per voltage rail — 500 mA at 5 V and 500 mA at 3.3 V is not
            1 A on one rail. The estimate assumes all parts running at once.
          </p>
        </Card>
      )}

      {/* Formulare */}
      <PartForm
        open={creating}
        onOpenChange={setCreating}
        title="New Part"
        onSubmit={async (fd) => createPart(projectId, fd)}
      />
      {editing && (
        <PartForm
          open
          onOpenChange={(v) => !v && setEditing(null)}
          title="Edit Part"
          part={editing}
          onSubmit={async (fd) => updatePart(editing.id, fd)}
          onDelete={async () => deletePart(editing.id)}
        />
      )}
    </div>
  );
}

function PartForm({
  open,
  onOpenChange,
  title,
  part,
  onSubmit,
  onDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  part?: PartRow;
  onSubmit: (fd: FormData) => Promise<void>;
  onDelete?: () => Promise<void>;
}) {
  const [, startTransition] = useTransition();

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} wide>
      <form
        action={async (fd) => {
          try {
            await onSubmit(fd);
            onOpenChange(false);
          } catch (err) {
            toast.error("Save failed — check the filled-in fields", {
              description: err instanceof Error ? err.message : undefined,
            });
          }
        }}
        className="space-y-4"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <Input name="name" required autoFocus defaultValue={part?.name} placeholder="ESP32-WROOM-32" />
          </Field>

          <Field label="Category">
            <NativeSelect name="category" defaultValue={part?.category ?? "OTHER"}>
              {Object.entries(PART_CATEGORY).map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Quantity">
            <Input name="quantity" type="number" min={1} defaultValue={part?.quantity ?? 1} />
          </Field>

          <Field label="Unit Price (€)">
            <Input
              name="unitPrice"
              inputMode="decimal"
              defaultValue={part?.unitPrice ?? ""}
              placeholder="4.20"
            />
          </Field>

          <Field label="Part Number">
            <Input name="partNumber" defaultValue={part?.partNumber ?? ""} placeholder="ILI9341" />
          </Field>

          <Field label="Voltage (V)" hint="For power draw estimate">
            <Input name="voltage" inputMode="decimal" defaultValue={part?.voltage ?? ""} placeholder="5" />
          </Field>

          <Field label="Current (mA)" hint="Typical draw of a single unit">
            <Input
              name="currentMa"
              inputMode="decimal"
              defaultValue={part?.currentMa ?? ""}
              placeholder="240"
            />
          </Field>

          <Field label="Shop Link" className="sm:col-span-2">
            <Input
              name="shopUrl"
              type="url"
              defaultValue={part?.shopUrl ?? ""}
              placeholder="https://www.aliexpress.com/item/…"
            />
          </Field>

          <Field
            label="Image"
            className="sm:col-span-2"
            hint="PNG, JPG, WEBP, or GIF up to 5 MB — saved only on your computer"
          >
            <input
              name="image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="focus-ring block w-full text-xs text-[var(--text-muted)] file:mr-3 file:rounded-md file:border file:border-[var(--border-strong)] file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-xs file:text-[var(--text)]"
            />
            {part?.imageUrl && (
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-[var(--text-muted)]">
                <input type="checkbox" name="removeImage" className="size-3.5 accent-[var(--accent)]" />
                Remove current image
              </label>
            )}
          </Field>

          <Field label="Notes" className="sm:col-span-2">
            <Textarea name="notes" rows={2} defaultValue={part?.notes ?? ""} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="acquired"
            defaultChecked={part?.acquired}
            className="focus-ring size-4 accent-[var(--accent)]"
          />
          Already bought (won&apos;t be in the shopping list)
        </label>

        <div className="flex justify-between gap-2 pt-1">
          {onDelete ? (
            <Button
              type="button"
              variant="danger"
              onClick={() =>
                startTransition(async () => {
                  try {
                    await onDelete();
                    onOpenChange(false);
                  } catch {
                    toast.error("Delete failed");
                  }
                })
              }
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <SubmitButton>Save</SubmitButton>
          </div>
        </div>
      </form>
    </Modal>
  );
}
