"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "./ui";

/**
 * Prepinac temy bez React stavu.
 *
 * Ktora ikona sa zobrazi, riesi CSS podla atributu data-theme na <html>
 * (viz globals.css). Vdaka tomu netreba useEffect na docitanie temy po
 * hydratacii - a teda ani setState v effecte, ktory by sposobil zbytocny
 * druhy render a probliknutie zlej ikony.
 */
export function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const isLight = root.getAttribute("data-theme") === "light";

    if (isLight) {
      root.removeAttribute("data-theme");
      localStorage.setItem("hf-theme", "dark");
    } else {
      root.setAttribute("data-theme", "light");
      localStorage.setItem("hf-theme", "light");
    }
  }

  return (
    <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle dark/light mode">
      <Sun className="theme-icon-dark size-4" />
      <Moon className="theme-icon-light size-4" />
    </Button>
  );
}
