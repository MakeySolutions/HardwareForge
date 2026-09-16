"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Download, FileUp, Trash2, Eye, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { deleteFile } from "@/server/content";
import { uploadToApp } from "@/lib/upload-client";
import { FILE_KIND } from "@/lib/constants";
import type { FileKind } from "@/generated/prisma/client";
import { formatBytes, cn, timeAgo } from "@/lib/utils";
import { Button, Card, EmptyState } from "@/components/ui";
import { Modal } from "@/components/modal";

const MAX_BYTES = 100 * 1024 * 1024;

type FileRow = {
  id: string;
  name: string;
  url: string;
  kind: FileKind;
  sizeBytes: number;
  createdAt: string;
};

export function FilesPanel({ projectId, files }: { projectId: string; files: FileRow[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string[]>([]);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  async function handleFiles(list: FileList | null) {
    if (!list?.length) return;
    const items = Array.from(list);
    setUploading(items.map((f) => f.name));

    for (const file of items) {
      if (file.size > MAX_BYTES) {
        toast.error(`"${file.name}" is larger than 100 MB`);
        continue;
      }
      try {
        await uploadToApp({ target: "project", projectId, name: file.name }, file);
      } catch (err) {
        toast.error(
          `Upload of "${file.name}" failed`,
          { description: err instanceof Error ? err.message : undefined },
        );
      }
    }

    setUploading([]);
    if (inputRef.current) inputRef.current.value = "";
    // Route handler nevie obnovit klientsky router ako Server Action.
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "card flex flex-col items-center justify-center gap-2 border-dashed px-6 py-10 text-center transition-colors",
          dragging && "border-[var(--accent)] bg-[var(--accent)]/5",
        )}
      >
        <FileUp className="size-7 text-[var(--text-muted)]" />
        <p className="text-sm font-medium">Drag files here or choose them</p>
        <p className="text-xs text-[var(--text-muted)]">
          PDF, STL, STEP, SVG, PNG, JPG, ZIP, Fusion 360 (.f3d) — up to 100 MB
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <Button
          variant="secondary"
          size="sm"
          className="mt-1"
          onClick={() => inputRef.current?.click()}
          disabled={uploading.length > 0}
        >
          {uploading.length > 0 ? `Uploading ${uploading.length}…` : "Choose Files"}
        </Button>
      </div>

      {uploading.length > 0 && (
        <Card className="p-3">
          {uploading.map((n) => (
            <p key={n} className="text-xs text-[var(--text-muted)]">
              Uploading {n}…
            </p>
          ))}
        </Card>
      )}

      {files.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="size-9" />}
          title="No files yet"
          description="Upload schematics, STL models, datasheets, or photos of the finished build."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {files.map((f) => {
            const meta = FILE_KIND[f.kind];
            const canPreview = f.kind === "IMAGE" || f.kind === "PDF" || f.kind === "SVG";

            return (
              <Card key={f.id} className="card-hover flex flex-col gap-3 p-3">
                <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-subtle)]">
                  {f.kind === "IMAGE" || f.kind === "SVG" ? (
                    <Image
                      src={f.url}
                      alt={f.name}
                      width={240}
                      height={112}
                      unoptimized
                      className="max-h-28 w-auto object-contain"
                    />
                  ) : (
                    <span
                      className="tabular rounded-md px-2.5 py-1 text-xs font-semibold"
                      style={{ background: `${meta.color}22`, color: meta.color }}
                    >
                      {meta.label}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" title={f.name}>
                    {f.name}
                  </p>
                  <p className="tabular text-[11px] text-[var(--text-muted)]">
                    {formatBytes(f.sizeBytes)} · {timeAgo(f.createdAt)}
                  </p>
                </div>

                <div className="flex gap-1">
                  {canPreview && (
                    <Button variant="ghost" size="sm" onClick={() => setPreview(f)}>
                      <Eye className="size-3.5" />
                      Open
                    </Button>
                  )}
                  <a
                    href={`${f.url}?download=1`}
                    download={f.name}
                    className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  >
                    <Download className="size-3.5" />
                    Download
                  </a>
                  <button
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          await deleteFile(f.id);
                        } catch {
                          toast.error("Delete failed");
                        }
                      })
                    }
                    className="focus-ring ml-auto rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-400"
                    aria-label={`Delete ${f.name}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-[var(--text-muted)]">
        STEP and .f3d can&apos;t be rendered in the app without a heavy converter — download them
        with &quot;Download&quot; and open in your CAD program. All files stay only on your computer.
      </p>

      {preview && (
        <Modal open onOpenChange={() => setPreview(null)} title={preview.name} wide>
          {preview.kind === "PDF" ? (
            <iframe src={preview.url} className="h-[70vh] w-full rounded-lg border border-[var(--border)]" />
          ) : (
            <Image
              src={preview.url}
              alt={preview.name}
              width={1200}
              height={800}
              unoptimized
              className="h-auto max-h-[70vh] w-full rounded-lg object-contain"
            />
          )}
        </Modal>
      )}
    </div>
  );
}
