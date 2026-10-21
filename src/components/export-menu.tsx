"use client";

import { useEffect, useId, useRef, useState } from "react";
import Button, { LinkButton } from "@/components/button";

const FORMATS = [
  { label: "CSV", href: (deckId: string) => `/api/decks/${deckId}/export` },
  { label: "Arena", href: (deckId: string) => `/api/decks/${deckId}/export?format=arena` },
  { label: "MTGO", href: (deckId: string) => `/api/decks/${deckId}/export?format=mtgo` },
] as const;

export default function ExportMenu({ deckId }: { deckId: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <Button
        variant="secondary"
        className="px-4 py-1 text-xs"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
      >
        Export <span aria-hidden="true">▾</span>
      </Button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Export format"
          className="absolute right-0 z-20 mt-2 flex min-w-36 flex-col gap-2 rounded-xl bg-surface p-2"
        >
          {FORMATS.map((format) => (
            <LinkButton
              key={format.label}
              role="menuitem"
              variant="secondary"
              href={format.href(deckId)}
              className="w-full px-4 py-1 text-center text-xs"
              onClick={() => setOpen(false)}
            >
              {format.label}
            </LinkButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
