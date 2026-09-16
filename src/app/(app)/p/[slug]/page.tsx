import Link from "next/link";
import { getProject, getProjectStats, getActivity } from "@/server/queries";
import { totalCost, remainingCost, powerBudget } from "@/lib/calc";
import { formatEur, timeAgo, formatDate } from "@/lib/utils";
import { Card, Progress, Stat } from "@/components/ui";

export default async function OverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  const [stats, activity] = await Promise.all([
    getProjectStats(project.id),
    getActivity(project.id, 12),
  ]);

  const cost = totalCost(stats.parts);
  const toBuy = remainingCost(stats.parts);
  const power = powerBudget(stats.parts);
  const progress = stats.totalTasks ? (stats.doneTasks / stats.totalTasks) * 100 : 0;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="p-4">
            <p className="text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
              Progress
            </p>
            <p className="tabular mt-1.5 text-2xl leading-none font-semibold">
              {stats.doneTasks}/{stats.totalTasks}
            </p>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">tasks done</p>
            <Progress value={progress} className="mt-3" />
          </Card>

          <Stat
            label="Project cost"
            value={formatEur(cost)}
            sub={
              toBuy > 0
                ? `Still to buy: ${formatEur(toBuy)} · ${stats.counts.parts} parts`
                : `${stats.counts.parts} parts, all bought`
            }
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

          <Stat
            label="Next due date"
            value={
              stats.nextDue?.dueDate ? (
                <span className="text-lg">{formatDate(stats.nextDue.dueDate)}</span>
              ) : (
                "—"
              )
            }
            sub={stats.nextDue?.title ?? "No task with a due date"}
          />
        </div>

        {power.rails.length > 1 && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Power Budget by Rail</h2>
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
                  <span className="tabular w-32 shrink-0 text-right text-xs text-[var(--text-muted)]">
                    {r.currentMa.toFixed(0)} mA · {r.watts.toFixed(1)} W
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              The estimate assumes all parts running at once. The recommended supply has a 30%
              margin for spikes (e.g. Wi-Fi transmit on an ESP32).
            </p>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <QuickLink href={`/p/${slug}/parts`} count={stats.counts.parts} label="parts" />
          <QuickLink href={`/p/${slug}/files`} count={stats.counts.files} label="files" />
          <QuickLink href={`/p/${slug}/links`} count={stats.counts.links} label="links" />
        </div>
      </div>

      <Card className="h-fit">
        <h2 className="mb-4 text-sm font-semibold">Recent Activity</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {activity.map((a) => (
              <li key={a.id} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                <div className="min-w-0">
                  <p className="text-sm leading-snug">{a.message}</p>
                  <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                    {timeAgo(a.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
        <Link
          href={`/p/${slug}/timeline`}
          className="mt-4 inline-block text-xs text-[var(--accent)] hover:underline"
        >
          Full timeline →
        </Link>
      </Card>
    </div>
  );
}

function QuickLink({ href, count, label }: { href: string; count: number; label: string }) {
  return (
    <Link href={href} className="card card-hover p-4">
      <p className="tabular text-xl font-semibold">{count}</p>
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
    </Link>
  );
}
