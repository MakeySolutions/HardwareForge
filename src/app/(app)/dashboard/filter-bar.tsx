"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { PROJECT_STATUS } from "@/lib/constants";
import { Button, Input, NativeSelect } from "@/components/ui";

/**
 * Filtre ziju v URL, nie v React state. Vdaka tomu je stav zdielatelny,
 * funguje tlacidlo spat a samotne filtrovanie bezi v Postgrese - stranka
 * zostava Server Component.
 */
export function FilterBar({ categories }: { categories: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [q, setQ] = useState(params.get("q") ?? "");

  function apply(next: URLSearchParams) {
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    apply(next);
  }

  // Debounce 300 ms - inak by kazde pismeno spustilo dotaz do DB
  useEffect(() => {
    const current = params.get("q") ?? "";
    if (q === current) return;
    const t = setTimeout(() => setParam("q", q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const hasFilters = Boolean(
    params.get("q") || params.get("category") || params.get("status") || params.get("sort"),
  );

  return (
    <div className="card mb-6 flex flex-wrap items-center gap-2 p-2.5">
      <div className="relative min-w-50 flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[var(--text-muted)]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search projects…"
          className="border-transparent bg-transparent pl-9"
          aria-label="Search projects"
        />
      </div>

      <NativeSelect
        value={params.get("category") ?? ""}
        onChange={(e) => setParam("category", e.target.value)}
        className="w-auto min-w-36"
        aria-label="Category"
      >
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        value={params.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}
        className="w-auto min-w-32"
        aria-label="Status"
      >
        <option value="">All statuses</option>
        {Object.entries(PROJECT_STATUS).map(([key, meta]) => (
          <option key={key} value={key}>
            {meta.label}
          </option>
        ))}
      </NativeSelect>

      <NativeSelect
        value={params.get("sort") ?? "updated"}
        onChange={(e) => setParam("sort", e.target.value === "updated" ? "" : e.target.value)}
        className="w-auto min-w-36"
        aria-label="Sort"
      >
        <option value="updated">Recently updated</option>
        <option value="created">Newest</option>
        <option value="title">By name</option>
      </NativeSelect>

      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setQ("");
            const next = new URLSearchParams();
            if (params.get("archived")) next.set("archived", "1");
            apply(next);
          }}
        >
          <X className="size-3.5" />
          Clear
        </Button>
      )}

      {pending && <span className="px-1 text-xs text-[var(--text-muted)]">Searching…</span>}
    </div>
  );
}
