import { getProject, getActivity, getTasks } from "@/server/queries";
import { formatDate, timeAgo } from "@/lib/utils";
import { Card, EmptyState, Stat } from "@/components/ui";
import { History } from "lucide-react";

/** Zoskupenie zaznamov po dnoch, aby sa os dala citat. */
function groupByDay<T extends { createdAt: Date }>(items: T[]) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = item.createdAt.toISOString().slice(0, 10);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return [...map.entries()];
}

export default async function TimelinePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  const [activity, tasks] = await Promise.all([
    getActivity(project.id, 200),
    getTasks(project.id),
  ]);

  const completed = tasks.filter((t) => t.completedAt);
  const days = groupByDay(activity);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Created" value={<span className="text-lg">{formatDate(project.createdAt)}</span>} />
        <Stat
          label="Last update"
          value={<span className="text-lg">{timeAgo(project.updatedAt)}</span>}
          sub={formatDate(project.updatedAt)}
        />
        <Stat
          label="Completed tasks"
          value={`${completed.length}/${tasks.length}`}
          sub={
            completed.length
              ? `Last ${timeAgo(
                  completed.sort(
                    (a, b) => b.completedAt!.getTime() - a.completedAt!.getTime(),
                  )[0].completedAt!,
                )}`
              : "None yet"
          }
        />
      </div>

      <Card>
        <h2 className="mb-5 text-sm font-semibold">Change History</h2>

        {days.length === 0 ? (
          <EmptyState
            icon={<History className="size-9" />}
            title="No history yet"
            description="Every change in the project is recorded here automatically."
          />
        ) : (
          <div className="space-y-6">
            {days.map(([day, items]) => (
              <div key={day}>
                <p className="mb-3 text-xs font-medium tracking-wide text-[var(--text-muted)] uppercase">
                  {formatDate(new Date(day))}
                </p>
                <ol className="relative space-y-3 border-l border-[var(--border)] pl-5">
                  {items.map((a) => (
                    <li key={a.id} className="relative">
                      <span
                        className="absolute top-1.5 -left-[1.4rem] size-1.5 rounded-full bg-[var(--accent)] ring-4 ring-[var(--surface)]"
                        aria-hidden
                      />
                      <p className="text-sm leading-snug">{a.message}</p>
                      <p className="tabular mt-0.5 text-[11px] text-[var(--text-muted)]">
                        {a.createdAt.toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
