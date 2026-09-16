import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PROJECT_STATUS, PRIORITY, TASK_STATUS, PART_CATEGORY, LINK_TYPE, KANBAN_COLUMNS } from "@/lib/constants";
import { totalCost, powerBudget, type PartCalcInput } from "@/lib/calc";
import { formatEur, formatDate } from "@/lib/utils";
import type { TaskStatus, PartCategory, LinkType, ProjectStatus, Priority } from "@/generated/prisma/client";

export type ReportData = {
  title: string;
  description: string | null;
  category: string;
  status: ProjectStatus;
  priority: Priority;
  createdAt: Date;
  dueDate: Date | null;
  tasks: { id: string; title: string; status: TaskStatus }[];
  parts: (PartCalcInput & {
    id: string;
    name: string;
    category: PartCategory;
    partNumber: string | null;
    shopUrl: string | null;
  })[];
  links: { id: string; title: string; url: string; type: LinkType }[];
  notes: { id: string; title: string; content: string }[];
};

/**
 * Jedno vykreslenie projektu pouzite na dvoch miestach:
 * tlacova verzia (export do PDF) a verejny zdielany pohlad.
 */
export function ProjectReport({ data, publicView }: { data: ReportData; publicView?: boolean }) {
  const cost = totalCost(data.parts);
  const power = powerBudget(data.parts);
  const done = data.tasks.filter((t) => t.status === "DONE").length;

  return (
    <article className="mx-auto max-w-3xl space-y-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{data.title}</h1>
        {data.description && (
          <p className="mt-2 text-[var(--text-muted)]">{data.description}</p>
        )}
        <dl className="tabular mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
          <Item label="Status" value={PROJECT_STATUS[data.status].label} />
          <Item label="Priority" value={PRIORITY[data.priority].label} />
          <Item label="Category" value={data.category} />
          <Item label="Created" value={formatDate(data.createdAt)} />
          {data.dueDate && <Item label="Due Date" value={formatDate(data.dueDate)} />}
          <Item label="Tasks" value={`${done}/${data.tasks.length} done`} />
          <Item label="Cost" value={formatEur(cost)} />
          {power.countedParts > 0 && (
            <Item label="Power Draw" value={`≈ ${power.totalWatts.toFixed(1)} W`} />
          )}
        </dl>
      </header>

      {data.tasks.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Tasks</h2>
          <div className="space-y-4">
            {KANBAN_COLUMNS.map((status) => {
              const items = data.tasks.filter((t) => t.status === status);
              if (items.length === 0) return null;
              return (
                <div key={status}>
                  <h3 className="mb-1.5 text-sm font-medium text-[var(--text-muted)]">
                    {TASK_STATUS[status].label} ({items.length})
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {items.map((t) => (
                      <li key={t.id} className="flex gap-2">
                        <span>{status === "DONE" ? "☑" : "☐"}</span>
                        <span className={status === "DONE" ? "line-through opacity-60" : ""}>
                          {t.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {data.parts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Parts</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--text-muted)]">
                <th className="py-2 font-medium">Name</th>
                <th className="py-2 font-medium">Category</th>
                <th className="py-2 text-right font-medium">Qty</th>
                <th className="py-2 text-right font-medium">Unit Price</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.parts.map((p) => (
                <tr key={p.id} className="border-b border-[var(--border)]">
                  <td className="py-1.5">
                    {p.name}
                    {p.partNumber && (
                      <span className="tabular ml-2 text-xs text-[var(--text-muted)]">
                        {p.partNumber}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-[var(--text-muted)]">{PART_CATEGORY[p.category]}</td>
                  <td className="tabular py-1.5 text-right">{p.quantity}</td>
                  <td className="tabular py-1.5 text-right">
                    {p.unitPrice ? formatEur(p.unitPrice) : "—"}
                  </td>
                  <td className="tabular py-1.5 text-right">
                    {p.unitPrice ? formatEur(Number(p.unitPrice) * p.quantity) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="py-2 text-right text-xs text-[var(--text-muted)]">
                  Total
                </td>
                <td className="tabular py-2 text-right font-semibold">{formatEur(cost)}</td>
              </tr>
            </tfoot>
          </table>

          {power.recommended && (
            <p className="tabular mt-3 text-sm text-[var(--text-muted)]">
              Estimated draw: ≈ {power.totalWatts.toFixed(1)} W · recommended supply ≥{" "}
              {power.recommended.voltage} V / {power.recommended.currentA.toFixed(1)} A
              (includes a 30% margin)
            </p>
          )}
        </section>
      )}

      {data.links.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Links</h2>
          <ul className="space-y-1.5 text-sm">
            {data.links.map((l) => (
              <li key={l.id}>
                <span className="text-[var(--text-muted)]">[{LINK_TYPE[l.type]}]</span>{" "}
                <a href={l.url} className="underline" target="_blank" rel="noopener noreferrer">
                  {l.title}
                </a>
                <span className="block text-xs break-all text-[var(--text-muted)]">{l.url}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!publicView && data.notes.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Notes</h2>
          <div className="space-y-6">
            {data.notes.map((n) => (
              <div key={n.id}>
                <h3 className="mb-1.5 font-medium">{n.title}</h3>
                <div className="markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{n.content}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
