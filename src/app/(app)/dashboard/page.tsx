import Link from "next/link";
import { CircuitBoard } from "lucide-react";
import { getProjects, getCategories } from "@/server/queries";
import { totalCost } from "@/lib/calc";
import { PROJECT_STATUS, PRIORITY } from "@/lib/constants";
import { formatEur, timeAgo } from "@/lib/utils";
import { Badge, EmptyState, Progress } from "@/components/ui";
import { FilterBar } from "./filter-bar";
import { NewProjectButton } from "./new-project";

export const metadata = { title: "Projects — HardwareForge" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const archived = one("archived") === "1";
  const [projects, categories] = await Promise.all([
    getProjects({
      q: one("q"),
      category: one("category"),
      status: one("status"),
      sort: one("sort"),
      archived,
    }),
    getCategories(),
  ]);

  const hasFilters = Boolean(one("q") || one("category") || one("status"));

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {archived ? "Archive" : "Projects"}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {projects.length === 0
              ? "No projects"
              : `${projects.length} ${projects.length === 1 ? "project" : "projects"}`}
          </p>
        </div>
        <NewProjectButton categories={categories.map((c) => c.name)} />
      </div>

      <FilterBar categories={categories.map((c) => c.name)} />

      {projects.length === 0 ? (
        <EmptyState
          icon={<CircuitBoard className="size-10" />}
          title={hasFilters ? "Nothing found" : "No projects yet"}
          description={
            hasFilters
              ? "Try changing your search or filters."
              : "Create your first project and keep parts, tasks, files, and notes all in one place."
          }
          action={hasFilters ? undefined : <NewProjectButton categories={[]} />}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {projects.map((p, i) => {
            const cost = totalCost(p.parts);
            const progress = p.totalTasks ? (p.doneTasks / p.totalTasks) * 100 : 0;
            const status = PROJECT_STATUS[p.status];
            const priority = PRIORITY[p.priority];

            return (
              <Link
                key={p.id}
                href={`/p/${p.slug}`}
                className="card card-hover animate-in group flex flex-col overflow-hidden"
                style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
              >
                <div
                  className="h-20 shrink-0"
                  style={{
                    background: `linear-gradient(135deg, ${p.color}38, ${p.color}0a 65%, transparent)`,
                    borderBottom: "1px solid var(--border)",
                  }}
                />
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="leading-tight font-semibold tracking-tight">{p.title}</h2>
                  <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-sm text-[var(--text-muted)]">
                    {p.description || "No description"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge className={status.color} dot={status.dot}>
                      {status.label}
                    </Badge>
                    <Badge className={priority.color}>{priority.label}</Badge>
                    <Badge className="border-[var(--border)] text-[var(--text-muted)]">
                      {p.category}
                    </Badge>
                  </div>

                  <div className="tabular mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--text-muted)]">
                    <span>
                      {p.doneTasks}/{p.totalTasks} tasks
                    </span>
                    <span>{formatEur(cost)}</span>
                    <span>{p.counts.parts} parts</span>
                    {p.counts.files > 0 && <span>{p.counts.files} files</span>}
                  </div>

                  <div className="mt-auto pt-3">
                    {p.totalTasks > 0 && <Progress value={progress} />}
                    <p className="mt-2 text-[11px] text-[var(--text-muted)]">
                      Updated {timeAgo(p.updatedAt)}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
