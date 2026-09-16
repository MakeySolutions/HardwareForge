import Link from "next/link";
import { CircuitBoard, LayoutGrid, Archive } from "lucide-react";
import { requireAuth } from "@/lib/auth";
import { getCategories } from "@/server/queries";
import { ThemeToggle } from "@/components/theme-toggle";
import { DataMenu } from "@/components/data-menu";

/**
 * Ochrana vsetkych vnorenych stranok. Server layout bezi pri kazdej
 * navigacii do tejto skupiny, takze staci jedno miesto.
 * Server Actions a Route Handlers volaju requireAuth() zvlast - layout
 * ich nechrani.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth();
  const categories = await getCategories();

  return (
    <div className="flex min-h-dvh">
      <aside className="no-print sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-subtle)] p-4 md:flex">
        <Link href="/dashboard" className="mb-6 flex items-center gap-2.5 px-2">
          <div className="grid size-8 place-items-center rounded-lg bg-[var(--accent)]/12 text-[var(--accent)]">
            <CircuitBoard className="size-4.5" />
          </div>
          <span className="font-semibold tracking-tight">HardwareForge</span>
        </Link>

        <nav className="space-y-1">
          <SidebarLink href="/dashboard" icon={<LayoutGrid className="size-4" />}>
            Projects
          </SidebarLink>
          <SidebarLink href="/dashboard?archived=1" icon={<Archive className="size-4" />}>
            Archive
          </SidebarLink>
        </nav>

        {categories.length > 0 && (
          <div className="mt-6">
            <p className="px-3 pb-2 text-[11px] font-medium tracking-wide text-[var(--text-muted)] uppercase">
              Categories
            </p>
            <div className="space-y-0.5">
              {categories.map((c) => (
                <Link
                  key={c.name}
                  href={`/dashboard?category=${encodeURIComponent(c.name)}`}
                  className="flex items-center justify-between rounded-lg px-3 py-1.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="tabular text-xs opacity-60">{c.count}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <DataMenu />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg)]/85 px-4 backdrop-blur md:px-6">
          <Link href="/dashboard" className="flex items-center gap-2 md:hidden">
            <CircuitBoard className="size-5 text-[var(--accent)]" />
            <span className="font-semibold">HardwareForge</span>
          </Link>
          <div className="hidden md:block" />
          <ThemeToggle />
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
    >
      {icon}
      {children}
    </Link>
  );
}
