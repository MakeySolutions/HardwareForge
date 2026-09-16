"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, Pin, Trash2, Eye, Pencil, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { createNote, saveNote, deleteNote, toggleNotePinned } from "@/server/content";
import { cn, timeAgo } from "@/lib/utils";
import { Button, Card, EmptyState, Input } from "@/components/ui";
import { ConfirmButton } from "@/components/modal";

type NoteRow = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  updatedAt: string;
};

export function NotesPanel({ projectId, notes }: { projectId: string; notes: NoteRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(notes[0]?.id ?? null);
  const [, startTransition] = useTransition();

  const selected = notes.find((n) => n.id === selectedId) ?? notes[0] ?? null;

  if (notes.length === 0) {
    return (
      <EmptyState
        icon={<NotebookPen className="size-9" />}
        title="No notes yet"
        description="Jot down pinouts, code snippets, or a checklist before soldering. Markdown is supported."
        action={
          <Button
            variant="primary"
            onClick={() =>
              startTransition(async () => {
                const id = await createNote(projectId);
                setSelectedId(id);
              })
            }
          >
            <Plus className="size-4" />
            New Note
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <Button
          variant="primary"
          size="sm"
          className="w-full justify-center"
          onClick={() =>
            startTransition(async () => {
              const id = await createNote(projectId);
              setSelectedId(id);
            })
          }
        >
          <Plus className="size-4" />
          New Note
        </Button>

        <div className="space-y-1">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => setSelectedId(n.id)}
              className={cn(
                "focus-ring w-full rounded-lg border px-3 py-2 text-left transition-colors",
                selected?.id === n.id
                  ? "border-[var(--accent)]/50 bg-[var(--surface)]"
                  : "border-transparent hover:bg-[var(--surface-hover)]",
              )}
            >
              <div className="flex items-center gap-1.5">
                {n.pinned && <Pin className="size-3 shrink-0 text-[var(--accent)]" />}
                <span className="truncate text-sm font-medium">{n.title}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{timeAgo(n.updatedAt)}</p>
            </button>
          ))}
        </div>
      </div>

      {selected && <NoteEditor key={selected.id} note={selected} />}
    </div>
  );
}

function NoteEditor({ note }: { note: NoteRow }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [, startTransition] = useTransition();

  const firstRender = useRef(true);

  // Autosave s 800 ms debounce - inak by kazde pismeno islo do DB
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await saveNote(note.id, title, content);
        setStatus("saved");
      } catch {
        setStatus("idle");
        toast.error("Failed to save note");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [title, content, note.id]);

  return (
    <Card className="flex min-h-[60vh] flex-col p-0">
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-transparent bg-transparent px-2 text-base font-semibold"
          aria-label="Note title"
        />
        <span className="w-16 shrink-0 text-right text-[11px] text-[var(--text-muted)]">
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : ""}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setPreview((v) => !v)}
          title={preview ? "Edit" : "Preview"}
        >
          {preview ? <Pencil className="size-3.5" /> : <Eye className="size-3.5" />}
          {preview ? "Edit" : "Preview"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => startTransition(() => void toggleNotePinned(note.id))}
          aria-label={note.pinned ? "Unpin" : "Pin"}
        >
          <Pin className={cn("size-3.5", note.pinned && "text-[var(--accent)]")} />
        </Button>
        <ConfirmButton
          title="Delete note?"
          message={`The note "${note.title}" will be permanently deleted.`}
          onConfirm={() => deleteNote(note.id)}
        >
          <Button variant="ghost" size="icon" aria-label="Delete note">
            <Trash2 className="size-3.5" />
          </Button>
        </ConfirmButton>
      </div>

      {preview ? (
        <div className="markdown flex-1 overflow-auto p-5">
          {content.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          ) : (
            <p className="text-sm text-[var(--text-muted)]">This note is empty.</p>
          )}
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={"# Wiring\n\n- [ ] GPIO 18 -> SCK\n- [ ] GPIO 23 -> MOSI\n\n```cpp\ntft.init();\n```"}
          className="focus-ring flex-1 resize-none bg-transparent p-5 font-[family-name:var(--font-mono)] text-sm leading-relaxed outline-none"
          aria-label="Note content (Markdown)"
        />
      )}
    </Card>
  );
}
