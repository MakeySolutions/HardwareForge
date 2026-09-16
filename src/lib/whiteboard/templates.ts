/**
 * Predlohy novej mapy. Kazda vracia pole skeletonov pre
 * `convertToExcalidrawElements`. Cisto vizualne - ziadne prepojene karty.
 */

export type TemplateId = "blank" | "plan" | "wiring" | "enclosure" | "ideas";

export const TEMPLATES: { id: TemplateId; label: string; hint: string }[] = [
  { id: "blank", label: "Blank", hint: "A clean canvas" },
  { id: "plan", label: "Project Plan", hint: "To Do / Refine / Done columns" },
  { id: "wiring", label: "Wiring Diagram", hint: "Power · MCU · Peripherals + legend" },
  { id: "enclosure", label: "Mechanical / Enclosure", hint: "Sketch · Dimensions · Print photos" },
  { id: "ideas", label: "Ideas", hint: "Colored sticky notes for brainstorming" },
];

const FONT = 2; // FONT_FAMILY.Nunito

function frame(x: number, y: number, w: number, h: number, name: string) {
  return { type: "frame" as const, x, y, width: w, height: h, name, children: [] };
}

function heading(x: number, y: number, text: string, color = "#e8eaf0") {
  return {
    type: "text" as const,
    x,
    y,
    text,
    fontSize: 28,
    fontFamily: FONT,
    strokeColor: color,
  };
}

function note(x: number, y: number, text: string, bg: string) {
  return {
    type: "rectangle" as const,
    x,
    y,
    width: 200,
    height: 120,
    backgroundColor: bg,
    fillStyle: "solid" as const,
    strokeColor: "transparent",
    roughness: 0,
    roundness: { type: 3 as const },
    label: { text, fontSize: 16, fontFamily: FONT },
  };
}

export function templateElements(id: TemplateId): unknown[] {
  switch (id) {
    case "plan":
      return [
        heading(40, 20, "Project Plan"),
        frame(40, 80, 320, 640, "To Do"),
        frame(400, 80, 320, 640, "Refine"),
        frame(760, 80, 320, 640, "Done"),
      ];

    case "wiring":
      return [
        heading(40, 20, "Wiring Diagram"),
        frame(40, 80, 300, 300, "Power"),
        frame(380, 80, 340, 420, "MCU"),
        frame(760, 80, 360, 560, "Peripherals"),
        heading(40, 420, "Wire Legend", "#8b91a3"),
        { type: "text" as const, x: 40, y: 460, text: "🔴 +V   ⚫ GND   🟡 data   🔵 clock", fontSize: 16, fontFamily: FONT, strokeColor: "#8b91a3" },
      ];

    case "enclosure":
      return [
        heading(40, 20, "Mechanical / Enclosure"),
        frame(40, 80, 520, 520, "Sketch"),
        frame(600, 80, 300, 240, "Dimensions"),
        frame(600, 360, 300, 240, "Print Photos"),
      ];

    case "ideas":
      return [
        heading(40, 20, "Ideas"),
        note(40, 90, "Idea 1", "#fde68a"),
        note(280, 90, "Idea 2", "#bbf7d0"),
        note(520, 90, "Idea 3", "#bfdbfe"),
        note(160, 250, "Inspiration", "#fbcfe8"),
        note(400, 250, "Question?", "#fed7aa"),
      ];

    case "blank":
    default:
      return [];
  }
}
