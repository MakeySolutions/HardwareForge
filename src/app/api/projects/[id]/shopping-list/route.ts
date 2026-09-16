import { db } from "@/lib/db";
import { isAuthorized } from "@/lib/auth";
import { groupByShop } from "@/lib/calc";

export const runtime = "nodejs";

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/**
 * Nakupny zoznam ako CSV - len nekupene sucastky, zoskupene podla obchodu,
 * aby sa dalo objednat naraz z jedneho e-shopu.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Route Handler nie je chraneny layoutom - autorizacia musi byt tu
  if (!(await isAuthorized())) {
    return new Response("Access denied", { status: 403 });
  }

  const { id } = await params;
  const project = await db.project.findUnique({
    where: { id },
    select: { slug: true, title: true },
  });
  if (!project) return new Response("Project not found", { status: 404 });

  const parts = await db.part.findMany({
    where: { projectId: id, acquired: false },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const rows: string[][] = [
    ["Shop", "Name", "Part Number", "Qty", "Unit Price", "Total", "Link", "Notes"],
  ];

  let total = 0;
  for (const group of groupByShop(parts)) {
    for (const p of group.items) {
      const unit = p.unitPrice ? Number(p.unitPrice) : null;
      const line = unit !== null ? unit * p.quantity : null;
      if (line !== null) total += line;

      rows.push([
        group.shop,
        p.name,
        p.partNumber ?? "",
        String(p.quantity),
        unit !== null ? unit.toFixed(2) : "",
        line !== null ? line.toFixed(2) : "",
        p.shopUrl ?? "",
        p.notes ?? "",
      ]);
    }
  }
  rows.push(["", "", "", "", "TOTAL", total.toFixed(2), "", ""]);

  // BOM na zaciatku, inak Excel zobrazi diakritiku rozbito.
  const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shopping-list-${project.slug}.csv"`,
    },
  });
}
