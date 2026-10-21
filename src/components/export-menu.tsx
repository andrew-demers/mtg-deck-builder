"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/components/button";

const EXPORT_FORMATS = [
  { label: "CSV", query: "" },
  { label: "Arena", query: "?format=arena" },
  { label: "MTGO", query: "?format=mtgo" },
];

/** One "Export" button that opens a list of the deck's export formats. */
export default function ExportMenu({ deckId }: { deckId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        variant="secondary"
        className="px-4 py-1 text-xs"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
      >
        Export ▾
      </Button>
      {isOpen ? (
        <ul
          role="menu"
          className="absolute right-0 z-10 mt-2 flex min-w-32 flex-col overflow-hidden rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
        >
          {EXPORT_FORMATS.map(({ label, query }) => (
            <li key={label} role="none">
              <a
                role="menuitem"
                href={`/api/decks/${deckId}/export${query}`}
                onClick={() => setIsOpen(false)}
                className="block px-4 py-2 hover:bg-background"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
