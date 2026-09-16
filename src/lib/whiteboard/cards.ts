import { TASK_STATUS, PART_CATEGORY } from "@/lib/constants";
import { formatEur } from "@/lib/utils";
import type { WhiteboardLinkData } from "@/server/queries";

/**
 * Prepojene karty na mape.
 *
 * Karta = obdlznik (`customData.hf`) s naviazanym textom. Farbu aj text spravuje
 * appka - synchronizuju sa so skutocnym stavom ulohy / sucastky v projekte.
 * Volny text a tvary sa nikdy neprepisuju.
 */

export const CARD_W = 240;
export const CARD_H = 88;

export type LinkKind = "task" | "part";

export type HfCardData = {
  hf: LinkKind;
  refId: string;
};

type LinkTask = WhiteboardLinkData["tasks"][number];
type LinkPart = WhiteboardLinkData["parts"][number];

// Jemna vypln + syta obruba podla stavu.
function statusColors(hex: string) {
  return { stroke: hex, background: hex + "22" };
}

const DELETED = { stroke: "#64748b", background: "#64748b18" };

function taskCardText(task: LinkTask): string {
  return `${task.title}\n${TASK_STATUS[task.status].label}`;
}

function partCardText(part: LinkPart): string {
  const price =
    part.unitPrice != null
      ? formatEur(Number(part.unitPrice) * part.quantity)
      : "no price";
  const buy = part.acquired ? "bought" : "to buy";
  return `${part.name}\n${part.quantity}× · ${price} · ${buy}`;
}

/** Skeleton pre `convertToExcalidrawElements` - jedna prepojena karta. */
export function cardSkeleton(
  kind: LinkKind,
  entity: LinkTask | LinkPart,
  x: number,
  y: number,
) {
  const isTask = kind === "task";
  const hex = isTask
    ? TASK_STATUS[(entity as LinkTask).status].dot
    : (entity as LinkPart).acquired
      ? "#34d399"
      : "#fb923c";
  const c = statusColors(hex);

  return {
    type: "rectangle" as const,
    x,
    y,
    width: CARD_W,
    height: CARD_H,
    roundness: { type: 3 as const },
    strokeColor: c.stroke,
    backgroundColor: c.background,
    fillStyle: "solid" as const,
    strokeWidth: 2,
    roughness: 0,
    customData: { hf: kind, refId: entity.id } satisfies HfCardData,
    label: {
      text: isTask
        ? taskCardText(entity as LinkTask)
        : partCardText(entity as LinkPart),
      fontSize: 16,
      fontFamily: 2, // FONT_FAMILY.Nunito
      textAlign: "center" as const,
      verticalAlign: "middle" as const,
    },
  };
}

/**
 * Prejde ulozene elementy, pri kazdej karte (`customData.hf`) prepise farbu
 * obdlznika a text naviazaneho elementu podla aktualneho stavu.
 * Vracia NOVE pole (needituje vstup) + priznak, ci sa nieco zmenilo.
 */
export function syncLinkedCards(
  elements: readonly unknown[],
  data: WhiteboardLinkData,
): { elements: unknown[]; changed: boolean } {
  const taskById = new Map(data.tasks.map((t) => [t.id, t]));
  const partById = new Map(data.parts.map((p) => [p.id, p]));

  // fileId/id naviazaneho textu -> nova hodnota
  const textPatch = new Map<string, string>();
  let changed = false;

  const next = elements.map((raw) => {
    const el = raw as Record<string, unknown>;
    const cd = el.customData as HfCardData | undefined;
    if (!cd?.hf || !cd.refId || el.type !== "rectangle") return raw;

    const entity =
      cd.hf === "task" ? taskById.get(cd.refId) : partById.get(cd.refId);

    let stroke: string;
    let background: string;
    let text: string;

    if (!entity) {
      stroke = DELETED.stroke;
      background = DELETED.background;
      text =
        cd.hf === "task"
          ? "task deleted"
          : "part deleted";
    } else if (cd.hf === "task") {
      const t = entity as LinkTask;
      const c = statusColors(TASK_STATUS[t.status].dot);
      stroke = c.stroke;
      background = c.background;
      text = taskCardText(t);
    } else {
      const p = entity as LinkPart;
      const c = statusColors(p.acquired ? "#34d399" : "#fb923c");
      stroke = c.stroke;
      background = c.background;
      text = partCardText(p);
    }

    const boundText = (el.boundElements as { type: string; id: string }[] | undefined)?.find(
      (b) => b.type === "text",
    );
    if (boundText) textPatch.set(boundText.id, text);

    if (el.strokeColor === stroke && el.backgroundColor === background) return raw;

    changed = true;
    return {
      ...el,
      strokeColor: stroke,
      backgroundColor: background,
      version: ((el.version as number) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: Date.now(),
    };
  });

  if (textPatch.size === 0) return { elements: next, changed };

  const withText = next.map((raw) => {
    const el = raw as Record<string, unknown>;
    if (el.type !== "text" || typeof el.id !== "string") return raw;
    const newText = textPatch.get(el.id);
    if (newText === undefined || newText === el.text) return raw;
    changed = true;
    return {
      ...el,
      text: newText,
      originalText: newText,
      version: ((el.version as number) ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 2 ** 31),
      updated: Date.now(),
    };
  });

  return { elements: withText, changed };
}

/** Nájde `customData.hf` na vybranom elemente (obdlznik alebo jeho text). */
export function readCardData(
  element: unknown,
  elements: readonly unknown[],
): HfCardData | null {
  const el = element as Record<string, unknown>;
  if (!el) return null;
  const direct = el.customData as HfCardData | undefined;
  if (direct?.hf && direct.refId) return direct;

  // vybrany je naviazany text -> vrat data kontajnera
  if (el.type === "text" && typeof el.containerId === "string") {
    const container = elements.find(
      (e) => (e as Record<string, unknown>).id === el.containerId,
    ) as Record<string, unknown> | undefined;
    const cd = container?.customData as HfCardData | undefined;
    if (cd?.hf && cd.refId) return cd;
  }
  return null;
}

export const PART_CATEGORY_LABEL = PART_CATEGORY;
