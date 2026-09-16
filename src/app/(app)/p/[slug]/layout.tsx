import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/server/queries";
import { ProjectTabs } from "./tabs";
import { StatusControls } from "./status-controls";
import { ProjectActions } from "./project-actions";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const project = await getProject(slug);
  return { title: `${project.title} — HardwareForge` };
}

/**
 * Hlavicka je v layoute, nie na stranke - pri prepinani tabov sa
 * neremountuje a ostava na mieste.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProject(slug);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
      <Link
        href="/dashboard"
        className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"
      >
        <ArrowLeft className="size-3.5" />
        Projects
      </Link>

      <div className="card relative overflow-hidden p-5 md:p-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-40"
          style={{ background: `linear-gradient(180deg, ${project.color}33, transparent)` }}
          aria-hidden
        />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{project.title}</h1>
            {project.description && (
              <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-muted)]">
                {project.description}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusControls
                projectId={project.id}
                status={project.status}
                priority={project.priority}
              />
              <Badge className="border-[var(--border)] text-[var(--text-muted)]">
                {project.category}
              </Badge>
              {project.dueDate && (
                <Badge className="border-[var(--border)] text-[var(--text-muted)]">
                  Due: {formatDate(project.dueDate)}
                </Badge>
              )}
              {project.archivedAt && (
                <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                  Archived
                </Badge>
              )}
            </div>
          </div>

          <ProjectActions projectId={project.id} slug={project.slug} />
        </div>
      </div>

      <ProjectTabs slug={slug} />

      <div className="mt-5">{children}</div>
    </div>
  );
}
