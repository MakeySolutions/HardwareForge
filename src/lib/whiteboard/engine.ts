import type { WhiteboardLinkData } from "@/server/queries";
import { syncLinkedCards, cardSkeleton, readCardData, type HfCardData } from "./cards";
import { templateElements, type TemplateId } from "./templates";
import { uploadNewFiles, loadStoredFiles } from "./files";
import { prepareImageFile } from "./images";

/* eslint-disable @typescript-eslint/no-explicit-any */
type ExcalidrawAPI = any;

export type SaveState = "idle" | "saving" | "saved" | "error";

type StoredFile = { fileId: string; url: string; mimeType: string };

type EngineConfig = {
  whiteboardId: string;
  storedFiles: StoredFile[];
  template: string | null;
  dark: boolean;
  getLinkData: () => WhiteboardLinkData;
  actions: {
    saveWhiteboard: (id: string, elements: unknown, appState: unknown) => Promise<void>;
    uploadThumbnail: (blob: Blob) => Promise<void>;
  };
  onSaveState: (s: SaveState) => void;
  onSelectCard: (card: HfCardData | null) => void;
};

const THUMB_INTERVAL = 60_000;

/**
 * Imperatívne jadro editora mimo Reactu - drží mutovateľný stav (API,
 * známe obrázky, časovače) a rieši autosave + synchronizáciu kariet.
 * Žiadne hooky, takže sa naň nevzťahujú pravidlá React Compilera.
 */
export function createWhiteboardEngine(cfg: EngineConfig) {
  let api: ExcalidrawAPI | null = null;
  const knownFiles = new Set(cfg.storedFiles.map((f) => f.fileId));
  let dirty = false;
  let lastVersion = -1;
  let lastThumbAt = 0;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let dark = cfg.dark;
  // Kazde dalsie vlozenie (karta/obrazok) sa mierne posunie, aby pri
  // opakovanom pridavani na to iste miesto nevznikla neviditelna kopa.
  let placeCount = 0;
  function nextOffset() {
    placeCount = (placeCount + 1) % 12;
    return placeCount * 22;
  }

  function sceneVersion(elements: readonly unknown[]): number {
    let h = elements.length;
    for (const raw of elements) {
      const el = raw as { version?: number; isDeleted?: boolean };
      h = (h * 31 + (el.version ?? 0) + (el.isDeleted ? 1 : 0)) | 0;
    }
    return h;
  }

  async function runSync() {
    if (!api) return;
    const current = api.getSceneElementsIncludingDeleted();
    const { elements, changed } = syncLinkedCards(current, cfg.getLinkData());
    if (!changed) return;
    const { CaptureUpdateAction } = await import("@excalidraw/excalidraw");
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
  }

  async function makeThumbnail() {
    if (!api) return;
    try {
      const { renderThumbnail } = await import("./export");
      const blob = await renderThumbnail({
        elements: api.getSceneElementsIncludingDeleted(),
        files: api.getFiles(),
      });
      if (!blob) return;
      await cfg.actions.uploadThumbnail(blob);
    } catch (err) {
      console.error("thumbnail:", err);
    }
  }

  async function persist(force = false) {
    if (!api || (!dirty && !force)) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const appState = api.getAppState();
    const files = api.getFiles();

    cfg.onSaveState("saving");
    try {
      await uploadNewFiles(cfg.whiteboardId, files, knownFiles);

      await cfg.actions.saveWhiteboard(cfg.whiteboardId, elements, {
        viewBackgroundColor: appState.viewBackgroundColor,
        scrollX: appState.scrollX,
        scrollY: appState.scrollY,
        zoom: appState.zoom,
        gridSize: appState.gridSize,
        // Tema mapy - nezavisla od globalnej temy appky (Excalidraw
        // vlastny prepinac nema, kedze mu temu vnucujeme cez prop).
        theme: dark ? "dark" : "light",
      });
      dirty = false;
      lastVersion = sceneVersion(elements);
      cfg.onSaveState("saved");

      if (Date.now() - lastThumbAt > THUMB_INTERVAL) {
        lastThumbAt = Date.now();
        void makeThumbnail();
      }
    } catch (err) {
      console.error(err);
      cfg.onSaveState("error");
    }
  }

  function scheduleSave() {
    dirty = true;
    cfg.onSaveState("idle");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void persist(), 1000);
  }

  return {
    setDark(v: boolean) {
      dark = v;
    },

    /**
     * Prepnutie tmavej/svetlej temy PRE TUTO MAPU, nezavisle od globalnej
     * temy appky. `theme` prop na <Excalidraw> preplo UI, ale farbu platna
     * treba prepnut samostatne - je to len pociatocna hodnota v initialData,
     * potom ju drzi vlastny stav Excalidrawu. Ulozi sa hned, aby volba
     * pretrvala aj po reloade.
     */
    setTheme(v: boolean) {
      dark = v;
      if (api) {
        api.updateScene({
          appState: { viewBackgroundColor: v ? "#0e1116" : "#ffffff" },
        });
      }
      void persist(true);
    },

    isDirty: () => dirty,

    async onApiReady(instance: ExcalidrawAPI) {
      api = instance;

      if (cfg.storedFiles.length) {
        const loaded = await loadStoredFiles(cfg.storedFiles);
        if (loaded.length) api.addFiles(loaded);
      }

      const empty = api.getSceneElements().length === 0;
      if (empty && cfg.template && cfg.template !== "blank") {
        const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
        const els = convertToExcalidrawElements(
          templateElements(cfg.template as TemplateId) as never,
        );
        api.updateScene({ elements: els });
        api.scrollToContent(els, { fitToContent: true });
        dirty = true;
        void persist();
      }

      await runSync();
      lastVersion = sceneVersion(api.getSceneElementsIncludingDeleted());
    },

    onChange(
      elements: readonly unknown[],
      appState: { selectedElementIds: Record<string, boolean> },
    ) {
      const ids = Object.keys(appState.selectedElementIds).filter(
        (id) => appState.selectedElementIds[id],
      );
      if (ids.length === 1) {
        const el = elements.find((e) => (e as { id: string }).id === ids[0]);
        cfg.onSelectCard(readCardData(el, elements));
      } else {
        cfg.onSelectCard(null);
      }

      if (sceneVersion(elements) !== lastVersion) scheduleSave();
    },

    resync() {
      void runSync();
    },

    async addCard(kind: "task" | "part", entityId: string) {
      if (!api) return;
      const data = cfg.getLinkData();
      const entity =
        kind === "task"
          ? data.tasks.find((t) => t.id === entityId)
          : data.parts.find((p) => p.id === entityId);
      if (!entity) return;

      const off = nextOffset();
      const st = api.getAppState();
      const cx = -st.scrollX + st.width / 2 / st.zoom.value - 120 + off;
      const cy = -st.scrollY + st.height / 2 / st.zoom.value - 44 + off;

      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      const card = convertToExcalidrawElements([
        cardSkeleton(kind, entity, cx, cy) as never,
      ]);
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...card],
      });
      scheduleSave();
    },

    /**
     * Vlastny vyber obrazkov - obchadza vstavany Excalidraw nastroj
     * "Insert image", ktory pod ochranou proti fingerprintingu (napr.
     * Brave Shields) zlyha na `getImageData` a vlozi prazdny ramcek.
     * Detaily v src/lib/whiteboard/images.ts.
     */
    async insertImages(files: File[]) {
      if (!api || files.length === 0) return;

      const st = api.getAppState();
      const baseX = -st.scrollX + st.width / 2 / st.zoom.value;
      const baseY = -st.scrollY + st.height / 2 / st.zoom.value;

      const binaryFiles: { id: string; dataURL: string; mimeType: string; created: number }[] = [];
      const skeletons: unknown[] = [];

      for (const file of files) {
        try {
          const img = await prepareImageFile(file);
          const off = nextOffset();
          binaryFiles.push({
            id: img.id,
            dataURL: img.dataURL,
            mimeType: img.mimeType,
            created: Date.now(),
          });
          skeletons.push({
            type: "image",
            fileId: img.id,
            x: baseX - img.width / 2 + off,
            y: baseY - img.height / 2 + off,
            width: img.width,
            height: img.height,
          });
        } catch (err) {
          console.error("Failed to prepare image:", err);
        }
      }
      if (skeletons.length === 0) return;

      api.addFiles(binaryFiles);
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      const els = convertToExcalidrawElements(skeletons as never);
      api.updateScene({
        elements: [...api.getSceneElementsIncludingDeleted(), ...els],
      });
      scheduleSave();
    },

    getScene() {
      return {
        elements: api?.getSceneElementsIncludingDeleted() ?? [],
        files: api?.getFiles() ?? {},
        dark,
      };
    },

    async flush() {
      if (saveTimer) clearTimeout(saveTimer);
      if (dirty && api) {
        try {
          await cfg.actions.saveWhiteboard(
            cfg.whiteboardId,
            api.getSceneElementsIncludingDeleted(),
            undefined,
          );
          await makeThumbnail();
        } catch (err) {
          console.error(err);
        }
      }
    },
  };
}

export type WhiteboardEngine = ReturnType<typeof createWhiteboardEngine>;
