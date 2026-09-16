/**
 * Vlastne vkladanie obrazkov na mapu, obchadzajuce Excalidraw vstavany
 * nastroj "Insert image" (klik na platno -> nastroj).
 *
 * Ten nastroj interne pouziva kniznicu `pica` na zmensenie velkeho obrazka,
 * a `pica` cita pixely cez `canvas.getImageData()`. Prehliadace s ochranou
 * proti fingerprintingu (napr. Brave Shields "Block fingerprinting") tento
 * volanie blokuju - `pica` zhodi vynimku, ktoru Excalidraw v ceste
 * "klik a umiestni" (setImagePreviewCursor) NEODCHYTAVA, takze cely vlozeny
 * obrazok zostane prazdny ramcek bez obsahu. Drag & drop a Ctrl+V tento
 * problem nemaju (nepouzivaju setImagePreviewCursor), ale tlacidlo v
 * paneli je najcastejsi sposob, ako pouzivatelia obrazok pridavaju.
 *
 * Riesenie: vlastny vyber suboru + zmensenie cez `createImageBitmap` +
 * `canvas.drawImage` + `canvas.toBlob` - ziadna z tychto volani nepouziva
 * `getImageData`, takze funguju aj pri zapnutej ochrane.
 */

const MAX_DIMENSION = 1440; // rovnaky strop ako Excalidraw pouziva interne
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export type InsertableImage = {
  id: string;
  dataURL: string;
  mimeType: string;
  width: number;
  height: number;
};

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

/** Zmensi obrazok, ak presahuje MAX_DIMENSION. SVG sa nechava tak. */
async function resizeIfNeeded(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.type === "image/svg+xml") {
    // SVG nema rastrove rozmery na zmensenie - vlozi sa 1:1
    const text = await file.text();
    const match = text.match(/viewBox=["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/);
    const width = match ? Number(match[1]) : 400;
    const height = match ? Number(match[2]) : 300;
    return { blob: file, width, height };
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  if (scale === 1 && file.size <= MAX_FILE_BYTES) {
    bitmap.close?.();
    return { blob: file, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const outType = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, 0.85),
  );
  if (!blob) throw new Error("Failed to process image");
  return { blob, width, height };
}

/** Nacita subor, zmensi ak treba a priprav ho na `api.addFiles()`. */
export async function prepareImageFile(file: File): Promise<InsertableImage> {
  const { blob, width, height } = await resizeIfNeeded(file);
  const dataURL = await blobToDataURL(blob);
  return {
    id: crypto.randomUUID(),
    dataURL,
    mimeType: blob.type || file.type,
    width,
    height,
  };
}
