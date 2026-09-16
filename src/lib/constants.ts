import type {
  ProjectStatus,
  Priority,
  TaskStatus,
  PartCategory,
  LinkType,
  FileKind,
} from "@/generated/prisma/client";

type Meta = { label: string; color: string; dot: string };

export const PROJECT_STATUS: Record<ProjectStatus, Meta> = {
  IDEA: { label: "Idea", color: "text-slate-300 bg-slate-500/15 border-slate-500/30", dot: "#94a3b8" },
  PLANNING: { label: "Planning", color: "text-sky-300 bg-sky-500/15 border-sky-500/30", dot: "#38bdf8" },
  DEVELOPMENT: { label: "Development", color: "text-indigo-300 bg-indigo-500/15 border-indigo-500/30", dot: "#818cf8" },
  TESTING: { label: "Testing", color: "text-amber-300 bg-amber-500/15 border-amber-500/30", dot: "#fbbf24" },
  DONE: { label: "Done", color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/30", dot: "#34d399" },
};

export const PRIORITY: Record<Priority, Meta> = {
  LOW: { label: "Low", color: "text-slate-300 bg-slate-500/15 border-slate-500/30", dot: "#94a3b8" },
  MEDIUM: { label: "Medium", color: "text-sky-300 bg-sky-500/15 border-sky-500/30", dot: "#38bdf8" },
  HIGH: { label: "High", color: "text-orange-300 bg-orange-500/15 border-orange-500/30", dot: "#fb923c" },
  CRITICAL: { label: "Critical", color: "text-red-300 bg-red-500/15 border-red-500/30", dot: "#f87171" },
};

export const TASK_STATUS: Record<TaskStatus, Meta> = {
  TODO: { label: "To Do", color: "text-slate-300", dot: "#94a3b8" },
  IN_PROGRESS: { label: "In Progress", color: "text-indigo-300", dot: "#818cf8" },
  WAITING: { label: "Waiting", color: "text-amber-300", dot: "#fbbf24" },
  TESTING: { label: "Testing", color: "text-violet-300", dot: "#a78bfa" },
  DONE: { label: "Done", color: "text-emerald-300", dot: "#34d399" },
};

/** Poradie stlpcov Kanban dosky. */
export const KANBAN_COLUMNS: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "WAITING",
  "TESTING",
  "DONE",
];

export const PART_CATEGORY: Record<PartCategory, string> = {
  MCU: "Microcontroller",
  DISPLAY: "Display",
  LED: "LED / strips",
  AUDIO: "Audio",
  SENSOR: "Sensor",
  POWER: "Power",
  MECHANICAL: "Mechanical / printing",
  CABLE: "Cables & connectors",
  OTHER: "Other",
};

export const LINK_TYPE: Record<LinkType, string> = {
  GITHUB: "GitHub",
  YOUTUBE: "YouTube",
  DATASHEET: "Datasheet",
  SHOP: "Shop",
  DOCS: "Documentation",
  INSPIRATION: "Inspiration",
  OTHER: "Other",
};

export const FILE_KIND: Record<FileKind, { label: string; color: string }> = {
  PDF: { label: "PDF", color: "#f87171" },
  STL: { label: "STL", color: "#a78bfa" },
  STEP: { label: "STEP", color: "#a78bfa" },
  CAD: { label: "CAD", color: "#c084fc" },
  SVG: { label: "SVG", color: "#fb923c" },
  IMAGE: { label: "Image", color: "#34d399" },
  ARCHIVE: { label: "Archive", color: "#94a3b8" },
  OTHER: { label: "File", color: "#94a3b8" },
};

/** Prípona -> FileKind. Fusion 360 (.f3d) a STEP nemajú registrovaný MIME type. */
const EXT_MAP: Record<string, FileKind> = {
  pdf: "PDF",
  stl: "STL",
  step: "STEP",
  stp: "STEP",
  svg: "SVG",
  png: "IMAGE",
  jpg: "IMAGE",
  jpeg: "IMAGE",
  webp: "IMAGE",
  gif: "IMAGE",
  zip: "ARCHIVE",
  rar: "ARCHIVE",
  "7z": "ARCHIVE",
  f3d: "CAD",
  f3z: "CAD",
  ipt: "CAD",
  iam: "CAD",
  "3mf": "CAD",
  obj: "CAD",
  dxf: "CAD",
  gcode: "CAD",
};

export function detectFileKind(filename: string): FileKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MAP[ext] ?? "OTHER";
}

/** Typ odkazu sa háda z domény, používateľ ho môže prepísať. */
export function guessLinkType(url: string): LinkType {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "OTHER";
  }
  if (host.includes("github.com")) return "GITHUB";
  if (host.includes("youtube.com") || host.includes("youtu.be")) return "YOUTUBE";
  if (
    host.includes("aliexpress") ||
    host.includes("amazon") ||
    host.includes("mouser") ||
    host.includes("digikey") ||
    host.includes("tme.eu") ||
    host.includes("laskarduino") ||
    host.includes("hadex")
  )
    return "SHOP";
  if (host.includes("docs.") || host.includes("readthedocs")) return "DOCS";
  if (host.includes("pinterest") || host.includes("instagram")) return "INSPIRATION";
  return "OTHER";
}

export const DEFAULT_CATEGORIES = [
  "ESP32",
  "Arduino",
  "3D printing",
  "Electronics",
  "LED",
  "Audio",
  "Smart home",
  "Other",
];
