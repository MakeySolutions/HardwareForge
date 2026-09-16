"use client";

import { useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FileImage, FileCode, Printer } from "lucide-react";
import { toast } from "sonner";

type Scene = {
  elements: readonly unknown[];
  files: unknown;
  dark: boolean;
  name: string;
};

export function ExportMenu({
  getScene,
  children,
}: {
  getScene: () => Scene;
  children: React.ReactNode;
}) {
  const [busy, setBusy] = useState(false);

  const doExport = async (kind: "png" | "svg" | "pdf") => {
    if (busy) return;
    setBusy(true);
    try {
      const scene = getScene();
      if (!scene.elements.length) {
        toast.error("Map is empty");
        return;
      }
      const mod = await import("@/lib/whiteboard/export");
      if (kind === "png") await mod.exportPng(scene);
      else if (kind === "svg") await mod.exportSvgFile(scene);
      else await mod.exportPdf(scene);
    } catch (err) {
      console.error(err);
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="card z-50 min-w-40 p-1 shadow-2xl shadow-black/40"
        >
          <Item onSelect={() => doExport("png")} icon={<FileImage className="size-3.5" />}>
            PNG image
          </Item>
          <Item onSelect={() => doExport("svg")} icon={<FileCode className="size-3.5" />}>
            SVG (vector)
          </Item>
          <Item onSelect={() => doExport("pdf")} icon={<Printer className="size-3.5" />}>
            PDF (via print)
          </Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({
  onSelect,
  icon,
  children,
}: {
  onSelect: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className="focus-ring flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-[var(--surface-hover)]"
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}
