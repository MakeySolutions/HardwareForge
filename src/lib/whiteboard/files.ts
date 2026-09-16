import { uploadToApp } from "@/lib/upload-client";

/**
 * Obrazky na mape.
 *
 * Excalidraw drzi obrazky ako `BinaryFileData` s base64 `dataURL`. My ich
 * nechceme mat v `Whiteboard.elements` (velke), tak:
 *  - nove obrazky pri autosave ulozime do lokalneho uloziska (/api/upload)
 *  - pri otvoreni mapy ich nacitame spat ako dataURL a vlozime do editora
 */

type ExcalidrawFile = {
  id: string;
  dataURL: string;
  mimeType: string;
  created: number;
};

type StoredFile = { fileId: string; url: string; mimeType: string };

function dataUrlToBlob(dataURL: string): Blob {
  const [head, b64] = dataURL.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * Ulozi tie subory, ktore este nepozname. Vracia mnozinu fileId,
 * ktore su uz vybavene (aby sa neopakovalo pri kazdom autosave).
 */
export async function uploadNewFiles(
  whiteboardId: string,
  files: Record<string, ExcalidrawFile>,
  known: Set<string>,
): Promise<Set<string>> {
  const pending = Object.values(files).filter(
    (f) => f && !known.has(f.id) && f.dataURL?.startsWith("data:"),
  );

  for (const f of pending) {
    try {
      const blob = dataUrlToBlob(f.dataURL);
      await uploadToApp(
        { target: "map-image", whiteboardId, fileId: f.id, mime: f.mimeType },
        blob,
      );
      known.add(f.id);
    } catch (err) {
      console.error("Failed to save image:", err);
    }
  }

  return known;
}

/** Nacita ulozene obrazky a vrati ich ako BinaryFileData pre `api.addFiles()`. */
export async function loadStoredFiles(stored: StoredFile[]): Promise<ExcalidrawFile[]> {
  const out = await Promise.all(
    stored.map(async (s) => {
      try {
        const res = await fetch(s.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dataURL = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
        const file: ExcalidrawFile = {
          id: s.fileId,
          dataURL,
          mimeType: s.mimeType || blob.type,
          created: Date.now(),
        };
        return file;
      } catch (err) {
        console.error("Failed to load map image:", err);
        return null;
      }
    }),
  );
  return out.filter((f): f is ExcalidrawFile => f !== null);
}
