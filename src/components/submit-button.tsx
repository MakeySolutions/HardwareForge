"use client";

import { useFormStatus } from "react-dom";
import { Button } from "./ui";

/**
 * Musi byt samostatny komponent - useFormStatus cita stav najblizsieho
 * nadradeneho <form>, takze nemoze byt v tom istom komponente ako form.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  className,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
